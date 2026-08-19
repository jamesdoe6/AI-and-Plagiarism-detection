/**
 * Web search providers.
 *
 * The application is 100 % client-side: it can only call APIs that allow CORS
 * from a browser. Every provider sits behind the same interface, so adding one
 * amounts to writing a `search(query, settings)` function returning
 * `[{url, title, snippet}]`.
 *
 * API keys stay in the browser's localStorage and are only ever sent to the
 * chosen provider.
 */

import { fetchWithTimeout, permanent } from '../util/async.js';
import { PLAGIARISM } from '../config.js';
import { t } from '../i18n/index.js';

/** Explicit error: missing key, quota exhausted, CORS blocked, and so on. */
export class ProviderError extends Error {
  constructor(message, { permanent: isPermanent = false, provider } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.permanent = isPermanent;
    this.provider = provider;
  }
}

const IMPLEMENTATIONS = {
  async google_cse(query, settings) {
    if (!settings.searchApiKey) throw new ProviderError(t('providers.errMissingKey', { provider: 'Google' }), { permanent: true });
    if (!settings.searchExtra) throw new ProviderError(t('providers.errMissingCx'), { permanent: true });
    const url = new URL('https://www.googleapis.com/customsearch/v1');
    url.searchParams.set('key', settings.searchApiKey);
    url.searchParams.set('cx', settings.searchExtra);
    url.searchParams.set('q', query);
    url.searchParams.set('num', '8');

    const response = await fetchWithTimeout(url.toString(), {}, PLAGIARISM.requestTimeoutMs);
    await assertOk(response, 'Google Programmable Search');
    const data = await response.json();
    return (data.items ?? []).map((item) => ({
      url: item.link,
      title: item.title,
      snippet: item.snippet ?? '',
    }));
  },

  async serper(query, settings) {
    if (!settings.searchApiKey) throw new ProviderError(t('providers.errMissingKey', { provider: 'Serper' }), { permanent: true });
    const response = await fetchWithTimeout('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-API-KEY': settings.searchApiKey },
      body: JSON.stringify({ q: query, num: 10 }),
    }, PLAGIARISM.requestTimeoutMs);
    await assertOk(response, 'Serper');
    const data = await response.json();
    return (data.organic ?? []).map((item) => ({
      url: item.link,
      title: item.title,
      snippet: item.snippet ?? '',
    }));
  },

  async brave(query, settings) {
    if (!settings.searchApiKey) throw new ProviderError(t('providers.errMissingKey', { provider: 'Brave' }), { permanent: true });
    const url = new URL('https://api.search.brave.com/res/v1/web/search');
    url.searchParams.set('q', query);
    url.searchParams.set('count', '10');
    const response = await fetchWithTimeout(url.toString(), {
      headers: { accept: 'application/json', 'X-Subscription-Token': settings.searchApiKey },
    }, PLAGIARISM.requestTimeoutMs);
    await assertOk(response, 'Brave Search');
    const data = await response.json();
    return (data.web?.results ?? []).map((item) => ({
      url: item.url,
      title: item.title,
      snippet: item.description ?? '',
    }));
  },

  async bing(query, settings) {
    if (!settings.searchApiKey) throw new ProviderError(t('providers.errMissingKey', { provider: 'Bing' }), { permanent: true });
    const url = new URL('https://api.bing.microsoft.com/v7.0/search');
    url.searchParams.set('q', query);
    url.searchParams.set('count', '10');
    const response = await fetchWithTimeout(url.toString(), {
      headers: { 'Ocp-Apim-Subscription-Key': settings.searchApiKey },
    }, PLAGIARISM.requestTimeoutMs);
    await assertOk(response, 'Bing Web Search');
    const data = await response.json();
    return (data.webPages?.value ?? []).map((item) => ({
      url: item.url,
      title: item.name,
      snippet: item.snippet ?? '',
    }));
  },

  /**
   * Your own endpoint: expected as GET `?q=...`, returning
   * `{results: [{url, title, snippet}]}` or a bare array.
   * Lets you plug any engine in behind a small proxy without touching the app.
   */
  async custom(query, settings) {
    if (!settings.searchExtra) throw new ProviderError(t('providers.errMissingEndpoint'), { permanent: true });
    const url = new URL(settings.searchExtra);
    url.searchParams.set('q', query);
    const headers = settings.searchApiKey ? { authorization: `Bearer ${settings.searchApiKey}` } : {};
    const response = await fetchWithTimeout(url.toString(), { headers }, PLAGIARISM.requestTimeoutMs);
    await assertOk(response, 'Custom endpoint');
    const data = await response.json();
    const items = Array.isArray(data) ? data : (data.results ?? data.items ?? []);
    return items
      .map((item) => ({
        url: item.url ?? item.link,
        title: item.title ?? item.name ?? item.url,
        snippet: item.snippet ?? item.description ?? '',
      }))
      .filter((item) => item.url);
  },
};

async function assertOk(response, provider) {
  if (response.ok) return;
  const body = await response.text().catch(() => '');
  const detail = body ? ` — ${body.slice(0, 180)}` : '';
  const status = response.status;

  if (status === 401 || status === 403) {
    throw new ProviderError(t('providers.errRejectedKey', { provider, status, detail }), { permanent: true });
  }
  if (status === 429) {
    throw new ProviderError(t('providers.errQuota', { provider }), { permanent: true });
  }
  if (status === 400) {
    throw new ProviderError(t('providers.errBadRequest', { provider, detail }), { permanent: true });
  }
  throw new ProviderError(t('providers.errHttp', { provider, status, detail }));
}

/** Single entry point. */
export async function search(query, settings) {
  const impl = IMPLEMENTATIONS[settings.searchProvider];
  if (!impl) throw new ProviderError(t('providers.errNoProvider'), { permanent: true });
  const results = await impl(query, settings);
  return results.filter((r) => r.url && /^https?:/i.test(r.url));
}

export function isSearchConfigured(settings) {
  const provider = settings.searchProvider;
  if (!provider || provider === 'none') return false;
  if (provider === 'custom') return Boolean(settings.searchExtra);
  if (provider === 'google_cse') return Boolean(settings.searchApiKey && settings.searchExtra);
  return Boolean(settings.searchApiKey);
}

/** Translation key of the hint shown when search is not usable. */
export function providerHintKey(settings) {
  if (settings.searchProvider === 'none') return 'providers.hintNone';
  if (!isSearchConfigured(settings)) return 'providers.hintIncomplete';
  return null;
}
