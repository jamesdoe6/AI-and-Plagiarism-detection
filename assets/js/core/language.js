/**
 * Lightweight language detection (fr / en / other) from function words.
 *
 * The language choice drives which resources are used (function words, markers,
 * frequency tables): getting it wrong badly degrades reliability, hence the
 * confidence indicator returned for the ensemble to act on.
 */

import { FUNCTION_WORDS_EN, FUNCTION_WORDS_FR } from '../data/function-words.js';
import { lowerWords } from './tokenize.js';

const EN = new Set(FUNCTION_WORDS_EN);
const FR = new Set(FUNCTION_WORDS_FR);

const FR_DIACRITICS = /[àâäçéèêëîïôöùûüÿœ]/gi;

export function detectLanguage(text) {
  const tokens = lowerWords(text).slice(0, 4000);
  if (!tokens.length) return { lang: 'en', confidence: 0, scores: { en: 0, fr: 0 } };

  let en = 0;
  let fr = 0;
  for (const token of tokens) {
    const plain = token.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (EN.has(token)) en += 1;
    if (FR.has(plain)) fr += 1;
  }

  const diacritics = (text.match(FR_DIACRITICS) ?? []).length / Math.max(1, text.length);
  fr += diacritics * tokens.length * 1.5;

  const total = en + fr;
  const lang = fr > en ? 'fr' : 'en';
  const confidence = total === 0 ? 0 : Math.abs(en - fr) / total;
  const coverage = total / tokens.length;

  return {
    lang,
    confidence: Math.min(1, confidence * 0.5 + coverage),
    coverage,
    scores: { en, fr },
    // Flags a text that resembles neither French nor English: detectors must
    // then reduce their confidence.
    supported: coverage > 0.12,
  };
}
