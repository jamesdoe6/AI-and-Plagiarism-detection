/**
 * Detecteur 7 — Patrons syntaxiques recurrents.
 *
 * Au-dela des mots, les modeles reutilisent des *moules* de phrase : meme
 * squelette d'ouverture, meme densite de subordination, meme alternance
 * proposition principale / incise. On mesure la diversite de ces squelettes et
 * la repetition des n-grammes de mots-outils (independants du sujet traite).
 */

import { combine, evidence, lengthConfidence, ramp, get } from './base.js';
import { counter, entropy } from '../core/stats.js';
import { words, ngrams } from '../core/tokenize.js';
import { FUNCTION_WORDS } from '../data/function-words.js';

export const syntaxTemplateDetector = {
  id: 'syntaxTemplate',
  label: 'Patrons syntaxiques',
  description: 'Reutilisation de moules de phrase et de sequences de mots-outils.',

  run({ features, doc, language }) {
    const skeletonDiversity = get(features, 'rep.skeletonDiversity', 1);
    const opener2 = get(features, 'syn.opener2Diversity', 1);
    const openerEntropy = get(features, 'syn.openerEntropy');
    const commaSd = get(features, 'syn.commasPerSentenceSd');
    const subord = get(features, 'syn.subordinationRate');
    const multiClause = get(features, 'syn.multiClauseRatio');

    // Sequences de mots-outils : signature syntaxique independante du sujet.
    const fw = new Set(FUNCTION_WORDS[language.lang] ?? FUNCTION_WORDS.en);
    const skeletonTokens = words(doc.text.toLowerCase()).map((w) => (fw.has(w) ? w : '#'));
    const grams = ngrams(skeletonTokens, 4);
    const gramFreq = counter(grams);
    const fwDiversity = grams.length ? gramFreq.size / grams.length : 1;
    const fwEntropy = entropy(gramFreq);

    const s1 = ramp(skeletonDiversity, 0.92, 0.55);
    const s2 = ramp(opener2, 0.98, 0.72);
    const s3 = ramp(openerEntropy, 5.0, 2.6);
    const s4 = ramp(commaSd, 1.5, 0.55);
    const s5 = ramp(fwDiversity, 0.98, 0.86);
    const s6 = ramp(multiClause, 0.18, 0.48);
    const s7 = ramp(subord, 0.5, 1.7);

    const score = combine([
      { score: s1, weight: 1.2 },
      { score: s2, weight: 1.1 },
      { score: s3, weight: 1.0 },
      { score: s4, weight: 0.9 },
      { score: s5, weight: 1.3 },
      { score: s6, weight: 0.6 },
      { score: s7, weight: 0.5 },
    ]);

    return {
      id: this.id,
      label: this.label,
      score,
      confidence: lengthConfidence(doc.wordCount) * (doc.sentenceCount >= 10 ? 1 : 0.55),
      evidence: [
        evidence('Diversite des squelettes de phrase', skeletonDiversity.toFixed(3), s1),
        evidence('Diversite des sequences de mots-outils', fwDiversity.toFixed(3), s5,
          `Entropie ${fwEntropy.toFixed(2)} bits sur ${gramFreq.size} sequences distinctes.`),
        evidence('Entropie des ouvertures de phrase', `${openerEntropy.toFixed(2)} bits`, s3),
        evidence('Regularite du nombre de virgules', commaSd.toFixed(2), s4),
      ],
    };
  },
};
