/**
 * Contract shared by every detector.
 *
 * A detector receives the analysis context and returns:
 *   {
 *     id, labelKey, descriptionKey,
 *     score:      estimated AI probability in [0,1]
 *     confidence: the detector's own reliability in [0,1]
 *     evidence:   human-readable indicators, as translation keys
 *     unavailable: true when the detector could not run
 *   }
 *
 * Detectors never return display strings — only i18n keys and parameters, so
 * that switching language re-renders an existing result without re-analysing.
 *
 * To add a detector: create a module exporting an object of this shape and
 * register it in `detectors/ensemble.js` plus `DETECTOR_WEIGHTS` in config.js.
 */

import { clamp, ramp } from '../core/stats.js';

export { clamp, ramp };

/**
 * Combine several weighted sub-signals into one score.
 * @param {Array<{score:number, weight:number}>} signals
 */
export function combine(signals) {
  const usable = signals.filter((s) => Number.isFinite(s.score) && s.weight > 0);
  if (!usable.length) return 0.5;
  const total = usable.reduce((a, s) => a + s.weight, 0);
  return clamp(usable.reduce((a, s) => a + s.score * s.weight, 0) / total);
}

/** Build a displayable indicator row. */
export function evidence(labelKey, value, score, hintKey = null, hintParams = null) {
  return {
    labelKey,
    value,
    score,
    direction: score > 0.6 ? 'ai' : score < 0.4 ? 'human' : 'neutral',
    hintKey,
    hintParams,
  };
}

/**
 * Confidence tied to sample size.
 *
 * Below roughly 150 words no statistical detector is reliable; published
 * studies show a clear accuracy drop on short texts. We therefore refuse to
 * display high confidence there.
 */
export function lengthConfidence(wordCount) {
  if (wordCount < 60) return 0.15;
  if (wordCount < 150) return 0.35;
  if (wordCount < 300) return 0.6;
  if (wordCount < 700) return 0.8;
  return 0.95;
}

export function get(features, key, fallback = 0) {
  const value = features[key];
  return Number.isFinite(value) ? value : fallback;
}

/** Formatting helpers — locale-independent, the UI adds units. */
export const pct = (value, digits = 1) => `${(value * 100).toFixed(digits)} %`;
export const num = (value, digits = 3) => (Number.isFinite(value) ? value.toFixed(digits) : '—');
