/**
 * Downloadable report generation.
 *
 * The report is a self-contained HTML file (no external resources): it opens
 * offline, can be archived, and prints to PDF via the browser. It reproduces
 * every warning shown in the interface — a report circulating without its
 * methodological caveats becomes an item of evidence, which it is not.
 *
 * It is generated in whichever language the interface is currently using.
 */

import { APP } from '../config.js';
import { escapeHtml } from '../util/dom.js';
import { t, formatNumber, formatDateTime, getLang } from '../i18n/index.js';
import { resolve, sourceTitle } from '../ui/render.js';

export function buildReportHtml({ ai, plagiarism, meta }) {
  return `<!doctype html>
<html lang="${getLang()}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(t('report.fileTitle', { name: meta.title }))}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
         margin: 0; padding: 40px 32px; color: #0a2540; background: #fff; line-height: 1.6;
         letter-spacing: -0.011em; }
  main { max-width: 880px; margin: 0 auto; }
  h1 { font-size: 26px; margin: 0 0 4px; letter-spacing: -0.03em; }
  h2 { font-size: 18px; margin: 36px 0 12px; padding-bottom: 8px; border-bottom: 1px solid #dbe6f2; }
  h3 { font-size: 13px; margin: 20px 0 8px; text-transform: uppercase; letter-spacing: .07em; color: #3d5a7d; }
  .meta { color: #3d5a7d; font-size: 13px; margin-bottom: 28px; }
  .scores { display: flex; gap: 16px; flex-wrap: wrap; margin: 20px 0 8px; }
  .score { flex: 1 1 220px; border: 1px solid #dbe6f2; border-radius: 18px; padding: 18px 20px;
           background: linear-gradient(158deg, #fbfdff, #f2f7fd); }
  .score .value { font-size: 42px; font-weight: 680; letter-spacing: -0.04em; line-height: 1.1; }
  .score .label { font-size: 11px; text-transform: uppercase; letter-spacing: .09em; color: #3d5a7d; }
  .score .note { font-size: 13px; color: #1e3a5f; margin-top: 8px; }
  .b-human, .b-low { color: #065f46; }
  .b-uncertain, .b-moderate { color: #92400e; }
  .b-mixed, .b-likely-ai, .b-high { color: #9a3412; }
  .b-strong-ai, .b-critical { color: #be185d; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; margin: 12px 0; }
  th, td { text-align: left; padding: 9px 10px; border-bottom: 1px solid #e8eef6; vertical-align: top; }
  th { font-size: 10.5px; text-transform: uppercase; letter-spacing: .07em; color: #3d5a7d; }
  td.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  ul { margin: 8px 0; padding-left: 20px; }
  li { margin: 4px 0; }
  blockquote { margin: 6px 0; padding: 8px 12px; border-left: 3px solid #22d3ee;
               background: #f6fafe; font-size: 12.5px; color: #1e3a5f; border-radius: 0 8px 8px 0; }
  .warn { border: 1px solid #f0d29a; background: #fefaf1; border-radius: 16px; padding: 16px 20px; margin: 24px 0; }
  .warn h3 { color: #92400e; margin-top: 0; }
  .warn p, .warn li { font-size: 13px; }
  a { color: #0b5fbf; word-break: break-word; }
  footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #dbe6f2; font-size: 12px; color: #3d5a7d; }
  @media print { body { padding: 0; } .warn { break-inside: avoid; } tr { break-inside: avoid; } }
</style>
</head>
<body>
<main>
  <h1>${escapeHtml(t('report.title'))}</h1>
  <p class="meta">${escapeHtml(t('report.metaLine', {
    name: meta.title,
    words: formatNumber(meta.wordCount),
    lang: meta.language,
    date: formatDateTime(),
    app: APP.name,
    version: APP.version,
  }))}</p>

  ${renderScores(ai, plagiarism)}
  ${renderAiSection(ai)}
  ${renderPlagiarismSection(plagiarism)}
  ${renderDisclaimer()}

  <footer>${escapeHtml(t('report.footer'))}</footer>
</main>
</body>
</html>`;
}

function renderScores(ai, plagiarism) {
  const aiValue = ai.score === null ? t('units.notAvailable') : `${ai.score.toFixed(0)} %`;
  const aiVerdict = ai.verdictKey ? t(ai.verdictKey) : t('report.notRequestedAi');
  const plagVerdict = plagiarism.verdictKey
    ? t(plagiarism.verdictKey, plagiarism.verdictParams)
    : t('report.notRequestedPlag');

  return `<div class="scores">
    <div class="score">
      <div class="label">${escapeHtml(t('report.aiScoreLabel'))}</div>
      <div class="value b-${escapeHtml(ai.band ?? 'uncertain')}">${escapeHtml(aiValue)}</div>
      <div class="note">${escapeHtml(t('report.confidence', {
        level: ai.confidenceKey ? t(ai.confidenceKey) : t('units.notAvailable'),
      }))} · ${escapeHtml(aiVerdict)}</div>
    </div>
    <div class="score">
      <div class="label">${escapeHtml(t('report.plagScoreLabel'))}</div>
      <div class="value b-${escapeHtml(plagiarism.band)}">${plagiarism.score.toFixed(0)} %</div>
      <div class="note">${escapeHtml(plagVerdict)}</div>
    </div>
  </div>`;
}

