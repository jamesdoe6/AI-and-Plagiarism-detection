/**
 * Assembly of the complete feature vector.
 *
 * The vector aggregates every metric family. In practice it holds between 730
 * and 950 dimensions depending on the detected language:
 *   - lexical             ~57
 *   - syntactic           ~60
 *   - punctuation / chars ~93
 *   - information         ~40
 *   - repetition          ~30
 *   - readability         ~17
 *   - stylometry          ~240 to 380 (one per function word)
 *   - markers             ~250 (one per lexicon entry)
 *
 * Detectors consume this vector; they never re-tokenise.
 */

import { buildDocument } from '../core/tokenize.js';
import { detectLanguage } from '../core/language.js';
import { lexicalFeatures } from './lexical.js';
import { syntacticFeatures } from './syntactic.js';
import { punctuationFeatures } from './punctuation.js';
import { entropyFeatures } from './entropy.js';
import { repetitionFeatures, compressionProfile } from './repetition.js';
import { readabilityFeatures } from './readability.js';
import { stylometryFeatures } from './stylometry.js';
import { markerFeatures } from './markers.js';

/** Display order and translation key of each metric family. */
export const FEATURE_GROUPS = [
  { id: 'lex', labelKey: 'groups.lex' },
  { id: 'syn', labelKey: 'groups.syn' },
  { id: 'punc', labelKey: 'groups.punc' },
  { id: 'char', labelKey: 'groups.char' },
  { id: 'ent', labelKey: 'groups.ent' },
  { id: 'rep', labelKey: 'groups.rep' },
  { id: 'read', labelKey: 'groups.read' },
  { id: 'sty', labelKey: 'groups.sty' },
  { id: 'fw', labelKey: 'groups.fw' },
  { id: 'pos', labelKey: 'groups.pos' },
  { id: 'mk', labelKey: 'groups.mk' },
];

/**
 * @param {string} rawText
 * @param {(stepKey:string, ratio:number)=>void} [onProgress] receives a
 *   translation key, never a display string.
 */
export async function extractFeatures(rawText, onProgress = () => {}) {
  const doc = buildDocument(rawText);
  const language = detectLanguage(doc.text);
  const lang = language.lang;

  const features = {};
  const detail = {};
  const steps = [
    ['steps.lexical', () => lexicalFeatures(doc)],
    ['steps.syntactic', () => syntacticFeatures(doc)],
    ['steps.punctuation', () => punctuationFeatures(doc)],
    ['steps.entropy', () => entropyFeatures(doc, lang)],
    ['steps.repetition', () => repetitionFeatures(doc)],
    ['steps.readability', () => readabilityFeatures(doc, lang)],
    ['steps.stylometry', () => stylometryFeatures(doc, lang)],
    ['steps.markers', () => markerFeatures(doc, lang)],
  ];

  for (let i = 0; i < steps.length; i += 1) {
    const [stepKey, run] = steps[i];
    onProgress(stepKey, (i + 1) / (steps.length + 1));
    const result = run();
    Object.assign(features, result.features);
    detail[stepKey] = result;
    // Let the UI breathe between two metric families.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  onProgress('steps.compression', 1);
  const compression = await compressionProfile(doc.text);
  if (compression) {
    features['rep.gzipRatio'] = compression.ratio;
    features['rep.gzipBitsPerChar'] = compression.ratio * 8;
    if (compression.baseline !== null) {
      features['rep.gzipShuffledRatio'] = compression.baseline;
      features['rep.gzipStructuralGain'] = compression.structuralGain;
    }
  }

  return {
    doc,
    language,
    features,
    detail,
    featureCount: Object.keys(features).length,
    markerHits: detail['steps.markers']?.hits ?? [],
  };
}

/** Group metrics by family for the expert-mode display. */
export function groupFeatures(features) {
  const groups = new Map();
  for (const [key, value] of Object.entries(features)) {
    const prefix = key.split('.')[0];
    if (!groups.has(prefix)) groups.set(prefix, []);
    groups.get(prefix).push([key, value]);
  }
  return groups;
}
