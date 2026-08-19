/**
 * Detector 1 — Predictability / perplexity proxy.
 *
 * Hypothesis: an LLM samples near the mode of its distribution, producing a
 * word sequence that is globally unsurprising and, above all, whose surprisal
 * varies little.
 *
 * Important calibration note: RAW surprisal conflates "predictable text" with
 * "learned text" (a word absent from the frequency table gets high surprisal
 * purely because it is long). We therefore rely primarily on:
 *   - surprisal restricted to known vocabulary (`ent.ivSurprisalMean`), which
 *     measures the choice between frequent and less-frequent words at constant
 *     register;
 *   - the DISPERSION of surprisal, which is the genuinely discriminative
 *     signal (the lexical counterpart of burstiness, in the spirit of
 *     DetectGPT-style approaches);
 *   - n-gram self-predictability.
 *
 * Main limitation: simple, school-level or translated human text also shows low
 * perplexity. This is the primary documented source of false positives for
 * non-native speakers.
 */

import { combine, evidence, lengthConfidence, ramp, get, num, pct } from './base.js';

const K = 'detectors.perplexity';

export const perplexityDetector = {
  id: 'perplexity',
  labelKey: `${K}.label`,
  descriptionKey: `${K}.description`,

  run({ features, doc }) {
    const ivMean = get(features, 'ent.ivSurprisalMean', 9.5);
    const oov = get(features, 'ent.oovRate');
    const cvSurprisal = get(features, 'ent.surprisalCv');
    const deltaMean = get(features, 'ent.surprisalDeltaMean');
    const selfPred = get(features, 'ent.selfPredictability');
    const sentCv = get(features, 'ent.sentenceSurprisalCv');
    const sentSd = get(features, 'ent.sentenceSurprisalSd');

    // Dominant signal: does information density vary from one sentence to the
    // next? A human alternates dense and sparse sentences; a model holds a
    // near-constant information rate. This is the lexical transposition of
    // burstiness, and the only signal in this family that cleanly separates
    // our reference samples.
    const s1 = ramp(sentCv, 0.155, 0.060);
    const s2 = ramp(sentSd, 1.55, 0.75);
    // Secondary signals, kept for interpretability but weighted low: they
    // depend too much on register to decide on their own.
    const s3 = ramp(cvSurprisal, 0.42, 0.26);
    const s4 = ramp(deltaMean, 6.5, 3.4);
    const s5 = ramp(selfPred, 0.860, 0.905);
    const s6 = ramp(ivMean, 10.6, 8.6);
    const s7 = ramp(oov, 0.34, 0.16);

    const score = combine([
      { score: s1, weight: 2.4 },
      { score: s2, weight: 1.3 },
      { score: s3, weight: 0.4 },
      { score: s4, weight: 0.4 },
      { score: s5, weight: 0.4 },
      { score: s6, weight: 0.3 },
      { score: s7, weight: 0.2 },
    ]);

    return {
      id: this.id,
      labelKey: this.labelKey,
      score,
      confidence: lengthConfidence(doc.wordCount) * 0.95,
      evidence: [
        evidence(`${K}.ev1`, num(sentCv), s1, `${K}.ev1Hint`),
        evidence(`${K}.ev2`, num(sentSd), s2),
        evidence(`${K}.ev3`, `${ivMean.toFixed(2)} bits`, s6, `${K}.ev3Hint`),
        evidence(`${K}.ev4`, num(cvSurprisal), s3),
        evidence(`${K}.ev5`, pct(oov), s7, `${K}.ev5Hint`),
      ],
    };
  },
};
