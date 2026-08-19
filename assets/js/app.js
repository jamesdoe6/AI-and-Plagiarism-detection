/**
 * Application controller.
 *
 * Responsibilities: UI state, text input and file import, orchestration of the
 * two analyses, progress reporting, report export and language switching.
 * All detection logic lives in detectors/ and plagiarism/; this module only
 * drives it.
 */

import { $, el, clear, download } from './util/dom.js';
import { loadSettings, saveSettings, LIMITS, APP } from './config.js';
import { analyzeAi } from './detectors/ensemble.js';
import { analyzePlagiarism } from './plagiarism/engine.js';
import { isSearchConfigured, providerHintKey } from './plagiarism/providers.js';
import { extractTextFromFile, validateText, FileError, formatBytes } from './io/file-parsers.js';
import { buildReportHtml } from './io/report.js';
import { initSettings } from './ui/settings.js';
import { renderAi, renderPlagiarism, renderDisclaimers, resolve } from './ui/render.js';
import { getSample } from './ui/sample.js';
import { words } from './core/tokenize.js';
import {
  t, getLang, setLang, detectInitialLanguage, applyTranslations,
  onLanguageChange, formatNumber, formatTime, SUPPORTED,
} from './i18n/index.js';

const state = {
  text: '',
  fileName: null,
  running: false,
  cancelled: false,
  ai: null,
  plagiarism: null,
  settings: loadSettings(),
  /** Log entries are kept as {key, params} so they survive a language switch. */
  logEntries: [],
};

let settingsApi;

/* ------------------------------------------------------------- Bootstrap */

function init() {
  setLang(detectInitialLanguage());
  applyTranslations();
  syncLanguageSwitch();
  renderDisclaimers();

  $('#expert-toggle').checked = Boolean(state.settings.expertMode);

  settingsApi = initSettings((next, messageKey) => {
    state.settings = next;
    updateProviderHint();
    if (messageKey) log({ key: messageKey });
  });

  bindLanguage();
  bindStickyBar();
  bindInput();
  bindTabs();
  bindFile();
  bindActions();
  updateCounter();
  updateProviderHint();

  // Re-render everything that was computed, without re-analysing.
  onLanguageChange(() => {
    syncLanguageSwitch();
    renderDisclaimers();
    updateCounter();
    updateProviderHint();
    redrawLog();
    if (state.ai) renderAi(state.ai, { expert: state.settings.expertMode });
    if (state.plagiarism) renderPlagiarism(state.plagiarism);
  });
}

/* -------------------------------------------------------------- Language */

function bindLanguage() {
  for (const button of $('#lang-switch').querySelectorAll('button')) {
    button.addEventListener('click', () => setLang(button.dataset.lang));
  }
}

function syncLanguageSwitch() {
  const lang = getLang();
  const index = SUPPORTED.indexOf(lang);
  const pill = $('#lang-switch .lang-pill');
  if (pill) pill.style.transform = `translateX(calc(${Math.max(0, index)} * 100%))`;
  for (const button of $('#lang-switch').querySelectorAll('button')) {
    button.setAttribute('aria-pressed', String(button.dataset.lang === lang));
  }
}

/** Separator border once the bar leaves the top of the page. */
function bindStickyBar() {
  const bar = document.querySelector('.topbar-wrap');
  const onScroll = () => bar.classList.toggle('is-stuck', window.scrollY > 6);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

/* ----------------------------------------------------------------- Input */

function bindInput() {
  const input = $('#text-input');
  input.addEventListener('input', () => {
    state.text = input.value;
    state.fileName = null;
    updateCounter();
  });
}

function bindTabs() {
  const tabs = [
    { tab: $('#tab-paste'), pane: $('#pane-paste') },
    { tab: $('#tab-file'), pane: $('#pane-file') },
  ];
  for (const { tab } of tabs) {
    tab.addEventListener('click', () => {
      for (const entry of tabs) {
        const active = entry.tab === tab;
        entry.tab.setAttribute('aria-selected', String(active));
        entry.pane.hidden = !active;
      }
    });
  }
}

function bindFile() {
  const dropzone = $('#dropzone');
  const fileInput = $('#file-input');

  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); fileInput.click(); }
  });

  for (const type of ['dragenter', 'dragover']) {
    dropzone.addEventListener(type, (event) => { event.preventDefault(); dropzone.classList.add('is-over'); });
  }
  for (const type of ['dragleave', 'drop']) {
    dropzone.addEventListener(type, (event) => { event.preventDefault(); dropzone.classList.remove('is-over'); });
  }
  dropzone.addEventListener('drop', (event) => {
    const file = event.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) handleFile(file);
    fileInput.value = '';
  });
}

