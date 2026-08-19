/**
 * Fournisseurs de recherche web.
 *
 * L'application est 100 % cote client : elle ne peut appeler que des API qui
 * autorisent le CORS depuis un navigateur. Chaque fournisseur est isole
 * derriere la meme interface pour qu'en ajouter un se limite a ecrire une
 * fonction `search(query, settings)` renvoyant `[{url, title, snippet}]`.
 *
 * Les cles d'API restent dans le localStorage du navigateur et ne sont
 * transmises qu'au fournisseur choisi.
 */

import { fetchWithTimeout, permanent } from '../util/async.js';
import { PLAGIARISM } from '../config.js';

/** Erreur explicite : cle manquante, quota, CORS bloque, etc. */
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
    if (!settings.searchApiKey) throw new ProviderError('Cle Google API manquante.', { permanent: true });
    if (!settings.searchExtra) throw new ProviderError('ID du moteur (cx) manquant.', { permanent: true });
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
    if (!settings.searchApiKey) throw new ProviderError('Cle Serper manquante.', { permanent: true });
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
    if (!settings.searchApiKey) throw new ProviderError('Cle Brave manquante.', { permanent: true });
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
    if (!settings.searchApiKey) throw new ProviderError('Cle Bing manquante.', { permanent: true });
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
   * Endpoint maison : attendu en GET `?q=...`, renvoyant
   * `{results: [{url, title, snippet}]}` ou directement un tableau.
   * Permet de brancher n'importe quel moteur derriere un petit proxy sans
   * modifier l'application.
   */
  async custom(query, settings) {
    if (!settings.searchExtra) throw new ProviderError('URL de l\'endpoint manquante.', { permanent: true });
    const url = new URL(settings.searchExtra);
    url.searchParams.set('q', query);
    const headers = settings.searchApiKey ? { authorization: `Bearer ${settings.searchApiKey}` } : {};
    const response = await fetchWithTimeout(url.toString(), { headers }, PLAGIARISM.requestTimeoutMs);
    await assertOk(response, 'Endpoint personnalise');
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

async function assertOk(response, providerName) {
  if (response.ok) return;
  const body = await response.text().catch(() => '');
  const detail = body ? ` — ${body.slice(0, 180)}` : '';
  if (response.status === 401 || response.status === 403) {
    throw new ProviderError(`${providerName} : cle refusee (HTTP ${response.status})${detail}`, { permanent: true });
  }
  if (response.status === 429) {
    throw new ProviderError(`${providerName} : quota depasse (HTTP 429). Reduisez le budget de requetes dans les reglages.`, { permanent: true });
  }
  if (response.status === 400) {
    throw new ProviderError(`${providerName} : requete refusee (HTTP 400)${detail}`, { permanent: true });
  }
  throw new ProviderError(`${providerName} : HTTP ${response.status}${detail}`);
}

/** Point d'entree unique. */
export async function search(query, settings) {
  const impl = IMPLEMENTATIONS[settings.searchProvider];
  if (!impl) throw new ProviderError('Aucun fournisseur de recherche configure.', { permanent: true });
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

/** Message d'aide affiche quand la recherche n'est pas configurable. */
export function providerHint(settings) {
  if (settings.searchProvider === 'none') {
    return 'Aucun moteur de recherche configure : seules les sources locales que vous fournissez seront comparees.';
  }
  if (!isSearchConfigured(settings)) {
    return 'Le fournisseur selectionne est incomplet (cle ou parametre manquant). Ouvrez les reglages pour le completer.';
  }
  return '';
}
