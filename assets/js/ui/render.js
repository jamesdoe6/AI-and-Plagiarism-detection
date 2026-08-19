/**
 * Rendu des resultats dans le DOM.
 * Tout contenu provenant du web ou de l'utilisateur passe par escapeHtml.
 */

import { $, el, clear, escapeHtml, fmtPercent } from '../util/dom.js';
import { AI_THRESHOLDS } from '../config.js';
import { groupFeatures, FEATURE_GROUPS } from '../features/index.js';
import { DISCLAIMERS, AI_METHOD_NOTE, PLAGIARISM_METHOD_NOTE } from './disclaimers.js';

const CIRCUMFERENCE = 2 * Math.PI * 52;

const BAND_LABEL = {
  human: 'signature humaine',
  uncertain: 'indetermine',
  mixed: 'signaux mixtes',
  'likely-ai': 'IA probable',
  'strong-ai': 'IA tres probable',
  low: 'faible',
  moderate: 'modere',
  high: 'important',
  critical: 'critique',
};

const BAND_BADGE = {
  human: 'badge-ok', low: 'badge-ok',
  uncertain: 'badge-warn', moderate: 'badge-warn',
  mixed: 'badge-alert', 'likely-ai': 'badge-alert', high: 'badge-alert',
  'strong-ai': 'badge-danger', critical: 'badge-danger',
};

function setGauge(circle, percent, band) {
  circle.setAttribute('stroke-dashoffset', String(CIRCUMFERENCE * (1 - percent / 100)));
  circle.setAttribute('class', `gauge-value s-${band}`);
}

/* ------------------------------------------------------------------ IA -- */

