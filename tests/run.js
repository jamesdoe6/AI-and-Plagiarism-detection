/**
 * Regression tests, run with `npm test` (Node >= 20).
 *
 * They do not prove the detector is "right" — no test can. They check five
 * things:
 *   1. the whole chain runs without error;
 *   2. clearly generated texts rank above clearly human ones;
 *   3. the safeguards hold (short text unscored, low confidence on small
 *      samples, thresholds respected);
 *   4. the similarity measure separates real reuse from same-topic writing;
 *   5. the two dictionaries stay structurally identical, so no language can
 *      silently fall back to the other mid-sentence.
 */

import { analyzeAi, resolveThresholds, formalityIndex } from '../assets/js/detectors/ensemble.js';
import { extractFeatures } from '../assets/js/features/index.js';
import { segmentText } from '../assets/js/plagiarism/segmenter.js';
import { similarityBetween, coverageRatio } from '../assets/js/plagiarism/similarity.js';
import { en } from '../assets/js/i18n/en.js';
import { fr } from '../assets/js/i18n/fr.js';
import { AI_LIKE, HUMAN_LIKE, EDGE_CASES } from './samples.js';

let failures = 0;
const settings = { aiProvider: 'none', searchProvider: 'none' };

function check(label, condition, detail = '') {
  const mark = condition ? 'OK  ' : 'FAIL';
  if (!condition) failures += 1;
  console.log(`  [${mark}] ${label}${detail ? ` — ${detail}` : ''}`);
}

/** Every leaf path of a dictionary, for structural comparison. */
function paths(node, prefix = '') {
  return Object.entries(node).flatMap(([key, value]) => (
    value && typeof value === 'object' && !Array.isArray(value)
      ? paths(value, `${prefix}${key}.`)
      : [`${prefix}${key}`]
  ));
}

