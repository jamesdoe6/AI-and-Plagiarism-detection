/**
 * Central application configuration.
 *
 * Everything "tunable" (thresholds, ensemble weights, limits, search providers)
 * lives here, so updating the detector never means touching business logic.
 *
 * User preferences (API keys, custom thresholds) are persisted in localStorage
 * and never sent anywhere other than the provider the user chose.
 */

export const APP = {
  name: 'AI-Plagiarism-Detector',
  version: '1.0.0',
  storageKey: 'apd.settings.v1',
};

/** Input limits. */
export const LIMITS = {
  maxWords: 100000,
  minWordsForAnalysis: 40,
  minWordsForHighConfidence: 300,
  maxFileBytes: 25 * 1024 * 1024,
};

/**
 * Interpretation thresholds for the AI score.
 * Deliberately conservative: we only say "likely AI" from 70 %, and "very
 * likely AI" from 85 %, in order to limit false positives (which are especially
 * frequent on non-native writing and on heavily formatted technical text).
 */
export const AI_THRESHOLDS = {
  human: 30,       // < 30 %  -> rather human signature
  uncertain: 55,   // 30-55 % -> undetermined
  likely: 70,      // 55-70 % -> mixed signals
  strong: 85,      // 70-85 % -> likely AI-assisted
                   // >= 85 % -> signature strongly consistent with AI
};

/** Interpretation thresholds for the plagiarism score (text coverage). */
export const PLAGIARISM_THRESHOLDS = {
  low: 8,
  moderate: 20,
  high: 40,
};

/**
 * Default weights of the detectors within the ensemble.
 * The sum need not be 1: the ensemble normalises.
 * To add a detector: register it in detectors/ensemble.js and add its id here.
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

/** Plagiarism engine parameters. */
export const PLAGIARISM = {
  passageWords: 42,        // size of one analysis window
  passageOverlap: 18,      // overlap between windows
  shingleSize: 5,          // word n-grams used for shingles
  maxQueries: 24,          // engine query budget per analysis
  maxFetch: 12,            // max pages downloaded for detailed comparison
  minSimilarity: 0.32,     // below this: noise, discarded
  reportSimilarity: 0.45,  // display threshold in the sources table
  concurrency: 4,
  requestTimeoutMs: 15000,
  fetchTimeoutMs: 20000,
  retries: 2,
};

/** Supported web search providers (all callable from a browser). */
export const SEARCH_PROVIDERS = {
  none: {
    id: 'none',
    labelKey: 'providers.none',
    needsKey: false,
    docs: 'docs/API-SETUP.md',
  },
  google_cse: {
    id: 'google_cse',
    labelKey: 'providers.googleCse',
    needsKey: true,
    needsExtra: 'cx',
    extraLabelKey: 'providers.engineId',
    docs: 'https://developers.google.com/custom-search/v1/overview',
  },
  serper: {
    id: 'serper',
    labelKey: 'providers.serper',
    needsKey: true,
    docs: 'https://serper.dev',
  },
  brave: {
    id: 'brave',
    labelKey: 'providers.brave',
    needsKey: true,
    docs: 'https://brave.com/search/api/',
  },
  bing: {
    id: 'bing',
    labelKey: 'providers.bing',
    needsKey: true,
    docs: 'https://learn.microsoft.com/bing/search-apis/',
  },
  custom: {
    id: 'custom',
    labelKey: 'providers.custom',
    needsKey: false,
    needsExtra: 'endpoint',
    extraLabelKey: 'providers.endpointUrl',
    docs: 'docs/API-SETUP.md',
  },
};

/** Optional providers for the remote AI detector. */
export const AI_PROVIDERS = {
  none: { id: 'none', labelKey: 'providers.aiNone', needsKey: false },
  anthropic: {
    id: 'anthropic',
    labelKey: 'providers.anthropic',
    needsKey: true,
    defaultModel: 'claude-sonnet-5',
    endpoint: 'https://api.anthropic.com/v1/messages',
  },
  openai_compatible: {
    id: 'openai_compatible',
    labelKey: 'providers.openaiCompatible',
    needsKey: true,
    needsExtra: 'endpoint',
    extraLabelKey: 'settings.baseUrl',
    defaultModel: 'gpt-4o-mini',
  },
  huggingface: {
    id: 'huggingface',
    labelKey: 'providers.huggingface',
    needsKey: true,
    defaultModel: 'openai-community/roberta-base-openai-detector',
    endpoint: 'https://api-inference.huggingface.co/models/',
  },
};

/** Remote text extractor used to compare the source text against pages. */
export const READER = {
  // r.jina.ai returns a page's plain text and allows CORS.
  defaultTemplate: 'https://r.jina.ai/{url}',
};

/** Default settings, merged with whatever is stored locally. */
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
