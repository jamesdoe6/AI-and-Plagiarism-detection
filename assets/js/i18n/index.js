/**
 * Minimal i18n runtime.
 *
 * English is the default and the reference: any key missing from another
 * dictionary falls back to English rather than rendering an empty string or a
 * raw key path.
 *
 * Two ways to translate:
 *   - `t('some.key', { count: 3 })` from JavaScript;
 *   - `data-i18n` attributes in the HTML, resolved by `applyTranslations()`.
 *
 * Interpolation uses `{name}` placeholders rather than string concatenation, so
 * word order can differ between languages.
 */

import { en } from './en.js';
import { fr } from './fr.js';

export const DICTIONARIES = { en, fr };
export const SUPPORTED = ['en', 'fr'];
export const DEFAULT_LANG = 'en';

const STORAGE_KEY = 'apd.lang';

let current = DEFAULT_LANG;
const listeners = new Set();

/**
 * Initial language: the visitor's remembered choice if there is one, otherwise
 * English. English is the deliberate default — the documentation, the code and
 * the intended audience are international; a French speaker switches in one
 * click.
 */
export function detectInitialLanguage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (SUPPORTED.includes(stored)) return stored;
  } catch {
    // Local storage unavailable (strict private browsing): keep the default.
  }
  return DEFAULT_LANG;
}

export function getLang() {
  return current;
}

export function setLang(lang) {
  if (!SUPPORTED.includes(lang) || lang === current) return;
  current = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Persistence impossible: the choice still holds for this session.
  }
  document.documentElement.lang = lang;
  applyTranslations();
  for (const listener of listeners) listener(lang);
}

/** Subscribe to language changes (used to re-render computed results). */
export function onLanguageChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function resolve(dictionary, path) {
  return path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), dictionary);
}

/**
 * Translate a key, interpolating `{placeholders}`.
 * Returns the key itself when it exists in no dictionary — a visible failure is
 * better than a silent empty string.
 */
export function t(key, params) {
  let value = resolve(DICTIONARIES[current], key);
  if (value === undefined) value = resolve(DICTIONARIES[DEFAULT_LANG], key);
  if (value === undefined) return key;
  if (typeof value !== 'string') return value;
  if (!params) return value;
  return value.replace(/\{(\w+)\}/g, (match, name) => (
    Object.hasOwn(params, name) ? String(params[name]) : match
  ));
}

/** Locale-aware number formatting, so thousands separators follow the language. */
export function formatNumber(value, options) {
  return new Intl.NumberFormat(current === 'fr' ? 'fr-FR' : 'en-GB', options).format(value);
}

export function formatDateTime(date = new Date()) {
  return new Intl.DateTimeFormat(current === 'fr' ? 'fr-FR' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function formatTime(date = new Date()) {
  return new Intl.DateTimeFormat(current === 'fr' ? 'fr-FR' : 'en-GB', {
    timeStyle: 'medium',
  }).format(date);
}

/**
 * Walk the document and apply every `data-i18n*` attribute.
 *
 *   data-i18n="key"            -> textContent
 *   data-i18n-html="key"       -> innerHTML (only for strings we author)
 *   data-i18n-attr="attr:key"  -> attribute, comma-separated for several
 */
export function applyTranslations(root = document) {
  for (const node of root.querySelectorAll('[data-i18n]')) {
    node.textContent = t(node.dataset.i18n);
  }
  for (const node of root.querySelectorAll('[data-i18n-html]')) {
    node.innerHTML = t(node.dataset.i18nHtml);
  }
  for (const node of root.querySelectorAll('[data-i18n-attr]')) {
    for (const pair of node.dataset.i18nAttr.split(',')) {
      const [attr, key] = pair.split(':').map((part) => part.trim());
      if (attr && key) node.setAttribute(attr, t(key));
    }
  }

  const title = document.querySelector('title');
  if (title) title.textContent = t('meta.title');
  document.querySelector('meta[name="description"]')?.setAttribute('content', t('meta.description'));
}

/** Confidence label from a 0..1 value — shared by the UI and the report. */
export function confidenceKey(confidence) {
  if (confidence >= 0.72) return 'confidence.high';
  if (confidence >= 0.48) return 'confidence.medium';
  if (confidence >= 0.25) return 'confidence.low';
  return 'confidence.veryLow';
}