/** Placeholders used by a translation string, e.g. {count}. */
function placeholders(value) {
  if (typeof value !== 'string') return [];
  return [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
}

function at(node, path) {
  return path.split('.').reduce((acc, key) => acc?.[key], node);
}

async function main() {
  console.log('\n== Translations ==');
  const enPaths = paths(en);
  const frPaths = paths(fr);
  const missingFr = enPaths.filter((p) => !frPaths.includes(p));
  const extraFr = frPaths.filter((p) => !enPaths.includes(p));
  check('identical key sets', missingFr.length === 0 && extraFr.length === 0,
    `${enPaths.length} keys; missing in fr: ${missingFr.slice(0, 4).join(', ') || 'none'}; extra: ${extraFr.slice(0, 4).join(', ') || 'none'}`);

  const mismatched = enPaths.filter((p) => {
    const a = placeholders(at(en, p));
    const b = placeholders(at(fr, p));
    return a.join(',') !== b.join(',');
  });
  check('matching placeholders in both languages', mismatched.length === 0, mismatched.slice(0, 5).join(', '));

  const disclaimersMatch = Array.isArray(en.disclaimers.list)
    && en.disclaimers.list.length === fr.disclaimers.list.length;
  check('same number of disclaimers', disclaimersMatch, `${en.disclaimers.list.length} items`);

  console.log('\n== Metric extraction ==');
  const extraction = await extractFeatures(AI_LIKE[0].text);
  check('more than 700 metrics computed', extraction.featureCount > 700, `${extraction.featureCount} metrics`);
  check('language detected', extraction.language.lang === 'en', extraction.language.lang);
  check('no NaN metric', Object.values(extraction.features).every(Number.isFinite),
    Object.entries(extraction.features).filter(([, v]) => !Number.isFinite(v)).map(([k]) => k).slice(0, 5).join(', '));

  console.log('\n== AI scores ==');
  const aiScores = [];
  const humanScores = [];

  for (const sample of AI_LIKE) {
    const result = await analyzeAi(sample.text, settings);
    aiScores.push(result.score);
    console.log(`  ${sample.id.padEnd(20)} ${result.score.toFixed(1)} % (${result.confidenceKey})`);
  }
  for (const sample of HUMAN_LIKE) {
    const result = await analyzeAi(sample.text, settings);
    humanScores.push(result.score);
    console.log(`  ${sample.id.padEnd(20)} ${result.score.toFixed(1)} % (${result.confidenceKey})`);
  }

  const minAi = Math.min(...aiScores);
  const maxHuman = Math.max(...humanScores);
  check('strict AI / human separation', minAi > maxHuman,
    `min AI ${minAi.toFixed(1)} % vs max human ${maxHuman.toFixed(1)} %`);
  check('separation margin >= 15 points', minAi - maxHuman >= 15, `margin ${(minAi - maxHuman).toFixed(1)} points`);
  check('no human text above 55 %', maxHuman < 55, `${maxHuman.toFixed(1)} %`);

  console.log('\n== Safeguards ==');
  for (const sample of EDGE_CASES) {
    const result = await analyzeAi(sample.text, settings);
    if (sample.expect === 'tooShort') {
      check(`${sample.id}: not scored`, result.tooShort === true && result.score === null);
      check(`${sample.id}: verdict key present`, result.verdictKey === 'verdict.tooShort');
    } else {
      console.log(`  ${sample.id.padEnd(20)} ${result.score.toFixed(1)} % (${result.confidenceKey})`);
      check(`${sample.id}: no strong false positive`, result.score < 70, `${result.score.toFixed(1)} %`);
    }
  }

  const shifted = resolveThresholds(70);
  check('custom threshold shifts the whole scale',
    shifted.strong === 70 && shifted.likely < 70 && shifted.uncertain < shifted.likely,
    JSON.stringify(shifted));

  const formalAi = formalityIndex((await extractFeatures(AI_LIKE[0].text)).features);
  const casualHuman = formalityIndex((await extractFeatures(HUMAN_LIKE[0].text)).features);
  check('formality index separates registers', formalAi > casualHuman + 0.3,
    `formal ${formalAi.toFixed(2)} vs casual ${casualHuman.toFixed(2)}`);

  console.log('\n== Detector output shape ==');
  const shaped = await analyzeAi(AI_LIKE[0].text, settings);
  check('detectors expose translation keys only',
    shaped.detectors.every((d) => typeof d.labelKey === 'string' && d.labelKey.startsWith('detectors.')));
  check('evidence exposes translation keys only',
    shaped.detectors.filter((d) => !d.unavailable)
      .every((d) => d.evidence.every((e) => typeof e.labelKey === 'string')));
  check('reasons are descriptors, not strings',
    shaped.reasons.every((r) => typeof r === 'object' && typeof r.key === 'string'));

  console.log('\n== Segmentation and similarity ==');
  const segments = segmentText(HUMAN_LIKE[0].text);
  check('passages produced', segments.length > 0, `${segments.length} passages`);
  check('consistent offsets', segments.every((s) => HUMAN_LIKE[0].text.slice(s.start, s.end).length > 0));

  // A realistic-length passage: shingle-based measures are mechanically harsh
  // on an isolated sentence, which is not the engine's operating regime
  // (~42-word windows).
  const a = `The migration of legacy database systems to cloud infrastructure requires careful planning around downtime windows, data consistency guarantees, and rollback procedures. Teams that skip the rehearsal phase frequently discover capacity problems only during the production cutover, when options are limited.`;
  const paraphrased = `The migration of legacy database systems to cloud infrastructure demands careful planning around downtime windows, data consistency guarantees, and rollback procedures. Teams that skip the rehearsal stage often discover capacity problems only during the production cutover, when options are limited.`;
  const sameTopic = `Cloud adoption continues to accelerate across the enterprise sector. Organisations cite cost predictability and elastic capacity as the primary drivers, although governance concerns remain a recurring obstacle in regulated industries.`;
  const embedded = `Introduction paragraph about something else entirely. ${a} Followed by additional unrelated commentary on separate matters.`;

  check('identical similarity = 1', similarityBetween(a, a).score > 0.97);
  check('unrelated similarity near 0', similarityBetween(a, 'Completely unrelated content about medieval pottery glazing techniques and kiln temperatures.').score < 0.15);
  check('light paraphrase detected', similarityBetween(a, paraphrased).score > 0.7,
    similarityBetween(a, paraphrased).score.toFixed(3));
  check('embedded passage detected', similarityBetween(a, embedded).score > 0.85,
    similarityBetween(a, embedded).score.toFixed(3));
  check('same topic but different text not flagged', similarityBetween(a, sameTopic).score < 0.3,
    similarityBetween(a, sameTopic).score.toFixed(3));

  console.log('\n== Coverage ==');
  const coverage = coverageRatio([
    { start: 0, end: 100, similarity: 1 },
    { start: 50, end: 150, similarity: 1 },
    { start: 400, end: 500, similarity: 0.5 },
  ], 1000);
  check('intervals merged, no double counting', Math.abs(coverage - 0.20) < 0.001, coverage.toFixed(3));

  console.log(`\n${failures === 0 ? 'All tests pass.' : `${failures} test(s) failed.`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
