/**
 * Plagiarism detection engine.
 *
 * Pipeline:
 *   1. split into overlapping passages;
 *   2. select the most distinctive passages, spread across the whole document
 *      (a document where only the end was copied must still be caught);
 *   3. query the search engine with exact-phrase queries;
 *   4. first similarity estimate on the returned snippets;
 *   5. download the most promising pages and compare in detail;
 *   6. aggregate per source, merge covered intervals, compute a global score.
 *
 * False-positive filtering matters as much as detection itself:
 *   - low-distinctiveness passages are never queried;
 *   - a match below threshold is discarded;
 *   - matches found across a very large number of different domains are treated
 *     as common phrasing, not as plagiarism;
 *   - coverage is weighted by similarity so the global score can never inflate.
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

  onStep({ key: 'steps.segmenting' }, 0.02);
  const passages = segmentText(text);
  if (!passages.length) {
    return emptyResult('plagVerdict.tooShort');
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
    onStep({ key: 'steps.searching', params: { count: selected.length } }, 0.1);

    const searchResults = await pool(selected, async (passage, index) => {
      try {
        const results = await withRetry(
          () => search(passage.query, settings),
          {
            retries: PLAGIARISM.retries,
            baseDelay: 1500,
            onRetry: (err, attempt, delay) => onLog({ key: 'logs.queryRetry', params: { index: index + 1, attempt, delay, error: err.message } }),
          },
        );
        queriesRun += 1;
        return { passage, results };
      } catch (err) {
        if (err instanceof ProviderError && err.permanent) errors.push(err.message);
        else errors.push(`#${index + 1}: ${err.message}`);
        return { passage, results: [] };
      }
    }, PLAGIARISM.concurrency, (done, total) => {
      onStep({ key: 'steps.searchingProgress', params: { done, total } }, 0.1 + (done / total) * 0.4);
    });

    // Step 4: preliminary score on the snippets returned by the engine.
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

    onLog({ key: 'logs.queriesRun', params: { queries: queriesRun, candidates: candidates.size } });

    // Step 5: detailed comparison on the most promising pages.
    const ranked = [...candidates.values()].sort((a, b) => b.preliminary - a.preliminary);
    const toFetch = settings.useReader === false
      ? []
      : dedupeByUrl(ranked.filter((c) => c.preliminary >= 0.12)).slice(0, PLAGIARISM.maxFetch);

    const pages = new Map();
    if (toFetch.length) {
      onStep({ key: 'steps.reading', params: { count: toFetch.length } }, 0.55);
      await pool(toFetch, async (candidate, i) => {
        const page = await fetchPageText(candidate.result.url, settings, onLog);
        if (page) pages.set(candidate.result.url, page.text);
        onStep({ key: 'steps.readingProgress', params: { done: i + 1, total: toFetch.length } }, 0.55 + ((i + 1) / toFetch.length) * 0.3);
      }, 3);
    }

    // Step 6: final score.
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
    onLog({ key: 'logs.searchDisabled' });
  }

  onStep({ key: 'steps.aggregatingPlag' }, 0.95);
  return buildResult({ text, passages, matches, errors, webEnabled, queriesRun });
}

/**
 * Compare the text against reference documents supplied by the user.
 * Runs entirely offline: this is the useful mode when comparing an assignment
 * against a class corpus without sending anything anywhere.
 */
async function compareLocalSources(passages, settings, onLog) {
  const raw = (settings.localSources ?? '').trim();
  if (!raw) return [];

  // Documents are separated by a line containing "---".
  const documents = raw.split(/^\s*---+\s*$/m).map((d) => d.trim()).filter((d) => d.length > 80);
  if (!documents.length) return [];
  onLog({ key: 'logs.localSources', params: { count: documents.length } });

  const matches = [];
  documents.forEach((document, index) => {
    const excerpt = paragraphs(document)[0]?.slice(0, 80) ?? '';
    for (const passage of passages) {
      const similarity = similarityBetween(passage.text, document);
      if (similarity.score < PLAGIARISM.minSimilarity) continue;
      matches.push({
        source: 'local',
        url: null,
        domainKey: 'plagVerdict.localDomain',
        titleKey: 'plagVerdict.localSource',
        titleParams: { index: index + 1, excerpt },
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
 * Aggregate matches per source and compute the global score.
 */
export function buildResult({ text, passages, matches, errors, webEnabled, queriesRun }) {
  // A phrase found across many different domains is common phrasing, not a
  // borrowing: we neutralise it.
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

  // Group by source.
  const bySource = new Map();
  for (const match of filtered) {
    const key = match.url ?? match.titleKey ?? match.title;
    if (!bySource.has(key)) {
      bySource.set(key, {
        url: match.url,
        domain: match.domain,
        domainKey: match.domainKey,
        title: match.title,
        titleKey: match.titleKey,
        titleParams: match.titleParams,
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
    ...verdictFor(score, webEnabled, sources.length),
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

/** Returns the verdict as a translation key plus its parameters. */
function verdictFor(score, webEnabled, sourceCount) {
  const params = { count: sourceCount };
  if (!webEnabled && sourceCount === 0) return { verdictKey: 'plagVerdict.noWebNoLocal' };
  if (sourceCount === 0) return { verdictKey: 'plagVerdict.noMatch' };
  if (score < PLAGIARISM_THRESHOLDS.low) return { verdictKey: 'plagVerdict.belowThreshold', verdictParams: params };
  if (score < PLAGIARISM_THRESHOLDS.moderate) return { verdictKey: 'plagVerdict.moderate', verdictParams: params };
  if (score < PLAGIARISM_THRESHOLDS.high) return { verdictKey: 'plagVerdict.high', verdictParams: params };
  return { verdictKey: 'plagVerdict.critical', verdictParams: params };
}

function emptyResult(verdictKey) {
  return {
    score: 0,
    band: 'low',
    verdictKey,
    sources: [],
    matches: [],
    passageCount: 0,
    queriesRun: 0,
    webEnabled: false,
    commonPhrasesFiltered: 0,
    errors: [],
  };
}
