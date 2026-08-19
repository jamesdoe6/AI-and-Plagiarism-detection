/**
 * Detector 3 — Stylometric uniformity.
 *
 * A human author drifts: their function-word proportions and grammatical
 * distribution shift from one paragraph to the next (fatigue, change of topic,
 * mood). An LLM keeps a near-constant signature across the whole text.
 *
 * Limitation: on a short text (fewer than three substantial paragraphs) drift
 * cannot be measured, and confidence drops sharply.
 */

import { combine, evidence, lengthConfidence, ramp, get, num, pct } from './base.js';

const K = 'detectors.stylometry';

export const stylometryDetector = {
  id: 'stylometry',
  labelKey: `${K}.label`,
  descriptionKey: `${K}.description`,

  run({ features, doc }) {
    const drift = get(features, 'sty.paragraphProfileDrift');
    const profiles = get(features, 'sty.paragraphProfileCount');
    const windowCv = get(features, 'sty.windowTtrCv');
    const fwRatio = get(features, 'sty.functionWordRatio');
    const posEntropy = get(features, 'pos.entropyNorm');
    const firstPerson = get(features, 'sty.firstPerson');
    const puncCv = get(features, 'punc.perSentenceCv');
    const openerDiversity = get(features, 'syn.openerDiversity');
    const fwEntropy = get(features, 'sty.functionWordEntropy');
    const fwCoverage = get(features, 'sty.functionWordCoverage');

    const measurable = profiles >= 3;
    const s1 = measurable ? ramp(drift, 0.08, 0.02) : 0.5;
    const s2 = ramp(windowCv, 0.14, 0.035);
    // Over-use of function words: generated text is more "connective".
    const s3 = ramp(fwRatio, 0.38, 0.53);
    const s4 = ramp(posEntropy, 0.80, 0.94);
    const s5 = ramp(firstPerson, 0.030, 0.002);
    const s6 = ramp(puncCv, 1.25, 0.55);
    const s7 = ramp(openerDiversity, 0.95, 0.60);
    // A human author draws on a wider, more uneven repertoire of function
    // words; a model concentrates usage on a narrow core.
    const s8 = ramp(fwEntropy, 5.35, 4.70);
    const s9 = ramp(fwCoverage, 0.26, 0.16);

    const score = combine([
      { score: s1, weight: measurable ? 1.6 : 0.2 },
      { score: s2, weight: 1.2 },
      { score: s3, weight: 0.7 },
      { score: s4, weight: 0.8 },
      { score: s5, weight: 1.0 },
      { score: s6, weight: 0.8 },
      { score: s7, weight: 1.0 },
      { score: s8, weight: 1.1 },
      { score: s9, weight: 0.9 },
    ]);

    return {
      id: this.id,
      labelKey: this.labelKey,
      score,
      confidence: lengthConfidence(doc.wordCount) * (measurable ? 1 : 0.55),
      evidence: [
        measurable
          ? evidence(`${K}.ev1`, drift.toFixed(4), s1, `${K}.ev1Hint`)
          : evidence(`${K}.ev1`, { key: `${K}.ev1NotMeasurable` }, s1, `${K}.ev1Hint`),
        evidence(`${K}.ev2`, num(windowCv), s2),
        evidence(`${K}.ev3`, pct(firstPerson, 2), s5, `${K}.ev3Hint`),
        evidence(`${K}.ev4`, num(openerDiversity), s7),
        evidence(`${K}.ev5`, num(puncCv), s6),
        evidence(`${K}.ev6`, `${fwEntropy.toFixed(2)} bits`, s8),
        evidence(`${K}.ev7`, pct(fwCoverage), s9),
      ],
    };
  },
};