async function handleFile(file) {
  hideError();
  const status = $('#file-status');
  status.hidden = false;
  clear(status).append(el('span', { class: 'file-chip' }, [
    el('span', { class: 'spinner' }),
    `${file.name} — ${formatBytes(file.size)}`,
  ]));

  try {
    const result = await extractTextFromFile(file, (label) => {
      clear(status).append(el('span', { class: 'file-chip' }, [
        el('span', { class: 'spinner' }), `${file.name} — ${label}`,
      ]));
    });

    state.text = result.text;
    state.fileName = file.name;
    $('#text-input').value = result.text;
    updateCounter();

    clear(status).append(el('span', { class: 'file-chip' }, [
      '📄',
      `${file.name} · ${result.kind} · ${formatNumber(result.wordCount)} ${t('units.words')}`,
      el('button', {
        class: 'btn btn-sm btn-ghost',
        onclick: () => {
          state.text = '';
          state.fileName = null;
          $('#text-input').value = '';
          status.hidden = true;
          updateCounter();
        },
        text: '✕',
      }),
    ]));

    if (result.warning) showError(result.warning, 'info');
  } catch (err) {
    status.hidden = true;
    showError(err instanceof FileError ? err.message : t('errors.readFailed', { message: err.message }));
  }
}

function updateCounter() {
  const count = words(state.text).length;
  const counter = $('#counter');
  let text = t('input.counter', { words: formatNumber(count), chars: formatNumber(state.text.length) });
  let tone = 'small dim';

  if (count > LIMITS.maxWords) {
    tone = 'small c-critical';
    text += t('input.counterOverLimit', { max: formatNumber(LIMITS.maxWords) });
  } else if (count && count < LIMITS.minWordsForAnalysis) {
    tone = 'small c-moderate';
    text += t('input.counterTooShort', { min: LIMITS.minWordsForAnalysis });
  } else if (count && count < LIMITS.minWordsForHighConfidence) {
    text += t('input.counterLowConfidence', { recommended: LIMITS.minWordsForHighConfidence });
  }

  counter.className = tone;
  counter.textContent = text;
}

function updateProviderHint() {
  const key = providerHintKey(state.settings);
  const host = $('#provider-hint');
  if (!key || !$('#opt-plag').checked) { host.hidden = true; return; }
  host.hidden = false;
  clear(host).append(
    el('span', { class: 'notice-icon', text: 'ℹ️' }),
    el('div', {}, [
      t(key),
      ' ',
      el('button', { class: 'btn btn-sm btn-ghost', onclick: () => settingsApi.open(), text: t('input.configure') }),
    ]),
  );
}

/* --------------------------------------------------------------- Actions */

function bindActions() {
  $('#analyze-btn').addEventListener('click', runAnalysis);
  $('#cancel-btn').addEventListener('click', () => {
    state.cancelled = true;
    log({ key: 'logs.cancelling' });
  });

  $('#sample-btn').addEventListener('click', () => {
    state.text = getSample(getLang());
    state.fileName = 'sample-generated.txt';
    $('#text-input').value = state.text;
    $('#tab-paste').click();
    updateCounter();
    showError(t('logs.sampleLoaded'), 'info');
  });

  $('#clear-btn').addEventListener('click', () => {
    state.text = '';
    state.fileName = null;
    state.ai = null;
    state.plagiarism = null;
    $('#text-input').value = '';
    $('#file-status').hidden = true;
    $('#ai-section').hidden = true;
    $('#plag-section').hidden = true;
    $('#export-section').hidden = true;
    hideError();
    updateCounter();
  });

  $('#expert-toggle').addEventListener('change', (event) => {
    state.settings.expertMode = event.target.checked;
    saveSettings(state.settings);
    if (state.ai) renderAi(state.ai, { expert: state.settings.expertMode });
  });

  $('#opt-plag').addEventListener('change', updateProviderHint);

  $('#report-html-btn').addEventListener('click', downloadHtmlReport);
  $('#report-pdf-btn').addEventListener('click', printReport);
  $('#report-json-btn').addEventListener('click', downloadJson);
}

/* -------------------------------------------------------------- Analysis */

