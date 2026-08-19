/**
 * Settings drawer: providers, keys, thresholds, local sources.
 * Values are persisted to localStorage through config.js.
 */

import { $, el, clear } from '../util/dom.js';
import { SEARCH_PROVIDERS, AI_PROVIDERS, DEFAULT_SETTINGS, loadSettings, saveSettings } from '../config.js';
import { t, onLanguageChange } from '../i18n/index.js';

export function initSettings(onChange) {
  let settings = loadSettings();

  const searchSelect = $('#set-search-provider');
  const aiSelect = $('#set-ai-provider');

  /** Provider option labels are translated, so they are rebuilt on switch. */
  function buildOptions() {
    const searchValue = searchSelect.value || settings.searchProvider;
    const aiValue = aiSelect.value || settings.aiProvider;

    clear(searchSelect);
    for (const provider of Object.values(SEARCH_PROVIDERS)) {
      searchSelect.append(el('option', { value: provider.id, text: t(provider.labelKey) }));
    }
    clear(aiSelect);
    for (const provider of Object.values(AI_PROVIDERS)) {
      aiSelect.append(el('option', { value: provider.id, text: t(provider.labelKey) }));
    }

    searchSelect.value = searchValue;
    aiSelect.value = aiValue;
  }

  function fill() {
    buildOptions();
    searchSelect.value = settings.searchProvider;
    $('#set-search-key').value = settings.searchApiKey;
    $('#set-search-extra').value = settings.searchExtra;
    $('#set-max-queries').value = settings.maxQueries;
    $('#set-use-reader').checked = settings.useReader !== false;
    $('#set-reader').value = settings.readerTemplate;
    aiSelect.value = settings.aiProvider;
    $('#set-ai-key').value = settings.aiApiKey;
    $('#set-ai-extra').value = settings.aiExtra;
    $('#set-ai-model').value = settings.aiModel;
    $('#set-local-sources').value = settings.localSources;
    $('#set-threshold').value = settings.aiThreshold;
    syncVisibility();
  }

  function syncVisibility() {
    const search = SEARCH_PROVIDERS[searchSelect.value];
    $('#field-search-key').hidden = !search?.needsKey && searchSelect.value !== 'custom';
    const extraNeeded = Boolean(search?.needsExtra);
    $('#field-search-extra').hidden = !extraNeeded;
    if (extraNeeded) $('#label-search-extra').textContent = t(search.extraLabelKey);

    const ai = AI_PROVIDERS[aiSelect.value];
    $('#field-ai-key').hidden = !ai?.needsKey;
    $('#field-ai-extra').hidden = !ai?.needsExtra;
    $('#field-ai-model').hidden = aiSelect.value === 'none';
    if (ai?.needsExtra) $('#label-ai-extra').textContent = t(ai.extraLabelKey);
    if (ai?.defaultModel) $('#set-ai-model').placeholder = ai.defaultModel;

    $('#threshold-label').textContent = t('settings.threshold', { value: $('#set-threshold').value });
  }

  function read() {
    return {
      ...settings,
      searchProvider: searchSelect.value,
      searchApiKey: $('#set-search-key').value.trim(),
      searchExtra: $('#set-search-extra').value.trim(),
      maxQueries: Number($('#set-max-queries').value) || DEFAULT_SETTINGS.maxQueries,
      useReader: $('#set-use-reader').checked,
      readerTemplate: $('#set-reader').value.trim() || DEFAULT_SETTINGS.readerTemplate,
      aiProvider: aiSelect.value,
      aiApiKey: $('#set-ai-key').value.trim(),
      aiExtra: $('#set-ai-extra').value.trim(),
      aiModel: $('#set-ai-model').value.trim(),
      localSources: $('#set-local-sources').value,
      aiThreshold: Number($('#set-threshold').value),
    };
  }

  searchSelect.addEventListener('change', syncVisibility);
  aiSelect.addEventListener('change', syncVisibility);
  $('#set-threshold').addEventListener('input', syncVisibility);

  $('#save-settings').addEventListener('click', () => {
    settings = read();
    const ok = saveSettings(settings);
    onChange(settings, ok ? 'settings.saved' : 'settings.savedNoStorage');
    close();
  });

  $('#reset-settings').addEventListener('click', () => {
    settings = { ...DEFAULT_SETTINGS, expertMode: settings.expertMode };
    saveSettings(settings);
    fill();
    onChange(settings, 'settings.resetDone');
  });

  // Rebuild the translated option lists when the language changes.
  onLanguageChange(() => {
    buildOptions();
    syncVisibility();
  });

  const drawer = $('#drawer');
  const backdrop = $('#drawer-backdrop');

  function open() {
    fill();
    drawer.hidden = false;
    requestAnimationFrame(() => {
      drawer.classList.add('is-open');
      backdrop.classList.add('is-open');
    });
    searchSelect.focus();
  }

  function close() {
    drawer.classList.remove('is-open');
    backdrop.classList.remove('is-open');
    setTimeout(() => { drawer.hidden = true; }, 450);
  }

  $('#settings-btn').addEventListener('click', open);
  $('#drawer-close').addEventListener('click', close);
  backdrop.addEventListener('click', close);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !drawer.hidden) close();
  });

  fill();
  return {
    get: () => settings,
    set: (next) => { settings = { ...settings, ...next }; saveSettings(settings); },
    open,
  };
}
