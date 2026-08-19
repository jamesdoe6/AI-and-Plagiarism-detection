/**
 * Ensemble de detection.
 *
 * Principe (« ensemble detection ») : aucun detecteur unique n'est fiable. On
 * combine des signaux volontairement *orthogonaux* (information, rythme,
 * stylometrie, lexique, structure, compression, plus des modeles distants
 * optionnels) par une moyenne ponderee par la fiabilite, puis on evalue :
 *
 *   - le score final (0-100 %) ;
 *   - le niveau de confiance, fonction de la longueur du texte, de l'accord
 *     entre detecteurs et de la disponibilite des modeles distants ;
 *   - un verdict textuel prudent, jamais binaire.
 *
 * Regles de prudence codees en dur :
 *   - un texte de moins de 40 mots n'est pas note ;
 *   - le desaccord entre detecteurs tire le score vers 50 % ;
 *   - la langue non supportee (ni fr ni en) plafonne la confiance ;
 *   - le verdict "probablement IA" n'apparait qu'au-dessus du seuil configure
 *     (80 % par defaut).
 */

import { DETECTOR_WEIGHTS, AI_THRESHOLDS, LIMITS } from '../config.js';
import { clamp, stdev, mean } from '../core/stats.js';
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

/** Detecteurs locaux : toujours executes, aucun appel reseau. */
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

/** Detecteurs distants : executes uniquement si configures par l'utilisateur. */
export const REMOTE_DETECTORS = [remoteLlmDetector, remoteClassifierDetector];

/**
 * Lance l'analyse IA complete.
 * @param {string} text
 * @param {object} settings
 * @param {{onStep?:Function, onLog?:Function}} hooks
 */
export async function analyzeAi(text, settings, hooks = {}) {
  const { onStep = () => {}, onLog = () => {} } = hooks;

  onStep('Extraction des metriques', 0.05);
  const extraction = await extractFeatures(text, (label, ratio) => {
    onStep(label, 0.05 + ratio * 0.35);
  });

  const ctx = {
    features: extraction.features,
    doc: extraction.doc,
    language: extraction.language,
    markerHits: extraction.markerHits,
    settings,
    onLog,
  };

  // --- Detecteurs locaux ---
  const results = [];
  LOCAL_DETECTORS.forEach((detector, i) => {
    onStep(`Detecteur : ${detector.label}`, 0.45 + (i / LOCAL_DETECTORS.length) * 0.2);
    try {
      const result = detector.run(ctx);
      results.push({ ...result, weight: DETECTOR_WEIGHTS[detector.id] ?? 1, description: detector.description });
    } catch (err) {
      onLog(`Detecteur ${detector.id} en echec : ${err.message}`);
      results.push({
        id: detector.id, label: detector.label, unavailable: true,
        error: err.message, score: 0.5, confidence: 0, weight: 0, evidence: [],
        description: detector.description,
      });
    }
  });

  // --- Detecteurs distants (optionnels, tolerants a la panne) ---
  for (const detector of REMOTE_DETECTORS) {
    if (!detector.isEnabled(settings)) continue;
    onStep(`Detecteur distant : ${detector.label}`, 0.7);
    try {
      const result = await detector.run(ctx);
      results.push({ ...result, weight: DETECTOR_WEIGHTS[detector.id] ?? 1, description: detector.description, remote: true });
      onLog(`${detector.label} : ${(result.score * 100).toFixed(1)} %`);
    } catch (err) {
      onLog(`${detector.label} indisponible : ${err.message}`);
      results.push({
        id: detector.id, label: detector.label, unavailable: true, remote: true,
        error: err.message, score: 0.5, confidence: 0, weight: 0, evidence: [],
        description: detector.description,
      });
    }
  }

  onStep('Agregation de l\'ensemble', 0.9);
  const aggregate = aggregateEnsemble(results, extraction, settings);

  return {
    ...aggregate,
    detectors: results,
    features: extraction.features,
    featureCount: extraction.featureCount,
    language: extraction.language,
    doc: extraction.doc,
    markerHits: extraction.markerHits,
    detail: extraction.detail,
  };
}

/**
 * Combine les detecteurs et produit score, confiance et verdict.
 * @param {object} [settings] permet de surcharger le seuil d'alerte choisi par
 *   l'utilisateur. Les bandes intermediaires sont derivees de ce seuil pour
 *   rester coherentes : deplacer le seuil deplace toute l'echelle.
 */