export function renderAi(result, { expert }) {
  const section = $('#ai-section');
  section.hidden = false;
  section.classList.add('fade-in');

  const scoreEl = $('#ai-score');
  const gauge = $('#ai-gauge');

  if (result.score === null) {
    scoreEl.textContent = 'n/a';
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
  $('#ai-verdict').textContent = result.verdict;

  const confBadge = $('#ai-confidence-badge');
  confBadge.textContent = `confiance ${result.confidenceLabel}`;
  confBadge.className = `badge ${confidenceBadgeClass(result.confidence)}`;

  const featBadge = $('#ai-features-badge');
  featBadge.textContent = `${result.featureCount} metriques · ${result.language.lang.toUpperCase()}`;
  featBadge.className = 'badge badge-neutral';

  const reasons = clear($('#ai-reasons'));
  for (const reason of result.reasons) reasons.append(el('li', { text: reason }));

  renderDetectors(result);
  renderAiExpert(result, expert);
}

/**
 * L'echelle suit le seuil d'alerte choisi par l'utilisateur : afficher une
 * echelle fixe alors que le verdict repose sur un seuil deplace serait
 * trompeur.
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

function renderDetectors(result) {
  const host = clear($('#ai-detectors'));

  const table = el('table', { class: 'data' });
  table.append(el('thead', {}, el('tr', {}, [
    el('th', { text: 'Detecteur' }),
    el('th', { class: 'num', text: 'Score' }),
    el('th', { text: '' }),
    el('th', { class: 'num', text: 'Fiabilite' }),
    el('th', { text: 'Indice principal' }),
  ])));

  const body = el('tbody');
  for (const detector of result.detectors) {
    const available = !detector.unavailable;
    const percent = detector.score * 100;
    const tone = percent >= 62 ? 'f-ai' : percent <= 38 ? 'f-human' : 'f-neutral';

    const evidenceCell = el('td');
    if (available && detector.evidence?.length) {
      const top = detector.evidence[0];
      evidenceCell.append(
        el('div', { class: 'small', html: `${escapeHtml(top.label)} : <strong>${escapeHtml(String(top.value))}</strong>` }),
      );
      if (detector.evidence.length > 1) {
        const details = el('details', { class: 'panel', style: 'margin-top:8px;background:transparent;border:0' });
        details.append(el('summary', { class: 'tiny dim', style: 'padding:2px 0', text: `${detector.evidence.length} indices` }));
        const list = el('div', { class: 'panel-body', style: 'padding:6px 0 0' });
        for (const item of detector.evidence) {
          list.append(el('div', { class: 'metric' }, [
            el('span', { class: 'metric-key', style: 'font-family:var(--font)', title: item.hint || '', text: item.label }),
            el('span', { class: `metric-val c-${item.direction === 'ai' ? 'likely-ai' : item.direction === 'human' ? 'human' : 'uncertain'}`, text: String(item.value) }),
          ]));
          if (item.hint) list.append(el('div', { class: 'tiny dim', style: 'margin:-2px 0 8px', text: item.hint }));
        }
        details.append(list);
        evidenceCell.append(details);
      }
    } else {
      evidenceCell.append(el('span', { class: 'tiny dim', text: detector.error ?? 'indisponible' }));
    }

    body.append(el('tr', {}, [
      el('td', {}, [
        el('div', { text: detector.label }),
        detector.remote ? el('span', { class: 'badge badge-neutral tiny', text: 'distant' }) : null,
        el('div', { class: 'tiny dim', style: 'margin-top:3px', text: detector.description ?? '' }),
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

  host.append(el('p', { class: 'tiny dim', style: 'margin-top:10px' }, [
    `Ensemble : moyenne ponderee par la fiabilite de ${result.detectorCount} detecteur(s) actif(s). `,
    `Accord entre detecteurs : ${(result.agreement * 100).toFixed(0)} %. `,
    `Votes IA / humain / neutre : ${result.votes.ai} / ${result.votes.human} / ${result.votes.neutral}. `,
    `Un desaccord fort ramene mecaniquement le score vers 50 %.`,
  ]));
}

function renderAiExpert(result, expert) {
  const host = $('#ai-expert');
  host.hidden = !expert;
  if (!expert) return;
  clear(host);

  // Marqueurs releves
  if (result.markerHits.length) {
    const details = el('details', { class: 'panel' });
    details.append(el('summary', { text: `Marqueurs lexicaux releves (${result.markerHits.length})` }));
    const body = el('div', { class: 'panel-body' });
    body.append(el('div', { class: 'row', style: 'gap:6px' },
      result.markerHits.map((hit) => el('span', { class: 'badge badge-neutral', text: `${hit.text} ×${hit.count}` }))));
    details.append(body);
    host.append(details);
  }

  // Toutes les metriques, par famille
  const groups = groupFeatures(result.features);
  for (const group of FEATURE_GROUPS) {
    const entries = groups.get(group.id);
    if (!entries?.length) continue;
    const details = el('details', { class: 'panel' });
    details.append(el('summary', { text: `${group.label} — ${entries.length} metriques` }));
    const body = el('div', { class: 'panel-body' });
    const grid = el('div', { class: 'metrics' });
    const sorted = [...entries].sort((a, b) => a[0].localeCompare(b[0]));
    // Les familles tres larges (mots-outils, marqueurs) sont filtrees sur les
    // valeurs non nulles : afficher 350 zeros n'aide personne.
    const shown = entries.length > 120 ? sorted.filter(([, v]) => v !== 0) : sorted;
    for (const [key, value] of shown) {
      grid.append(el('div', { class: 'metric' }, [
        el('span', { class: 'metric-key', title: key, text: key }),
        el('span', { class: 'metric-val', text: formatMetric(value) }),
      ]));
    }
    if (shown.length < entries.length) {
      body.append(el('p', { class: 'tiny dim', text: `${entries.length - shown.length} metriques a zero masquees.` }));
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

/* ------------------------------------------------------------- Plagiat -- */

export function renderPlagiarism(result) {
  const section = $('#plag-section');
  section.hidden = false;
  section.classList.add('fade-in');

  $('#plag-score').textContent = result.score.toFixed(0);
  $('#plag-score').className = `gauge-number c-${result.band}`;
  setGauge($('#plag-gauge'), result.score, result.band);
  $('#plag-verdict').textContent = result.verdict;

  const badge = $('#plag-queries-badge');
  badge.textContent = result.webEnabled
    ? `${result.queriesRun} requetes · ${result.passageCount} passages`
    : `hors ligne · ${result.passageCount} passages`;
  badge.className = `badge ${BAND_BADGE[result.band] ?? 'badge-neutral'}`;

  $('#plag-note').textContent = [
    `${result.passageCount} passages analyses.`,
    result.commonPhrasesFiltered
      ? `${result.commonPhrasesFiltered} correspondance(s) ecartee(s) : retrouvees sur trop de domaines differents pour etre des emprunts.`
      : '',
    'Le pourcentage est la part du texte couverte par au moins une correspondance, ponderee par sa similarite. Une citation correctement attribuee compte comme un recouvrement : seule une lecture humaine peut faire la difference.',
  ].filter(Boolean).join(' ');

  renderSources(result);
  renderPlagErrors(result);
}

function renderSources(result) {
  const host = clear($('#plag-sources'));

  if (!result.sources.length) {
    host.append(el('div', { class: 'empty' },
      result.webEnabled
        ? 'Aucune source depassant le seuil de signalement (45 % de similarite).'
        : 'Aucun moteur de recherche configure et aucune source locale fournie. Ouvrez les reglages pour activer la recherche web.'));
    return;
  }

  const table = el('table', { class: 'data' });
  table.append(el('thead', {}, el('tr', {}, [
    el('th', { text: 'Source' }),
    el('th', { class: 'num', text: 'Similarite' }),
    el('th', { class: 'num', text: 'Couverture' }),
    el('th', { class: 'num', text: 'Passages' }),
  ])));

  const body = el('tbody');
  for (const source of result.sources) {
    const best = source.matches[0];
    const titleCell = el('td');

    titleCell.append(source.url
      ? el('a', { class: 'src-title', href: source.url, target: '_blank', rel: 'noopener noreferrer nofollow', text: source.title })
      : el('div', { class: 'src-title', text: source.title }));

    titleCell.append(el('div', { class: 'src-url' }, [
      source.domain,
      source.verified ? ' · page telechargee et comparee' : ' · comparaison sur extrait de recherche seulement',
    ]));

    if (best?.matchedText) {
      titleCell.append(el('div', { class: 'excerpt', text: best.matchedText.slice(0, 600) }));
    }
    if (best?.passageText) {
      const details = el('details', { class: 'panel', style: 'margin-top:8px;background:transparent' });
      details.append(el('summary', { class: 'tiny dim', text: 'Passage correspondant dans votre texte' }));
      details.append(el('div', { class: 'panel-body' }, el('div', { class: 'excerpt', text: best.passageText })));
      titleCell.append(details);
    }

    const similarity = source.bestSimilarity * 100;
    body.append(el('tr', {}, [
      titleCell,
      el('td', { class: `num c-${similarity >= 85 ? 'critical' : similarity >= 65 ? 'high' : 'moderate'}`, text: `${similarity.toFixed(0)} %` }),
      el('td', { class: 'num dim', text: fmtPercent(source.coverage * 100) }),
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
      el('strong', { text: 'La recherche n\'a pas pu aboutir completement. ' }),
      'Le score de plagiat est donc partiel — traitez-le comme un minorant.',
      el('ul', { class: 'small', style: 'margin:8px 0 0;padding-left:18px' },
        result.errors.slice(0, 6).map((e) => el('li', { text: e }))),
    ]),
  ]));
}

/* --------------------------------------------------------- Statiques --- */

export function renderDisclaimers() {
  const host = clear($('#disclaimer-list'));
  const list = el('ul', { class: 'reasons' });
  for (const text of DISCLAIMERS) list.append(el('li', { text }));
  host.append(list);
  $('#method-ai').textContent = AI_METHOD_NOTE;
  $('#method-plag').textContent = PLAGIARISM_METHOD_NOTE;
}

export function bandLabel(band) {
  return BAND_LABEL[band] ?? band;
}
