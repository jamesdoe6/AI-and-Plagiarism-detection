/**
 * Contrat commun a tous les detecteurs.
 *
 * Un detecteur recoit le contexte d'analyse et renvoie :
 *   {
 *     id, label,
 *     score:      probabilite IA estimee dans [0,1]
 *     confidence: fiabilite propre du detecteur dans [0,1]
 *     evidence:   liste d'indices lisibles par un humain
 *     unavailable: true si le detecteur n'a pas pu s'executer
 *   }
 *
 * Pour ajouter un detecteur : creer un module exportant un objet de cette forme
 * et l'enregistrer dans `detectors/ensemble.js` + `config.js` (poids).
 */

import { clamp, ramp } from '../core/stats.js';

export { clamp, ramp };

/**
 * Combine plusieurs sous-signaux ponderes en un score unique.
 * @param {Array<{score:number, weight:number}>} signals
 */
export function combine(signals) {
  const usable = signals.filter((s) => Number.isFinite(s.score) && s.weight > 0);
  if (!usable.length) return 0.5;
  const total = usable.reduce((a, s) => a + s.weight, 0);
  return clamp(usable.reduce((a, s) => a + s.score * s.weight, 0) / total);
}

/** Construit une ligne d'indice affichable. */
export function evidence(label, value, score, hint = '') {
  return {
    label,
    value,
    score,
    direction: score > 0.6 ? 'ai' : score < 0.4 ? 'human' : 'neutral',
    hint,
  };
}

/**
 * Confiance liee a la taille de l'echantillon.
 * En dessous de ~150 mots, aucun detecteur statistique n'est fiable ; les
 * etudes publiees montrent une chute nette de la precision sur les textes
 * courts. On refuse donc d'afficher une confiance elevee.
 */
export function lengthConfidence(wordCount) {
  if (wordCount < 60) return 0.15;
  if (wordCount < 150) return 0.35;
  if (wordCount < 300) return 0.6;
  if (wordCount < 700) return 0.8;
  return 0.95;
}

export function get(features, key, fallback = 0) {
  const value = features[key];
  return Number.isFinite(value) ? value : fallback;
}
