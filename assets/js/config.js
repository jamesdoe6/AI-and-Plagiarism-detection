/**
 * Configuration centrale de l'application.
 *
 * Tout ce qui est "reglable" (seuils, poids de l'ensemble, limites, fournisseurs
 * de recherche) est regroupe ici pour que la mise a jour du detecteur ne demande
 * pas de toucher a la logique metier.
 *
 * Les preferences utilisateur (cles d'API, seuils personnalises) sont
 * persistees dans localStorage, jamais envoyees ailleurs que vers le
 * fournisseur choisi par l'utilisateur.
 */

export const APP = {
  name: 'AI-Plagiarism-Detector',
  version: '1.0.0',
  storageKey: 'apd.settings.v1',
};

/** Limites d'entree. */
export const LIMITS = {
  maxWords: 100000,
  minWordsForAnalysis: 40,
  minWordsForHighConfidence: 300,
  maxFileBytes: 25 * 1024 * 1024,
};

/**
 * Seuils d'interpretation du score IA.
 * Volontairement conservateurs : on n'annonce "probablement IA" qu'a partir de
 * 70 %, et "tres probablement IA" a partir de 85 %, afin de limiter les faux
 * positifs (particulierement frequents sur les textes de locuteurs non natifs
 * et sur les textes techniques tres formates).
 */
export const AI_THRESHOLDS = {
  human: 30,       // < 30 %  -> signature plutot humaine
  uncertain: 55,   // 30-55 % -> indetermine
  likely: 70,      // 55-70 % -> signaux mixtes
  strong: 85,      // 70-85 % -> probablement assiste par IA
                   // >= 85 % -> signature fortement compatible avec une IA
};

/** Seuils d'interpretation du score de plagiat (couverture du texte). */
export const PLAGIARISM_THRESHOLDS = {
  low: 8,
  moderate: 20,
  high: 40,
};

/**
 * Poids par defaut des detecteurs locaux dans l'ensemble.
 * La somme n'a pas besoin de valoir 1 : l'ensemble normalise.
 * Pour ajouter un detecteur : l'enregistrer dans detectors/ensemble.js et
 * ajouter son id ici.
 */
export const DETECTOR_WEIGHTS = {
  perplexity: 1.35,
  burstiness: 1.25,
  stylometry: 1.0,
  lexicalRichness: 0.9,
  markers: 1.15,
  structure: 0.8,
  syntaxTemplate: 0.95,
  compression: 0.85,
  remoteLlm: 1.6,
  remoteClassifier: 1.5,
};

/** Parametres du moteur de plagiat. */
export const PLAGIARISM = {
  passageWords: 42,        // taille d'une fenetre d'analyse
  passageOverlap: 18,      // recouvrement entre fenetres
  shingleSize: 5,          // n-grammes de mots pour les shingles
  maxQueries: 24,          // budget de requetes moteur par analyse
  maxFetch: 12,            // nombre max de pages telechargees pour comparaison fine
  minSimilarity: 0.32,     // en dessous : bruit, on ignore
  reportSimilarity: 0.45,  // seuil d'affichage dans le tableau des sources
  concurrency: 4,
  requestTimeoutMs: 15000,
  fetchTimeoutMs: 20000,
  retries: 2,
};

/** Fournisseurs de recherche web supportes (tous appelables depuis le navigateur). */
export const SEARCH_PROVIDERS = {
  none: {
    id: 'none',
    label: 'Aucun (sources locales uniquement)',
    needsKey: false,
    docs: 'docs/API-SETUP.md',
  },
  google_cse: {
    id: 'google_cse',
    label: 'Google Programmable Search (JSON API)',
    needsKey: true,
    needsExtra: 'cx',
    extraLabel: 'ID du moteur (cx)',
    docs: 'https://developers.google.com/custom-search/v1/overview',
  },
  serper: {
    id: 'serper',
    label: 'Serper.dev (Google)',
    needsKey: true,
    docs: 'https://serper.dev',
  },
  brave: {
    id: 'brave',
    label: 'Brave Search API',
    needsKey: true,
    docs: 'https://brave.com/search/api/',
  },
  bing: {
    id: 'bing',
    label: 'Bing Web Search (Azure)',
    needsKey: true,
    docs: 'https://learn.microsoft.com/bing/search-apis/',
  },
  custom: {
    id: 'custom',
    label: 'Endpoint personnalise (proxy maison)',
    needsKey: false,
    needsExtra: 'endpoint',
    extraLabel: 'URL de l\'endpoint',
    docs: 'docs/API-SETUP.md',
  },
};

/** Fournisseurs optionnels pour le detecteur IA distant. */
export const AI_PROVIDERS = {
  none: { id: 'none', label: 'Aucun (analyse locale uniquement)', needsKey: false },
  anthropic: {
    id: 'anthropic',
    label: 'Claude (Anthropic Messages API)',
    needsKey: true,
    defaultModel: 'claude-sonnet-5',
    endpoint: 'https://api.anthropic.com/v1/messages',
  },
  openai_compatible: {
    id: 'openai_compatible',
    label: 'Endpoint compatible OpenAI (/chat/completions)',
    needsKey: true,
    needsExtra: 'endpoint',
    extraLabel: 'URL de base',
    defaultModel: 'gpt-4o-mini',
  },
  huggingface: {
    id: 'huggingface',
    label: 'Hugging Face Inference (classifieur)',
    needsKey: true,
    defaultModel: 'openai-community/roberta-base-openai-detector',
    endpoint: 'https://api-inference.huggingface.co/models/',
  },
};

/** Extracteur de texte distant utilise pour comparer le texte source aux pages. */
export const READER = {
  // r.jina.ai renvoie le texte brut d'une page et autorise le CORS.
  defaultTemplate: 'https://r.jina.ai/{url}',
};

/** Reglages par defaut, fusionnes avec ce qui est stocke localement. */
export const DEFAULT_SETTINGS = {
  searchProvider: 'none',
  searchApiKey: '',
  searchExtra: '',
  aiProvider: 'none',
  aiApiKey: '',
  aiExtra: '',
  aiModel: '',
  readerTemplate: READER.defaultTemplate,
  useReader: true,
  expertMode: false,
  theme: 'dark',
  aiThreshold: AI_THRESHOLDS.strong,
  maxQueries: PLAGIARISM.maxQueries,
  localSources: '',
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(APP.storageKey);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(APP.storageKey, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}
