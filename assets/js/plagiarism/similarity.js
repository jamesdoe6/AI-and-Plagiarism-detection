/**
 * Similarity measures between two texts.
 *
 * No single measure will do:
 *   - Jaccard over shingles catches verbatim copying but misses paraphrase;
 *   - weighted bag-of-words cosine catches paraphrase but over-scores two texts
 *     from the same domain;
 *   - containment spots a short extract embedded in a long text;
 *   - longest common subsequence stays robust to insertions.
 *
 * We combine them, and also return the best aligned excerpt so the user can
 * CHECK FOR THEMSELVES — that is the critical point: the tool flags, the human
 * judges.
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

/** tf vector weighted by word length (an IDF proxy with no corpus). */
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
 * Composite similarity between a source passage and a candidate text.
 * @returns {{score:number, jaccard:number, containment:number, cosine:number,
 *            lcs:number, exact:boolean, matchedText:string|null}}
 */
/**
 * Content words: the 150 most frequent words of the language are removed.
 * Two unrelated texts share a great many function words; aligning them inflates
 * any similarity measure artificially. Reasoning over content words alone keeps
 * paraphrase detectable while two same-register but unrelated texts fall back
 * near zero.
 */
function contentTokens(tokens, lang) {
  const ranks = rankMap(lang);
  return tokens.filter((t) => {
    const rank = ranks.get(t);
    return t.length > 2 && (!rank || rank > 150);
  });
}

/**
 * Composite similarity between a source passage and a candidate text.
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

  // Short shingles: catch near-verbatim reuse where roughly one word in ten
  // was substituted — the most common form of "touched-up" plagiarism.
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

  // Verbatim copy: the canonical source substring appears as-is.
  const canonicalSource = sourceTokens.join(' ');
  const canonicalCandidate = candidateTokens.join(' ');
  const exact = canonicalSource.length > 40 && canonicalCandidate.includes(canonicalSource);

  const { window, windowScore } = bestWindow(sourceShingles, candidate, sourceTokens.length);

  // Weighting: containment dominates ("does this passage exist elsewhere?").
  // Cosine is deliberately a minority contributor: on its own it conflates
  // "same topic" with "same text", the main source of false positives.
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
 * Find the window within the candidate that best covers the source passage.
 * Serves both to refine the score and to display a comparable excerpt.
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

  // Recover the excerpt from the original (non-canonical) text for display.
  const excerpt = extractOriginal(candidate, best.start, size);
  return { window: excerpt, windowScore: best.score };
}

/** Recover a readable excerpt of the original text from a token index. */
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
 * Global coverage: the share of the source text covered by at least one retained
 * match. Intervals are merged so a passage found on several sites is not counted
 * twice — otherwise the score would exceed 100 % and the tool would become an
 * accusation generator.
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

  // Each interval counts in proportion to its similarity: a passage that is
  // "50 % close" does not represent 100 % plagiarism over its length.
  const covered = merged.reduce((acc, [start, end, weight]) => acc + (end - start) * weight, 0);
  return Math.min(1, covered / totalLength);
}
