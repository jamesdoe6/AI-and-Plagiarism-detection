/**
 * Detecteur 1 — Previsibilite / proxy de perplexite.
 *
 * Hypothese : un LLM echantillonne pres du mode de sa distribution, ce qui
 * produit une suite de mots globalement peu surprenante et, surtout, dont la
 * surprise varie peu.
 *
 * Point de calibration important : la surprise *brute* confond "texte
 * previsible" et "texte savant" (un mot absent de la table de frequence recoit
 * une surprise elevee du seul fait de sa longueur). On s'appuie donc en
 * priorite sur :
 *   - la surprise restreinte au vocabulaire connu (`ent.ivSurprisalMean`), qui
 *     mesure le choix entre mots frequents et moins frequents a registre
 *     constant ;
 *   - la *dispersion* de la surprise, qui est le signal reellement
 *     discriminant (equivalent lexical de la burstiness, dans l'esprit des
 *     approches type DetectGPT) ;
 *   - l'auto-predictibilite n-gramme.
 *
 * Limite majeure : un texte humain simple, scolaire ou traduit presente lui
 * aussi une faible perplexite. C'est la premiere source documentee de faux
 * positifs sur les locuteurs non natifs.
 */

import { combine, evidence, lengthConfidence, ramp, get } from './base.js';

export const perplexityDetector = {
  id: 'perplexity',
  label: 'Previsibilite (proxy de perplexite)',
  description: 'Surprise lexicale et sa dispersion, estimees par loi de Zipf et modele n-gramme auto-appris.',

  run({ features, doc }) {
    const ivMean = get(features, 'ent.ivSurprisalMean', 9.5);
    const oov = get(features, 'ent.oovRate');
    const cvSurprisal = get(features, 'ent.surprisalCv');
    const deltaMean = get(features, 'ent.surprisalDeltaMean');
    const selfPred = get(features, 'ent.selfPredictability');
    const sentCv = get(features, 'ent.sentenceSurprisalCv');
    const sentSd = get(features, 'ent.sentenceSurprisalSd');

    // Signal dominant : la densite informationnelle varie-t-elle d'une phrase a
    // l'autre ? Un humain alterne phrases denses et phrases creuses ; un modele
    // maintient un debit d'information quasi constant. C'est la transposition
    // lexicale de la burstiness, et c'est le seul signal de cette famille qui
    // separe nettement nos echantillons de reference.
    const s1 = ramp(sentCv, 0.155, 0.060);
    const s2 = ramp(sentSd, 1.55, 0.75);
    // Signaux secondaires, conserves pour l'interpretabilite mais faiblement
    // ponderes : ils dependent trop du registre pour trancher seuls.
    const s3 = ramp(cvSurprisal, 0.42, 0.26);
    const s4 = ramp(deltaMean, 6.5, 3.4);
    const s5 = ramp(selfPred, 0.860, 0.905);
    const s6 = ramp(ivMean, 10.6, 8.6);
    const s7 = ramp(oov, 0.34, 0.16);

    const score = combine([
      { score: s1, weight: 2.4 },
      { score: s2, weight: 1.3 },
      { score: s3, weight: 0.4 },
      { score: s4, weight: 0.4 },
      { score: s5, weight: 0.4 },
      { score: s6, weight: 0.3 },
      { score: s7, weight: 0.2 },
    ]);

    return {
      id: this.id,
      label: this.label,
      score,
      confidence: lengthConfidence(doc.wordCount) * 0.95,
      evidence: [
        evidence('Variabilite de la densite informationnelle', sentCv.toFixed(3), s1,
          'Ecart de surprise moyenne d\'une phrase a l\'autre. En dessous de 0,08, le debit d\'information est anormalement constant.'),
        evidence('Ecart-type entre phrases', sentSd.toFixed(3), s2),
        evidence('Surprise moyenne (vocabulaire connu)', `${ivMean.toFixed(2)} bits`, s6,
          'Signal secondaire : depend fortement du registre, il ne tranche pas seul.'),
        evidence('Dispersion globale de la surprise', cvSurprisal.toFixed(3), s3),
        evidence('Mots hors vocabulaire courant', `${(oov * 100).toFixed(1)} %`, s7,
          'Lexique specialise ou idiosyncratique.'),
      ],
    };
  },
};
