/**
 * Controleur de l'application.
 *
 * Responsabilites : gestion de l'etat de l'interface, saisie et import de
 * fichiers, orchestration des deux analyses, progression, export du rapport.
 * Toute la logique de detection vit dans detectors/ et plagiarism/ ; ce module
 * ne fait que la piloter.
 */

import { $, el, clear, download } from './util/dom.js';
import { loadSettings, saveSettings, LIMITS, APP } from './config.js';
import { analyzeAi } from './detectors/ensemble.js';
import { analyzePlagiarism } from './plagiarism/engine.js';
import { isSearchConfigured, providerHint } from './plagiarism/providers.js';
import { extractTextFromFile, validateText, FileError, formatBytes } from './io/file-parsers.js';
import { buildReportHtml } from './io/report.js';
import { initSettings } from './ui/settings.js';
import { renderAi, renderPlagiarism, renderDisclaimers } from './ui/render.js';
import { SAMPLE_TEXT } from './ui/sample.js';
import { words } from './core/tokenize.js';

const state = {
  text: '',
  fileName: null,
  running: false,
  cancelled: false,
  ai: null,
  plagiarism: null,
  settings: loadSettings(),
};

let settingsApi;

/* ------------------------------------------------------------- Demarrage */

function init() {
  renderDisclaimers();
  applyTheme(state.settings.theme);
  $('#expert-toggle').checked = Boolean(state.settings.expertMode);

  settingsApi = initSettings((next, message) => {
    state.settings = next;
    updateProviderHint();
    if (message) log(message);
  });

  bindInput();
  bindTabs();
  bindStickyBar();
  bindFile();
  bindActions();
  updateCounter();
  updateProviderHint();
}

/** Bordure de separation quand la barre quitte le haut de page. */
function bindStickyBar() {
  const bar = document.querySelector('.topbar-wrap');
  const onScroll = () => bar.classList.toggle('is-stuck', window.scrollY > 6);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

/* ----------------------------------------------------------------- Theme */

function applyTheme(theme) {
  const light = theme === 'light';
  document.documentElement.dataset.theme = light ? 'light' : 'dark';
  const button = $('#theme-btn');
  if (button) {
    button.textContent = light ? '☀️' : '🌙';
    button.title = light ? 'Passer en thème sombre' : 'Passer en thème clair';
  }
}

/* ------------------------------------------------------------- Saisie -- */

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
    dropzone.addEventListener(type, (event) => {
      event.preventDefault();
      dropzone.classList.add('is-over');
    });
  }
  for (const type of ['dragleave', 'drop']) {
    dropzone.addEventListener(type, (event) => {
      event.preventDefault();
      dropzone.classList.remove('is-over');
    });
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
  clear(status).append(
    el('span', { class: 'file-chip' }, [
      el('span', { class: 'spinner' }),
      `${file.name} — ${formatBytes(file.size)}`,
    ]),
  );

  try {
    const result = await extractTextFromFile(file, (label) => {
      clear(status).append(el('span', { class: 'file-chip' }, [el('span', { class: 'spinner' }), `${file.name} — ${label}`]));
    });

    state.text = result.text;
    state.fileName = file.name;
    $('#text-input').value = result.text;
    updateCounter();

    clear(status).append(
      el('span', { class: 'file-chip' }, [
        '📄',
        `${file.name} · ${result.kind} · ${result.wordCount.toLocaleString('fr-FR')} mots`,
        el('button', {
          class: 'btn btn-sm btn-ghost',
          onclick: () => { state.text = ''; state.fileName = null; $('#text-input').value = ''; status.hidden = true; updateCounter(); },
          text: '✕',
        }),
      ]),
    );

    if (result.warning) showError(result.warning, 'notice');
  } catch (err) {
    status.hidden = true;
    showError(err instanceof FileError ? err.message : `Lecture impossible : ${err.message}`);
  }
}

