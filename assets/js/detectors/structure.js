/**
 * Detecteur 6 — Mise en forme et organisation.
 *
 * Les reponses de chatbots ont une architecture reconnaissable : introduction
 * annoncant le plan, listes a puces de longueur homogene, gras sur les
 * intitules, conclusion recapitulative. Ce detecteur mesure cette "forme de
 * reponse".
 *
 * Limite : un article de blog professionnel ou une documentation technique
 * presente naturellement cette structure. Poids faible dans l'ensemble.
 */

import { combine, evidence, lengthConfidence, ramp, get } from './base.js';

export const structureDetector = {
  id: 'structure',
  label: 'Structure et mise en forme',
  description: 'Listes homogenes, titres, gras, conclusion recapitulative : la « forme de reponse » de chatbot.',

  run({ features, doc }) {
    const bulletRatio = get(features, 'mk.bulletLineRatio');
    const bulletUniform = get(features, 'mk.bulletUniformity');
    const headings = get(features, 'mk.headingCount');
    const bold = get(features, 'mk.boldCount');
    const colonList = get(features, 'mk.colonBeforeList');
    const paraUniform = get(features, 'syn.paraUniformity');
    const imperatives = get(features, 'mk.imperativeOpeners');

    const text = doc.text.toLowerCase();
    const hasConclusion = /(^|\n)\s*(in conclusion|to summarize|in summary|en conclusion|pour conclure|en resume|pour resumer)/i.test(doc.text) ? 1 : 0;
    const hasPlanIntro = /(this article|in this (post|article|guide)|cet article|dans cet article|nous allons voir|we will explore)/i.test(text) ? 1 : 0;

    // Texte en prose continue : l'absence de listes et de titres n'est pas un
    // indice d'humanite, c'est simplement un autre format. On neutralise donc
    // ces signaux au lieu de les compter comme des votes "humain".
    const plainProse = bulletRatio === 0 && headings === 0 && bold === 0;

    const s1 = ramp(bulletRatio, 0.02, 0.30);
    const s2 = bulletRatio > 0.05 ? ramp(bulletUniform, 0.35, 0.80) : 0.5;
    const s3 = ramp(headings, 0, 6);
    const s4 = ramp(bold, 0, 8);
    const s5 = ramp(colonList, 0, 4);
    const s6 = doc.paragraphs.length >= 4 ? ramp(paraUniform, 0.35, 0.85) : 0.5;
    const s7 = hasConclusion ? 0.78 : 0.45;
    const s8 = hasPlanIntro ? 0.70 : 0.48;
    const s9 = ramp(imperatives, 0, 5);

    const score = combine([
      { score: s1, weight: plainProse ? 0.15 : 1.0 },
      { score: s2, weight: plainProse ? 0 : 0.9 },
      { score: s3, weight: plainProse ? 0.1 : 0.7 },
      { score: s4, weight: plainProse ? 0 : 0.6 },
      { score: s5, weight: plainProse ? 0 : 0.6 },
      { score: s6, weight: 1.0 },
      { score: s7, weight: 0.9 },
      { score: s8, weight: 0.6 },
      { score: s9, weight: 0.5 },
    ]);

    return {
      id: this.id,
      label: this.label,
      score,
      confidence: Math.min(0.7, lengthConfidence(doc.wordCount)),
      evidence: [
        evidence('Lignes en liste', `${(bulletRatio * 100).toFixed(1)} %`, s1),
        evidence('Homogeneite des puces', bulletUniform.toFixed(2), s2,
          'Des items de longueur quasi identique sont un signe de generation.'),
        evidence('Paragraphes de taille homogene', paraUniform.toFixed(2), s6),
        evidence('Conclusion recapitulative explicite', hasConclusion ? 'oui' : 'non', s7),
        evidence('Titres / intertitres', String(headings), s3),
      ],
    };
  },
};
