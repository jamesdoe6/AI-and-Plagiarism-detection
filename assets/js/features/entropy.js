/**
 * Information metrics: entropy, surprisal (perplexity proxy), local
 * predictability.
 *
 * The perplexity proxy combines three independent signals:
 *  1. mean surprisal under Zipf's law over bundled frequency lists (no network
 *     call, no heavy model);
 *  2. the conditional entropy of an n-gram model LEARNED FROM THE TEXT ITSELF:
 *     generated text predicts itself better;
 *  3. the variance of word-to-word surprisal, the lexical counterpart of
 *     burstiness (an LLM produces a smooth surprisal curve).
 *
 * This is NOT a real language-model perplexity. It is a client-side computable
 * approximation, documented as such.
 */

import { mean, stdev, cv, entropy, normalizedEntropy, counter, quantile, skewness } from '../core/stats.js';
import { wordSurprisal, inVocabSurprisal } from '../data/word-freq.js';
import { charNgrams, ngrams } from '../core/tokenize.js';

export function entropyFeatures(doc, lang = 'en') {
  const f = {};
  const tokens = doc.lower;
  if (tokens.length < 5) return { features: f, surprisals: [] };

  // 1. Zipfian surprisal
  const surprisals = tokens.map((w) => wordSurprisal(w, lang));
  f['ent.surprisalMean'] = mean(surprisals);
  f['ent.surprisalSd'] = stdev(surprisals);
  f['ent.surprisalCv'] = cv(surprisals);
  f['ent.surprisalSkew'] = skewness(surprisals);
  f['ent.surprisalP10'] = quantile(surprisals, 0.1);
  f['ent.surprisalP50'] = quantile(surprisals, 0.5);
  f['ent.surprisalP90'] = quantile(surprisals, 0.9);
  f['ent.surprisalIqr'] = quantile(surprisals, 0.75) - quantile(surprisals, 0.25);
  f['ent.pseudoPerplexity'] = 2 ** mean(surprisals);
  f['ent.lowSurprisalRatio'] = surprisals.filter((s) => s < 8).length / surprisals.length;
  f['ent.highSurprisalRatio'] = surprisals.filter((s) => s > 16).length / surprisals.length;

  // Surprisal restricted to known vocabulary, plus the out-of-vocabulary rate.
  // Together these two separate "predictable text" from "learned text", which
  // raw surprisal systematically conflates.
  const iv = tokens.map((w) => inVocabSurprisal(w, lang)).filter((v) => v !== null);
  f['ent.oovRate'] = 1 - iv.length / tokens.length;
  f['ent.ivSurprisalMean'] = mean(iv);
  f['ent.ivSurprisalSd'] = stdev(iv);
  f['ent.ivSurprisalCv'] = cv(iv);
  f['ent.ivSurprisalP90'] = quantile(iv, 0.9);
  f['ent.ivLowRatio'] = iv.length ? iv.filter((s) => s < 7).length / iv.length : 0;

  // Burstiness of surprisal: mean of successive absolute differences.
  const deltas = [];
  for (let i = 1; i < surprisals.length; i += 1) deltas.push(Math.abs(surprisals[i] - surprisals[i - 1]));
  f['ent.surprisalDeltaMean'] = mean(deltas);
  f['ent.surprisalDeltaSd'] = stdev(deltas);

  // Surprisal aggregated per sentence: a human writes unevenly "dense" sentences.
  const perSentence = doc.sentences.map((s) => {
    const ws = s.text.toLowerCase().match(/[\p{L}\p{N}'’-]+/gu) ?? [];
    return ws.length ? mean(ws.map((w) => wordSurprisal(w, lang))) : 0;
  }).filter((v) => v > 0);
  f['ent.sentenceSurprisalMean'] = mean(perSentence);
  f['ent.sentenceSurprisalSd'] = stdev(perSentence);
  f['ent.sentenceSurprisalCv'] = cv(perSentence);

  // 2. N-gram self-predictability (model learned from the text)
  for (const n of [2, 3]) {
    const cond = conditionalEntropy(tokens, n);
    f[`ent.wordCondEntropy${n}`] = cond;
  }
  f['ent.wordUnigramEntropy'] = entropy(counter(tokens));
  f['ent.wordUnigramEntropyNorm'] = normalizedEntropy(counter(tokens));
  f['ent.selfPredictability'] = f['ent.wordUnigramEntropy'] > 0
    ? 1 - f['ent.wordCondEntropy2'] / f['ent.wordUnigramEntropy'] : 0;

  // 3. Character entropy at several orders
  const canonical = doc.canonical;
  for (const n of [1, 2, 3, 4]) {
    const grams = counter(charNgrams(canonical.slice(0, 60000), n));
    f[`ent.charEntropy${n}`] = entropy(grams);
    f[`ent.charEntropyNorm${n}`] = normalizedEntropy(grams);
  }
  f['ent.charCondEntropy'] = (f['ent.charEntropy3'] || 0) - (f['ent.charEntropy2'] || 0);

  // Word n-gram diversity: the lower it is, the more predictable the text.
  for (const n of [2, 3, 4, 5]) {
    const grams = ngrams(tokens, n);
    const uniq = new Set(grams).size;
    f[`ent.ngramDiversity${n}`] = grams.length ? uniq / grams.length : 0;
  }

  return { features: f, surprisals };
}

/**
 * Conditional entropy H(w_n | w_1..w_{n-1}) estimated over the text itself.
 * A low value relative to the unigram entropy signals a highly self-similar text.
 */
export function conditionalEntropy(tokens, n = 2) {
  if (tokens.length <= n) return 0;
  const contexts = new Map();
  for (let i = 0; i + n <= tokens.length; i += 1) {
    const ctx = tokens.slice(i, i + n - 1).join(' ');
    const next = tokens[i + n - 1];
    if (!contexts.has(ctx)) contexts.set(ctx, new Map());
    const bucket = contexts.get(ctx);
    bucket.set(next, (bucket.get(next) || 0) + 1);
  }
  let total = 0;
  let weighted = 0;
  for (const bucket of contexts.values()) {
    const count = [...bucket.values()].reduce((a, b) => a + b, 0);
    total += count;
    weighted += count * entropy(bucket);
  }
  return total ? weighted / total : 0;
}
