/**
 * Detector 6 — Formatting and organisation.
 *
 * Chatbot answers have a recognisable architecture: an introduction announcing
 * the plan, bullet lists of uniform length, bold on labels, a recap conclusion.
 * This detector measures that "answer shape".
 *
 * Limitation: a professional blog post or technical documentation naturally
 * shows this structure. Low weight in the ensemble.
 */

import { combine, evidence, lengthConfidence, ramp, get, pct, num } from './base.js';

const K = 'detectors.structure';

export const structureDetector = {
  id: 'structure',
  labelKey: `${K}.label`,
  descriptionKey: `${K}.description`,

  run({ features, doc }) {
    const bulletRatio = get(features, 'mk.bulletLineRatio');
    const bulletUniform = get(features, 'mk.bulletUniformity');
    const headings = get(features, 'mk.headingCount');
    const bold = get(features, 'mk.boldCount');
    const colonList = get(features, 'mk.colonBeforeList');
    const paraUniform = get(features, 'syn.paraUniformity');
    const imperatives = get(features, 'mk.imperativeOpeners');

    const text = doc.text.toLowerCase();
    const hasConclusion = /(^|\n)\s*(in conclusion|to summarize|to summarise|in summary|en conclusion|pour conclure|en resume|pour resumer)/i.test(doc.text) ? 1 : 0;
    const hasPlanIntro = /(this article|in this (post|article|guide)|cet article|dans cet article|nous allons voir|we will explore)/i.test(text) ? 1 : 0;

    // Continuous prose: the absence of lists and headings is not evidence of
    // humanity, it is simply another format. We neutralise these signals rather
    // than count them as "human" votes.
    const plainProse = bulletRatio === 0 && headings === 0 && bold === 0;

    const s1 = ramp(bulletRatio, 0.02, 0.30);
    const s2 = bulletRatio > 0.05 ? ramp(bulletUniform, 0.35, 0.80) : 0.5;
    const s3 = ramp(headings, 0, 6);
    const s4 = ramp(bold, 0, 8);
    const s5 = ramp(colonList, 0, 4);
    const s6 = doc.paragraphs.length >= 4 ? ramp(paraUniform, 0.35, 0.85) : 0.5;
    const s7 = hasConclusion ? 0.78 : 0.45;
    const s8 = hasPlanIntro ? 0.70 : 0.48;
    const s9 = ramp(imperatives, 0, 5);

    const score = combine([
      { score: s1, weight: plainProse ? 0.15 : 1.0 },
      { score: s2, weight: plainProse ? 0 : 0.9 },
      { score: s3, weight: plainProse ? 0.1 : 0.7 },
      { score: s4, weight: plainProse ? 0 : 0.6 },
      { score: s5, weight: plainProse ? 0 : 0.6 },
      { score: s6, weight: 1.0 },
      { score: s7, weight: 0.9 },
      { score: s8, weight: 0.6 },
      { score: s9, weight: 0.5 },
    ]);

    return {
      id: this.id,
      labelKey: this.labelKey,
      score,
      confidence: Math.min(0.7, lengthConfidence(doc.wordCount)),
      evidence: [
        evidence(`${K}.ev1`, pct(bulletRatio), s1),
        evidence(`${K}.ev2`, bulletUniform.toFixed(2), s2, `${K}.ev2Hint`),
        evidence(`${K}.ev3`, paraUniform.toFixed(2), s6),
        evidence(`${K}.ev4`, { key: hasConclusion ? `${K}.yes` : `${K}.no` }, s7),
        evidence(`${K}.ev5`, String(headings), s3),
      ],
    };
  },
};
