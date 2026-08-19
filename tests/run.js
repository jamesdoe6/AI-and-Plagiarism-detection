/**
 * Tests de non-regression, executes avec `npm test` (Node >= 20).
 *
 * Ils ne prouvent pas que le detecteur est "juste" — aucun test ne peut le
 * faire. Ils verifient trois choses :
 *   1. la chaine complete s'execute sans erreur ;
 *   2. les textes clairement generes se classent au-dessus des textes
 *      clairement humains ;
 *   3. les regles de prudence tiennent (texte court non note, confiance basse
 *      sur echantillon reduit, seuils respectes).
 */

import { analyzeAi } from '../assets/js/detectors/ensemble.js';
import { extractFeatures } from '../assets/js/features/index.js';
import { segmentText } from '../assets/js/plagiarism/segmenter.js';
import { similarityBetween, coverageRatio } from '../assets/js/plagiarism/similarity.js';
import { AI_LIKE, HUMAN_LIKE, EDGE_CASES } from './samples.js';

let failures = 0;
const settings = { aiProvider: 'none', searchProvider: 'none' };

function check(label, condition, detail = '') {
  const mark = condition ? 'OK  ' : 'FAIL';
  if (!condition) failures += 1;
  console.log(`  [${mark}] ${label}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  console.log('\n== Extraction des metriques ==');
  const extraction = await extractFeatures(AI_LIKE[0].text);
  check('plus de 700 metriques calculees', extraction.featureCount > 700, `${extraction.featureCount} metriques`);
  check('langue detectee', extraction.language.lang === 'en', extraction.language.lang);
  check('aucune metrique NaN', Object.entries(extraction.features).every(([, v]) => Number.isFinite(v)),
    Object.entries(extraction.features).filter(([, v]) => !Number.isFinite(v)).map(([k]) => k).slice(0, 5).join(', '));

  console.log('\n== Scores IA ==');
  const aiScores = [];
  const humanScores = [];

  for (const sample of AI_LIKE) {
    const result = await analyzeAi(sample.text, settings);
    aiScores.push(result.score);
    console.log(`  ${sample.id.padEnd(20)} ${result.score.toFixed(1)} % (confiance ${result.confidenceLabel})`);
  }
  for (const sample of HUMAN_LIKE) {
    const result = await analyzeAi(sample.text, settings);
    humanScores.push(result.score);
    console.log(`  ${sample.id.padEnd(20)} ${result.score.toFixed(1)} % (confiance ${result.confidenceLabel})`);
  }

  const minAi = Math.min(...aiScores);
  const maxHuman = Math.max(...humanScores);
  check('separation stricte IA / humain', minAi > maxHuman,
    `min IA ${minAi.toFixed(1)} % vs max humain ${maxHuman.toFixed(1)} %`);
  check('marge de separation >= 15 points', minAi - maxHuman >= 15,
    `marge ${(minAi - maxHuman).toFixed(1)} points`);
  check('aucun texte humain au-dessus de 55 %', maxHuman < 55, `${maxHuman.toFixed(1)} %`);

  console.log('\n== Cas limites ==');
  for (const sample of EDGE_CASES) {
    const result = await analyzeAi(sample.text, settings);
    if (sample.expect === 'tooShort') {
      check(`${sample.id} : non note`, result.tooShort === true && result.score === null);
    } else {
      console.log(`  ${sample.id.padEnd(20)} ${result.score.toFixed(1)} % (confiance ${result.confidenceLabel})`);
      check(`${sample.id} : pas de faux positif fort`, result.score < 70, `${result.score.toFixed(1)} %`);
    }
  }

  console.log('\n== Segmentation et similarite ==');
  const segments = segmentText(HUMAN_LIKE[0].text);
  check('segments produits', segments.length > 0, `${segments.length} passages`);
  check('offsets coherents', segments.every((s) => HUMAN_LIKE[0].text.slice(s.start, s.end).length > 0));

  // Passage de longueur realiste : les mesures a base de shingles sont
  // mecaniquement severes sur une phrase isolee, ce qui n'est pas le regime
  // d'usage du moteur (fenetres de ~42 mots).
  const a = `The migration of legacy database systems to cloud infrastructure requires careful planning around downtime windows, data consistency guarantees, and rollback procedures. Teams that skip the rehearsal phase frequently discover capacity problems only during the production cutover, when options are limited.`;
  const paraphrased = `The migration of legacy database systems to cloud infrastructure demands careful planning around downtime windows, data consistency guarantees, and rollback procedures. Teams that skip the rehearsal stage often discover capacity problems only during the production cutover, when options are limited.`;
  const sameTopic = `Cloud adoption continues to accelerate across the enterprise sector. Organisations cite cost predictability and elastic capacity as the primary drivers, although governance concerns remain a recurring obstacle in regulated industries.`;
  const embedded = `Introduction paragraph about something else entirely. ${a} Followed by additional unrelated commentary on separate matters.`;

  const identical = similarityBetween(a, a);
  const different = similarityBetween(a, 'Completely unrelated content about medieval pottery glazing techniques and kiln temperatures.');
  const paraphrase = similarityBetween(a, paraphrased);
  const topic = similarityBetween(a, sameTopic);
  const inside = similarityBetween(a, embedded);

  check('similarite identique = 1', identical.score > 0.97, identical.score.toFixed(3));
  check('similarite sans rapport proche de 0', different.score < 0.15, different.score.toFixed(3));
  check('paraphrase legere detectee', paraphrase.score > 0.7, paraphrase.score.toFixed(3));
  check('passage inclus detecte', inside.score > 0.85, inside.score.toFixed(3));
  check('meme sujet mais texte different non signale', topic.score < 0.3, topic.score.toFixed(3));

  console.log('\n== Couverture ==');
  const coverage = coverageRatio([
    { start: 0, end: 100, similarity: 1 },
    { start: 50, end: 150, similarity: 1 },
    { start: 400, end: 500, similarity: 0.5 },
  ], 1000);
  check('intervalles fusionnes, pas de double comptage', Math.abs(coverage - 0.20) < 0.001, coverage.toFixed(3));

  console.log(`\n${failures === 0 ? 'Tous les tests passent.' : `${failures} test(s) en echec.`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
