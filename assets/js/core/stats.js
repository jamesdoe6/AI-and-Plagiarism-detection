/** Statistical helpers used by the metric extractors. */

export const sum = (xs) => xs.reduce((a, b) => a + b, 0);

export const mean = (xs) => (xs.length ? sum(xs) / xs.length : 0);

export function variance(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return sum(xs.map((x) => (x - m) ** 2)) / (xs.length - 1);
}

export const stdev = (xs) => Math.sqrt(variance(xs));

/** Coefficient of variation: relative dispersion, scale-invariant. */
export function cv(xs) {
  const m = mean(xs);
  return m === 0 ? 0 : stdev(xs) / m;
}

export function median(xs) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function quantile(xs, q) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return s[base + 1] !== undefined ? s[base] + rest * (s[base + 1] - s[base]) : s[base];
}

/** Skewness — AI text often shows a more symmetric distribution. */
export function skewness(xs) {
  const n = xs.length;
  if (n < 3) return 0;
  const m = mean(xs);
  const sd = stdev(xs);
  if (sd === 0) return 0;
  return (n / ((n - 1) * (n - 2))) * sum(xs.map((x) => ((x - m) / sd) ** 3));
}

/** Excess kurtosis. */
export function kurtosis(xs) {
  const n = xs.length;
  if (n < 4) return 0;
  const m = mean(xs);
  const sd = stdev(xs);
  if (sd === 0) return 0;
  const g2 = sum(xs.map((x) => ((x - m) / sd) ** 4)) / n - 3;
  return g2;
}

/** Shannon entropy (base 2) of a distribution of counts. */
export function entropy(counts) {
  const values = Array.isArray(counts) ? counts : Array.from(counts.values());
  const total = sum(values);
  if (!total) return 0;
  let h = 0;
  for (const c of values) {
    if (c <= 0) continue;
    const p = c / total;
    h -= p * Math.log2(p);
  }
  return h;
}

/** Entropy normalised to [0,1] by its theoretical maximum. */
export function normalizedEntropy(counts) {
  const values = Array.isArray(counts) ? counts : Array.from(counts.values());
  const k = values.filter((v) => v > 0).length;
  if (k <= 1) return 0;
  return entropy(values) / Math.log2(k);
}

/** Gini index of a distribution (0 = uniform, 1 = concentrated). */
export function gini(values) {
  const xs = [...values].filter((v) => v >= 0).sort((a, b) => a - b);
  const n = xs.length;
  if (!n) return 0;
  const total = sum(xs);
  if (total === 0) return 0;
  let cumulative = 0;
  for (let i = 0; i < n; i += 1) cumulative += (i + 1) * xs[i];
  return (2 * cumulative) / (n * total) - (n + 1) / n;
}

export function counter(items) {
  const map = new Map();
  for (const item of items) map.set(item, (map.get(item) || 0) + 1);
  return map;
}

/** Cosine similarity between two sparse vectors (Map). */
export function cosineSparse(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const v of a.values()) na += v * v;
  for (const v of b.values()) nb += v * v;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const [k, v] of small) {
    const other = large.get(k);
    if (other) dot += v * other;
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function jaccard(setA, setB) {
  if (!setA.size || !setB.size) return 0;
  const [small, large] = setA.size <= setB.size ? [setA, setB] : [setB, setA];
  let inter = 0;
  for (const item of small) if (large.has(item)) inter += 1;
  return inter / (setA.size + setB.size - inter);
}

/** Containment: share of A found within B (asymmetric, useful for plagiarism). */
export function containment(setA, setB) {
  if (!setA.size) return 0;
  let inter = 0;
  for (const item of setA) if (setB.has(item)) inter += 1;
  return inter / setA.size;
}

/** Clamp a value into [min, max]. */
export const clamp = (x, min = 0, max = 1) => Math.min(max, Math.max(min, x));

/** Logistic sigmoid. */
export const sigmoid = (x) => 1 / (1 + Math.exp(-x));

/**
 * Convert a raw metric into a 0..1 score through a SOFT ramp.
 *
 * `lo` is the value pulling towards 0, `hi` the one pulling towards 1 (lo may be
 * greater than hi to invert the direction). We use a logistic rather than a
 * truncated linear ramp: a metric slightly out of bounds must not produce a
 * categorical 0 % or 100 % vote. The extremes sit at ~0.06 and ~0.94, always
 * leaving room for doubt — essential when the final score can be read as an
 * accusation.
 */
const RAMP_STEEPNESS = 5.2;

export function ramp(value, lo, hi) {
  if (!Number.isFinite(value)) return 0.5;
  if (lo === hi) return 0.5;
  const t = (value - lo) / (hi - lo);
  return sigmoid((t - 0.5) * RAMP_STEEPNESS);
}

/** Hard variant, for the rare metric that genuinely must saturate. */
export function hardRamp(value, lo, hi) {
  if (!Number.isFinite(value)) return 0.5;
  if (lo === hi) return 0.5;
  return clamp((value - lo) / (hi - lo));
}

/** Bounded Levenshtein distance, over arrays (words) or strings. */
export function levenshtein(a, b, maxLen = 400) {
  const s = typeof a === 'string' ? a.slice(0, maxLen) : a.slice(0, maxLen);
  const t = typeof b === 'string' ? b.slice(0, maxLen) : b.slice(0, maxLen);
  const n = s.length;
  const m = t.length;
  if (!n) return m;
  if (!m) return n;
  let prev = Array.from({ length: m + 1 }, (_, i) => i);
  const curr = new Array(m + 1);
  for (let i = 1; i <= n; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= m; j += 1) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = [...curr];
  }
  return prev[m];
}

/** Normalised similarity ratio derived from Levenshtein. */
export function levenshteinRatio(a, b) {
  const maxLen = Math.max(a.length, b.length);
  if (!maxLen) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

/**
 * Longest common subsequence (length) between two word arrays.
 * Used to spot near-verbatim reuse despite insertions.
 */
export function lcsLength(a, b, cap = 600) {
  const s = a.slice(0, cap);
  const t = b.slice(0, cap);
  let prev = new Array(t.length + 1).fill(0);
  const curr = new Array(t.length + 1).fill(0);
  for (let i = 1; i <= s.length; i += 1) {
    curr[0] = 0;
    for (let j = 1; j <= t.length; j += 1) {
      curr[j] = s[i - 1] === t[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], curr[j - 1]);
    }
    prev = [...curr];
  }
  return prev[t.length];
}
