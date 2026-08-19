/**
 * Lexical metrics: richness, diversity, word morphology.
 *
 * Why they matter: LLMs produce vocabulary whose diversity is REGULAR (neither
 * impoverished nor exceptionally rich) and avoid both very rare words and clumsy
 * repetition. The classic richness indices (TTR, Yule K, Honoré R, Brunet W)
 * capture that regularity.
 */

import { counter, mean, stdev, cv, skewness, kurtosis, gini, entropy, median, quantile } from '../core/stats.js';

const MAX_WORD_BIN = 18;

export function lexicalFeatures(doc) {
  const tokens = doc.lower;
  const n = tokens.length;
  const f = {};
  if (!n) return { features: f };

  const lengths = tokens.map((w) => w.length);
  const freq = counter(tokens);
  const types = freq.size;
  const hapax = [...freq.values()].filter((c) => c === 1).length;
  const dis = [...freq.values()].filter((c) => c === 2).length;

  f['lex.tokenCount'] = n;
  f['lex.typeCount'] = types;
  f['lex.ttr'] = types / n;
  f['lex.rootTtr'] = types / Math.sqrt(n);              // Guiraud R
  f['lex.corrTtr'] = types / Math.sqrt(2 * n);          // Carroll CTTR
  f['lex.logTtr'] = Math.log(types) / Math.log(n);      // Herdan C
  f['lex.mattr'] = movingAverageTtr(tokens, 100);
  f['lex.mattr50'] = movingAverageTtr(tokens, 50);
  f['lex.msttr'] = segmentalTtr(tokens, 100);
  f['lex.hapaxRatio'] = hapax / n;
  f['lex.disLegomenaRatio'] = dis / n;
  f['lex.honoreR'] = hapax === types ? 0 : (100 * Math.log(n)) / (1 - hapax / types);
  f['lex.brunetW'] = n ** (types ** -0.165);
  f['lex.yuleK'] = yuleK(freq, n);
  f['lex.simpsonD'] = simpsonD(freq, n);
  f['lex.maas'] = types > 1 ? (Math.log(n) - Math.log(types)) / Math.log(n) ** 2 : 0;

  f['lex.wordLenMean'] = mean(lengths);
  f['lex.wordLenSd'] = stdev(lengths);
  f['lex.wordLenCv'] = cv(lengths);
  f['lex.wordLenSkew'] = skewness(lengths);
  f['lex.wordLenKurt'] = kurtosis(lengths);
  f['lex.wordLenMedian'] = median(lengths);
  f['lex.wordLenP90'] = quantile(lengths, 0.9);
  f['lex.wordLenIqr'] = quantile(lengths, 0.75) - quantile(lengths, 0.25);
  f['lex.longWordRatio'] = lengths.filter((l) => l >= 7).length / n;
  f['lex.veryLongWordRatio'] = lengths.filter((l) => l >= 12).length / n;
  f['lex.shortWordRatio'] = lengths.filter((l) => l <= 3).length / n;

  // Word-length histogram: 18 further metrics.
  const bins = new Array(MAX_WORD_BIN).fill(0);
  for (const l of lengths) bins[Math.min(l, MAX_WORD_BIN) - 1] += 1;
  bins.forEach((count, i) => { f[`lex.wordLenBin${i + 1}`] = count / n; });

  f['lex.freqEntropy'] = entropy(freq);
  f['lex.freqEntropyNorm'] = types > 1 ? entropy(freq) / Math.log2(types) : 0;
  f['lex.freqGini'] = gini([...freq.values()]);
  f['lex.topWordShare'] = Math.max(...freq.values()) / n;
  f['lex.top10Share'] = topKShare(freq, 10) / n;
  f['lex.top50Share'] = topKShare(freq, 50) / n;
  f['lex.zipfSlope'] = zipfSlope(freq);

  // Morphology
  const capitalized = doc.tokens.filter((w) => /^[A-ZÀ-Þ]/.test(w)).length;
  f['lex.capitalizedRatio'] = capitalized / n;
  f['lex.allCapsRatio'] = doc.tokens.filter((w) => w.length > 1 && w === w.toUpperCase() && /[A-ZÀ-Þ]/.test(w)).length / n;
  f['lex.digitTokenRatio'] = tokens.filter((w) => /\d/.test(w)).length / n;
  f['lex.hyphenTokenRatio'] = tokens.filter((w) => w.includes('-')).length / n;
  f['lex.apostropheTokenRatio'] = tokens.filter((w) => /['’]/.test(w)).length / n;

  return { features: f, freq, types, hapax };
}

function topKShare(freq, k) {
  return [...freq.values()].sort((a, b) => b - a).slice(0, k).reduce((a, b) => a + b, 0);
}

/** Moving Average TTR: robust to text length, unlike raw TTR. */
export function movingAverageTtr(tokens, window = 100) {
  if (tokens.length < window) return new Set(tokens).size / Math.max(1, tokens.length);
  let total = 0;
  let count = 0;
  const freq = new Map();
  for (let i = 0; i < tokens.length; i += 1) {
    freq.set(tokens[i], (freq.get(tokens[i]) || 0) + 1);
    if (i >= window) {
      const out = tokens[i - window];
      const c = freq.get(out) - 1;
      if (c <= 0) freq.delete(out); else freq.set(out, c);
    }
    if (i >= window - 1) { total += freq.size / window; count += 1; }
  }
  return count ? total / count : 0;
}

function segmentalTtr(tokens, size = 100) {
  const segments = Math.floor(tokens.length / size);
  if (!segments) return new Set(tokens).size / Math.max(1, tokens.length);
  let total = 0;
  for (let i = 0; i < segments; i += 1) {
    total += new Set(tokens.slice(i * size, (i + 1) * size)).size / size;
  }
  return total / segments;
}

function yuleK(freq, n) {
  const spectrum = new Map();
  for (const c of freq.values()) spectrum.set(c, (spectrum.get(c) || 0) + 1);
  let inner = 0;
  for (const [times, count] of spectrum) inner += count * times ** 2;
  return n ? (10000 * (inner - n)) / n ** 2 : 0;
}

function simpsonD(freq, n) {
  if (n < 2) return 0;
  let total = 0;
  for (const c of freq.values()) total += c * (c - 1);
  return total / (n * (n - 1));
}

/** Slope of the log(rank)/log(frequency) line: the text's Zipfian regularity. */
function zipfSlope(freq) {
  const sorted = [...freq.values()].sort((a, b) => b - a).slice(0, 200);
  if (sorted.length < 10) return 0;
  const xs = sorted.map((_, i) => Math.log(i + 1));
  const ys = sorted.map((c) => Math.log(c));
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i += 1) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  return den ? num / den : 0;
}