function renderAiSection(ai) {
  if (ai.score === null) {
    return `<h2>${escapeHtml(t('report.aiSection'))}</h2><p>${escapeHtml(
      ai.verdictKey ? t(ai.verdictKey) : t('report.notRequestedAi'),
    )}</p>`;
  }

  const rows = ai.detectors.map((d) => {
    const label = t(d.labelKey) + (d.labelSuffix ? ` (${d.labelSuffix})` : '');
    const detail = d.unavailable
      ? escapeHtml(d.errorKey ? t(d.errorKey, d.errorParams) : (d.errorText ?? t('ai.unavailable')))
      : `${escapeHtml(t(d.evidence?.[0]?.labelKey ?? ''))} : <strong>${escapeHtml(resolve(d.evidence?.[0]?.value ?? ''))}</strong>`;
    return `<tr>
      <td>${escapeHtml(label)}${d.remote ? ` <em>${escapeHtml(t('report.remote'))}</em>` : ''}</td>
      <td class="num">${d.unavailable ? '—' : `${(d.score * 100).toFixed(0)} %`}</td>
      <td class="num">${d.unavailable ? '—' : `${(d.confidence * 100).toFixed(0)} %`}</td>
      <td>${detail}</td>
    </tr>`;
  }).join('');

  return `<h2>${escapeHtml(t('report.aiSection'))}</h2>
  <p>${escapeHtml(t(ai.verdictKey))}</p>
  <h3>${escapeHtml(t('report.whyThisScore'))}</h3>
  <ul>${ai.reasons.map((r) => `<li>${escapeHtml(resolve(r))}</li>`).join('')}</ul>
  <h3>${escapeHtml(t('report.detectorDetail', { active: ai.detectorCount, total: ai.detectors.length }))}</h3>
  <table>
    <thead><tr>
      <th>${escapeHtml(t('ai.tableDetector'))}</th>
      <th class="num">${escapeHtml(t('ai.tableScore'))}</th>
      <th class="num">${escapeHtml(t('ai.tableReliability'))}</th>
      <th>${escapeHtml(t('ai.tableEvidence'))}</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p class="meta">${escapeHtml(t('report.statsLine', {
    features: ai.featureCount,
    agreement: (ai.agreement * 100).toFixed(0),
    ai: ai.votes.ai,
    human: ai.votes.human,
    neutral: ai.votes.neutral,
  }))}</p>`;
}

function renderPlagiarismSection(plagiarism) {
  const heading = `<h2>${escapeHtml(t('report.plagSection'))}</h2>`;
  const verdict = plagiarism.verdictKey
    ? t(plagiarism.verdictKey, plagiarism.verdictParams)
    : t('report.notRequestedPlag');

  const stats = `<p class="meta">${escapeHtml(t('report.plagStats', {
    passages: plagiarism.passageCount,
    queries: plagiarism.queriesRun,
  }))}${plagiarism.commonPhrasesFiltered
    ? escapeHtml(t('report.plagFiltered', { count: plagiarism.commonPhrasesFiltered }))
    : ''}</p>`;

  if (!plagiarism.sources.length) {
    return `${heading}<p>${escapeHtml(verdict)}</p>${stats}`;
  }

  const rows = plagiarism.sources.map((source) => {
    const title = sourceTitle(source);
    const domain = source.domainKey ? t(source.domainKey) : source.domain;
    return `<tr>
      <td>
        ${source.url
          ? `<a href="${escapeHtml(source.url)}">${escapeHtml(title)}</a><br><span class="meta">${escapeHtml(domain)}</span>`
          : escapeHtml(title)}
        <br><span class="meta">${escapeHtml(source.verified ? t('plagiarism.verified') : t('plagiarism.unverified'))}</span>
        <blockquote>${escapeHtml((source.matches[0]?.matchedText ?? '').slice(0, 420))}</blockquote>
      </td>
      <td class="num">${(source.bestSimilarity * 100).toFixed(0)} %</td>
      <td class="num">${(source.coverage * 100).toFixed(1)} %</td>
      <td class="num">${source.matches.length}</td>
    </tr>`;
  }).join('');

  return `${heading}
  <p>${escapeHtml(verdict)}</p>
  <table>
    <thead><tr>
      <th>${escapeHtml(t('plagiarism.tableSource'))}</th>
      <th class="num">${escapeHtml(t('plagiarism.tableSimilarity'))}</th>
      <th class="num">${escapeHtml(t('plagiarism.tableCoverage'))}</th>
      <th class="num">${escapeHtml(t('plagiarism.tablePassages'))}</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  ${stats}
  ${plagiarism.errors.length
    ? `<h3>${escapeHtml(t('report.incidents'))}</h3><ul>${
      plagiarism.errors.map((e) => `<li>${escapeHtml(e)}</li>`).join('')}</ul>`
    : ''}`;
}

function renderDisclaimer() {
  return `<div class="warn">
    <h3>${escapeHtml(t('report.disclaimerTitle'))}</h3>
    <ul>${t('disclaimers.list').map((d) => `<li>${escapeHtml(d)}</li>`).join('')}</ul>
  </div>`;
}