async function runAnalysis() {
  if (state.running) return;
  hideError();

  const wantAi = $('#opt-ai').checked;
  const wantPlagiarism = $('#opt-plag').checked;

  if (!wantAi && !wantPlagiarism) {
    showError(t('errors.selectOne'));
    return;
  }

  let validated;
  try {
    validated = validateText(state.text);
  } catch (err) {
    showError(err.message);
    return;
  }

  if (validated.wordCount < LIMITS.minWordsForAnalysis) {
    showError(t('errors.tooShort', { min: LIMITS.minWordsForAnalysis, count: validated.wordCount }));
    return;
  }

  state.running = true;
  state.cancelled = false;
  state.ai = null;
  state.plagiarism = null;
  state.logEntries = [];

  $('#analyze-btn').disabled = true;
  $('#progress-section').hidden = false;
  $('#ai-section').hidden = true;
  $('#plag-section').hidden = true;
  $('#export-section').hidden = true;
  clear($('#progress-log'));
  setProgress({ key: 'progress.preparing' }, 0);

  const text = validated.text;
  const steps = (wantAi ? 1 : 0) + (wantPlagiarism ? 1 : 0);
  let completed = 0;

  try {
    if (wantAi) {
      const result = await analyzeAi(text, state.settings, {
        onStep: (step, ratio) => setProgress(
          { key: 'progress.aiPrefix', params: { step } },
          ((completed + ratio) / steps) * 100,
        ),
        onLog: log,
      });
      if (state.cancelled) throw new CancelledError();
      state.ai = result;
      renderAi(result, { expert: state.settings.expertMode });
      completed += 1;
      log({
        key: 'logs.aiDone',
        params: {
          score: result.score === null ? { key: 'logs.aiNotScored' } : `${result.score.toFixed(1)} %`,
          confidence: { key: result.confidenceKey },
        },
      });
    }

    if (wantPlagiarism) {
      if (!isSearchConfigured(state.settings) && !(state.settings.localSources ?? '').trim()) {
        log({ key: 'logs.noProvider' });
      }
      const result = await analyzePlagiarism(text, state.settings, {
        onStep: (step, ratio) => setProgress(
          { key: 'progress.plagiarismPrefix', params: { step } },
          ((completed + ratio) / steps) * 100,
        ),
        onLog: log,
      });
      if (state.cancelled) throw new CancelledError();
      state.plagiarism = result;
      renderPlagiarism(result);
      completed += 1;
      log({
        key: 'logs.plagDone',
        params: { score: result.score.toFixed(1), sources: result.sources.length },
      });
    }

    setProgress({ key: 'progress.done' }, 100);
    $('#export-section').hidden = !(state.ai || state.plagiarism);
    (state.ai ? $('#ai-section') : $('#plag-section')).scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    if (err instanceof CancelledError) {
      log({ key: 'logs.cancelled' });
      setProgress({ key: 'progress.cancelled' }, 0);
    } else {
      console.error(err);
      showError(t('errors.analysisFailed', { message: err.message }));
      log({ key: 'logs.error', params: { message: err.message } });
    }
  } finally {
    state.running = false;
    $('#analyze-btn').disabled = false;
    $('#progress-spinner').hidden = true;
  }
}

class CancelledError extends Error {
  constructor() { super('cancelled'); }
}

/* -------------------------------------------------------------- Progress */

function setProgress(labelDescriptor, percent) {
  const clamped = Math.max(0, Math.min(100, percent));
  $('#progress-label').textContent = resolve(labelDescriptor);
  $('#progress-pct').textContent = `${clamped.toFixed(0)} %`;
  $('#progress-fill').style.width = `${clamped}%`;
  $('#progress-spinner').hidden = clamped >= 100;
}

/**
 * Log an entry. Entries are stored as descriptors, not strings, so switching
 * language re-renders the whole journal rather than leaving it half-translated.
 */
function log(entry) {
  state.logEntries.push({ time: new Date(), entry });
  appendLogLine(state.logEntries[state.logEntries.length - 1]);
}

function appendLogLine({ time, entry }) {
  const host = $('#progress-log');
  host.append(el('div', { text: `[${formatTime(time)}] ${resolve(entry)}` }));
  host.scrollTop = host.scrollHeight;
}

function redrawLog() {
  const host = clear($('#progress-log'));
  for (const line of state.logEntries) appendLogLine(line);
  void host;
}

/* ---------------------------------------------------------------- Errors */

