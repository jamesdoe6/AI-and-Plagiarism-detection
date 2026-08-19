/**
 * Detector 10 (optional) — Remote classifier (Hugging Face Inference).
 *
 * Lets you plug in a genuinely trained "human vs machine" classifier
 * (roberta-base-openai-detector, Hello-SimpleAI/chatgpt-detector-roberta,
 * desklib/ai-text-detector, and so on). The text is split into chunks that fit
 * the model window (~512 tokens), then the scores are aggregated.
 *
 * Limitation: these public models were trained on older generations; their
 * performance drops on recent models and on paraphrased text. They remain
 * useful as an ADDITIONAL VOICE in the ensemble, not as a verdict.
 */

import { fetchWithTimeout, withRetry, permanent, pool } from '../util/async.js';
import { AI_PROVIDERS } from '../config.js';
import { clamp } from './base.js';
import { mean, stdev } from '../core/stats.js';
import { t } from '../i18n/index.js';

const K = 'detectors.remoteClassifier';

const CHUNK_CHARS = 1400;
const MAX_CHUNKS = 8;

export const remoteClassifierDetector = {
  id: 'remoteClassifier',
  labelKey: `${K}.label`,
  descriptionKey: `${K}.description`,
  remote: true,

  isEnabled(settings) {
    return settings.aiProvider === 'huggingface' && Boolean(settings.aiApiKey);
  },

  async run({ doc, settings, onLog }) {
    const provider = AI_PROVIDERS.huggingface;
    const model = settings.aiModel || provider.defaultModel;
    const url = `${provider.endpoint}${model}`;

    const chunks = splitChunks(doc.text, CHUNK_CHARS).slice(0, MAX_CHUNKS);
    if (!chunks.length) throw new Error(t(`${K}.errorShort`));

    const results = await pool(chunks, async (chunk) => {
      return withRetry(async () => {
        const response = await fetchWithTimeout(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${settings.aiApiKey}`,
          },
          body: JSON.stringify({ inputs: chunk, options: { wait_for_model: true } }),
        }, 30000);

        if (response.status === 503) throw new Error(t(`${K}.loading`));
        if (!response.ok) {
          const body = await response.text().catch(() => '');
          const message = `HTTP ${response.status} — ${body.slice(0, 160)}`;
          if ([400, 401, 403, 404].includes(response.status)) throw permanent(message);
          throw new Error(message);
        }
        return response.json();
      }, {
        retries: 2,
        baseDelay: 2000,
        onRetry: (err, attempt, delay) => onLog?.(t(`${K}.retry`, { attempt, delay, error: err.message })),
      });
    }, 2);

    const scores = results
      .map((r) => extractAiScore(r))
      .filter((v) => Number.isFinite(v));

    if (!scores.length) throw new Error(t(`${K}.errorNoScore`));

    const avg = mean(scores);
    const dispersion = stdev(scores);

    return {
      id: this.id,
      labelKey: this.labelKey,
      labelSuffix: model,
      score: clamp(avg),
      // High dispersion across segments = mixed text, or an undecided model.
      confidence: clamp(0.75 - dispersion, 0.25, 0.85) * (scores.length >= 3 ? 1 : 0.7),
      evidence: [
        {
          labelKey: `${K}.ev1`,
          value: `${(avg * 100).toFixed(1)} %`,
          score: clamp(avg),
          direction: avg > 0.6 ? 'ai' : avg < 0.4 ? 'human' : 'neutral',
          hintKey: `${K}.ev1Hint`,
          hintParams: { count: scores.length },
        },
        {
          labelKey: `${K}.ev2`,
          value: dispersion.toFixed(3),
          score: 0.5,
          direction: 'neutral',
          hintKey: dispersion > 0.25 ? `${K}.ev2HintHigh` : `${K}.ev2HintLow`,
        },
      ],
      segmentScores: scores,
    };
  },
};

/** Split on sentence boundaries so the context is not broken mid-thought. */
function splitChunks(text, size) {
  const parts = text.split(/(?<=[.!?…])\s+/);
  const chunks = [];
  let current = '';
  for (const part of parts) {
    if ((current + part).length > size && current) {
      chunks.push(current.trim());
      current = '';
    }
    current += `${part} `;
  }
  if (current.trim().length > 120) chunks.push(current.trim());
  return chunks;
}

/**
 * Normalise the heterogeneous output formats of HF models.
 * Labels vary: LABEL_0/LABEL_1, Fake/Real, AI/Human, machine/human.
 */
function extractAiScore(result) {
  const flat = Array.isArray(result?.[0]) ? result[0] : result;
  if (!Array.isArray(flat)) return NaN;
  let aiScore = NaN;
  let humanScore = NaN;
  for (const item of flat) {
    const label = String(item?.label ?? '').toLowerCase();
    const score = Number(item?.score);
    if (!Number.isFinite(score)) continue;
    if (/(fake|ai|machine|generated|chatgpt|label_1)/.test(label)) aiScore = score;
    if (/(real|human|original|label_0)/.test(label)) humanScore = score;
  }
  if (Number.isFinite(aiScore)) return aiScore;
  if (Number.isFinite(humanScore)) return 1 - humanScore;
  return NaN;
}
