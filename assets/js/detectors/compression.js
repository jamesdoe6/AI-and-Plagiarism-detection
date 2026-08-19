/**
 * Detector 8 — Redundancy measured by compression.
 *
 * The gzip compression ratio is an information measure independent of every
 * linguistic heuristic: the more a text reuses its own sequences, the better it
 * compresses. That makes it a signal orthogonal to the other detectors, which
 * is the whole point of an ensemble.
 *
 * Calibration: the raw ratio depends heavily on length. We therefore use the
 * STRUCTURAL GAIN = ratio of the text / ratio of the same text with its words
 * shuffled. That null baseline neutralises the effect of vocabulary and size.
 *
 * Deliberate restriction: below roughly 600 words gzip has too little material
 * for the ratio to be stable (observed values all cluster around 1.00, with no
 * relation to the text's origin). In that case the detector declares itself
 * UNAVAILABLE rather than voting at random — a detector that abstains is worth
 * more than one that adds noise to the ensemble.
 */

import { combine, evidence, lengthConfidence, ramp, get, pct } from './base.js';

const K = 'detectors.compression';
const MIN_WORDS = 600;

export const compressionDetector = {
  id: 'compression',
  labelKey: `${K}.label`,
  descriptionKey: `${K}.description`,

  run({ features, doc }) {
    const gain = features['rep.gzipStructuralGain'];
    const hasGain = Number.isFinite(gain);
    const enoughText = doc.wordCount >= MIN_WORDS;

    if (!hasGain || !enoughText) {
      return {
        id: this.id,
        labelKey: this.labelKey,
        score: 0.5,
        confidence: 0,
        unavailable: true,
        errorKey: !hasGain ? `${K}.unavailableApi` : `${K}.unavailableShort`,
        errorParams: { words: doc.wordCount, min: MIN_WORDS },
        evidence: [],
      };
    }

    const repeat4 = get(features, 'rep.repeat4');
    const repeat6 = get(features, 'rep.repeat6');
    const globalOverlap = get(features, 'rep.globalSentenceOverlap');
    const ngram3 = get(features, 'ent.ngramDiversity3', 1);

    // Structural gain: ~0.97 for varied human prose, distinctly lower when the
    // text massively reuses its own turns of phrase.
    const s1 = ramp(gain, 0.985, 0.900);
    const s2 = ramp(repeat4, 0.004, 0.045);
    const s3 = ramp(repeat6, 0.001, 0.02);
    const s4 = ramp(globalOverlap, 0.05, 0.20);
    const s5 = ramp(ngram3, 0.998, 0.960);

    const score = combine([
      { score: s1, weight: 2.0 },
      { score: s2, weight: 1.0 },
      { score: s3, weight: 0.7 },
      { score: s4, weight: 0.7 },
      { score: s5, weight: 0.6 },
    ]);

    return {
      id: this.id,
      labelKey: this.labelKey,
      score,
      confidence: lengthConfidence(doc.wordCount) * 0.8,
      evidence: [
        evidence(`${K}.ev1`, gain.toFixed(4), s1, `${K}.ev1Hint`),
        evidence(`${K}.ev2`, pct(repeat4, 2), s2),
        evidence(`${K}.ev3`, pct(repeat6, 2), s3),
        evidence(`${K}.ev4`, pct(globalOverlap), s4),
      ],
    };
  },
};
