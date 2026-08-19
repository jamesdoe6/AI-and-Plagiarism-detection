/**
 * Rendering results into the DOM.
 *
 * Detectors and engines return translation KEYS, never display strings. This
 * module is the only place that resolves them, which is what lets the language
 * switch re-render an existing result without re-running the analysis.
 *
 * Anything coming from the web or from the user goes through escapeHtml.
 */

import { $, el, clear, escapeHtml } from '../util/dom.js';
import { AI_THRESHOLDS } from '../config.js';
import { groupFeatures, FEATURE_GROUPS } from '../features/index.js';
import { t, formatNumber } from '../i18n/index.js';

const CIRCUMFERENCE = 2 * Math.PI * 52;

const BAND_BADGE = {
  human: 'badge-ok', low: 'badge-ok',
  uncertain: 'badge-warn', moderate: 'badge-warn',
  mixed: 'badge-alert', 'likely-ai': 'badge-alert', high: 'badge-alert',
  'strong-ai': 'badge-danger', critical: 'badge-danger',
};

/**
 * Resolve a value that may be a plain string or a `{key, params}` descriptor.
 * Nested descriptors are resolved first, so a reason can embed a detector label
 * that is itself translated.
 */
export function resolve(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value !== 'object' || !value.key) return String(value);
  const params = value.params
    ? Object.fromEntries(Object.entries(value.params).map(([k, v]) => [k, resolve(v)]))
    : undefined;
  return t(value.key, params);
}

function setGauge(circle, percent, band) {
  circle.setAttribute('stroke-dashoffset', String(CIRCUMFERENCE * (1 - percent / 100)));
  circle.setAttribute('class', `gauge-value s-${band}`);
}

/* ------------------------------------------------------------------ AI -- */

export function renderAi(result, { expert }) {
  const section = $('#ai-section');
  section.hidden = false;
  section.classList.add('fade-in');

  const scoreEl = $('#ai-score');
  const gauge = $('#ai-gauge');

  if (result.score === null) {
    scoreEl.textContent = t('units.notAvailable');
    scoreEl.className = 'gauge-number';
    setGauge(gauge, 0, 'uncertain');
    $('#ai-marker').style.left = '0%';
  } else {
    scoreEl.textContent = result.score.toFixed(0);
    scoreEl.className = `gauge-number c-${result.band}`;
    setGauge(gauge, result.score, result.band);
    $('#ai-marker').style.left = `${result.score}%`;
  }

  renderScale(result.thresholds ?? AI_THRESHOLDS);

  $('#ai-verdict').textContent = t(result.verdictKey)
    + (result.lowConfidence ? t('verdict.lowConfidenceSuffix') : '');

  const confBadge = $('#ai-confidence-badge');
  confBadge.textContent = t('ai.confidenceBadge', { level: t(result.confidenceKey) });
  confBadge.className = `badge ${confidenceBadgeClass(result.confidence)}`;

  const featBadge = $('#ai-features-badge');
  featBadge.textContent = t('ai.featuresBadge', {
    count: result.featureCount,
    lang: result.language.lang.toUpperCase(),
  });
  featBadge.className = 'badge badge-neutral';

  const reasons = clear($('#ai-reasons'));
  for (const reason of result.reasons) reasons.append(el('li', { text: resolve(reason) }));

  renderDetectors(result);
  renderAiExpert(result, expert);
}

/**
 * The scale follows the user's chosen alert threshold: showing a fixed scale
 * while the verdict rests on a moved threshold would be misleading.
 */
function renderScale(thresholds) {
  const host = clear($('#ai-scale'));
  const stops = [
    ['f-human', thresholds.human],
    ['f-uncertain', thresholds.uncertain - thresholds.human],
    ['f-mixed', thresholds.likely - thresholds.uncertain],
    ['f-likely-ai', thresholds.strong - thresholds.likely],
    ['f-strong-ai', 100 - thresholds.strong],
  ];
  for (const [cls, width] of stops) {
    host.append(el('i', { class: cls, style: `flex:${Math.max(1, width)}` }));
  }
}

function confidenceBadgeClass(confidence) {
  if (confidence >= 0.72) return 'badge-ok';
  if (confidence >= 0.48) return 'badge-warn';
  return 'badge-danger';
}

/** A detector's display name, including any runtime suffix (e.g. model name). */
function detectorLabel(detector) {
  const base = t(detector.labelKey);
  return detector.labelSuffix ? `${base} (${detector.labelSuffix})` : base;
}

