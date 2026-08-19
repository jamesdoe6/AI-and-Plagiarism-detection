/**
 * Detecteur 8 — Redondance mesuree par compression.
 *
 * Le taux de compression gzip est une mesure d'information independante de
 * toutes les heuristiques linguistiques : plus un texte reprend ses propres
 * sequences, mieux il se compresse. C'est un signal orthogonal aux autres
 * detecteurs, ce qui est l'interet meme d'un ensemble.
 *
 * Calibration : le taux brut depend fortement de la longueur. On utilise donc
 * le *gain structurel* = taux du texte / taux du meme texte aux mots melanges.
 * Cette ligne de base nulle neutralise l'effet du vocabulaire et de la taille.
 *
 * Restriction assumee : en dessous d'environ 600 mots, gzip n'a pas assez de
 * matiere pour que ce rapport soit stable (les valeurs observees se tassent
 * toutes autour de 1,00, sans lien avec l'origine du texte). Dans ce cas le
 * detecteur se declare *indisponible* plutot que de voter au hasard — un
 * detecteur qui s'abstient vaut mieux qu'un detecteur qui bruite l'ensemble.
 */

import { combine, evidence, lengthConfidence, ramp, get } from './base.js';

const MIN_WORDS = 600;

export const compressionDetector = {
  id: 'compression',
  label: 'Redondance (compression)',
  description: 'Gain de compression structurel et reprise de n-grammes ; requiert au moins 600 mots.',

  run({ features, doc }) {
    const gain = features['rep.gzipStructuralGain'];
    const hasGain = Number.isFinite(gain);
    const enoughText = doc.wordCount >= MIN_WORDS;

    if (!hasGain || !enoughText) {
      return {
        id: this.id,
        label: this.label,
        score: 0.5,
        confidence: 0,
        unavailable: true,
        error: !hasGain
          ? 'API de compression indisponible dans ce navigateur.'
          : `Texte trop court (${doc.wordCount} mots, minimum ${MIN_WORDS}) pour que le gain de compression soit stable.`,
        evidence: [],
      };
    }

    const repeat4 = get(features, 'rep.repeat4');
    const repeat6 = get(features, 'rep.repeat6');
    const globalOverlap = get(features, 'rep.globalSentenceOverlap');
    const ngram3 = get(features, 'ent.ngramDiversity3', 1);

    // Gain structurel : ~0,97 pour de la prose variee, nettement plus bas quand
    // le texte reprend massivement ses propres tournures.
    const s1 = ramp(gain, 0.985, 0.900);
    const s2 = ramp(repeat4, 0.004, 0.045);
    const s3 = ramp(repeat6, 0.001, 0.02);
    const s4 = ramp(globalOverlap, 0.05, 0.20);
    const s5 = ramp(ngram3, 0.998, 0.960);

    const score = combine([
      { score: s1, weight: 2.0 },
      { score: s2, weight: 1.0 },
      { score: s3, weight: 0.7 },
      { score: s4, weight: 0.7 },
      { score: s5, weight: 0.6 },
    ]);

    return {
      id: this.id,
      label: this.label,
      score,
      confidence: lengthConfidence(doc.wordCount) * 0.8,
      evidence: [
        evidence('Gain de compression structurel', gain.toFixed(4), s1,
          'Rapport entre le texte et sa version aux mots melanges ; plus il est bas, plus le texte reprend ses propres sequences.'),
        evidence('4-grammes repetes', `${(repeat4 * 100).toFixed(2)} %`, s2),
        evidence('6-grammes repetes', `${(repeat6 * 100).toFixed(2)} %`, s3),
        evidence('Recouvrement global entre phrases', `${(globalOverlap * 100).toFixed(1)} %`, s4),
      ],
    };
  },
};
