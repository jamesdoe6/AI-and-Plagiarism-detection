/**
 * Detector 4 — Calibrated lexical richness.
 *
 * LLMs occupy a narrow band of lexical richness: neither the repetitive poverty
 * of a rushed essay, nor the idiosyncratic peaks of a human author. We
 * therefore penalise both excess regularity and the known "machine zone" of the
 * MATTR / Yule K indices.
 *
 * Limitation: lexical richness depends enormously on domain (legal writing is
 * naturally repetitive). Moderate weight in the ensemble.
 */

import { combine, evidence, lengthConfidence, ramp, get, clamp, num, pct } from './base.js';

const K = 'detectors.lexicalRichness';

/** Peaks when the value sits at the centre of the "machine" band. */
function band(value, center, halfWidth) {
  if (!Number.isFinite(value)) return 0.5;
  return clamp(1 - Math.abs(value - center) / halfWidth);
}

export const lexicalRichnessDetector = {
  id: 'lexicalRichness',
  labelKey: `${K}.label`,
  descriptionKey: `${K}.description`,

  run({ features, doc }) {
    const mattr = get(features, 'lex.mattr');
    const hapax = get(features, 'lex.hapaxRatio');
    const yule = get(features, 'lex.yuleK');
    const longWords = get(features, 'lex.longWordRatio');
    const wordLenCv = get(features, 'lex.wordLenCv');
    const zipf = get(features, 'lex.zipfSlope');
    const contentRepeat = get(features, 'rep.contentRepeatRate');

    // The band is widened on short texts, where MATTR is mechanically high
    // (fewer opportunities to repeat a word).
    const mattrCenter = doc.wordCount < 400 ? 0.80 : 0.73;
    const s1 = band(mattr, mattrCenter, 0.20);
    const s2 = ramp(hapax, 0.52, 0.30);
    const s3 = band(yule, 95, 90);
    const s4 = ramp(longWords, 0.20, 0.36);
    const s5 = ramp(wordLenCv, 0.62, 0.42);
    const s6 = band(zipf, -1.0, 0.55);
    const s7 = ramp(contentRepeat, 0.10, 0.34);

    const score = combine([
      { score: s1, weight: 1.2 },
      { score: s2, weight: 1.1 },
      { score: s3, weight: 0.8 },
      { score: s4, weight: 0.9 },
      { score: s5, weight: 0.7 },
      { score: s6, weight: 0.5 },
      { score: s7, weight: 0.8 },
    ]);

    return {
      id: this.id,
      labelKey: this.labelKey,
      score,
      confidence: lengthConfidence(doc.wordCount) * 0.8,
      evidence: [
        evidence(`${K}.ev1`, num(mattr), s1),
        evidence(`${K}.ev2`, pct(hapax), s2, `${K}.ev2Hint`),
        evidence(`${K}.ev3`, pct(longWords), s4),
        evidence(`${K}.ev4`, pct(contentRepeat), s7),
      ],
    };
  },
};
