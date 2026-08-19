/**
 * Detector 7 — Recurring syntactic templates.
 *
 * Beyond words, models reuse sentence MOULDS: the same opening skeleton, the
 * same subordination density, the same main-clause / parenthetical alternation.
 * We measure the diversity of those skeletons and the repetition of
 * function-word n-grams, which are independent of the topic being written about.
 */

import { combine, evidence, lengthConfidence, ramp, get, num } from './base.js';
import { counter, entropy } from '../core/stats.js';
import { words, ngrams } from '../core/tokenize.js';
import { FUNCTION_WORDS } from '../data/function-words.js';

const K = 'detectors.syntaxTemplate';

export const syntaxTemplateDetector = {
  id: 'syntaxTemplate',
  labelKey: `${K}.label`,
  descriptionKey: `${K}.description`,

  run({ features, doc, language }) {
    const skeletonDiversity = get(features, 'rep.skeletonDiversity', 1);
    const opener2 = get(features, 'syn.opener2Diversity', 1);
    const openerEntropy = get(features, 'syn.openerEntropy');
    const commaSd = get(features, 'syn.commasPerSentenceSd');
    const subord = get(features, 'syn.subordinationRate');
    const multiClause = get(features, 'syn.multiClauseRatio');

    // Function-word sequences: a syntactic signature independent of subject.
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
      labelKey: this.labelKey,
      score,
      confidence: lengthConfidence(doc.wordCount) * (doc.sentenceCount >= 10 ? 1 : 0.55),
      evidence: [
        evidence(`${K}.ev1`, num(skeletonDiversity), s1),
        evidence(`${K}.ev2`, num(fwDiversity), s5, `${K}.ev2Hint`, {
          entropy: fwEntropy.toFixed(2),
          count: gramFreq.size,
        }),
        evidence(`${K}.ev3`, `${openerEntropy.toFixed(2)} bits`, s3),
        evidence(`${K}.ev4`, commaSd.toFixed(2), s4),
      ],
    };
  },
};
