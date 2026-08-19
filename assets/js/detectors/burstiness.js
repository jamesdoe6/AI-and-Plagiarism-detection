/**
 * Detecteur 2 — Burstiness structurelle.
 *
 * L'ecriture humaine alterne de facon irreguliere phrases longues et courtes ;
 * les modeles de langue convergent vers une longueur cible stable. On mesure
 * la dispersion des longueurs de phrases, la forme de leur distribution et la
 * regularite des paragraphes.
 *
 * Limite : un texte edite, normalise ou ecrit sous contrainte de style (presse,
 * documentation technique) peut etre tres regulier sans etre genere.
 */

import { combine, evidence, lengthConfidence, ramp, get } from './base.js';

export const burstinessDetector = {
  id: 'burstiness',
  label: 'Burstiness (rythme des phrases)',
  description: 'Dispersion des longueurs de phrases et regularite des paragraphes.',

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
      label: this.label,
      score,
      confidence: lengthConfidence(doc.wordCount) * (doc.sentenceCount >= 8 ? 1 : 0.5),
      evidence: [
        evidence('Coefficient de variation des phrases', cvSent.toFixed(3), s1,
          'En dessous de 0,30 le rythme est anormalement stable.'),
        evidence('Indice de burstiness', burst.toFixed(3), s2,
          'Proche de -1 : regularite quasi mecanique.'),
        evidence('Ecart interquartile des longueurs', `${iqr.toFixed(1)} mots`, s6),
        evidence('Phrases courtes (<= 8 mots)', `${(shortRatio * 100).toFixed(1)} %`, s5,
          'Les humains inserent souvent des phrases tres breves.'),
        evidence('Stabilite de la lisibilite entre paragraphes', readCv.toFixed(3), s8),
      ],
    };
  },
};
