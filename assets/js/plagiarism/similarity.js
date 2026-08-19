/**
 * Mesures de similarite entre deux textes.
 *
 * Aucune mesure isolee ne convient :
 *   - Jaccard sur shingles detecte la copie litterale mais rate la paraphrase ;
 *   - le cosinus sur sacs de mots ponderes detecte la paraphrase mais surestime
 *     la similarite de deux textes du meme domaine ;
 *   - le containment repere qu'un extrait court est inclus dans un texte long ;
 *   - la plus longue sous-sequence commune reste robuste aux insertions.
 *
 * On les combine, et on renvoie aussi le meilleur extrait aligne pour que
 * l'utilisateur puisse *verifier lui-meme* — c'est le point critique : l'outil
 * signale, l'humain juge.
 */

import { canonicalize, ngrams } from '../core/tokenize.js';
import { rankMap } from '../data/word-freq.js';
import { detectLanguage } from '../core/language.js';
import { jaccard, containment, cosineSparse, counter, lcsLength } from '../core/stats.js';
import { PLAGIARISM } from '../config.js';

export function shingles(text, size = PLAGIARISM.shingleSize) {
  const tokens = canonicalize(text).split(' ').filter(Boolean);
  if (tokens.length < size) return new Set(tokens.length ? [tokens.join(' ')] : []);
  return new Set(ngrams(tokens, size));
}

export function tokensOf(text) {
  return canonicalize(text).split(' ').filter(Boolean);
}

/** Vecteur tf pondere par la longueur du mot (proxy d'IDF sans corpus). */
function weightedVector(tokens) {
  const freq = counter(tokens);
  const vector = new Map();
  for (const [word, count] of freq) {
    const weight = Math.min(3.2, 0.55 + word.length * 0.22);
    vector.set(word, (1 + Math.log(count)) * weight);
  }
  return vector;
}

/**
 * Similarite composite entre un passage source et un texte candidat.
 * @returns {{score:number, jaccard:number, containment:number, cosine:number,
 *            lcs:number, exact:boolean, matchedText:string|null}}
 */
/**
 * Mots de contenu : on retire les 150 mots les plus frequents de la langue.
 * Deux textes sans rapport partagent beaucoup de mots-outils ; les aligner
 * gonfle artificiellement toute mesure de similarite. En raisonnant sur les
 * seuls mots de contenu, une paraphrase reste detectable alors que deux textes
 * du meme registre mais sans lien retombent pres de zero.
 */
function contentTokens(tokens, lang) {
  const ranks = rankMap(lang);
  return tokens.filter((t) => {
    const rank = ranks.get(t);
    return t.length > 2 && (!rank || rank > 150);
  });
}

/**
 * Similarite composite entre un passage source et un texte candidat.
 * @returns {{score:number, jaccard:number, containment:number, cosine:number,
 *            lcs:number, exact:boolean, matchedText:string|null}}
 */