export function aggregateEnsemble(results, extraction, settings = {}) {
  const thresholds = resolveThresholds(settings.aiThreshold);
  const usable = results.filter((r) => !r.unavailable && r.weight > 0 && Number.isFinite(r.score));
  const doc = extraction.doc;

  if (doc.wordCount < LIMITS.minWordsForAnalysis || !usable.length) {
    return {
      score: null,
      confidence: 0,
      confidenceLabel: 'insuffisante',
      verdict: 'Texte trop court pour une estimation statistique fiable.',
      agreement: 0,
      votes: { ai: 0, human: 0, neutral: 0 },
      tooShort: true,
      reasons: [`Le texte compte ${doc.wordCount} mots ; il en faut au moins ${LIMITS.minWordsForAnalysis} pour que les metriques aient un sens (et ${LIMITS.minWordsForHighConfidence} pour une confiance elevee).`],
    };
  }

  // Ponderation : poids configure x confiance propre du detecteur.
  const totalWeight = usable.reduce((a, r) => a + r.weight * Math.max(0.05, r.confidence), 0);
  const weighted = usable.reduce((a, r) => a + r.score * r.weight * Math.max(0.05, r.confidence), 0) / totalWeight;

  // Vote majoritaire (indicateur secondaire, affiche en mode expert).
  const votes = { ai: 0, human: 0, neutral: 0 };
  for (const r of usable) {
    if (r.score >= 0.62) votes.ai += 1;
    else if (r.score <= 0.38) votes.human += 1;
    else votes.neutral += 1;
  }

  // Accord entre detecteurs : un desaccord fort doit reduire l'ecart a 50 %.
  const spread = stdev(usable.map((r) => r.score));
  const agreement = clamp(1 - spread / 0.45);

  // Regression vers le centre proportionnelle au desaccord.
  const shrink = 0.55 + 0.45 * agreement;
  let score = 0.5 + (weighted - 0.5) * shrink;

  // Penalite langue non supportee : les ressources embarquees sont fr/en.
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

  return {
    score: percent,
    rawScore: weighted * 100,
    confidence,
    confidenceLabel: confidenceLabel(confidence),
    agreement,
    spread,
    votes,
    verdict: verdictFor(percent, confidence, thresholds),
    band: bandFor(percent, thresholds),
    thresholds,
    reasons: buildReasons(usable, extraction, percent, agreement, languageOk, thresholds),
    detectorCount: usable.length,
  };
}

export function confidenceLabel(confidence) {
  if (confidence >= 0.72) return 'elevee';
  if (confidence >= 0.48) return 'moyenne';
  if (confidence >= 0.25) return 'faible';
  return 'tres faible';
}

/**
 * Derive l'echelle complete depuis le seuil d'alerte choisi.
 * Le seuil par defaut (85 %) reproduit exactement AI_THRESHOLDS ; l'abaisser
 * comprime proportionnellement les bandes basses, sans jamais les inverser.
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

function verdictFor(percent, confidence, thresholds) {
  const band = bandFor(percent, thresholds);
  const suffix = confidence < 0.45 ? ' — confiance faible, resultat a ne pas exploiter seul.' : '';
  switch (band) {
    case 'human':
      return `Signature compatible avec une redaction humaine.${suffix}`;
    case 'uncertain':
      return `Indetermine : les signaux ne penchent pas nettement.${suffix}`;
    case 'mixed':
      return `Signaux mixtes : possible assistance par IA, ou redaction humaine tres formatee.${suffix}`;
    case 'likely-ai':
      return `Probablement genere ou fortement assiste par une IA.${suffix}`;
    default:
      return `Signature fortement compatible avec un texte genere par IA.${suffix}`;
  }
}

/** Explique le score en langage clair, en s'appuyant sur les indices les plus marquants. */
function buildReasons(results, extraction, percent, agreement, languageOk, thresholds) {
  const reasons = [];
  const sorted = [...results].sort((a, b) => Math.abs(b.score - 0.5) - Math.abs(a.score - 0.5));

  for (const r of sorted.slice(0, 4)) {
    const direction = r.score > 0.5 ? 'vers l\'IA' : 'vers l\'humain';
    const top = r.evidence?.find((e) => Math.abs(e.score - 0.5) > 0.18) ?? r.evidence?.[0];
    reasons.push(`${r.label} : ${(r.score * 100).toFixed(0)} % ${direction}${top ? ` (${top.label} = ${top.value})` : ''}.`);
  }

  if (agreement < 0.55) {
    reasons.push('Les detecteurs sont en desaccord marque : le score a ete ramene vers 50 % par prudence.');
  }
  if (!languageOk) {
    reasons.push('La langue du texte n\'est ni le francais ni l\'anglais : les ressources linguistiques embarquees ne s\'appliquent pas, la fiabilite est fortement reduite.');
  }
  if (extraction.doc.wordCount < 300) {
    reasons.push(`Texte court (${extraction.doc.wordCount} mots) : la variance des metriques est elevee, le score est indicatif.`);
  }
  if (percent >= thresholds.uncertain && percent < thresholds.strong) {
    reasons.push('Zone intermediaire : c\'est precisement la plage ou les detecteurs se trompent le plus, notamment sur les textes edites ou paraphrases.');
  }

  // Garde-fou de registre. Les signaux exploites (regularite du rythme,
  // uniformite stylometrique, densite de connecteurs) correlent fortement avec
  // le caractere formel d'un texte, pas seulement avec son origine. Sur un
  // texte tres formel, le risque de faux positif augmente reellement : on le
  // dit, plutot que de laisser le score parler seul.
  const formality = formalityIndex(extraction.features);
  if (formality > 0.62 && percent >= thresholds.uncertain) {
    reasons.push(`Registre tres formel detecte (indice ${formality.toFixed(2)}) : mots longs, phrases amples, peu de marques personnelles. Ce profil fait monter le score independamment de l'origine du texte — c'est le cas ou les faux positifs sont les plus frequents, notamment pour les locuteurs non natifs et les ecrits academiques ou administratifs.`);
  }

  return reasons;
}

/**
 * Indice de formalite dans [0,1]. Sert uniquement d'avertissement : il n'entre
 * pas dans le calcul du score, il en qualifie la fiabilite.
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

/** Ajuste dynamiquement un poids (utilise par l'interface avancee). */
export function setDetectorWeight(id, weight) {
  DETECTOR_WEIGHTS[id] = weight;
}
