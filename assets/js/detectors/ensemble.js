/**
 * Detection ensemble.
 *
 * Principle ("ensemble detection"): no single detector is reliable. We combine
 * deliberately ORTHOGONAL signals (information, rhythm, stylometry, lexis,
 * structure, compression, plus optional remote models) through a
 * reliability-weighted mean, then evaluate:
 *
 *   - the final score (0–100 %);
 *   - the confidence level, a function of text length, agreement between
 *     detectors and availability of remote models;
 *   - a cautious, never binary, textual verdict.
 *
 * Hard-coded safeguards:
 *   - a text under 40 words is not scored at all;
 *   - disagreement between detectors pulls the score back towards 50 %;
 *   - an unsupported language (neither fr nor en) caps confidence;
 *   - the "likely AI" verdict only appears above the configured threshold
 *     (85 % by default).
 *
 * Everything user-facing is returned as translation keys, never as strings, so
 * the interface can switch language without re-running the analysis.
 */

import { DETECTOR_WEIGHTS, AI_THRESHOLDS, LIMITS } from '../config.js';
import { clamp, stdev } from '../core/stats.js';
import { extractFeatures } from '../features/index.js';

import { perplexityDetector } from './perplexity.js';
import { burstinessDetector } from './burstiness.js';
import { stylometryDetector } from './stylometry.js';
import { lexicalRichnessDetector } from './lexical-richness.js';
import { markersDetector } from './markers.js';
import { structureDetector } from './structure.js';
import { syntaxTemplateDetector } from './syntax-template.js';
import { compressionDetector } from './compression.js';
import { remoteLlmDetector } from './remote-llm.js';
import { remoteClassifierDetector } from './remote-classifier.js';

/** Local detectors: always run, no network calls. */
export const LOCAL_DETECTORS = [
  perplexityDetector,
  burstinessDetector,
  stylometryDetector,
  lexicalRichnessDetector,
  markersDetector,
  structureDetector,
  syntaxTemplateDetector,
  compressionDetector,
];

/** Remote detectors: only run when the user has configured them. */
export const REMOTE_DETECTORS = [remoteLlmDetector, remoteClassifierDetector];

/**
 * Run the full AI analysis.
 * @param {string} text
 * @param {object} settings
 * @param {{onStep?:Function, onLog?:Function}} hooks
 */
export async function analyzeAi(text, settings, hooks = {}) {
  const { onStep = () => {}, onLog = () => {} } = hooks;

  onStep({ key: 'steps.features' }, 0.05);
  const extraction = await extractFeatures(text, (stepKey, ratio) => {
    onStep({ key: stepKey }, 0.05 + ratio * 0.35);
  });

  const ctx = {
    features: extraction.features,
    doc: extraction.doc,
    language: extraction.language,
    markerHits: extraction.markerHits,
    settings,
    onLog,
  };

  // --- Local detectors ---
  const results = [];
  LOCAL_DETECTORS.forEach((detector, i) => {
    onStep({ key: 'steps.detector', params: { label: detector.labelKey } },
      0.45 + (i / LOCAL_DETECTORS.length) * 0.2);
    try {
      const result = detector.run(ctx);
      results.push({
        ...result,
        weight: DETECTOR_WEIGHTS[detector.id] ?? 1,
        descriptionKey: detector.descriptionKey,
      });
    } catch (err) {
      onLog({ key: 'logs.detectorFailed', params: { id: detector.id, message: err.message } });
      results.push({
        id: detector.id,
        labelKey: detector.labelKey,
        descriptionKey: detector.descriptionKey,
        unavailable: true,
        errorText: err.message,
        score: 0.5,
        confidence: 0,
        weight: 0,
        evidence: [],
      });
    }
  });

  // --- Remote detectors (optional, failure-tolerant) ---
  for (const detector of REMOTE_DETECTORS) {
    if (!detector.isEnabled(settings)) continue;
    onStep({ key: 'steps.remoteDetector', params: { label: detector.labelKey } }, 0.7);
    try {
      const result = await detector.run(ctx);
      results.push({
        ...result,
        weight: DETECTOR_WEIGHTS[detector.id] ?? 1,
        descriptionKey: detector.descriptionKey,
        remote: true,
      });
      onLog({ key: 'logs.remoteScore', params: { label: detector.labelKey, score: (result.score * 100).toFixed(1) } });
    } catch (err) {
      onLog({ key: 'logs.remoteUnavailable', params: { label: detector.labelKey, message: err.message } });
      results.push({
        id: detector.id,
        labelKey: detector.labelKey,
        descriptionKey: detector.descriptionKey,
        unavailable: true,
        remote: true,
        errorText: err.message,
        score: 0.5,
        confidence: 0,
        weight: 0,
        evidence: [],
      });
    }
  }

  onStep({ key: 'steps.aggregating' }, 0.9);
  const aggregate = aggregateEnsemble(results, extraction, settings);

  return {
    ...aggregate,
    detectors: results,
    features: extraction.features,
    featureCount: extraction.featureCount,
    language: extraction.language,
    doc: extraction.doc,
    markerHits: extraction.markerHits,
  };
}

