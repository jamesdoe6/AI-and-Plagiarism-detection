/**
 * Moteur de detection de plagiat.
 *
 * Pipeline :
 *   1. segmentation en passages avec recouvrement ;
 *   2. selection des passages les plus distinctifs, repartis sur tout le
 *      document (un document dont seule la fin est copiee doit etre detecte) ;
 *   3. interrogation du moteur de recherche sur des requetes exactes ;
 *   4. premiere estimation de similarite sur les extraits renvoyes ;
 *   5. telechargement des pages les plus prometteuses et comparaison fine ;
 *   6. agregation par source, fusion des intervalles couverts, score global.
 *
 * Le filtrage anti-faux-positifs est aussi important que la detection :
 *   - les passages peu distinctifs ne sont pas interroges ;
 *   - une correspondance sous le seuil est ignoree ;
 *   - les correspondances trouvees sur un tres grand nombre de domaines
 *     differents sont traitees comme des expressions courantes, pas du plagiat ;
 *   - la couverture est ponderee par la similarite pour ne jamais gonfler le
 *     score global.
 */

import { PLAGIARISM, PLAGIARISM_THRESHOLDS } from '../config.js';
import { segmentText, selectPassages } from './segmenter.js';
import { similarityBetween, coverageRatio } from './similarity.js';
import { search, isSearchConfigured, ProviderError } from './providers.js';
import { fetchPageText, host } from './fetcher.js';
import { pool, withRetry } from '../util/async.js';
import { paragraphs } from '../core/tokenize.js';

/**
 * @param {string} text
 * @param {object} settings
 * @param {{onStep?:Function, onLog?:Function, signal?:AbortSignal}} hooks
 */
export async function analyzePlagiarism(text, settings, hooks = {}) {
  const { onStep = () => {}, onLog = () => {} } = hooks;

  onStep('Segmentation du texte', 0.02);
  const passages = segmentText(text);
  if (!passages.length) {
    return emptyResult('Texte trop court pour etre segmente en passages exploitables.');
  }

  const budget = Math.max(1, Math.min(120, Number(settings.maxQueries) || PLAGIARISM.maxQueries));
  const searchable = passages.filter((p) => p.distinctiveness >= 0.18);
  const selected = selectPassages(searchable.length ? searchable : passages, budget);

  const matches = [];
  const errors = [];
  const localMatches = await compareLocalSources(passages, settings, onLog);
  matches.push(...localMatches);

  const webEnabled = isSearchConfigured(settings);
  let queriesRun = 0;

  if (webEnabled) {
    onStep(`Recherche web (${selected.length} requetes)`, 0.1);

    const searchResults = await pool(selected, async (passage, index) => {
      try {
        const results = await withRetry(
          () => search(passage.query, settings),
          {
            retries: PLAGIARISM.retries,
            baseDelay: 1500,
            onRetry: (err, attempt, delay) => onLog(`Requete ${index + 1} : tentative ${attempt} dans ${delay} ms (${err.message})`),
          },
        );
        queriesRun += 1;
        return { passage, results };
      } catch (err) {
        if (err instanceof ProviderError && err.permanent) errors.push(err.message);
        else errors.push(`Requete ${index + 1} : ${err.message}`);
        return { passage, results: [] };
      }
    }, PLAGIARISM.concurrency, (done, total) => {
      onStep(`Recherche web ${done}/${total}`, 0.1 + (done / total) * 0.4);
    });

    // Etape 4 : score preliminaire sur les extraits renvoyes par le moteur.
    const candidates = new Map();
    for (const entry of searchResults) {
      if (!entry?.results) continue;
      for (const result of entry.results) {
        const preliminary = similarityBetween(entry.passage.text, `${result.title} ${result.snippet}`);
        const key = `${result.url}|${entry.passage.id}`;
        candidates.set(key, {
          passage: entry.passage,
          result,
          preliminary: preliminary.score,
        });
      }
    }

    onLog(`${queriesRun} requete(s) executee(s), ${candidates.size} candidat(s) a examiner.`);

    // Etape 5 : comparaison fine sur les pages les plus prometteuses.
    const ranked = [...candidates.values()].sort((a, b) => b.preliminary - a.preliminary);
    const toFetch = settings.useReader === false
      ? []
      : dedupeByUrl(ranked.filter((c) => c.preliminary >= 0.12)).slice(0, PLAGIARISM.maxFetch);

    const pages = new Map();
    if (toFetch.length) {
      onStep(`Lecture des sources (${toFetch.length})`, 0.55);
      await pool(toFetch, async (candidate, i) => {
        const page = await fetchPageText(candidate.result.url, settings, onLog);
        if (page) pages.set(candidate.result.url, page.text);
        onStep(`Lecture des sources ${i + 1}/${toFetch.length}`, 0.55 + ((i + 1) / toFetch.length) * 0.3);
      }, 3);
    }

    // Etape 6 : score definitif.
    for (const candidate of candidates.values()) {
      const pageText = pages.get(candidate.result.url);
      const comparisonText = pageText ?? `${candidate.result.title} ${candidate.result.snippet}`;
      const similarity = similarityBetween(candidate.passage.text, comparisonText);
      if (similarity.score < PLAGIARISM.minSimilarity) continue;

      matches.push({
        source: 'web',
        url: candidate.result.url,
        domain: host(candidate.result.url),
        title: candidate.result.title || candidate.result.url,
        snippet: candidate.result.snippet ?? '',
        matchedText: similarity.matchedText ?? candidate.result.snippet ?? '',
        passageText: candidate.passage.text,
        passageId: candidate.passage.id,
        start: candidate.passage.start,
        end: candidate.passage.end,
        similarity: similarity.score,
        exact: similarity.exact,
        detail: similarity,
        verified: Boolean(pageText),
      });
    }
  } else {
    onLog('Recherche web desactivee : aucun fournisseur configure.');
  }

  onStep('Agregation des resultats', 0.95);
  return buildResult({ text, passages, matches, errors, webEnabled, queriesRun });
}