export function similarityBetween(source, candidate) {
  const sourceTokens = tokensOf(source);
  const candidateTokens = tokensOf(candidate);

  if (sourceTokens.length < 4 || candidateTokens.length < 4) {
    return { score: 0, jaccard: 0, containment: 0, cosine: 0, lcs: 0, exact: false, matchedText: null };
  }

  const lang = detectLanguage(source).lang;
  const sourceShingles = shingles(source);
  const candidateShingles = shingles(candidate);

  const j = jaccard(sourceShingles, candidateShingles);
  const c = containment(sourceShingles, candidateShingles);

  // Shingles courts : rattrapent les reprises quasi litterales ou un mot sur
  // dix a ete substitue — le cas le plus courant de plagiat "retouche".
  const c3 = containment(
    new Set(ngrams(sourceTokens, 3)),
    new Set(ngrams(candidateTokens, 3)),
  );

  const cos = cosineSparse(weightedVector(sourceTokens), weightedVector(candidateTokens));

  const sourceContent = contentTokens(sourceTokens, lang);
  const candidateContent = contentTokens(candidateTokens, lang);
  const lcs = sourceContent.length
    ? lcsLength(sourceContent, candidateContent) / sourceContent.length
    : lcsLength(sourceTokens, candidateTokens) / sourceTokens.length;

  // Copie litterale : la sous-chaine canonique source apparait telle quelle.
  const canonicalSource = sourceTokens.join(' ');
  const canonicalCandidate = candidateTokens.join(' ');
  const exact = canonicalSource.length > 40 && canonicalCandidate.includes(canonicalSource);

  const { window, windowScore } = bestWindow(sourceShingles, candidate, sourceTokens.length);

  // Ponderation : le containment domine (« ce passage existe-t-il ailleurs ? »).
  // Le cosinus est volontairement minoritaire : seul, il confond "meme sujet"
  // et "meme texte", ce qui est la principale source de faux positifs.
  let score = 0.28 * c + 0.15 * c3 + 0.09 * j + 0.12 * cos + 0.36 * lcs;
  if (exact) score = Math.max(score, 0.97);
  if (windowScore > score) score = (score + windowScore) / 2;

  return {
    score: Math.min(1, score),
    jaccard: j,
    containment: c,
    containment3: c3,
    cosine: cos,
    lcs,
    exact,
    matchedText: window,
  };
}

/**
 * Cherche dans le candidat la fenetre qui recouvre le mieux le passage source.
 * Sert a la fois a affiner le score et a afficher un extrait comparable.
 */
export function bestWindow(sourceShingles, candidate, sourceLength) {
  const tokens = tokensOf(candidate);
  const size = Math.min(tokens.length, Math.max(20, sourceLength));
  if (tokens.length <= size) {
    return { window: candidate.slice(0, 600), windowScore: 0 };
  }

  const step = Math.max(4, Math.floor(size / 4));
  let best = { start: 0, score: 0 };
  for (let i = 0; i + size <= tokens.length; i += step) {
    const windowTokens = tokens.slice(i, i + size);
    const windowShingles = new Set(ngrams(windowTokens, PLAGIARISM.shingleSize));
    const score = containment(sourceShingles, windowShingles);
    if (score > best.score) best = { start: i, score };
  }

  if (best.score === 0) return { window: null, windowScore: 0 };

  // Retrouve l'extrait dans le texte d'origine (non canonique) pour l'affichage.
  const excerpt = extractOriginal(candidate, best.start, size);
  return { window: excerpt, windowScore: best.score };
}

/** Recupere un extrait lisible du texte original a partir d'un index de token. */
function extractOriginal(text, tokenStart, tokenCount) {
  const matches = [...text.matchAll(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu)];
  if (!matches.length) return text.slice(0, 400);
  const startMatch = matches[Math.min(tokenStart, matches.length - 1)];
  const endMatch = matches[Math.min(tokenStart + tokenCount, matches.length - 1)];
  const start = Math.max(0, startMatch.index - 40);
  const end = Math.min(text.length, endMatch.index + endMatch[0].length + 40);
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
}

/**
 * Couverture globale : proportion du texte source recouverte par au moins une
 * correspondance retenue. On fusionne les intervalles pour ne pas compter deux
 * fois un passage trouve sur plusieurs sites — sinon le score depasse 100 % et
 * l'outil devient un generateur d'accusations.
 */
export function coverageRatio(matches, totalLength) {
  if (!matches.length || !totalLength) return 0;
  const intervals = matches
    .map((m) => [m.start, m.end, m.similarity])
    .sort((a, b) => a[0] - b[0]);

  const merged = [];
  for (const [start, end, weight] of intervals) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) {
      last[1] = Math.max(last[1], end);
      last[2] = Math.max(last[2], weight);
    } else {
      merged.push([start, end, weight]);
    }
  }

  // Chaque intervalle compte au prorata de sa similarite : un passage
  // "proche a 50 %" ne represente pas 100 % de plagiat sur sa longueur.
  const covered = merged.reduce((acc, [start, end, weight]) => acc + (end - start) * weight, 0);
  return Math.min(1, covered / totalLength);
}
