/**
 * Assemblage du vecteur de caracteristiques complet.
 *
 * Le vecteur agrege toutes les familles de metriques. En pratique il contient
 * entre 800 et 1000 dimensions selon la langue detectee :
 *   - lexicales           ~60
 *   - syntaxiques         ~55
 *   - ponctuation / char  ~85
 *   - information         ~35
 *   - repetition          ~30
 *   - lisibilite          ~20
 *   - stylometrie         ~250 a 380 (une par mot-outil)
 *   - marqueurs           ~250 (une par expression du lexique)
 *
 * Les detecteurs consomment ce vecteur ; ils ne re-tokenisent jamais.
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

export const FEATURE_GROUPS = [
  { id: 'lex', label: 'Lexique et richesse' },
  { id: 'syn', label: 'Syntaxe et burstiness' },
  { id: 'punc', label: 'Ponctuation' },
  { id: 'char', label: 'Distribution des caracteres' },
  { id: 'ent', label: 'Information et perplexite' },
  { id: 'rep', label: 'Repetition et redondance' },
  { id: 'read', label: 'Lisibilite' },
  { id: 'sty', label: 'Stylometrie (agregats)' },
  { id: 'fw', label: 'Stylometrie (mots-outils)' },
  { id: 'pos', label: 'Categories grammaticales (proxy)' },
  { id: 'mk', label: 'Marqueurs lexicaux' },
];

/**
 * @param {string} rawText
 * @param {(step:string, ratio:number)=>void} [onProgress]
 */
export async function extractFeatures(rawText, onProgress = () => {}) {
  const doc = buildDocument(rawText);
  const language = detectLanguage(doc.text);
  const lang = language.lang;

  const features = {};
  const detail = {};
  const steps = [
    ['Analyse lexicale', () => lexicalFeatures(doc)],
    ['Analyse syntaxique', () => syntacticFeatures(doc)],
    ['Ponctuation et typographie', () => punctuationFeatures(doc)],
    ['Entropie et perplexite', () => entropyFeatures(doc, lang)],
    ['Repetitions', () => repetitionFeatures(doc)],
    ['Lisibilite', () => readabilityFeatures(doc, lang)],
    ['Stylometrie', () => stylometryFeatures(doc, lang)],
    ['Marqueurs lexicaux', () => markerFeatures(doc, lang)],
  ];

  for (let i = 0; i < steps.length; i += 1) {
    const [label, run] = steps[i];
    onProgress(label, (i + 1) / (steps.length + 1));
    const result = run();
    Object.assign(features, result.features);
    detail[label] = result;
    // Laisse l'UI respirer entre deux familles de metriques.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  onProgress('Compression', 1);
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
    markerHits: detail['Marqueurs lexicaux']?.hits ?? [],
  };
}

/** Regroupe les metriques par famille pour l'affichage en mode expert. */
export function groupFeatures(features) {
  const groups = new Map();
  for (const [key, value] of Object.entries(features)) {
    const prefix = key.split('.')[0];
    if (!groups.has(prefix)) groups.set(prefix, []);
    groups.get(prefix).push([key, value]);
  }
  return groups;
}
