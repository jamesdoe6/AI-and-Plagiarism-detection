/**
 * Recuperation du contenu des pages candidates.
 *
 * Un navigateur ne peut pas telecharger une page arbitraire : la politique
 * d'origine croisee l'interdit. On passe donc par un service d'extraction de
 * texte configurable (par defaut r.jina.ai, qui renvoie le texte brut d'une URL
 * et autorise le CORS).
 *
 * Consequence a assumer et a afficher : l'URL analysee transite par ce service.
 * Si l'utilisateur ne veut pas, il desactive l'option et l'analyse se limite
 * aux extraits fournis par le moteur de recherche.
 */

import { fetchWithTimeout, withRetry } from '../util/async.js';
import { PLAGIARISM, READER } from '../config.js';
import { normalizeText } from '../core/tokenize.js';

const cache = new Map();

/**
 * Telecharge et nettoie le texte d'une page.
 * @returns {Promise<{text:string, truncated:boolean}|null>} null si echec.
 */
export async function fetchPageText(url, settings, onLog) {
  if (cache.has(url)) return cache.get(url);

  const template = settings.readerTemplate || READER.defaultTemplate;
  const target = template.includes('{url}')
    ? template.replace('{url}', encodeURI(url))
    : `${template}${encodeURIComponent(url)}`;

  try {
    const result = await withRetry(async () => {
      const response = await fetchWithTimeout(target, {
        headers: { accept: 'text/plain, text/html;q=0.9' },
      }, PLAGIARISM.fetchTimeoutMs);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.text();
    }, {
      retries: 1,
      baseDelay: 1200,
      onRetry: (err) => onLog?.(`Lecture de ${host(url)} : nouvelle tentative (${err.message})`),
    });

    const cleaned = cleanExtractedText(result);
    const value = cleaned.length > 200
      ? { text: cleaned.slice(0, 120000), truncated: cleaned.length > 120000 }
      : null;
    cache.set(url, value);
    return value;
  } catch (err) {
    onLog?.(`Lecture impossible de ${host(url)} : ${err.message}`);
    cache.set(url, null);
    return null;
  }
}

/** Retire le bruit markdown / navigation laisse par les extracteurs. */
function cleanExtractedText(raw) {
  return normalizeText(
    String(raw)
      .replace(/^Title:.*$/m, '')
      .replace(/^URL Source:.*$/m, '')
      .replace(/^Markdown Content:.*$/m, '')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/^[|+-]{3,}$/gm, ' ')
      .replace(/^#{1,6}\s*/gm, '')
      .replace(/\*{1,3}/g, ''),
  );
}

export function host(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

export function clearFetchCache() {
  cache.clear();
}
