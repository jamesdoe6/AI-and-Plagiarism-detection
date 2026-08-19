/**
 * Fetching the content of candidate pages.
 *
 * A browser cannot download an arbitrary page: the same-origin policy forbids
 * it. We therefore go through a configurable text-extraction service (r.jina.ai
 * by default, which returns a URL's plain text and allows CORS).
 *
 * A consequence to own and to display: the analysed URL passes through that
 * service. If the user objects, they disable the option and the analysis falls
 * back to the snippets provided by the search engine.
 */

import { fetchWithTimeout, withRetry } from '../util/async.js';
import { PLAGIARISM, READER } from '../config.js';
import { normalizeText } from '../core/tokenize.js';
import { t } from '../i18n/index.js';

const cache = new Map();

/**
 * Download and clean a page's text.
 * @returns {Promise<{text:string, truncated:boolean}|null>} null on failure.
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
      onRetry: (err) => onLog?.({ key: 'logs.readRetry', params: { host: host(url), error: err.message } }),
    });

    const cleaned = cleanExtractedText(result);
    const value = cleaned.length > 200
      ? { text: cleaned.slice(0, 120000), truncated: cleaned.length > 120000 }
      : null;
    cache.set(url, value);
    return value;
  } catch (err) {
    onLog?.({ key: 'logs.readFailed', params: { host: host(url), error: err.message } });
    cache.set(url, null);
    return null;
  }
}

/** Strip the markdown / navigation noise left behind by extractors. */
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
