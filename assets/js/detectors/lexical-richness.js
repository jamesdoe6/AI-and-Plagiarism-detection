/**
 * Detecteur 4 — Richesse lexicale calibree.
 *
 * Les LLM occupent une bande etroite de richesse lexicale : ni la pauvrete
 * repetitive d'une redaction bacle, ni les pics d'idiosyncrasie d'un auteur
 * humain. On penalise donc autant l'exces de regularite que la "zone machine"
 * connue des indices MATTR / Yule K.
 *
 * Limite : la richesse lexicale depend enormement du domaine (un texte
 * juridique est naturellement repetitif). Poids modere dans l'ensemble.
 */

import { combine, evidence, lengthConfidence, ramp, get, clamp } from './base.js';

/** Score maximal quand la valeur est proche du centre de la bande "machine". */
function band(value, center, halfWidth) {
  if (!Number.isFinite(value)) return 0.5;
  return clamp(1 - Math.abs(value - center) / halfWidth);
}

export const lexicalRichnessDetector = {
  id: 'lexicalRichness',
  label: 'Richesse lexicale',
  description: 'Position du texte dans la bande de diversite lexicale typique des modeles de langue.',

  run({ features, doc }) {
    const mattr = get(features, 'lex.mattr');
    const hapax = get(features, 'lex.hapaxRatio');
    const yule = get(features, 'lex.yuleK');
    const longWords = get(features, 'lex.longWordRatio');
    const wordLenCv = get(features, 'lex.wordLenCv');
    const zipf = get(features, 'lex.zipfSlope');
    const contentRepeat = get(features, 'rep.contentRepeatRate');

    // La bande est elargie sur les textes courts, ou le MATTR est mecaniquement
    // eleve (peu d'occasions de repeter un mot).
    const mattrCenter = doc.wordCount < 400 ? 0.80 : 0.73;
    const s1 = band(mattr, mattrCenter, 0.20);
    const s2 = ramp(hapax, 0.52, 0.30);
    const s3 = band(yule, 95, 90);
    const s4 = ramp(longWords, 0.20, 0.36);
    const s5 = ramp(wordLenCv, 0.62, 0.42);
    const s6 = band(zipf, -1.0, 0.55);
    const s7 = ramp(contentRepeat, 0.10, 0.34);

    const score = combine([
      { score: s1, weight: 1.2 },
      { score: s2, weight: 1.1 },
      { score: s3, weight: 0.8 },
      { score: s4, weight: 0.9 },
      { score: s5, weight: 0.7 },
      { score: s6, weight: 0.5 },
      { score: s7, weight: 0.8 },
    ]);

    return {
      id: this.id,
      label: this.label,
      score,
      confidence: lengthConfidence(doc.wordCount) * 0.8,
      evidence: [
        evidence('MATTR (diversite sur fenetre glissante)', mattr.toFixed(3), s1),
        evidence('Hapax (mots employes une seule fois)', `${(hapax * 100).toFixed(1)} %`, s2,
          'Un texte humain contient davantage de mots uniques.'),
        evidence('Mots longs (>= 7 lettres)', `${(longWords * 100).toFixed(1)} %`, s4),
        evidence('Repetition des mots de contenu', `${(contentRepeat * 100).toFixed(1)} %`, s7),
      ],
    };
  },
};