function updateCounter() {
  const count = words(state.text).length;
  const chars = state.text.length;
  const counter = $('#counter');
  counter.textContent = `${count.toLocaleString('fr-FR')} mot${count > 1 ? 's' : ''} · ${chars.toLocaleString('fr-FR')} caractère${chars > 1 ? 's' : ''}`;

  if (count > LIMITS.maxWords) {
    counter.className = 'small c-critical';
    counter.textContent += ` — au-delà de la limite de ${LIMITS.maxWords.toLocaleString('fr-FR')} mots`;
  } else if (count && count < LIMITS.minWordsForAnalysis) {
    counter.className = 'small c-moderate';
    counter.textContent += ` — minimum ${LIMITS.minWordsForAnalysis} mots pour analyser`;
  } else if (count && count < LIMITS.minWordsForHighConfidence) {
    counter.className = 'small dim';
    counter.textContent += ` — ${LIMITS.minWordsForHighConfidence} mots recommandés pour une confiance correcte`;
  } else {
    counter.className = 'small dim';
  }
}

function updateProviderHint() {
  const hint = providerHint(state.settings);
  const host = $('#provider-hint');
  if (!hint || !$('#opt-plag').checked) { host.hidden = true; return; }
  host.hidden = false;
  clear(host).append(
    el('span', { class: 'notice-icon', text: 'ℹ️' }),
    el('div', {}, [
      hint,
      ' ',
      el('button', { class: 'btn btn-sm btn-ghost', onclick: () => settingsApi.open(), text: 'Configurer' }),
    ]),
  );
}

/* ------------------------------------------------------------- Actions -- */

