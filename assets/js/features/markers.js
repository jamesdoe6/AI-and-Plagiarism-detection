/**
 * Surface lexical metrics: LLM style markers, connectives, hedging, subjectivity
 * markers, human noise, formatting.
 *
 * Each lexicon entry becomes a metric (~250 in total), plus aggregates. These
 * signals are deliberately weighted low: they are easy to circumvent and produce
 * false positives on academic and institutional writing, which naturally uses
 * this register.
 */

import { AI_PHRASES, TRANSITIONS, HEDGES, PERSONAL_MARKERS, HUMAN_NOISE } from '../data/ai-markers.js';
import { words } from '../core/tokenize.js';
import { mean } from '../core/stats.js';

export function markerFeatures(doc, lang = 'en') {
  const f = {};
  const haystack = ` ${doc.canonical} `;
  const per1k = (count) => (count / Math.max(1, doc.wordCount)) * 1000;

  const hits = [];

  // --- Phrases typical of LLM output ---
  const phrases = AI_PHRASES[lang] ?? AI_PHRASES.en;
  let phraseTotal = 0;
  let phraseDistinct = 0;
  for (const phrase of phrases) {
    const needle = phrase
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!needle) continue;
    const count = countOccurrences(haystack, ` ${needle}`);
    f[`mk.phrase.${slug(phrase)}`] = count;
    if (count > 0) {
      phraseTotal += count;
      phraseDistinct += 1;
      hits.push({ type: 'phrase', text: phrase, count });
    }
  }
  f['mk.aiPhrasePer1k'] = per1k(phraseTotal);
  f['mk.aiPhraseDistinct'] = phraseDistinct;
  f['mk.aiPhraseDistinctRatio'] = phraseDistinct / phrases.length;

  // --- Logical connectives, especially sentence-initial ---
  const transitions = TRANSITIONS[lang] ?? TRANSITIONS.en;
  let transTotal = 0;
  let transOpeners = 0;
  const openers = doc.sentences.map((s) => words(s.text).slice(0, 2).join(' ').toLowerCase());
  for (const t of transitions) {
    const count = countOccurrences(haystack, ` ${t} `);
    f[`mk.trans.${slug(t)}`] = count;
    transTotal += count;
    transOpeners += openers.filter((o) => o.startsWith(t)).length;
  }
  f['mk.transitionPer1k'] = per1k(transTotal);
  f['mk.transitionOpenerRatio'] = doc.sentences.length ? transOpeners / doc.sentences.length : 0;

  // --- Hedging ---
  const hedges = HEDGES[lang] ?? HEDGES.en;
  let hedgeTotal = 0;
  for (const h of hedges) {
    const count = countOccurrences(haystack, ` ${h} `);
    f[`mk.hedge.${slug(h)}`] = count;
    hedgeTotal += count;
  }
  f['mk.hedgePer1k'] = per1k(hedgeTotal);

  // --- Subjectivity / lived experience (a HUMAN signal) ---
  const personal = PERSONAL_MARKERS[lang] ?? PERSONAL_MARKERS.en;
  let personalTotal = 0;
  for (const p of personal) {
    const needle = p.toLowerCase().replace(/[^\p{L}\p{N}\s'-]/gu, ' ').replace(/\s+/g, ' ').trim();
    const count = countOccurrences(haystack, ` ${needle}`);
    f[`mk.personal.${slug(p)}`] = count;
    personalTotal += count;
  }
  f['mk.personalPer1k'] = per1k(personalTotal);

  // --- Informal register / noise (a HUMAN signal) ---
  const noise = HUMAN_NOISE[lang] ?? HUMAN_NOISE.en;
  let noiseTotal = 0;
  for (const w of noise) {
    const count = countOccurrences(haystack, ` ${w.replace(/[^\p{L}\p{N}\s'-]/gu, '')} `);
    f[`mk.noise.${slug(w)}`] = count;
    noiseTotal += count;
  }
  f['mk.humanNoisePer1k'] = per1k(noiseTotal);

  // --- Typical rhetorical patterns ---
  const text = doc.text;
  f['mk.notOnlyButAlso'] = countOccurrences(haystack, ' not only ') + countOccurrences(haystack, ' non seulement ');
  f['mk.itIsNotJust'] = countOccurrences(haystack, " it s not just ") + countOccurrences(haystack, " ce n est pas seulement ");
  f['mk.tricolon'] = (text.match(/\b\w+,\s+\w+(?:\s+\w+)?,\s+(?:and|et|or|ou)\s+\w+/gi) ?? []).length;
  f['mk.parallelIntro'] = (text.match(/^(First|Second|Third|Finally|Premierement|Deuxiemement|Enfin|Tout d'abord|Ensuite)[,:]/gim) ?? []).length;
  f['mk.rhetoricalQuestion'] = doc.sentences.filter((s) => /\?$/.test(s.text) && /^(what|why|how|but what|so what|pourquoi|comment|qu'est|mais)/i.test(s.text)).length;
  f['mk.imperativeOpeners'] = doc.sentences.filter((s) => /^(Remember|Consider|Note|Imagine|Think|Let's|Souvenez|Considerez|Notez|Imaginez|Pensez)\b/i.test(s.text)).length;

  // --- Formatting: lists, headings, bold, structural emoji ---
  const lines = text.split('\n');
  const bulletLines = lines.filter((l) => /^\s*([-*•·–—]|\d+[.)])\s+/.test(l));
  f['mk.bulletLineRatio'] = lines.length ? bulletLines.length / lines.length : 0;
  f['mk.bulletCount'] = bulletLines.length;
  f['mk.bulletUniformity'] = bulletUniformity(bulletLines);
  f['mk.headingCount'] = lines.filter((l) => /^\s*#{1,6}\s+/.test(l) || /^[A-ZÀ-Þ][^.!?]{3,60}:$/.test(l.trim())).length;
  f['mk.boldCount'] = (text.match(/\*\*[^*]+\*\*/g) ?? []).length;
  f['mk.markdownRatio'] = ((text.match(/[*_`#>|]/g) ?? []).length / Math.max(1, text.length)) * 1000;
  f['mk.colonBeforeList'] = (text.match(/:\s*\n\s*([-*•]|\d+[.)])/g) ?? []).length;
  f['mk.emojiCount'] = (text.match(/\p{Extended_Pictographic}/gu) ?? []).length;

  // --- Conversational-assistant tells ---
  f['mk.assistantTells'] = countOccurrences(haystack, ' as an ai ')
    + countOccurrences(haystack, ' as a language model ')
    + countOccurrences(haystack, ' en tant qu ia ')
    + countOccurrences(haystack, ' i hope this helps ')
    + countOccurrences(haystack, ' j espere que cela vous aide ')
    + countOccurrences(haystack, ' certainly ')
    + countOccurrences(haystack, ' here s a ');

  // --- Mean marker density per sentence ---
  const perSentence = doc.sentences.map((s) => {
    const c = ` ${s.text.toLowerCase()} `;
    return phrases.reduce((acc, p) => acc + (c.includes(p.toLowerCase()) ? 1 : 0), 0);
  });
  f['mk.markersPerSentence'] = mean(perSentence);
  f['mk.sentencesWithMarker'] = doc.sentences.length
    ? perSentence.filter((v) => v > 0).length / doc.sentences.length : 0;

  return { features: f, hits: hits.sort((a, b) => b.count - a.count).slice(0, 25) };
}

function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
}

function countOccurrences(haystack, needle) {
  if (!needle || needle.length < 2) return 0;
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

/** Bullet regularity: generated lists have items of uniform length. */
function bulletUniformity(bulletLines) {
  if (bulletLines.length < 3) return 0;
  const lengths = bulletLines.map((l) => l.trim().length);
  const m = mean(lengths);
  if (!m) return 0;
  const sd = Math.sqrt(lengths.reduce((a, l) => a + (l - m) ** 2, 0) / lengths.length);
  return Math.max(0, 1 - sd / m);
}
