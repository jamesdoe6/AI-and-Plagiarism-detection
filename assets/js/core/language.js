/**
 * Detection de langue legere (fr / en / autre) par mots-outils.
 * Le choix de la langue conditionne les ressources utilisees (mots-outils,
 * marqueurs, table de frequences) : se tromper degrade fortement la fiabilite,
 * d'ou le renvoi d'un indice de confiance exploitable par l'ensemble.
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
    // Signale un texte qui ne ressemble ni au francais ni a l'anglais :
    // les detecteurs doivent alors reduire leur confiance.
    supported: coverage > 0.12,
  };
}