function renderDetectors(result) {
  const host = clear($('#ai-detectors'));

  const table = el('table', { class: 'data' });
  table.append(el('thead', {}, el('tr', {}, [
    el('th', { text: t('ai.tableDetector') }),
    el('th', { class: 'num', text: t('ai.tableScore') }),
    el('th', { text: '' }),
    el('th', { class: 'num', text: t('ai.tableReliability') }),
    el('th', { text: t('ai.tableEvidence') }),
  ])));

  const body = el('tbody');
  for (const detector of result.detectors) {
    const available = !detector.unavailable;
    const percent = detector.score * 100;
    const tone = percent >= 62 ? 'f-ai' : percent <= 38 ? 'f-human' : 'f-neutral';

    const evidenceCell = el('td');
    if (available && detector.evidence?.length) {
      const top = detector.evidence[0];
      evidenceCell.append(el('div', {
        class: 'small',
        html: `${escapeHtml(t(top.labelKey))} : <strong>${escapeHtml(resolve(top.value))}</strong>`,
      }));
      if (detector.evidence.length > 1) {
        evidenceCell.append(evidenceDetails(detector));
      }
    } else {
      const message = detector.errorKey
        ? t(detector.errorKey, detector.errorParams)
        : (detector.errorText ?? t('ai.unavailable'));
      evidenceCell.append(el('span', { class: 'tiny dim', text: message }));
    }

    body.append(el('tr', {}, [
      el('td', {}, [
        el('div', { text: detectorLabel(detector) }),
        detector.remote ? el('span', { class: 'badge badge-neutral tiny', text: t('report.remote') }) : null,
        el('div', { class: 'tiny dim', style: 'margin-top:3px', text: t(detector.descriptionKey) }),
      ]),
      el('td', { class: `num ${available ? '' : 'dim'}`, text: available ? `${percent.toFixed(0)} %` : '—' }),
      el('td', { style: 'width:90px' }, available
        ? el('div', { class: 'bar' }, el('i', { class: tone, style: `width:${percent}%` }))
        : el('span', { class: 'dim', text: '—' })),
      el('td', { class: 'num dim', text: available ? `${(detector.confidence * 100).toFixed(0)} %` : '—' }),
      evidenceCell,
    ]));
  }

  table.append(body);
  host.append(el('div', { class: 'table-wrap' }, table));

  host.append(el('p', { class: 'tiny dim', style: 'margin-top:12px', text: t('ai.ensembleNote', {
    active: result.detectorCount,
    agreement: (result.agreement * 100).toFixed(0),
    ai: result.votes.ai,
    human: result.votes.human,
    neutral: result.votes.neutral,
  }) }));
}

/** Collapsible list of every indicator behind one detector. */
function evidenceDetails(detector) {
  const details = el('details', { class: 'panel', style: 'margin-top:8px;background:transparent;border:0' });
  details.append(el('summary', {
    class: 'tiny dim',
    style: 'padding:2px 0',
    text: t('ai.evidenceCount', { count: detector.evidence.length }),
  }));

  const list = el('div', { class: 'panel-body', style: 'padding:6px 0 0' });
  for (const item of detector.evidence) {
    const hint = item.hintText ?? (item.hintKey ? t(item.hintKey, item.hintParams) : '');
    const toneClass = item.direction === 'ai' ? 'c-likely-ai'
      : item.direction === 'human' ? 'c-human' : 'c-uncertain';
    list.append(el('div', { class: 'metric' }, [
      el('span', { class: 'metric-key', style: 'font-family:var(--font)', text: t(item.labelKey) }),
      el('span', { class: `metric-val ${toneClass}`, text: resolve(item.value) }),
    ]));
    if (hint) list.append(el('div', { class: 'tiny dim', style: 'margin:-2px 0 8px', text: hint }));
  }

  details.append(list);
  return details;
}

function renderAiExpert(result, expert) {
  const host = $('#ai-expert');
  host.hidden = !expert;
  if (!expert) return;
  clear(host);

  if (result.markerHits.length) {
    const details = el('details', { class: 'panel' });
    details.append(el('summary', { text: t('ai.markersFound', { count: result.markerHits.length }) }));
    details.append(el('div', { class: 'panel-body' },
      el('div', { class: 'row', style: 'gap:6px' },
        result.markerHits.map((hit) => el('span', { class: 'chip', text: `${hit.text} ×${hit.count}` })))));
    host.append(details);
  }

  const groups = groupFeatures(result.features);
  for (const group of FEATURE_GROUPS) {
    const entries = groups.get(group.id);
    if (!entries?.length) continue;

    const details = el('details', { class: 'panel' });
    details.append(el('summary', {
      text: t('ai.groupSuffix', { label: t(group.labelKey), count: entries.length }),
    }));

    const body = el('div', { class: 'panel-body' });
    const sorted = [...entries].sort((a, b) => a[0].localeCompare(b[0]));
    // Very wide families (function words, markers) are filtered to non-zero
    // values: showing 350 zeros helps nobody.
    const shown = entries.length > 120 ? sorted.filter(([, v]) => v !== 0) : sorted;

    if (shown.length < entries.length) {
      body.append(el('p', { class: 'tiny dim', text: t('ai.metricsHidden', { count: entries.length - shown.length }) }));
    }

    const grid = el('div', { class: 'metrics' });
    for (const [key, value] of shown) {
      grid.append(el('div', { class: 'metric' }, [
        el('span', { class: 'metric-key', title: key, text: key }),
        el('span', { class: 'metric-val', text: formatMetric(value) }),
      ]));
    }
    body.append(grid);
    details.append(body);
    host.append(details);
  }
}

