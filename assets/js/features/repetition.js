/**
 * Repetition and redundancy metrics.
 *
 * Two opposing phenomena are measured:
 *  - VERBATIM repetition (reused n-grams), more a sign of long generated text or
 *    copy-paste;
 *  - STRUCTURAL repetition (same openings, same sentence patterns), a strong
 *    LLM signature.
 *
 * The gzip compression ratio serves as a global redundancy measure, computed via
 * the native CompressionStream API with no external dependency.
 */

import { counter, mean, stdev, entropy } from '../core/stats.js';
import { ngrams, words } from '../core/tokenize.js';

export function repetitionFeatures(doc) {
  const f = {};
  const tokens = doc.lower;
  if (tokens.length < 10) return { features: f };

  for (const n of [2, 3, 4, 5, 6, 8]) {
    const grams = ngrams(tokens, n);
    if (!grams.length) { f[`rep.repeat${n}`] = 0; f[`rep.maxRepeat${n}`] = 0; continue; }
    const freq = counter(grams);
    const repeated = [...freq.values()].filter((c) => c > 1);
    f[`rep.repeat${n}`] = repeated.reduce((a, b) => a + b - 1, 0) / grams.length;
    f[`rep.maxRepeat${n}`] = Math.max(...freq.values()) / grams.length;
    f[`rep.uniqueRatio${n}`] = freq.size / grams.length;
  }

  // Content repetition (excluding function words): words longer than 5 letters.
  const content = tokens.filter((w) => w.length > 5);
  const contentFreq = counter(content);
  f['rep.contentRepeatRate'] = content.length
    ? 1 - contentFreq.size / content.length : 0;
  f['rep.contentTopShare'] = content.length
    ? Math.max(0, ...contentFreq.values()) / content.length : 0;
  f['rep.contentEntropy'] = entropy(contentFreq);

  // Cross-sentence repetition: mean lexical overlap of neighbouring sentences.
  const sentSets = doc.sentences.map((s) => new Set(words(s.text.toLowerCase()).filter((w) => w.length > 3)));
  const overlaps = [];
  for (let i = 1; i < sentSets.length; i += 1) {
    const a = sentSets[i - 1];
    const b = sentSets[i];
    if (!a.size || !b.size) continue;
    let inter = 0;
    for (const w of b) if (a.has(w)) inter += 1;
    overlaps.push(inter / Math.min(a.size, b.size));
  }
  f['rep.adjacentSentenceOverlap'] = mean(overlaps);
  f['rep.adjacentSentenceOverlapSd'] = stdev(overlaps);

  // Global all-pairs overlap (sampled to stay linear).
  f['rep.globalSentenceOverlap'] = sampledPairwiseOverlap(sentSets);

  // Sentence patterns: function-word / length skeleton.
  const skeletons = doc.sentences.map((s) => sentenceSkeleton(s.text));
  const skeletonFreq = counter(skeletons);
  f['rep.skeletonDiversity'] = skeletons.length ? skeletonFreq.size / skeletons.length : 0;
  f['rep.skeletonTopShare'] = skeletons.length ? Math.max(0, ...skeletonFreq.values()) / skeletons.length : 0;

  return { features: f };
}

/** Skeleton: the first 4 words reduced to a coarse category. */
function sentenceSkeleton(text) {
  return words(text)
    .slice(0, 4)
    .map((w) => {
      const lw = w.toLowerCase();
      if (/^\d+$/.test(lw)) return '#';
      if (lw.length <= 3) return 's';
      if (lw.length <= 6) return 'm';
      return 'L';
    })
    .join('');
}

function sampledPairwiseOverlap(sets, maxPairs = 4000) {
  const n = sets.length;
  if (n < 3) return 0;
  const step = Math.max(1, Math.floor((n * (n - 1)) / 2 / maxPairs));
  let total = 0;
  let count = 0;
  let k = 0;
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      k += 1;
      if (k % step !== 0) continue;
      const a = sets[i];
      const b = sets[j];
      if (!a.size || !b.size) continue;
      let inter = 0;
      for (const w of b) if (a.has(w)) inter += 1;
      total += inter / Math.min(a.size, b.size);
      count += 1;
    }
  }
  return count ? total / count : 0;
}

/**
 * Compression profile.
 *
 * The raw compression ratio depends heavily on length and language. We therefore
 * compare it against a NULL BASELINE: the same text with its words randomly
 * shuffled. Shuffling destroys sequence redundancy while preserving vocabulary
 * and length. The ratio between the two (structuralGain) isolates genuinely
 * structural redundancy, almost independently of text size.
 *
 * Uses the native CompressionStream API; returns null when unavailable (the
 * ensemble then ignores this signal rather than guessing).
 */
export async function compressionProfile(text) {
  try {
    if (typeof CompressionStream === 'undefined') return null;
    const ratio = await gzipRatio(text);
    if (ratio === null) return null;

    const tokens = text.split(/(\s+)/);
    const shuffled = shuffle(tokens.filter((t) => t.trim().length)).join(' ');
    const baseline = await gzipRatio(shuffled);
    if (baseline === null) return { ratio, baseline: null, structuralGain: null };

    return {
      ratio,
      baseline,
      // < 1: the text compresses better than its shuffled version, meaning it
      // carries sequence redundancy.
      structuralGain: baseline > 0 ? ratio / baseline : null,
    };
  } catch {
    return null;
  }
}

/** Compatibility: legacy entry point returning only the raw ratio. */
export async function compressionRatio(text) {
  const profile = await compressionProfile(text);
  return profile ? profile.ratio : null;
}

async function gzipRatio(text) {
  const bytes = new TextEncoder().encode(text);
  if (!bytes.length) return null;
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  const compressed = await new Response(stream).arrayBuffer();
  return compressed.byteLength / bytes.length;
}

/** Deterministic shuffle (fixed seed): two analyses of the same text agree. */
function shuffle(items) {
  const out = [...items];
  let seed = 20260419;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
