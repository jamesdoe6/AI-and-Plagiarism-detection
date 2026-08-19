/**
 * Readability indices (English and French).
 *
 * Taken alone they say nothing about a text's origin; their STABILITY FROM ONE
 * PARAGRAPH TO THE NEXT, however, is discriminative: an LLM holds a near-constant
 * readability level, a human varies.
 */

import { mean, stdev, cv } from '../core/stats.js';
import { words, sentences, syllables } from '../core/tokenize.js';

export function readabilityFeatures(doc, lang = 'en') {
  const f = {};
  const tokens = doc.tokens;
  const sentCount = Math.max(1, doc.sentences.length);
  if (tokens.length < 10) return { features: f };

  const syl = tokens.map((w) => syllables(w, lang));
  const totalSyllables = syl.reduce((a, b) => a + b, 0);
  const wordsPerSentence = tokens.length / sentCount;
  const syllablesPerWord = totalSyllables / tokens.length;
  const complexWords = syl.filter((s) => s >= 3).length;
  const letters = tokens.join('').length;

  f['read.wordsPerSentence'] = wordsPerSentence;
  f['read.syllablesPerWord'] = syllablesPerWord;
  f['read.complexWordRatio'] = complexWords / tokens.length;
  f['read.lettersPerWord'] = letters / tokens.length;

  f['read.flesch'] = 206.835 - 1.015 * wordsPerSentence - 84.6 * syllablesPerWord;
  f['read.fleschFr'] = 207 - 1.015 * wordsPerSentence - 73.6 * syllablesPerWord; // Kandel-Moles
  f['read.fleschKincaid'] = 0.39 * wordsPerSentence + 11.8 * syllablesPerWord - 15.59;
  f['read.gunningFog'] = 0.4 * (wordsPerSentence + 100 * (complexWords / tokens.length));
  f['read.smog'] = 1.043 * Math.sqrt(complexWords * (30 / sentCount)) + 3.1291;
  f['read.ari'] = 4.71 * (letters / tokens.length) + 0.5 * wordsPerSentence - 21.43;
  f['read.colemanLiau'] = 0.0588 * ((letters / tokens.length) * 100) - 0.296 * ((sentCount / tokens.length) * 100) - 15.8;
  f['read.lix'] = wordsPerSentence + 100 * (tokens.filter((w) => w.length > 6).length / tokens.length);
  f['read.rix'] = tokens.filter((w) => w.length > 6).length / sentCount;

  // Readability variability from paragraph to paragraph: the key signal here.
  const perParagraph = doc.paragraphs
    .map((p) => {
      const pw = words(p);
      const ps = Math.max(1, sentences(p).length);
      if (pw.length < 15) return null;
      const psyl = pw.map((w) => syllables(w, lang)).reduce((a, b) => a + b, 0);
      return 206.835 - 1.015 * (pw.length / ps) - 84.6 * (psyl / pw.length);
    })
    .filter((v) => v !== null);

  f['read.paragraphFleschMean'] = mean(perParagraph);
  f['read.paragraphFleschSd'] = stdev(perParagraph);
  f['read.paragraphFleschCv'] = Math.abs(cv(perParagraph));
  f['read.paragraphFleschRange'] = perParagraph.length > 1
    ? Math.max(...perParagraph) - Math.min(...perParagraph) : 0;

  return { features: f, perParagraph };
}