/**
 * Compare le texte a des documents de reference fournis par l'utilisateur.
 * Fonctionne entierement hors ligne : c'est le mode utile quand on veut
 * comparer un devoir a un corpus de classe sans envoyer quoi que ce soit.
 */
async function compareLocalSources(passages, settings, onLog) {
  const raw = (settings.localSources ?? '').trim();
  if (!raw) return [];

  // Les documents sont separes par une ligne "---".
  const documents = raw.split(/^\s*---+\s*$/m).map((d) => d.trim()).filter((d) => d.length > 80);
  if (!documents.length) return [];
  onLog(`${documents.length} source(s) locale(s) comparee(s).`);

  const matches = [];
  documents.forEach((document, index) => {
    const firstLine = paragraphs(document)[0]?.slice(0, 80) ?? `Document ${index + 1}`;
    for (const passage of passages) {
      const similarity = similarityBetween(passage.text, document);
      if (similarity.score < PLAGIARISM.minSimilarity) continue;
      matches.push({
        source: 'local',
        url: null,
        domain: 'source locale',
        title: `Source locale ${index + 1} — ${firstLine}…`,
        snippet: '',
        matchedText: similarity.matchedText ?? '',
        passageText: passage.text,
        passageId: passage.id,
        start: passage.start,
        end: passage.end,
        similarity: similarity.score,
        exact: similarity.exact,
        detail: similarity,
        verified: true,
      });
    }
  });
  return matches;
}

function dedupeByUrl(candidates) {
  const seen = new Set();
  const out = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.result.url)) continue;
    seen.add(candidate.result.url);
    out.push(candidate);
  }
  return out;
}

/**
 * Agrege les correspondances par source et calcule le score global.
 */