function showError(message, kind = 'danger') {
  const host = $('#input-error');
  host.hidden = false;
  host.className = `notice ${kind === 'danger' ? 'notice-danger' : 'notice-info'}`;
  clear(host).append(
    el('span', { class: 'notice-icon', text: kind === 'danger' ? '⛔' : 'ℹ️' }),
    el('div', { text: message }),
  );
}

function hideError() {
  $('#input-error').hidden = true;
}

/* ---------------------------------------------------------------- Export */

function reportPayload() {
  return {
    ai: state.ai ?? {
      score: null, band: 'uncertain', confidenceKey: null, verdictKey: null,
      reasons: [], detectors: [], votes: { ai: 0, human: 0, neutral: 0 },
      agreement: 0, featureCount: 0, detectorCount: 0,
    },
    plagiarism: state.plagiarism ?? {
      score: 0, band: 'low', verdictKey: null, sources: [], matches: [],
      passageCount: 0, queriesRun: 0, errors: [], commonPhrasesFiltered: 0,
    },
    meta: {
      title: state.fileName ?? t('report.pastedText'),
      wordCount: words(state.text).length,
      language: state.ai?.language?.lang?.toUpperCase() ?? t('units.notAvailable'),
    },
  };
}

function downloadHtmlReport() {
  download(`report-${stamp()}.html`, buildReportHtml(reportPayload()), 'text/html;charset=utf-8');
}

function printReport() {
  const html = buildReportHtml(reportPayload());
  const frame = el('iframe', { style: 'position:fixed;right:0;bottom:0;width:0;height:0;border:0' });
  document.body.append(frame);
  const doc = frame.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();
  frame.contentWindow.addEventListener('load', () => {
    frame.contentWindow.focus();
    frame.contentWindow.print();
    setTimeout(() => frame.remove(), 1000);
  });
}

function downloadJson() {
  // The full document and raw vectors are stripped: they bloat the file without
  // helping anyone re-read it. The metric vector is included only in expert mode.
  const payload = {
    generator: `${APP.name} v${APP.version}`,
    generatedAt: new Date().toISOString(),
    language: getLang(),
    meta: reportPayload().meta,
    ai: state.ai ? {
      score: state.ai.score,
      band: state.ai.band,
      confidence: state.ai.confidence,
      confidenceLabel: t(state.ai.confidenceKey),
      verdict: t(state.ai.verdictKey),
      agreement: state.ai.agreement,
      votes: state.ai.votes,
      reasons: state.ai.reasons.map((r) => resolve(r)),
      featureCount: state.ai.featureCount,
      detectedLanguage: state.ai.language,
      thresholds: state.ai.thresholds,
      detectors: state.ai.detectors.map((d) => ({
        id: d.id,
        label: t(d.labelKey),
        score: d.score,
        confidence: d.confidence,
        unavailable: Boolean(d.unavailable),
        error: d.errorKey ? t(d.errorKey, d.errorParams) : (d.errorText ?? null),
        evidence: (d.evidence ?? []).map((e) => ({
          label: t(e.labelKey),
          value: resolve(e.value),
          score: e.score,
          direction: e.direction,
        })),
      })),
      features: state.settings.expertMode ? state.ai.features : undefined,
    } : null,
    plagiarism: state.plagiarism ? {
      score: state.plagiarism.score,
      band: state.plagiarism.band,
      verdict: t(state.plagiarism.verdictKey, state.plagiarism.verdictParams),
      passageCount: state.plagiarism.passageCount,
      queriesRun: state.plagiarism.queriesRun,
      commonPhrasesFiltered: state.plagiarism.commonPhrasesFiltered,
      errors: state.plagiarism.errors,
      sources: state.plagiarism.sources.map((s) => ({
        url: s.url,
        domain: s.domainKey ? t(s.domainKey) : s.domain,
        title: s.titleKey ? t(s.titleKey, s.titleParams) : s.title,
        bestSimilarity: s.bestSimilarity,
        coverage: s.coverage,
        verified: s.verified,
        matches: s.matches.map((m) => ({
          similarity: m.similarity,
          exact: m.exact,
          start: m.start,
          end: m.end,
          passageText: m.passageText,
          matchedText: m.matchedText,
        })),
      })),
    } : null,
    disclaimer: t('report.jsonDisclaimer'),
  };
  download(`analysis-${stamp()}.json`, JSON.stringify(payload, null, 2), 'application/json');
}

function stamp() {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
