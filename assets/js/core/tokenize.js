/**
 * Segmentation du texte : mots, phrases, paragraphes, syllabes.
 * Concu pour le francais et l'anglais (les deux langues visees par les
 * ressources embarquees), avec une degradation propre sur les autres langues.
 */

const WORD_RE = /[\p{L}\p{N}][\p{L}\p{N}'’\-]*/gu;

/** Abreviations qui ne terminent pas une phrase. */
const ABBREVIATIONS = new Set([
  'm', 'mm', 'mme', 'mlle', 'dr', 'pr', 'st', 'ste', 'av', 'ed', 'cf', 'etc',
  'ex', 'fig', 'no', 'nos', 'vol', 'p', 'pp', 'art', 'ch', 'al', 'env',
  'mr', 'mrs', 'ms', 'prof', 'inc', 'ltd', 'jr', 'sr', 'vs', 'approx', 'dept',
  'univ', 'e.g', 'i.e', 'u.s', 'u.k',
]);

export function normalizeText(raw) {
  return String(raw ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060\ufeff]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Version agressive pour les comparaisons de similarite. */
export function canonicalize(raw) {
  return String(raw ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘`´]/g, "'")
    .replace(/[“”«»]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function words(text) {
  return String(text).match(WORD_RE) ?? [];
}

export function lowerWords(text) {
  return words(text).map((w) => w.toLowerCase());
}

/**
 * Decoupe en phrases avec les offsets d'origine (necessaire pour surligner
 * les passages plagies dans le texte source).
 */
export function sentences(text) {
  const out = [];
  const src = String(text);
  let start = 0;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (ch !== '.' && ch !== '!' && ch !== '?' && ch !== '…' && ch !== '\n') continue;

    if (ch === '\n') {
      if (src[i + 1] === '\n') {
        pushSentence(out, src, start, i);
        start = i + 1;
      }
      continue;
    }

    // Suite de ponctuation finale (?!, ...)
    let end = i;
    while (end + 1 < src.length && '.!?…'.includes(src[end + 1])) end += 1;

    const next = src.slice(end + 1, end + 3);
    const before = src.slice(Math.max(0, start), end);
    const lastToken = (before.match(/([\p{L}\p{N}.]+)\s*$/u)?.[1] ?? '').toLowerCase().replace(/\.$/, '');

    if (ch === '.' && ABBREVIATIONS.has(lastToken)) continue;
    if (ch === '.' && /^\d$/.test(src[i + 1] ?? '') && /\d$/.test(src[i - 1] ?? '')) continue;
    if (next && !/^[\s"'»)\]]/.test(next) && next.trim().length) continue;

    pushSentence(out, src, start, end + 1);
    start = end + 1;
    i = end;
  }
  pushSentence(out, src, start, src.length);
  return out;
}

function pushSentence(out, src, start, end) {
  const raw = src.slice(start, end);
  const trimmedStart = start + (raw.length - raw.trimStart().length);
  const text = raw.trim();
  if (text.length < 2) return;
  out.push({ text, start: trimmedStart, end: trimmedStart + text.length, index: out.length });
}

export function paragraphs(text) {
  return String(text)
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

export function lines(text) {
  return String(text).split('\n');
}

/** N-grammes de mots. */
export function ngrams(tokens, n) {
  const out = [];
  for (let i = 0; i + n <= tokens.length; i += 1) out.push(tokens.slice(i, i + n).join(' '));
  return out;
}

/** N-grammes de caracteres. */
export function charNgrams(text, n) {
  const out = [];
  const s = text;
  for (let i = 0; i + n <= s.length; i += 1) out.push(s.slice(i, i + n));
  return out;
}

const VOWELS_FR = 'aeiouyàâäéèêëîïôöùûüœ';
const VOWELS_EN = 'aeiouy';

/** Estimation du nombre de syllabes (approximation suffisante pour la lisibilite). */
export function syllables(word, lang = 'en') {
  const w = word.toLowerCase().replace(/[^a-zà-ÿœ]/g, '');
  if (!w) return 0;
  const vowels = lang === 'fr' ? VOWELS_FR : VOWELS_EN;
  let count = 0;
  let prevVowel = false;
  for (const ch of w) {
    const isVowel = vowels.includes(ch);
    if (isVowel && !prevVowel) count += 1;
    prevVowel = isVowel;
  }
  if (lang === 'en' && w.endsWith('e') && count > 1) count -= 1;
  if (lang === 'fr' && /(es|ent)$/.test(w) && count > 1) count -= 1;
  return Math.max(1, count);
}

/** Statistiques de base reutilisees partout : evite de re-tokeniser 40 fois. */
export function buildDocument(rawText) {
  const text = normalizeText(rawText);
  const sents = sentences(text);
  const paras = paragraphs(text);
  const tokens = words(text);
  const lower = tokens.map((w) => w.toLowerCase());
  const canonical = canonicalize(text);
  return {
    raw: rawText,
    text,
    canonical,
    sentences: sents,
    paragraphs: paras,
    tokens,
    lower,
    wordCount: tokens.length,
    charCount: text.length,
    sentenceCount: sents.length,
    paragraphCount: paras.length,
  };
}
