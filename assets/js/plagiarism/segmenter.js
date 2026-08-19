/**
 * Splitting the text into queryable passages.
 *
 * Strategy: overlapping sliding windows of ~42 words, aligned on sentence
 * boundaries where possible, so that every query sent to the search engine
 * corresponds to a unit of meaning.
 *
 * Each passage gets a "distinctiveness" score: the more rare words and unusual
 * sequences it contains, the more worthwhile it is to query. Searching for
 * "it is important to note that" produces nothing but noise, and that is the
 * primary source of false positives in a plagiarism detector.
 */

import { PLAGIARISM } from '../config.js';
import { sentences, words, canonicalize, ngrams } from '../core/tokenize.js';
import { rankMap } from '../data/word-freq.js';
import { detectLanguage } from '../core/language.js';

/**
 * @param {string} text
 * @param {{passageWords?:number, overlap?:number}} [options]
 * @returns {Array<{id:number,text:string,start:number,end:number,wordCount:number,distinctiveness:number}>}
 */
export function segmentText(text, options = {}) {
  const size = options.passageWords ?? PLAGIARISM.passageWords;
  const overlap = options.overlap ?? PLAGIARISM.passageOverlap;
  const step = Math.max(8, size - overlap);

  const sents = sentences(text);
  if (!sents.length) return [];

  const lang = detectLanguage(text).lang;
  const ranks = rankMap(lang);

  // Build windows aligned on sentences.
  const passages = [];
  let cursor = 0;
  while (cursor < sents.length) {
    let wordCount = 0;
    let end = cursor;
    while (end < sents.length && wordCount < size) {
      wordCount += words(sents[end].text).length;
      end += 1;
    }
    const slice = sents.slice(cursor, end);
    if (!slice.length) break;

    const start = slice[0].start;
    const stop = slice[slice.length - 1].end;
    const passageText = text.slice(start, stop).trim();

    if (words(passageText).length >= 12) {
      passages.push({
        id: passages.length,
        text: passageText,
        start,
        end: stop,
        wordCount: words(passageText).length,
        sentenceRange: [slice[0].index, slice[slice.length - 1].index],
      });
    }

    // Advance by at least one sentence, aiming for the requested step.
    let advanced = 0;
    let next = cursor;
    while (next < sents.length && advanced < step) {
      advanced += words(sents[next].text).length;
      next += 1;
    }
    cursor = Math.max(cursor + 1, next - (overlap > 0 ? 1 : 0));
  }

  for (const passage of passages) {
    passage.distinctiveness = distinctiveness(passage.text, ranks);
    passage.query = buildQuery(passage.text);
  }

  return passages;
}

/**
 * Distinctiveness score in [0,1].
 * Combines mean word rarity with the originality of 4-grams.
 */
export function distinctiveness(text, ranks) {
  const tokens = canonicalize(text).split(' ').filter(Boolean);
  if (tokens.length < 8) return 0;

  let rareScore = 0;
  let named = 0;
  for (const token of tokens) {
    const rank = ranks.get(token);
    if (!rank) rareScore += 1;
    else if (rank > 900) rareScore += 0.55;
    else if (rank > 300) rareScore += 0.2;
  }
  const rarity = rareScore / tokens.length;

  // Named entities approximated: mid-sentence capitals, and digits.
  named = (text.match(/(?<!^)(?<![.!?]\s)\b[A-ZÀ-Þ][a-zà-ÿ]{2,}/g) ?? []).length;
  const digits = (text.match(/\b\d[\d.,%-]*\b/g) ?? []).length;

  const uniqueness = new Set(ngrams(tokens, 4)).size / Math.max(1, tokens.length - 3);

  return Math.min(1,
    rarity * 1.15
    + Math.min(0.25, named / Math.max(8, tokens.length) * 2)
    + Math.min(0.15, digits / Math.max(8, tokens.length) * 3)
    + uniqueness * 0.15);
}

/**
 * Build an exact-phrase query for the search engine.
 * We keep a continuous 8-to-12-word substring — long enough to discriminate,
 * short enough for engines to handle it properly.
 */
export function buildQuery(text, maxWords = 11) {
  const cleaned = text
    .replace(/\s+/g, ' ')
    .replace(/["“”«»]/g, '')
    .trim();
  const tokens = cleaned.split(' ');
  if (tokens.length <= maxWords) return `"${cleaned}"`;

  // The window densest in long words: avoids landing on a run of function
  // words that would return millions of irrelevant results.
  let bestStart = 0;
  let bestScore = -1;
  for (let i = 0; i + maxWords <= tokens.length; i += 1) {
    const window = tokens.slice(i, i + maxWords);
    const score = window.reduce((a, w) => a + Math.min(12, w.length), 0);
    if (score > bestScore) { bestScore = score; bestStart = i; }
  }
  return `"${tokens.slice(bestStart, bestStart + maxWords).join(' ')}"`;
}

/**
 * Select the passages to query within the query budget.
 * Queries are spread across the document's whole length rather than concentrated
 * on the most distinctive passages — otherwise a document where only the ending
 * was copied would slip through unnoticed.
 */
export function selectPassages(passages, budget) {
  if (passages.length <= budget) return [...passages];

  const buckets = Math.min(budget, Math.max(1, Math.ceil(budget / 2)));
  const perBucket = Math.ceil(passages.length / buckets);
  const selected = [];

  for (let b = 0; b < buckets; b += 1) {
    const slice = passages.slice(b * perBucket, (b + 1) * perBucket);
    if (!slice.length) continue;
    const sorted = [...slice].sort((a, b2) => b2.distinctiveness - a.distinctiveness);
    const take = Math.max(1, Math.round((budget / passages.length) * slice.length));
    selected.push(...sorted.slice(0, take));
  }

  return selected
    .sort((a, b) => b.distinctiveness - a.distinctiveness)
    .slice(0, budget)
    .sort((a, b) => a.start - b.start);
}