export function buildResult({ text, passages, matches, errors, webEnabled, queriesRun }) {
  // Une expression retrouvee sur beaucoup de domaines differents est une
  // tournure courante, pas un emprunt : on la neutralise.
  const passageDomains = new Map();
  for (const match of matches) {
    if (match.source !== 'web') continue;
    if (!passageDomains.has(match.passageId)) passageDomains.set(match.passageId, new Set());
    passageDomains.get(match.passageId).add(match.domain);
  }

  const filtered = matches.filter((match) => {
    if (match.source !== 'web') return true;
    const domains = passageDomains.get(match.passageId)?.size ?? 1;
    if (domains >= 6 && match.similarity < 0.85 && !match.exact) return false;
    return true;
  });

  const commonPhrases = matches.length - filtered.length;

  // Regroupement par source.
  const bySource = new Map();
  for (const match of filtered) {
    const key = match.url ?? match.title;
    if (!bySource.has(key)) {
      bySource.set(key, {
        url: match.url,
        domain: match.domain,
        title: match.title,
        source: match.source,
        verified: match.verified,
        matches: [],
        bestSimilarity: 0,
      });
    }
    const group = bySource.get(key);
    group.matches.push(match);
    group.bestSimilarity = Math.max(group.bestSimilarity, match.similarity);
    group.verified = group.verified || match.verified;
  }

  const sources = [...bySource.values()]
    .map((group) => ({
      ...group,
      matches: group.matches.sort((a, b) => b.similarity - a.similarity),
      coverage: coverageRatio(group.matches, text.length),
    }))
    .filter((group) => group.bestSimilarity >= PLAGIARISM.reportSimilarity)
    .sort((a, b) => b.bestSimilarity - a.bestSimilarity);

  const reportable = filtered.filter((m) => m.similarity >= PLAGIARISM.reportSimilarity);
  const coverage = coverageRatio(reportable, text.length);
  const score = coverage * 100;

  return {
    score,
    band: bandFor(score),
    verdict: verdictFor(score, webEnabled, sources.length),
    sources,
    matches: reportable.sort((a, b) => b.similarity - a.similarity),
    passageCount: passages.length,
    queriesRun,
    webEnabled,
    commonPhrasesFiltered: commonPhrases,
    errors: [...new Set(errors)],
  };
}

function bandFor(score) {
  if (score < PLAGIARISM_THRESHOLDS.low) return 'low';
  if (score < PLAGIARISM_THRESHOLDS.moderate) return 'moderate';
  if (score < PLAGIARISM_THRESHOLDS.high) return 'high';
  return 'critical';
}

function verdictFor(score, webEnabled, sourceCount) {
  if (!webEnabled && sourceCount === 0) {
    return 'Aucune recherche web effectuee : ce score ne reflete que les sources locales fournies (aucune ici).';
  }
  if (sourceCount === 0) {
    return 'Aucune correspondance significative trouvee dans les sources interrogees.';
  }
  if (score < PLAGIARISM_THRESHOLDS.low) {
    return `${sourceCount} source(s) presentant des similitudes ponctuelles, sous le seuil de signalement global.`;
  }
  if (score < PLAGIARISM_THRESHOLDS.moderate) {
    return `Recouvrement modere avec ${sourceCount} source(s) : verifiez s'il s'agit de citations correctement attribuees.`;
  }
  if (score < PLAGIARISM_THRESHOLDS.high) {
    return `Recouvrement important avec ${sourceCount} source(s) : une part notable du texte existe deja en ligne.`;
  }
  return `Recouvrement tres important avec ${sourceCount} source(s) : le texte reprend largement des contenus existants.`;
}

function emptyResult(message) {
  return {
    score: 0,
    band: 'low',
    verdict: message,
    sources: [],
    matches: [],
    passageCount: 0,
    queriesRun: 0,
    webEnabled: false,
    commonPhrasesFiltered: 0,
    errors: [],
  };
}
