/**
 * Generation du rapport telechargeable.
 *
 * Le rapport est un fichier HTML autonome (aucune ressource externe) : il
 * s'ouvre hors ligne, s'archive et s'imprime en PDF via le navigateur. Il
 * reprend integralement les avertissements de l'interface — un rapport qui
 * circule sans ses reserves methodologiques devient une piece a charge, ce
 * qu'il n'est pas.
 */

import { APP } from '../config.js';
import { escapeHtml } from '../util/dom.js';
import { DISCLAIMERS } from '../ui/disclaimers.js';

export function buildReportHtml({ ai, plagiarism, meta }) {
  const date = new Date().toLocaleString('fr-FR');

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Rapport d'analyse — ${escapeHtml(meta.title || 'Document')}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
         margin: 0; padding: 40px 32px; color: #17181c; background: #fff; line-height: 1.6; }
  main { max-width: 880px; margin: 0 auto; }
  h1 { font-size: 26px; margin: 0 0 4px; letter-spacing: -0.02em; }
  h2 { font-size: 18px; margin: 36px 0 12px; padding-bottom: 8px; border-bottom: 1px solid #e4e5ea; }
  h3 { font-size: 14px; margin: 20px 0 8px; text-transform: uppercase; letter-spacing: .07em; color: #6a6d78; }
  .meta { color: #6a6d78; font-size: 13px; margin-bottom: 28px; }
  .scores { display: flex; gap: 16px; flex-wrap: wrap; margin: 20px 0 8px; }
  .score { flex: 1 1 220px; border: 1px solid #e4e5ea; border-radius: 14px; padding: 18px 20px; }
  .score .value { font-size: 40px; font-weight: 650; letter-spacing: -0.03em; line-height: 1.1; }
  .score .label { font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: #6a6d78; }
  .score .note { font-size: 13px; color: #45474f; margin-top: 8px; }
  .b-human { color: #16794a; } .b-uncertain { color: #8a6d1f; } .b-mixed { color: #a35a12; }
  .b-likely-ai, .b-high { color: #b3401c; } .b-strong-ai, .b-critical { color: #96122b; }
  .b-low { color: #16794a; } .b-moderate { color: #8a6d1f; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; margin: 12px 0; }
  th, td { text-align: left; padding: 9px 10px; border-bottom: 1px solid #ebecf0; vertical-align: top; }
  th { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #6a6d78; }
  td.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  ul { margin: 8px 0; padding-left: 20px; }
  li { margin: 4px 0; }
  blockquote { margin: 6px 0; padding: 8px 12px; border-left: 3px solid #d8d9e0;
               background: #f7f7f9; font-size: 12.5px; color: #45474f; border-radius: 0 6px 6px 0; }
  .warn { border: 1px solid #e8c89a; background: #fdf7ec; border-radius: 12px; padding: 16px 20px; margin: 24px 0; }
  .warn h3 { color: #8a5a12; margin-top: 0; }
  .warn p, .warn li { font-size: 13px; }
  a { color: #1d4ed8; word-break: break-word; }
  footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e4e5ea; font-size: 12px; color: #6a6d78; }
  @media print { body { padding: 0; } .warn { break-inside: avoid; } table { break-inside: auto; } tr { break-inside: avoid; } }
</style>
</head>
<body>
<main>
  <h1>Rapport d'analyse — IA et plagiat</h1>
  <p class="meta">
    ${escapeHtml(meta.title || 'Texte colle')} · ${meta.wordCount.toLocaleString('fr-FR')} mots ·
    langue detectee : ${escapeHtml(meta.language)} · genere le ${escapeHtml(date)} par ${APP.name} v${APP.version}
  </p>

  ${renderScores(ai, plagiarism)}
  ${renderAiSection(ai)}
  ${renderPlagiarismSection(plagiarism)}
  ${renderDisclaimer()}

  <footer>
    Rapport genere localement dans le navigateur. Les scores sont des estimations statistiques.
    Aucune decision concernant une personne ne doit reposer sur ce document seul.
  </footer>
</main>
</body>
</html>`;
}

function renderScores(ai, plagiarism) {
  const aiValue = ai.score === null ? 'n/a' : `${ai.score.toFixed(0)} %`;
  return `<div class="scores">
    <div class="score">
      <div class="label">Probabilite IA estimee</div>
      <div class="value b-${escapeHtml(ai.band ?? 'uncertain')}">${aiValue}</div>
      <div class="note">Confiance : ${escapeHtml(ai.confidenceLabel)} · ${escapeHtml(ai.verdict)}</div>
    </div>
    <div class="score">
      <div class="label">Recouvrement avec des sources</div>
      <div class="value b-${escapeHtml(plagiarism.band)}">${plagiarism.score.toFixed(0)} %</div>
      <div class="note">${escapeHtml(plagiarism.verdict)}</div>
    </div>
  </div>`;
}

function renderAiSection(ai) {
  if (ai.score === null) {
    return `<h2>Analyse IA</h2><p>${escapeHtml(ai.verdict)}</p>`;
  }

  const detectors = ai.detectors.map((d) => `<tr>
      <td>${escapeHtml(d.label)}${d.remote ? ' <em>(distant)</em>' : ''}</td>
      <td class="num">${d.unavailable ? '—' : `${(d.score * 100).toFixed(0)} %`}</td>
      <td class="num">${d.unavailable ? '—' : `${(d.confidence * 100).toFixed(0)} %`}</td>
      <td>${escapeHtml(d.unavailable ? (d.error ?? 'indisponible') : (d.evidence?.[0]?.label ?? ''))}${
        d.unavailable ? '' : ` : <strong>${escapeHtml(d.evidence?.[0]?.value ?? '')}</strong>`}</td>
    </tr>`).join('');

  return `<h2>Analyse IA</h2>
  <p>${escapeHtml(ai.verdict)}</p>
  <h3>Pourquoi ce score</h3>
  <ul>${ai.reasons.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}</ul>
  <h3>Detail des detecteurs (${ai.detectorCount} actifs sur ${ai.detectors.length})</h3>
  <table>
    <thead><tr><th>Detecteur</th><th class="num">Score</th><th class="num">Fiabilite</th><th>Indice principal</th></tr></thead>
    <tbody>${detectors}</tbody>
  </table>
  <p class="meta">${ai.featureCount} metriques calculees · accord entre detecteurs : ${(ai.agreement * 100).toFixed(0)} % ·
  votes IA/humain/neutre : ${ai.votes.ai}/${ai.votes.human}/${ai.votes.neutral}</p>`;
}

function renderPlagiarismSection(plagiarism) {
  if (!plagiarism.sources.length) {
    return `<h2>Analyse de plagiat</h2><p>${escapeHtml(plagiarism.verdict)}</p>
    <p class="meta">${plagiarism.passageCount} passages analyses · ${plagiarism.queriesRun} requetes executees.</p>`;
  }

  const rows = plagiarism.sources.map((source) => `<tr>
      <td>
        ${source.url
          ? `<a href="${escapeHtml(source.url)}">${escapeHtml(source.title)}</a><br><span class="meta">${escapeHtml(source.domain)}</span>`
          : escapeHtml(source.title)}
        ${source.verified ? '' : '<br><span class="meta">comparaison sur extrait de recherche uniquement</span>'}
        <blockquote>${escapeHtml((source.matches[0]?.matchedText ?? '').slice(0, 420))}</blockquote>
      </td>
      <td class="num">${(source.bestSimilarity * 100).toFixed(0)} %</td>
      <td class="num">${(source.coverage * 100).toFixed(1)} %</td>
      <td class="num">${source.matches.length}</td>
    </tr>`).join('');

  return `<h2>Analyse de plagiat</h2>
  <p>${escapeHtml(plagiarism.verdict)}</p>
  <table>
    <thead><tr><th>Source</th><th class="num">Similarite max</th><th class="num">Couverture</th><th class="num">Passages</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p class="meta">${plagiarism.passageCount} passages analyses · ${plagiarism.queriesRun} requetes executees${
    plagiarism.commonPhrasesFiltered ? ` · ${plagiarism.commonPhrasesFiltered} correspondance(s) ecartee(s) comme expressions courantes` : ''}.</p>
  ${plagiarism.errors.length ? `<h3>Incidents pendant la recherche</h3><ul>${
    plagiarism.errors.map((e) => `<li>${escapeHtml(e)}</li>`).join('')}</ul>` : ''}`;
}

function renderDisclaimer() {
  return `<div class="warn">
    <h3>A lire avant toute utilisation de ce rapport</h3>
    <ul>${DISCLAIMERS.map((d) => `<li>${escapeHtml(d)}</li>`).join('')}</ul>
  </div>`;
}