/**
 * Combine the detectors and produce score, confidence and verdict.
 * @param {object} [settings] lets the user override the alert threshold. The
 *   intermediate bands are derived from it so the whole scale stays coherent:
 *   moving the threshold moves the entire scale.
 */
export function aggregateEnsemble(results, extraction, settings = {}) {
  const thresholds = resolveThresholds(settings.aiThreshold);
  const usable = results.filter((r) => !r.unavailable && r.weight > 0 && Number.isFinite(r.score));
  const doc = extraction.doc;

  if (doc.wordCount < LIMITS.minWordsForAnalysis || !usable.length) {
    return {
      score: null,
      confidence: 0,
      confidenceKey: 'confidence.insufficient',
      verdictKey: 'verdict.tooShort',
      agreement: 0,
      votes: { ai: 0, human: 0, neutral: 0 },
      tooShort: true,
      thresholds,
      reasons: [{
        key: 'reasons.tooShortDetail',
        params: {
          words: doc.wordCount,
          min: LIMITS.minWordsForAnalysis,
          recommended: LIMITS.minWordsForHighConfidence,
        },
      }],
    };
  }

  // Weighting: configured weight x the detector's own confidence.
  const totalWeight = usable.reduce((a, r) => a + r.weight * Math.max(0.05, r.confidence), 0);
  const weighted = usable.reduce((a, r) => a + r.score * r.weight * Math.max(0.05, r.confidence), 0) / totalWeight;

  // Majority vote (secondary indicator, shown in expert mode).
  const votes = { ai: 0, human: 0, neutral: 0 };
  for (const r of usable) {
    if (r.score >= 0.62) votes.ai += 1;
    else if (r.score <= 0.38) votes.human += 1;
    else votes.neutral += 1;
  }

  // Agreement between detectors: strong disagreement must shrink the distance
  // from 50 %.
  const spread = stdev(usable.map((r) => r.score));
  const agreement = clamp(1 - spread / 0.45);

  // Regression towards the centre, proportional to the disagreement.
  const shrink = 0.55 + 0.45 * agreement;
  let score = 0.5 + (weighted - 0.5) * shrink;

  // Unsupported-language penalty: the bundled resources are fr/en only.
  const languageOk = extraction.language.supported;
  if (!languageOk) score = 0.5 + (score - 0.5) * 0.6;

  const lengthFactor = clamp(
    doc.wordCount < LIMITS.minWordsForHighConfidence
      ? 0.35 + (doc.wordCount / LIMITS.minWordsForHighConfidence) * 0.45
      : 0.8 + Math.min(0.2, (doc.wordCount - LIMITS.minWordsForHighConfidence) / 3000),
  );

  const remoteBonus = usable.some((r) => r.remote) ? 1.1 : 1;
  const confidence = clamp(agreement * lengthFactor * remoteBonus * (languageOk ? 1 : 0.7));

  const percent = clamp(score) * 100;
  const band = bandFor(percent, thresholds);

  return {
    score: percent,
    rawScore: weighted * 100,
    confidence,
    confidenceKey: confidenceKeyFor(confidence),
    agreement,
    spread,
    votes,
    band,
    thresholds,
    verdictKey: verdictKeyFor(band),
    lowConfidence: confidence < 0.45,
    reasons: buildReasons(usable, extraction, percent, agreement, languageOk, thresholds),
    detectorCount: usable.length,
  };
}

export function confidenceKeyFor(confidence) {
  if (confidence >= 0.72) return 'confidence.high';
  if (confidence >= 0.48) return 'confidence.medium';
  if (confidence >= 0.25) return 'confidence.low';
  return 'confidence.veryLow';
}

