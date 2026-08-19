/**
 * Tiroir de reglages : fournisseurs, cles, seuils, sources locales.
 * Les valeurs sont persistees dans localStorage via config.js.
 */

import { $, el } from '../util/dom.js';
import { SEARCH_PROVIDERS, AI_PROVIDERS, DEFAULT_SETTINGS, loadSettings, saveSettings } from '../config.js';

export function initSettings(onChange) {
  let settings = loadSettings();

  const searchSelect = $('#set-search-provider');
  const aiSelect = $('#set-ai-provider');

  for (const provider of Object.values(SEARCH_PROVIDERS)) {
    searchSelect.append(el('option', { value: provider.id, text: provider.label }));
  }
  for (const provider of Object.values(AI_PROVIDERS)) {
    aiSelect.append(el('option', { value: provider.id, text: provider.label }));
  }

  function fill() {
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
    $('#threshold-value').textContent = settings.aiThreshold;
    syncVisibility();
  }

  function syncVisibility() {
    const search = SEARCH_PROVIDERS[searchSelect.value];
    $('#field-search-key').hidden = !search?.needsKey && searchSelect.value !== 'custom';
    const extraNeeded = Boolean(search?.needsExtra);
    $('#field-search-extra').hidden = !extraNeeded;
    if (extraNeeded) $('#label-search-extra').textContent = search.extraLabel;

    const ai = AI_PROVIDERS[aiSelect.value];
    $('#field-ai-key').hidden = !ai?.needsKey;
    $('#field-ai-extra').hidden = !ai?.needsExtra;
    $('#field-ai-model').hidden = aiSelect.value === 'none';
    if (ai?.needsExtra) $('#label-ai-extra').textContent = ai.extraLabel;
    if (ai?.defaultModel && !$('#set-ai-model').value) $('#set-ai-model').placeholder = ai.defaultModel;
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
  $('#set-threshold').addEventListener('input', (event) => {
    $('#threshold-value').textContent = event.target.value;
  });

  $('#save-settings').addEventListener('click', () => {
    settings = read();
    const ok = saveSettings(settings);
    onChange(settings, ok
      ? 'Reglages enregistres.'
      : 'Reglages appliques, mais impossible de les enregistrer (stockage local indisponible).');
    close();
  });

  $('#reset-settings').addEventListener('click', () => {
    settings = { ...DEFAULT_SETTINGS, theme: settings.theme, expertMode: settings.expertMode };
    saveSettings(settings);
    fill();
    onChange(settings, 'Reglages reinitialises.');
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
    $('#set-search-provider').focus();
  }

  function close() {
    drawer.classList.remove('is-open');
    backdrop.classList.remove('is-open');
    setTimeout(() => { drawer.hidden = true; }, 320);
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
