/**
 * Detector 2 — Structural burstiness.
 *
 * Human writing alternates long and short sentences irregularly; language
 * models converge on a stable target length. We measure the dispersion of
 * sentence lengths, the shape of their distribution and paragraph regularity.
 *
 * Limitation: edited, normalised, or house-style-constrained text (journalism,
 * technical documentation) can be very regular without being generated.
 */

import { combine, evidence, lengthConfidence, ramp, get, num, pct } from './base.js';

const K = 'detectors.burstiness';

export const burstinessDetector = {
  id: 'burstiness',
  labelKey: `${K}.label`,
  descriptionKey: `${K}.description`,

  run({ features, doc }) {
    const cvSent = get(features, 'syn.sentLenCv');
    const burst = get(features, 'syn.burstiness');
    const adjacent = get(features, 'syn.adjacentDeltaNorm');
    const uniform = get(features, 'syn.uniformSentRatio');
    const shortRatio = get(features, 'syn.shortSentRatio');
    const iqr = get(features, 'syn.sentLenIqr');
    const paraCv = get(features, 'syn.paraSentCv');
    const readCv = get(features, 'read.paragraphFleschCv');

    const s1 = ramp(cvSent, 0.62, 0.26);
    const s2 = ramp(burst, -0.28, -0.62);
    const s3 = ramp(adjacent, 0.62, 0.26);
    const s4 = ramp(uniform, 0.16, 0.44);
    const s5 = ramp(shortRatio, 0.26, 0.04);
    const s6 = ramp(iqr, 16, 5);
    const s7 = doc.paragraphs.length >= 3 ? ramp(paraCv, 0.55, 0.12) : 0.5;
    const s8 = ramp(readCv, 0.30, 0.06);

    const score = combine([
      { score: s1, weight: 1.6 },
      { score: s2, weight: 1.1 },
      { score: s3, weight: 1.2 },
      { score: s4, weight: 0.9 },
      { score: s5, weight: 1.0 },
      { score: s6, weight: 1.0 },
      { score: s7, weight: doc.paragraphs.length >= 3 ? 0.8 : 0.2 },
      { score: s8, weight: 0.7 },
    ]);

    return {
      id: this.id,
      labelKey: this.labelKey,
      score,
      confidence: lengthConfidence(doc.wordCount) * (doc.sentenceCount >= 8 ? 1 : 0.5),
      evidence: [
        evidence(`${K}.ev1`, num(cvSent), s1, `${K}.ev1Hint`),
        evidence(`${K}.ev2`, num(burst), s2, `${K}.ev2Hint`),
        evidence(`${K}.ev3`, `${iqr.toFixed(1)}`, s6),
        evidence(`${K}.ev4`, pct(shortRatio), s5, `${K}.ev4Hint`),
        evidence(`${K}.ev5`, num(readCv), s8),
      ],
    };
  },
};
