/**
 * Detecteur 9 (optionnel) — Jugement d'un LLM distant.
 *
 * Un modele de langue interroge sur l'origine d'un texte apporte un signal
 * *semantique* (coherence du vecu raconte, plausibilite des details, ton) que
 * les metriques statistiques ne captent pas. Il est donc complementaire dans
 * l'ensemble.
 *
 * Confidentialite : le texte est envoye au fournisseur choisi par
 * l'utilisateur, et uniquement a celui-ci. Le detecteur est desactive par
 * defaut et l'interface le rappelle explicitement.
 *
 * Limite : un LLM est lui-meme un juge imparfait et sur-confiant. Son score est
 * donc lisse (jamais 0 % ni 100 %) et sa confiance plafonnee.
 */

import { fetchWithTimeout, withRetry, permanent } from '../util/async.js';
import { AI_PROVIDERS } from '../config.js';
import { clamp } from './base.js';

const PROMPT = `Tu es un expert en detection de texte genere par IA. Analyse le texte ci-dessous.

Reponds UNIQUEMENT par un objet JSON valide, sans texte autour, au format :
{"ai_probability": <nombre entre 0 et 100>, "confidence": <"faible"|"moyenne"|"elevee">, "signals": ["<signal 1>", "<signal 2>", "<signal 3>"], "reasoning": "<2 phrases maximum>"}

Criteres : previsibilite lexicale, regularite du rythme des phrases, absence de details vecus verifiables, tournures d'assistant, uniformite du registre, erreurs humaines absentes.
Sois prudent : un texte formel, academique ou ecrit par un locuteur non natif n'est PAS forcement genere. En cas de doute, reste proche de 50.

TEXTE A ANALYSER :
---
`;

/** Tronque le texte pour respecter les limites de contexte / de cout. */
function sample(text, maxChars = 12000) {
  if (text.length <= maxChars) return text;
  const head = text.slice(0, Math.floor(maxChars * 0.6));
  const tail = text.slice(-Math.floor(maxChars * 0.4));
  return `${head}\n\n[...extrait tronque...]\n\n${tail}`;
}

export const remoteLlmDetector = {
  id: 'remoteLlm',
  label: 'Jugement LLM distant',
  description: 'Second avis semantique demande a un modele de langue (optionnel, necessite une cle d\'API).',
  remote: true,

  isEnabled(settings) {
    return ['anthropic', 'openai_compatible'].includes(settings.aiProvider) && Boolean(settings.aiApiKey);
  },

  async run({ doc, settings, onLog }) {
    const provider = AI_PROVIDERS[settings.aiProvider];
    const payloadText = `${PROMPT}${sample(doc.text)}\n---`;

    const call = async () => {
      const response = settings.aiProvider === 'anthropic'
        ? await callAnthropic(provider, settings, payloadText)
        : await callOpenAiCompatible(provider, settings, payloadText);
      return response;
    };

    const raw = await withRetry(call, {
      retries: 2,
      onRetry: (err, attempt, delay) => onLog?.(`LLM distant : nouvelle tentative ${attempt} dans ${delay} ms (${err.message})`),
    });

    const parsed = parseJson(raw);
    if (!parsed || !Number.isFinite(parsed.ai_probability)) {
      throw new Error('Reponse du modele illisible (JSON attendu).');
    }

    // Lissage : on ramene le verdict vers le centre pour eviter les 0/100
    // categoriques que les LLM produisent trop volontiers.
    const smoothed = clamp(0.5 + (clamp(parsed.ai_probability / 100) - 0.5) * 0.88);
    const confidenceMap = { faible: 0.4, moyenne: 0.62, elevee: 0.8 };

    return {
      id: this.id,
      label: this.label,
      score: smoothed,
      confidence: confidenceMap[String(parsed.confidence).toLowerCase()] ?? 0.55,
      evidence: [
        {
          label: 'Verdict brut du modele',
          value: `${Number(parsed.ai_probability).toFixed(0)} %`,
          score: clamp(parsed.ai_probability / 100),
          direction: parsed.ai_probability > 60 ? 'ai' : parsed.ai_probability < 40 ? 'human' : 'neutral',
          hint: parsed.reasoning ?? '',
        },
        ...(Array.isArray(parsed.signals) ? parsed.signals : []).slice(0, 4).map((s) => ({
          label: 'Signal releve',
          value: String(s).slice(0, 160),
          score: 0.6,
          direction: 'neutral',
          hint: '',
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
      // Necessaire pour appeler l'API depuis un navigateur.
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
  // 401/403/404/422 : inutile de rejouer.
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