function bindActions() {
  $('#analyze-btn').addEventListener('click', runAnalysis);
  $('#cancel-btn').addEventListener('click', () => { state.cancelled = true; log('Annulation demandée…'); });

  $('#sample-btn').addEventListener('click', () => {
    state.text = SAMPLE_TEXT;
    state.fileName = 'exemple-genere.txt';
    $('#text-input').value = SAMPLE_TEXT;
    $('#tab-paste').click();
    updateCounter();
    showError('Exemple chargé : ce texte a été produit par un modèle de langue. Il sert à montrer à quoi ressemble un score élevé.', 'notice');
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

  $('#theme-btn').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    applyTheme(next);
    state.settings.theme = next;
    saveSettings(state.settings);
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

/* ------------------------------------------------------------ Analyse -- */

async function runAnalysis() {
  if (state.running) return;
  hideError();

  const wantAi = $('#opt-ai').checked;
  const wantPlagiarism = $('#opt-plag').checked;

  if (!wantAi && !wantPlagiarism) {
    showError('Sélectionnez au moins une analyse.');
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
    showError(`Il faut au moins ${LIMITS.minWordsForAnalysis} mots pour que les métriques aient un sens (actuellement ${validated.wordCount}).`);
    return;
  }

  state.running = true;
  state.cancelled = false;
  state.ai = null;
  state.plagiarism = null;

  $('#analyze-btn').disabled = true;
  $('#progress-section').hidden = false;
  $('#ai-section').hidden = true;
  $('#plag-section').hidden = true;
  $('#export-section').hidden = true;
  clear($('#progress-log'));
  setProgress('Préparation…', 0);

  const text = validated.text;
  const steps = (wantAi ? 1 : 0) + (wantPlagiarism ? 1 : 0);
  let completed = 0;

  try {
    if (wantAi) {
      const result = await analyzeAi(text, state.settings, {
        onStep: (label, ratio) => setProgress(`IA — ${label}`, ((completed + ratio) / steps) * 100),
        onLog: log,
      });
      if (state.cancelled) throw new CancelledError();
      state.ai = result;
      renderAi(result, { expert: state.settings.expertMode });
      completed += 1;
      log(`Analyse IA terminée : ${result.score === null ? 'non noté' : `${result.score.toFixed(1)} %`} (confiance ${result.confidenceLabel}).`);
    }

    if (wantPlagiarism) {
      if (!isSearchConfigured(state.settings) && !(state.settings.localSources ?? '').trim()) {
        log('Plagiat : aucun moteur configuré et aucune source locale — analyse limitée.');
      }
      const result = await analyzePlagiarism(text, state.settings, {
        onStep: (label, ratio) => setProgress(`Plagiat — ${label}`, ((completed + ratio) / steps) * 100),
        onLog: log,
      });
      if (state.cancelled) throw new CancelledError();
      state.plagiarism = result;
      renderPlagiarism(result);
      completed += 1;
      log(`Analyse plagiat terminée : ${result.score.toFixed(1)} % de recouvrement, ${result.sources.length} source(s).`);
    }

    setProgress('Terminé', 100);
    $('#progress-spinner').hidden = true;
    $('#export-section').hidden = !(state.ai || state.plagiarism);
    $('#ai-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    if (err instanceof CancelledError) {
      log('Analyse annulée.');
      setProgress('Annulé', 0);
    } else {
      console.error(err);
      showError(`L'analyse a échoué : ${err.message}`);
      log(`Erreur : ${err.stack ?? err.message}`);
    }
  } finally {
    state.running = false;
    $('#analyze-btn').disabled = false;
    $('#progress-spinner').hidden = state.cancelled || !state.running;
  }
}

class CancelledError extends Error {
  constructor() { super('Analyse annulée'); }
}

/* --------------------------------------------------------- Progression -- */

function setProgress(label, percent) {
  const clamped = Math.max(0, Math.min(100, percent));
  $('#progress-label').textContent = label;
  $('#progress-pct').textContent = `${clamped.toFixed(0)} %`;
  $('#progress-fill').style.width = `${clamped}%`;
  $('#progress-spinner').hidden = clamped >= 100;
}

function log(message) {
  const host = $('#progress-log');
  const time = new Date().toLocaleTimeString('fr-FR');
  host.append(el('div', { text: `[${time}] ${message}` }));
  host.scrollTop = host.scrollHeight;
}

/* -------------------------------------------------------------- Erreurs -- */

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

/* --------------------------------------------------------------- Export -- */

function reportPayload() {
  return {
    ai: state.ai ?? {
      score: null, band: 'uncertain', confidenceLabel: 'non analysé',
      verdict: 'Analyse IA non demandée.', reasons: [], detectors: [],
      votes: { ai: 0, human: 0, neutral: 0 }, agreement: 0, featureCount: 0, detectorCount: 0,
    },
    plagiarism: state.plagiarism ?? {
      score: 0, band: 'low', verdict: 'Analyse de plagiat non demandée.',
      sources: [], matches: [], passageCount: 0, queriesRun: 0, errors: [], commonPhrasesFiltered: 0,
    },
    meta: {
      title: state.fileName ?? 'Texte collé',
      wordCount: words(state.text).length,
      language: state.ai?.language?.lang?.toUpperCase() ?? 'n/a',
    },
  };
}

function downloadHtmlReport() {
  const html = buildReportHtml(reportPayload());
  download(`rapport-${stamp()}.html`, html, 'text/html;charset=utf-8');
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
  const payload = reportPayload();
  // Le document complet et les vecteurs bruts sont retires : ils alourdissent
  // le fichier sans servir a la relecture.
  const serialisable = {
    generator: `${APP.name} v${APP.version}`,
    generatedAt: new Date().toISOString(),
    meta: payload.meta,
    ai: state.ai ? {
      score: state.ai.score,
      band: state.ai.band,
      confidence: state.ai.confidence,
      confidenceLabel: state.ai.confidenceLabel,
      verdict: state.ai.verdict,
      agreement: state.ai.agreement,
      votes: state.ai.votes,
      reasons: state.ai.reasons,
      featureCount: state.ai.featureCount,
      language: state.ai.language,
      detectors: state.ai.detectors.map((d) => ({
        id: d.id, label: d.label, score: d.score, confidence: d.confidence,
        unavailable: Boolean(d.unavailable), error: d.error ?? null, evidence: d.evidence,
      })),
      features: state.settings.expertMode ? state.ai.features : undefined,
    } : null,
    plagiarism: state.plagiarism ? {
      score: state.plagiarism.score,
      band: state.plagiarism.band,
      verdict: state.plagiarism.verdict,
      passageCount: state.plagiarism.passageCount,
      queriesRun: state.plagiarism.queriesRun,
      commonPhrasesFiltered: state.plagiarism.commonPhrasesFiltered,
      errors: state.plagiarism.errors,
      sources: state.plagiarism.sources.map((s) => ({
        url: s.url, domain: s.domain, title: s.title,
        bestSimilarity: s.bestSimilarity, coverage: s.coverage, verified: s.verified,
        matches: s.matches.map((m) => ({
          similarity: m.similarity, exact: m.exact, start: m.start, end: m.end,
          passageText: m.passageText, matchedText: m.matchedText,
        })),
      })),
    } : null,
    disclaimer: 'Estimations statistiques. Aucune valeur probante. Ne pas utiliser seul pour une decision concernant une personne.',
  };
  download(`analyse-${stamp()}.json`, JSON.stringify(serialisable, null, 2), 'application/json');
}

function stamp() {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
