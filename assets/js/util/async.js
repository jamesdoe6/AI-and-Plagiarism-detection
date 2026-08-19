/** Network helpers: timeout, exponential backoff, bounded-concurrency pool. */

export class TimeoutError extends Error {
  constructor(ms) {
    super(`Timed out after ${ms} ms`);
    this.name = 'TimeoutError';
  }
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** fetch with a hard timeout and an actionable error message. */
export async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err?.name === 'AbortError') throw new TimeoutError(timeoutMs);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Replay an operation with exponential backoff (2s, 4s, 8s...).
 * Explicit 4xx errors (invalid key, quota, malformed request) are not replayed:
 * retrying them achieves nothing and burns quota.
 */
export async function withRetry(fn, { retries = 2, baseDelay = 800, onRetry } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      if (err?.permanent) break;
      if (attempt === retries) break;
      const delay = baseDelay * 2 ** attempt;
      onRetry?.(err, attempt + 1, delay);
      await sleep(delay);
    }
  }
  throw lastError;
}

/** Run tasks with bounded concurrency, preserving result order. */
export async function pool(items, worker, concurrency = 4, onProgress) {
  const results = new Array(items.length);
  let index = 0;
  let done = 0;

  async function runner() {
    while (index < items.length) {
      const current = index;
      index += 1;
      try {
        results[current] = await worker(items[current], current);
      } catch (err) {
        results[current] = { error: err };
      }
      done += 1;
      onProgress?.(done, items.length);
    }
  }

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, runner);
  await Promise.all(runners);
  return results;
}

/** Network error flagged as final (no retry). */
export function permanent(message, extra = {}) {
  const err = new Error(message);
  err.permanent = true;
  Object.assign(err, extra);
  return err;
}

/** Let the main thread breathe so the UI can repaint. */
export function yieldToUI() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