/**
 * Derive the full scale from the chosen alert threshold.
 * The default (85 %) reproduces AI_THRESHOLDS exactly; lowering it compresses
 * the lower bands proportionally, without ever inverting them.
 */
export function resolveThresholds(alertThreshold) {
  const strong = Number.isFinite(Number(alertThreshold))
    ? Math.min(95, Math.max(55, Number(alertThreshold)))
    : AI_THRESHOLDS.strong;
  const ratio = strong / AI_THRESHOLDS.strong;
  return {
    human: Math.round(AI_THRESHOLDS.human * ratio),
    uncertain: Math.round(AI_THRESHOLDS.uncertain * ratio),
    likely: Math.round(AI_THRESHOLDS.likely * ratio),
    strong,
  };
}

export function bandFor(percent, thresholds = AI_THRESHOLDS) {
  if (percent < thresholds.human) return 'human';
  if (percent < thresholds.uncertain) return 'uncertain';
  if (percent < thresholds.likely) return 'mixed';
  if (percent < thresholds.strong) return 'likely-ai';
  return 'strong-ai';
}

function verdictKeyFor(band) {
  switch (band) {
    case 'human': return 'verdict.human';
    case 'uncertain': return 'verdict.uncertain';
    case 'mixed': return 'verdict.mixed';
    case 'likely-ai': return 'verdict.likelyAi';
    default: return 'verdict.strongAi';
  }
}

/**
 * Explain the score in plain language, leaning on the most telling indicators.
 * Returns translation keys and parameters, resolved by the render layer.
 */
function buildReasons(results, extraction, percent, agreement, languageOk, thresholds) {
  const reasons = [];
  const sorted = [...results].sort((a, b) => Math.abs(b.score - 0.5) - Math.abs(a.score - 0.5));

  for (const r of sorted.slice(0, 4)) {
    const top = r.evidence?.find((e) => Math.abs(e.score - 0.5) > 0.18) ?? r.evidence?.[0];
    reasons.push({
      key: 'reasons.detector',
      params: {
        label: { key: r.labelKey },
        percent: (r.score * 100).toFixed(0),
        direction: { key: r.score > 0.5 ? 'reasons.directionAi' : 'reasons.directionHuman' },
        evidence: top
          ? { key: 'reasons.evidenceSuffix', params: { label: { key: top.labelKey }, value: top.value } }
          : '',
      },
    });
  }

  if (agreement < 0.55) reasons.push({ key: 'reasons.disagreement' });
  if (!languageOk) reasons.push({ key: 'reasons.unsupportedLanguage' });
  if (extraction.doc.wordCount < 300) {
    reasons.push({ key: 'reasons.shortText', params: { words: extraction.doc.wordCount } });
  }
  if (percent >= thresholds.uncertain && percent < thresholds.strong) {
    reasons.push({ key: 'reasons.intermediateZone' });
  }

  // Register safeguard. The signals we exploit (rhythm regularity, stylometric
  // uniformity, connective density) correlate strongly with how FORMAL a text
  // is, not only with its origin. On very formal text the false-positive risk
  // genuinely rises: we say so, rather than letting the score speak alone.
  const formality = formalityIndex(extraction.features);
  if (formality > 0.62 && percent >= thresholds.uncertain) {
    reasons.push({ key: 'reasons.formalRegister', params: { index: formality.toFixed(2) } });
  }

  return reasons;
}

/**
 * Formality index in [0,1]. Used purely as a warning: it does not enter the
 * score computation, it qualifies the score's reliability.
 */
export function formalityIndex(features) {
  const longWords = features['lex.longWordRatio'] ?? 0;
  const sentLen = features['syn.sentLenMean'] ?? 0;
  const firstPerson = features['sty.firstPerson'] ?? 0;
  const noise = features['mk.humanNoisePer1k'] ?? 0;
  const nominal = features['pos.nominalRatio'] ?? 0;

  const signals = [
    clamp((longWords - 0.16) / 0.22),
    clamp((sentLen - 12) / 14),
    clamp(1 - firstPerson / 0.03),
    clamp(1 - noise / 2.5),
    clamp((nominal - 0.22) / 0.16),
  ];
  return signals.reduce((a, b) => a + b, 0) / signals.length;
}

/** Adjust a weight at runtime (used by the advanced interface). */
export function setDetectorWeight(id, weight) {
  DETECTOR_WEIGHTS[id] = weight;
}
