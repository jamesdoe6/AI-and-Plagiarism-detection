/**
 * Detector 9 (optional) — Remote LLM judgement.
 *
 * Asking a language model about a text's origin brings a SEMANTIC signal
 * (coherence of the experience being recounted, plausibility of details, tone)
 * that statistical metrics cannot capture. It is therefore complementary within
 * the ensemble.
 *
 * Privacy: the text is sent to the provider chosen by the user, and only to
 * that one. The detector is off by default and the interface says so plainly.
 *
 * Limitation: an LLM is itself an imperfect and over-confident judge. Its score
 * is therefore smoothed (never 0 % nor 100 %) and its confidence capped.
 */

import { fetchWithTimeout, withRetry, permanent } from '../util/async.js';
import { AI_PROVIDERS } from '../config.js';
import { clamp } from './base.js';
import { t } from '../i18n/index.js';

const K = 'detectors.remoteLlm';

const PROMPT = `You are an expert in detecting AI-generated text. Analyse the text below.

Reply with ONLY a valid JSON object, no surrounding text, in this format:
{"ai_probability": <number between 0 and 100>, "confidence": <"low"|"medium"|"high">, "signals": ["<signal 1>", "<signal 2>", "<signal 3>"], "reasoning": "<2 sentences maximum>"}

Criteria: lexical predictability, regularity of sentence rhythm, absence of verifiable lived detail, assistant boilerplate, uniformity of register, absence of human error.
Be cautious: formal, academic, or non-native writing is NOT necessarily generated. When in doubt, stay close to 50.

TEXT TO ANALYSE:
---
`;

/** Truncate the text to respect context and cost limits. */
function sample(text, maxChars = 12000) {
  if (text.length <= maxChars) return text;
  const head = text.slice(0, Math.floor(maxChars * 0.6));
  const tail = text.slice(-Math.floor(maxChars * 0.4));
  return `${head}\n\n[...truncated extract...]\n\n${tail}`;
}

export const remoteLlmDetector = {
  id: 'remoteLlm',
  labelKey: `${K}.label`,
  descriptionKey: `${K}.description`,
  remote: true,

  isEnabled(settings) {
    return ['anthropic', 'openai_compatible'].includes(settings.aiProvider) && Boolean(settings.aiApiKey);
  },

  async run({ doc, settings, onLog }) {
    const provider = AI_PROVIDERS[settings.aiProvider];
    const payloadText = `${PROMPT}${sample(doc.text)}\n---`;

    const call = async () => (settings.aiProvider === 'anthropic'
      ? callAnthropic(provider, settings, payloadText)
      : callOpenAiCompatible(provider, settings, payloadText));

    const raw = await withRetry(call, {
      retries: 2,
      onRetry: (err, attempt, delay) => onLog?.(t(`${K}.retry`, { attempt, delay, error: err.message })),
    });

    const parsed = parseJson(raw);
    if (!parsed || !Number.isFinite(parsed.ai_probability)) {
      throw new Error(t(`${K}.errorParse`));
    }

    // Smoothing: pull the verdict back towards the centre to avoid the
    // categorical 0/100 that LLMs produce far too readily.
    const smoothed = clamp(0.5 + (clamp(parsed.ai_probability / 100) - 0.5) * 0.88);
    const confidenceMap = { low: 0.4, faible: 0.4, medium: 0.62, moyenne: 0.62, high: 0.8, elevee: 0.8 };

    return {
      id: this.id,
      labelKey: this.labelKey,
      score: smoothed,
      confidence: confidenceMap[String(parsed.confidence).toLowerCase()] ?? 0.55,
      evidence: [
        {
          labelKey: `${K}.ev1`,
          value: `${Number(parsed.ai_probability).toFixed(0)} %`,
          score: clamp(parsed.ai_probability / 100),
          direction: parsed.ai_probability > 60 ? 'ai' : parsed.ai_probability < 40 ? 'human' : 'neutral',
          hintText: parsed.reasoning ?? '',
        },
        ...(Array.isArray(parsed.signals) ? parsed.signals : []).slice(0, 4).map((signal) => ({
          labelKey: `${K}.ev2`,
          value: String(signal).slice(0, 160),
          score: 0.6,
          direction: 'neutral',
        })),
      ],
      raw: parsed,
    };
  },
};

async function callAnthropic(provider, settings, prompt) {
  const response = await fetchWithTimeout(provider.endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': settings.aiApiKey,
      'anthropic-version': '2023-06-01',
      // Required to call the API from a browser.
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: settings.aiModel || provider.defaultModel,
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
    }),
  }, 30000);

  if (!response.ok) throw httpError(response.status, await safeText(response));
  const data = await response.json();
  return data?.content?.map((c) => c.text ?? '').join('') ?? '';
}

async function callOpenAiCompatible(provider, settings, prompt) {
  const base = (settings.aiExtra || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const response = await fetchWithTimeout(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${settings.aiApiKey}`,
    },
    body: JSON.stringify({
      model: settings.aiModel || provider.defaultModel,
      max_tokens: 600,
      temperature: 0,
      messages: [{ role: 'user', content: prompt }],
    }),
  }, 30000);

  if (!response.ok) throw httpError(response.status, await safeText(response));
  const data = await response.json();
  return data?.choices?.[0]?.message?.content ?? '';
}

function httpError(status, body) {
  const message = `HTTP ${status}${body ? ` — ${body.slice(0, 200)}` : ''}`;
  // 4xx: replaying is pointless.
  if ([400, 401, 403, 404, 422].includes(status)) return permanent(message, { status });
  return Object.assign(new Error(message), { status });
}

async function safeText(response) {
  try { return await response.text(); } catch { return ''; }
}

function parseJson(text) {
  if (!text) return null;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}