function formatMetric(value) {
  if (!Number.isFinite(value)) return '—';
  if (Number.isInteger(value)) return String(value);
  if (Math.abs(value) >= 1000) return value.toFixed(0);
  if (Math.abs(value) >= 1) return value.toFixed(3);
  return value.toFixed(4);
}

/* ----------------------------------------------------------- Plagiarism -- */

export function renderPlagiarism(result) {
  const section = $('#plag-section');
  section.hidden = false;
  section.classList.add('fade-in');

  $('#plag-score').textContent = result.score.toFixed(0);
  $('#plag-score').className = `gauge-number c-${result.band}`;
  setGauge($('#plag-gauge'), result.score, result.band);
  $('#plag-verdict').textContent = t(result.verdictKey, result.verdictParams);

  const badge = $('#plag-queries-badge');
  badge.textContent = result.webEnabled
    ? t('plagiarism.badgeOnline', { queries: result.queriesRun, passages: result.passageCount })
    : t('plagiarism.badgeOffline', { passages: result.passageCount });
  badge.className = `badge ${BAND_BADGE[result.band] ?? 'badge-neutral'}`;

  $('#plag-note').textContent = [
    t('plagiarism.note', { passages: result.passageCount }),
    result.commonPhrasesFiltered
      ? t('plagiarism.noteFiltered', { count: result.commonPhrasesFiltered })
      : '',
    t('plagiarism.noteMethod'),
  ].filter(Boolean).join(' ');

  renderSources(result);
  renderPlagErrors(result);
}

/** A source's title: either a plain string, or a key for local sources. */
export function sourceTitle(source) {
  return source.titleKey ? t(source.titleKey, source.titleParams) : (source.title ?? '');
}

function renderSources(result) {
  const host = clear($('#plag-sources'));

  if (!result.sources.length) {
    host.append(el('div', { class: 'empty', text: result.webEnabled
      ? t('plagiarism.emptyOnline')
      : t('plagiarism.emptyOffline') }));
    return;
  }

  const table = el('table', { class: 'data' });
  table.append(el('thead', {}, el('tr', {}, [
    el('th', { text: t('plagiarism.tableSource') }),
    el('th', { class: 'num', text: t('plagiarism.tableSimilarity') }),
    el('th', { class: 'num', text: t('plagiarism.tableCoverage') }),
    el('th', { class: 'num', text: t('plagiarism.tablePassages') }),
  ])));

  const body = el('tbody');
  for (const source of result.sources) {
    const best = source.matches[0];
    const title = sourceTitle(source);
    const cell = el('td');

    cell.append(source.url
      ? el('a', { class: 'src-title', href: source.url, target: '_blank', rel: 'noopener noreferrer nofollow', text: title })
      : el('div', { class: 'src-title', text: title }));

    cell.append(el('div', { class: 'src-url' }, [
      source.domainKey ? t(source.domainKey) : source.domain,
      ' · ',
      source.verified ? t('plagiarism.verified') : t('plagiarism.unverified'),
    ]));

    if (best?.matchedText) {
      cell.append(el('div', { class: 'excerpt', text: best.matchedText.slice(0, 600) }));
    }
    if (best?.passageText) {
      const details = el('details', { class: 'panel', style: 'margin-top:8px;background:transparent' });
      details.append(el('summary', { class: 'tiny dim', text: t('plagiarism.yourPassage') }));
      details.append(el('div', { class: 'panel-body' }, el('div', { class: 'excerpt', text: best.passageText })));
      cell.append(details);
    }

    const similarity = source.bestSimilarity * 100;
    body.append(el('tr', {}, [
      cell,
      el('td', { class: `num c-${similarity >= 85 ? 'critical' : similarity >= 65 ? 'high' : 'moderate'}`, text: `${similarity.toFixed(0)} %` }),
      el('td', { class: 'num dim', text: `${(source.coverage * 100).toFixed(1)} %` }),
      el('td', { class: 'num dim', text: String(source.matches.length) }),
    ]));
  }

  table.append(body);
  host.append(el('div', { class: 'table-wrap' }, table));
}

function renderPlagErrors(result) {
  const host = clear($('#plag-errors'));
  if (!result.errors.length) return;
  host.append(el('div', { class: 'notice' }, [
    el('span', { class: 'notice-icon', text: '⚠️' }),
    el('div', {}, [
      el('strong', { text: `${t('plagiarism.errorsTitle')} ` }),
      t('plagiarism.errorsBody'),
      el('ul', { class: 'small', style: 'margin:8px 0 0;padding-left:18px' },
        result.errors.slice(0, 6).map((e) => el('li', { text: e }))),
    ]),
  ]));
}

/* ------------------------------------------------------------- Static --- */

export function renderDisclaimers() {
  const host = clear($('#disclaimer-list'));
  const list = el('ul', { class: 'reasons' });
  for (const text of t('disclaimers.list')) list.append(el('li', { text }));
  host.append(list);
  $('#method-ai').textContent = t('disclaimers.methodAi');
  $('#method-plag').textContent = t('disclaimers.methodPlag');
}
