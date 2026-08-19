/**
 * Detecteur 5 — Marqueurs lexicaux de style LLM.
 *
 * Comptage d'expressions sur-representees dans les sorties de modeles alignes
 * (« il est important de noter », « delve into », connecteurs en tete de
 * phrase, hedging systematique), moins les marqueurs d'implication personnelle
 * et de registre familier qui, eux, tirent vers l'humain.
 *
 * Limite forte et assumee : ce detecteur est le plus facile a tromper (il
 * suffit de supprimer quelques expressions) et le plus generateur de faux
 * positifs sur les textes academiques et institutionnels. D'ou un score borne
 * et une confiance plafonnee.
 */

import { combine, evidence, lengthConfidence, ramp, get, clamp } from './base.js';

export const markersDetector = {
  id: 'markers',
  label: 'Marqueurs lexicaux',
  description: 'Expressions, connecteurs et tournures sur-representes dans les productions de LLM.',

  run({ features, doc, markerHits = [] }) {
    const phrasePer1k = get(features, 'mk.aiPhrasePer1k');
    const distinct = get(features, 'mk.aiPhraseDistinct');
    const transitions = get(features, 'mk.transitionPer1k');
    const transOpeners = get(features, 'mk.transitionOpenerRatio');
    const hedges = get(features, 'mk.hedgePer1k');
    const personal = get(features, 'mk.personalPer1k');
    const noise = get(features, 'mk.humanNoisePer1k');
    const tells = get(features, 'mk.assistantTells');
    const notOnly = get(features, 'mk.notOnlyButAlso');
    const tricolon = get(features, 'mk.tricolon');

    const s1 = ramp(phrasePer1k, 0.5, 9);
    const s2 = ramp(distinct, 1, 10);
    const s3 = ramp(transitions, 4, 22);
    const s4 = ramp(transOpeners, 0.05, 0.30);
    const s5 = ramp(hedges, 5, 22);
    const s6 = ramp(personal, 6, 0);          // beaucoup de "je" => humain
    const s7 = ramp(noise, 2.5, 0);           // registre familier => humain
    const s8 = tells > 0 ? 0.95 : 0.5;
    const s9 = ramp((notOnly + tricolon) / Math.max(1, doc.sentenceCount / 10), 0.4, 3);

    const raw = combine([
      { score: s1, weight: 1.5 },
      { score: s2, weight: 1.2 },
      { score: s3, weight: 0.9 },
      { score: s4, weight: 1.1 },
      { score: s5, weight: 0.6 },
      { score: s6, weight: 1.2 },
      { score: s7, weight: 0.9 },
      { score: s8, weight: tells > 0 ? 1.4 : 0.2 },
      { score: s9, weight: 0.7 },
    ]);

    // Score borne : les marqueurs seuls ne doivent jamais suffire a conclure.
    const score = clamp(0.10 + raw * 0.82);

    return {
      id: this.id,
      label: this.label,
      score,
      confidence: Math.min(0.75, lengthConfidence(doc.wordCount)),
      evidence: [
        evidence('Expressions typiques / 1000 mots', phrasePer1k.toFixed(2), s1),
        evidence('Expressions distinctes reperees', String(distinct), s2,
          markerHits.slice(0, 6).map((h) => `« ${h.text} » x${h.count}`).join(', ')),
        evidence('Connecteurs en tete de phrase', `${(transOpeners * 100).toFixed(1)} %`, s4),
        evidence('Marques de subjectivite / 1000 mots', personal.toFixed(2), s6,
          'Recit personnel et opinions explicites tirent vers l\'humain.'),
        evidence('Registre familier / 1000 mots', noise.toFixed(2), s7),
        tells > 0 ? evidence('Formules d\'assistant detectees', String(tells), 0.95,
          'Ex. « en tant que modele de langage », « j\'espere que cela vous aide ».') : null,
      ].filter(Boolean),
    };
  },
};
