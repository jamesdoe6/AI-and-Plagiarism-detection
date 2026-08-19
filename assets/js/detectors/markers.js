/**
 * Detector 5 — Lexical markers of LLM style.
 *
 * Counts phrases over-represented in aligned-model output ("it is important to
 * note", "delve into", sentence-initial connectives, systematic hedging), minus
 * markers of personal involvement and informal register, which pull towards
 * human.
 *
 * Strong, acknowledged limitation: this is the easiest detector to defeat (just
 * remove a few phrases) and the biggest producer of false positives on academic
 * and institutional writing. Hence a bounded score and a capped confidence.
 */

import { combine, evidence, lengthConfidence, ramp, get, clamp, num } from './base.js';

const K = 'detectors.markers';

export const markersDetector = {
  id: 'markers',
  labelKey: `${K}.label`,
  descriptionKey: `${K}.description`,

  run({ features, doc, markerHits = [] }) {
    const phrasePer1k = get(features, 'mk.aiPhrasePer1k');
    const distinct = get(features, 'mk.aiPhraseDistinct');
    const transitions = get(features, 'mk.transitionPer1k');
    const transOpeners = get(features, 'mk.transitionOpenerRatio');
    const hedges = get(features, 'mk.hedgePer1k');
    const personal = get(features, 'mk.personalPer1k');
    const noise = get(features, 'mk.humanNoisePer1k');
    const tells = get(features, 'mk.assistantTells');
    const notOnly = get(features, 'mk.notOnlyButAlso');
    const tricolon = get(features, 'mk.tricolon');

    const s1 = ramp(phrasePer1k, 0.5, 9);
    const s2 = ramp(distinct, 1, 10);
    const s3 = ramp(transitions, 4, 22);
    const s4 = ramp(transOpeners, 0.05, 0.30);
    const s5 = ramp(hedges, 5, 22);
    const s6 = ramp(personal, 6, 0);          // lots of "I" => human
    const s7 = ramp(noise, 2.5, 0);           // informal register => human
    const s8 = tells > 0 ? 0.95 : 0.5;
    const s9 = ramp((notOnly + tricolon) / Math.max(1, doc.sentenceCount / 10), 0.4, 3);

    const raw = combine([
      { score: s1, weight: 1.5 },
      { score: s2, weight: 1.2 },
      { score: s3, weight: 0.9 },
      { score: s4, weight: 1.1 },
      { score: s5, weight: 0.6 },
      { score: s6, weight: 1.2 },
      { score: s7, weight: 0.9 },
      { score: s8, weight: tells > 0 ? 1.4 : 0.2 },
      { score: s9, weight: 0.7 },
    ]);

    // Bounded score: markers alone must never be enough to conclude.
    const score = clamp(0.10 + raw * 0.82);

    return {
      id: this.id,
      labelKey: this.labelKey,
      score,
      confidence: Math.min(0.75, lengthConfidence(doc.wordCount)),
      evidence: [
        evidence(`${K}.ev1`, phrasePer1k.toFixed(2), s1),
        evidence(`${K}.ev2`, String(distinct), s2),
        evidence(`${K}.ev3`, `${(transOpeners * 100).toFixed(1)} %`, s4),
        evidence(`${K}.ev4`, personal.toFixed(2), s6, `${K}.ev4Hint`),
        evidence(`${K}.ev5`, noise.toFixed(2), s7),
        tells > 0 ? evidence(`${K}.ev6`, String(tells), 0.95, `${K}.ev6Hint`) : null,
      ].filter(Boolean),
      markerHits,
    };
  },
};
