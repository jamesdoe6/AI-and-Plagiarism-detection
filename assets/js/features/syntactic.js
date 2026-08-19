/**
 * Sentence-level syntactic and structural metrics.
 *
 * This is where "burstiness" plays out: a human alternates short and long
 * sentences irregularly, an LLM converges on a stable mean length. We therefore
 * measure not only the mean but above all the dispersion, the gap between
 * neighbouring sentences, and the shape of the distribution.
 */

import { mean, stdev, cv, skewness, kurtosis, median, quantile, entropy, counter } from '../core/stats.js';
import { words } from '../core/tokenize.js';

const SENT_BINS = [5, 8, 11, 14, 17, 20, 24, 28, 33, 40, 50, 70, Infinity];

export function syntacticFeatures(doc) {
  const f = {};
  const sents = doc.sentences;
  if (!sents.length) return { features: f, sentenceLengths: [] };

  const sentTokens = sents.map((s) => words(s.text));
  const lengths = sentTokens.map((t) => t.length);
  const charLengths = sents.map((s) => s.text.length);

  f['syn.sentenceCount'] = sents.length;
  f['syn.sentLenMean'] = mean(lengths);
  f['syn.sentLenSd'] = stdev(lengths);
  f['syn.sentLenCv'] = cv(lengths);                 // the central burstiness metric
  f['syn.sentLenSkew'] = skewness(lengths);
  f['syn.sentLenKurt'] = kurtosis(lengths);
  f['syn.sentLenMedian'] = median(lengths);
  f['syn.sentLenMin'] = Math.min(...lengths);
  f['syn.sentLenMax'] = Math.max(...lengths);
  f['syn.sentLenRange'] = Math.max(...lengths) - Math.min(...lengths);
  f['syn.sentLenIqr'] = quantile(lengths, 0.75) - quantile(lengths, 0.25);
  f['syn.sentLenP10'] = quantile(lengths, 0.1);
  f['syn.sentLenP90'] = quantile(lengths, 0.9);
  f['syn.sentLenEntropy'] = entropy(counter(lengths));
  f['syn.charLenMean'] = mean(charLengths);
  f['syn.charLenCv'] = cv(charLengths);

  // Local burstiness: mean gap between consecutive sentences.
  const deltas = [];
  for (let i = 1; i < lengths.length; i += 1) deltas.push(Math.abs(lengths[i] - lengths[i - 1]));
  f['syn.adjacentDeltaMean'] = mean(deltas);
  f['syn.adjacentDeltaSd'] = stdev(deltas);
  f['syn.adjacentDeltaNorm'] = mean(lengths) ? mean(deltas) / mean(lengths) : 0;
  f['syn.burstiness'] = burstinessCoefficient(lengths);
  f['syn.shortSentRatio'] = lengths.filter((l) => l <= 8).length / lengths.length;
  f['syn.longSentRatio'] = lengths.filter((l) => l >= 30).length / lengths.length;
  f['syn.midSentRatio'] = lengths.filter((l) => l > 12 && l < 26).length / lengths.length;
  f['syn.uniformSentRatio'] = uniformRunRatio(lengths, 0.2);

  // Sentence-length histogram: 13 metrics.
  const bins = new Array(SENT_BINS.length).fill(0);
  for (const l of lengths) {
    const idx = SENT_BINS.findIndex((edge) => l <= edge);
    bins[idx === -1 ? SENT_BINS.length - 1 : idx] += 1;
  }
  bins.forEach((count, i) => { f[`syn.sentBin${i}`] = count / lengths.length; });

  // Intra-sentence complexity: commas, subordination, parentheticals.
  const commas = sents.map((s) => (s.text.match(/,/g) ?? []).length);
  f['syn.commasPerSentence'] = mean(commas);
  f['syn.commasPerSentenceSd'] = stdev(commas);
  f['syn.commaFreeSentRatio'] = commas.filter((c) => c === 0).length / sents.length;
  f['syn.multiClauseRatio'] = commas.filter((c) => c >= 2).length / sents.length;
  f['syn.subordinationRate'] = mean(sents.map((s) => (s.text.match(/\b(that|which|who|because|although|while|dont|qui|que|dont|parce|bien que|alors que|lorsque)\b/gi) ?? []).length));
  f['syn.coordinationRate'] = mean(sents.map((s) => (s.text.match(/\b(and|or|but|et|ou|mais|donc)\b/gi) ?? []).length));

  // Sentence types.
  f['syn.questionRatio'] = sents.filter((s) => /\?\s*$/.test(s.text)).length / sents.length;
  f['syn.exclamationRatio'] = sents.filter((s) => /!\s*$/.test(s.text)).length / sents.length;
  f['syn.declarativeRatio'] = sents.filter((s) => /\.\s*$/.test(s.text)).length / sents.length;
  f['syn.fragmentRatio'] = sents.filter((s) => words(s.text).length <= 4).length / sents.length;

  // Sentence openings: their diversity separates human from LLM sharply.
  const openers = sents.map((s) => (words(s.text)[0] ?? '').toLowerCase());
  const openerFreq = counter(openers);
  f['syn.openerDiversity'] = openerFreq.size / sents.length;
  f['syn.openerEntropy'] = entropy(openerFreq);
  f['syn.openerTopShare'] = Math.max(0, ...openerFreq.values()) / sents.length;
  f['syn.openerRepeatRate'] = repeatedAdjacent(openers);
  const bigramOpeners = counter(sents.map((s) => words(s.text).slice(0, 2).join(' ').toLowerCase()));
  f['syn.opener2Diversity'] = bigramOpeners.size / sents.length;
  f['syn.determinerOpenerRatio'] = openers.filter((w) => ['the', 'a', 'an', 'this', 'these', 'le', 'la', 'les', 'un', 'une', 'ce', 'cette', 'ces'].includes(w)).length / sents.length;
  f['syn.pronounOpenerRatio'] = openers.filter((w) => ['i', 'we', 'you', 'he', 'she', 'they', 'it', 'je', 'nous', 'vous', 'il', 'elle', 'ils', 'elles', 'on'].includes(w)).length / sents.length;

  // Paragraphs.
  const paraLengths = doc.paragraphs.map((p) => words(p).length);
  const paraSentCounts = doc.paragraphs.map((p) => Math.max(1, (p.match(/[.!?…]+/g) ?? []).length));
  f['syn.paragraphCount'] = doc.paragraphs.length;
  f['syn.paraLenMean'] = mean(paraLengths);
  f['syn.paraLenCv'] = cv(paraLengths);
  f['syn.paraSentMean'] = mean(paraSentCounts);
  f['syn.paraSentCv'] = cv(paraSentCounts);
  f['syn.paraUniformity'] = paraLengths.length > 2 ? 1 - Math.min(1, cv(paraLengths)) : 0;

  return { features: f, sentenceLengths: lengths, sentTokens };
}

/**
 * Goh & Barabási burstiness coefficient: (sigma - mu) / (sigma + mu).
 * Close to -1: ultra-regular (machine signature). Near 0 or positive: the
 * irregularity typical of human writing.
 */
export function burstinessCoefficient(values) {
  const m = mean(values);
  const s = stdev(values);
  if (m + s === 0) return 0;
  return (s - m) / (s + m);
}

/** Share of sentences whose length is close to the preceding one. */
function uniformRunRatio(lengths, tolerance = 0.2) {
  if (lengths.length < 2) return 0;
  let count = 0;
  for (let i = 1; i < lengths.length; i += 1) {
    const base = Math.max(1, lengths[i - 1]);
    if (Math.abs(lengths[i] - base) / base <= tolerance) count += 1;
  }
  return count / (lengths.length - 1);
}

function repeatedAdjacent(items) {
  if (items.length < 2) return 0;
  let count = 0;
  for (let i = 1; i < items.length; i += 1) if (items[i] && items[i] === items[i - 1]) count += 1;
  return count / (items.length - 1);
}
