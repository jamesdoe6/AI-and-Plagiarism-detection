/**
 * Single entry point for extracting text from a file.
 * Supported formats: .txt, .md, .csv, .rtf, .html, .docx, .odt, .pdf.
 */

import { LIMITS } from '../config.js';
import { extractDocx } from './docx.js';
import { extractPdf } from './pdf.js';
import { normalizeText, words } from '../core/tokenize.js';
import { t, formatNumber } from '../i18n/index.js';

export const ACCEPTED_EXTENSIONS = ['.txt', '.md', '.markdown', '.csv', '.rtf', '.html', '.htm', '.docx', '.odt', '.pdf'];

export class FileError extends Error {}

/**
 * @returns {Promise<{text:string, wordCount:number, warning?:string, kind:string}>}
 */
export async function extractTextFromFile(file, onProgress = () => {}) {
  if (file.size > LIMITS.maxFileBytes) {
    throw new FileError(t('errors.fileTooLarge', {
      size: formatBytes(file.size),
      max: formatBytes(LIMITS.maxFileBytes),
    }));
  }

  const name = file.name.toLowerCase();
  const extension = name.slice(name.lastIndexOf('.'));
  let text = '';
  let warning;
  let kind = 'text';

  onProgress('io.reading', 0.1);

  if (extension === '.pdf') {
    kind = 'PDF';
    const result = await extractPdf(file, (label, ratio) => onProgress(label, 0.1 + ratio * 0.8));
    text = result.text;
    warning = result.warning;
  } else if (extension === '.docx' || extension === '.odt') {
    kind = extension === '.docx' ? 'Word' : 'OpenDocument';
    text = await extractDocx(file);
  } else if (extension === '.rtf') {
    kind = 'RTF';
    text = stripRtf(await file.text());
  } else if (extension === '.html' || extension === '.htm') {
    kind = 'HTML';
    text = stripHtml(await file.text());
  } else if (ACCEPTED_EXTENSIONS.includes(extension)) {
    kind = extension === '.md' || extension === '.markdown' ? 'Markdown' : 'text';
    text = await file.text();
  } else {
    throw new FileError(t('errors.unsupportedFormat', {
      ext: extension || '?',
      list: ACCEPTED_EXTENSIONS.join(', '),
    }));
  }

  onProgress('io.cleaning', 0.95);
  text = normalizeText(text);

  if (!text || text.length < 20) {
    throw new FileError(t('errors.noText'));
  }

  const wordCount = words(text).length;
  if (wordCount > LIMITS.maxWords) {
    throw new FileError(t('errors.tooManyWords', {
      count: formatNumber(wordCount),
      max: formatNumber(LIMITS.maxWords),
    }));
  }

  return { text, wordCount, warning, kind };
}

/** Validate direct input (pasting) against the same limits. */
export function validateText(text) {
  const clean = normalizeText(text);
  const wordCount = words(clean).length;
  if (wordCount > LIMITS.maxWords) {
    throw new FileError(t('errors.tooManyWordsPaste', {
      count: formatNumber(wordCount),
      max: formatNumber(LIMITS.maxWords),
    }));
  }
  return { text: clean, wordCount };
}

/** RTF cleanup: control groups, font tables, escape sequences. */
function stripRtf(raw) {
  let text = raw;
  // Remove purely technical groups (fonts, colours, metadata).
  text = text.replace(/\{\\\*?\\(fonttbl|colortbl|stylesheet|info|pict|generator)[\s\S]*?\}/g, ' ');
  text = text
    .replace(/\\par[d]?\b/g, '\n')
    .replace(/\\line\b/g, '\n')
    .replace(/\\tab\b/g, '\t')
    .replace(/\\'([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\u(-?\d+)\s?\??/g, (_, code) => String.fromCharCode(Number(code) < 0 ? Number(code) + 65536 : Number(code)))
    .replace(/\\[a-z]+-?\d*\s?/gi, ' ')
    .replace(/[{}]/g, ' ');
  return text;
}

function stripHtml(raw) {
  const withoutScripts = raw
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(nav|header|footer|aside)[\s\S]*?<\/\1>/gi, ' ');

  if (typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(withoutScripts, 'text/html');
    return doc.body?.innerText ?? doc.body?.textContent ?? '';
  }

  return withoutScripts
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
