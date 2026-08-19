/**
 * Detecteur 10 (optionnel) — Classifieur distant (Hugging Face Inference).
 *
 * Permet de brancher un vrai classifieur entraine "humain vs machine"
 * (roberta-base-openai-detector, Hello-SimpleAI/chatgpt-detector-roberta,
 * desklib/ai-text-detector, etc.). Le texte est decoupe en morceaux compatibles
 * avec la fenetre du modele (~512 tokens) puis les scores sont agreges.
 *
 * Limite : ces modeles publics sont entraines sur des generations anciennes ;
 * leur performance chute sur les modeles recents et sur le texte paraphrase.
 * Ils restent utiles comme *voix supplementaire* de l'ensemble, pas comme
 * verdict.
 */

import { fetchWithTimeout, withRetry, permanent, pool } from '../util/async.js';
import { AI_PROVIDERS } from '../config.js';
import { clamp } from './base.js';
import { mean, stdev } from '../core/stats.js';

const CHUNK_CHARS = 1400;
const MAX_CHUNKS = 8;

export const remoteClassifierDetector = {
  id: 'remoteClassifier',
  label: 'Classifieur distant',
  description: 'Modele de classification humain / IA heberge (Hugging Face Inference API).',
  remote: true,

  isEnabled(settings) {
    return settings.aiProvider === 'huggingface' && Boolean(settings.aiApiKey);
  },

  async run({ doc, settings, onLog }) {
    const provider = AI_PROVIDERS.huggingface;
    const model = settings.aiModel || provider.defaultModel;
    const url = `${provider.endpoint}${model}`;

    const chunks = splitChunks(doc.text, CHUNK_CHARS).slice(0, MAX_CHUNKS);
    if (!chunks.length) throw new Error('Texte trop court pour le classifieur.');

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

        if (response.status === 503) throw new Error('Modele en cours de chargement');
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
        onRetry: (err, attempt, delay) => onLog?.(`Classifieur : tentative ${attempt} dans ${delay} ms (${err.message})`),
      });
    }, 2);

    const scores = results
      .map((r) => extractAiScore(r))
      .filter((v) => Number.isFinite(v));

    if (!scores.length) throw new Error('Aucun score exploitable renvoye par le modele.');

    const avg = mean(scores);
    const dispersion = stdev(scores);

    return {
      id: this.id,
      label: `${this.label} (${model})`,
      score: clamp(avg),
      // Une forte dispersion entre segments = texte mixte ou modele indecis.
      confidence: clamp(0.75 - dispersion, 0.25, 0.85) * (scores.length >= 3 ? 1 : 0.7),
      evidence: [
        {
          label: 'Score moyen du classifieur',
          value: `${(avg * 100).toFixed(1)} %`,
          score: clamp(avg),
          direction: avg > 0.6 ? 'ai' : avg < 0.4 ? 'human' : 'neutral',
          hint: `${scores.length} segments analyses.`,
        },
        {
          label: 'Dispersion entre segments',
          value: dispersion.toFixed(3),
          score: 0.5,
          direction: 'neutral',
          hint: dispersion > 0.25 ? 'Segments heterogenes : texte possiblement mixte humain + IA.' : 'Segments homogenes.',
        },
      ],
      segmentScores: scores,
    };
  },
};

/** Decoupe sur les frontieres de phrase pour ne pas casser le contexte. */
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
 * Normalise les formats de sortie heterogenes des modeles HF.
 * Les libelles varient : LABEL_0/LABEL_1, Fake/Real, AI/Human, machine/human.
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
