/**
 * Detecteur 3 — Uniformite stylometrique.
 *
 * Un auteur humain derive : ses proportions de mots-outils et sa distribution
 * grammaticale changent d'un paragraphe a l'autre (fatigue, changement de
 * sujet, humeur). Un LLM garde une signature quasi constante sur toute la
 * longueur du texte.
 *
 * Limite : sur un texte court (< 3 paragraphes consequents) la derive n'est pas
 * mesurable ; la confiance chute alors fortement.
 */

import { combine, evidence, lengthConfidence, ramp, get } from './base.js';

export const stylometryDetector = {
  id: 'stylometry',
  label: 'Uniformite stylometrique',
  description: 'Stabilite de la signature mots-outils / categories grammaticales le long du texte.',

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
    // Sur-emploi de mots-outils : le texte genere est plus "liant".
    const s3 = ramp(fwRatio, 0.38, 0.53);
    const s4 = ramp(posEntropy, 0.80, 0.94);
    const s5 = ramp(firstPerson, 0.030, 0.002);
    const s6 = ramp(puncCv, 1.25, 0.55);
    const s7 = ramp(openerDiversity, 0.95, 0.60);
    // Un auteur humain pioche dans un repertoire de mots-outils plus large et
    // plus inegal ; un modele en concentre l'usage sur un noyau restreint.
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
      label: this.label,
      score,
      confidence: lengthConfidence(doc.wordCount) * (measurable ? 1 : 0.55),
      evidence: [
        evidence('Derive du profil entre paragraphes', measurable ? drift.toFixed(4) : 'non mesurable', s1,
          'Un auteur humain derive ; un modele reste stable.'),
        evidence('Variabilite de la richesse par fenetre', windowCv.toFixed(3), s2),
        evidence('Pronoms de 1re personne', `${(firstPerson * 100).toFixed(2)} %`, s5,
          'Leur quasi-absence est frequente dans le texte genere impersonnel.'),
        evidence('Diversite des debuts de phrase', openerDiversity.toFixed(3), s7),
        evidence('Regularite de la ponctuation', puncCv.toFixed(3), s6),
        evidence('Entropie du repertoire de mots-outils', `${fwEntropy.toFixed(2)} bits`, s8),
        evidence('Couverture du repertoire de mots-outils', `${(fwCoverage * 100).toFixed(1)} %`, s9),
      ],
    };
  },
};
