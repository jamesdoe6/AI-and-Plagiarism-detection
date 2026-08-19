/**
 * Segmentation du texte en passages interrogeables.
 *
 * Strategie : fenetres glissantes de ~42 mots avec recouvrement, alignees sur
 * les frontieres de phrases quand c'est possible, afin que chaque requete
 * envoyee au moteur de recherche corresponde a une unite de sens.
 *
 * Chaque passage recoit un score de "distinctivite" : plus un passage contient
 * de mots rares et de sequences peu banales, plus il est utile a interroger.
 * Interroger « il est important de noter que » ne produit que du bruit ; c'est
 * la premiere source de faux positifs d'un detecteur de plagiat.
 */

import { PLAGIARISM } from '../config.js';
import { sentences, words, canonicalize, ngrams } from '../core/tokenize.js';
import { rankMap } from '../data/word-freq.js';
import { detectLanguage } from '../core/language.js';

/**
 * @param {string} text
 * @param {{passageWords?:number, overlap?:number}} [options]
 * @returns {Array<{id:number,text:string,start:number,end:number,wordCount:number,distinctiveness:number}>}
 */
export function segmentText(text, options = {}) {
  const size = options.passageWords ?? PLAGIARISM.passageWords;
  const overlap = options.overlap ?? PLAGIARISM.passageOverlap;
  const step = Math.max(8, size - overlap);

  const sents = sentences(text);
  if (!sents.length) return [];

  const lang = detectLanguage(text).lang;
  const ranks = rankMap(lang);

  // Construction de fenetres alignees sur les phrases.
  const passages = [];
  let cursor = 0;
  while (cursor < sents.length) {
    let wordCount = 0;
    let end = cursor;
    while (end < sents.length && wordCount < size) {
      wordCount += words(sents[end].text).length;
      end += 1;
    }
    const slice = sents.slice(cursor, end);
    if (!slice.length) break;

    const start = slice[0].start;
    const stop = slice[slice.length - 1].end;
    const passageText = text.slice(start, stop).trim();

    if (words(passageText).length >= 12) {
      passages.push({
        id: passages.length,
        text: passageText,
        start,
        end: stop,
        wordCount: words(passageText).length,
        sentenceRange: [slice[0].index, slice[slice.length - 1].index],
      });
    }

    // Avance d'au moins une phrase, en visant le pas demande.
    let advanced = 0;
    let next = cursor;
    while (next < sents.length && advanced < step) {
      advanced += words(sents[next].text).length;
      next += 1;
    }
    cursor = Math.max(cursor + 1, next - (overlap > 0 ? 1 : 0));
  }

  for (const passage of passages) {
    passage.distinctiveness = distinctiveness(passage.text, ranks);
    passage.query = buildQuery(passage.text);
  }

  return passages;
}

/**
 * Score de distinctivite dans [0,1].
 * Combine la rarete moyenne des mots et l'originalite des 4-grammes.
 */
export function distinctiveness(text, ranks) {
  const tokens = canonicalize(text).split(' ').filter(Boolean);
  if (tokens.length < 8) return 0;

  let rareScore = 0;
  let named = 0;
  for (const token of tokens) {
    const rank = ranks.get(token);
    if (!rank) rareScore += 1;
    else if (rank > 900) rareScore += 0.55;
    else if (rank > 300) rareScore += 0.2;
  }
  const rarity = rareScore / tokens.length;

  // Entites nommees approximees : majuscules en milieu de phrase, chiffres.
  named = (text.match(/(?<!^)(?<![.!?]\s)\b[A-ZÀ-Þ][a-zà-ÿ]{2,}/g) ?? []).length;
  const digits = (text.match(/\b\d[\d.,%-]*\b/g) ?? []).length;

  const uniqueness = new Set(ngrams(tokens, 4)).size / Math.max(1, tokens.length - 3);

  return Math.min(1,
    rarity * 1.15
    + Math.min(0.25, named / Math.max(8, tokens.length) * 2)
    + Math.min(0.15, digits / Math.max(8, tokens.length) * 3)
    + uniqueness * 0.15);
}

/**
 * Construit une requete exacte pour le moteur de recherche.
 * On conserve une sous-chaine continue de 8 a 12 mots — assez longue pour etre
 * discriminante, assez courte pour que les moteurs la traitent correctement.
 */
export function buildQuery(text, maxWords = 11) {
  const cleaned = text
    .replace(/\s+/g, ' ')
    .replace(/["“”«»]/g, '')
    .trim();
  const tokens = cleaned.split(' ');
  if (tokens.length <= maxWords) return `"${cleaned}"`;

  // Fenetre la plus "dense" en mots longs : evite de tomber sur une suite de
  // mots-outils qui ramenerait des millions de resultats non pertinents.
  let bestStart = 0;
  let bestScore = -1;
  for (let i = 0; i + maxWords <= tokens.length; i += 1) {
    const window = tokens.slice(i, i + maxWords);
    const score = window.reduce((a, w) => a + Math.min(12, w.length), 0);
    if (score > bestScore) { bestScore = score; bestStart = i; }
  }
  return `"${tokens.slice(bestStart, bestStart + maxWords).join(' ')}"`;
}

/**
 * Selectionne les passages a interroger dans la limite du budget de requetes.
 * On repartit les requetes sur toute la longueur du document plutot que de les
 * concentrer sur les passages les plus distinctifs, sinon un document dont
 * seule la fin est copiee passe inapercu.
 */
export function selectPassages(passages, budget) {
  if (passages.length <= budget) return [...passages];

  const buckets = Math.min(budget, Math.max(1, Math.ceil(budget / 2)));
  const perBucket = Math.ceil(passages.length / buckets);
  const selected = [];

  for (let b = 0; b < buckets; b += 1) {
    const slice = passages.slice(b * perBucket, (b + 1) * perBucket);
    if (!slice.length) continue;
    const sorted = [...slice].sort((a, b2) => b2.distinctiveness - a.distinctiveness);
    const take = Math.max(1, Math.round((budget / passages.length) * slice.length));
    selected.push(...sorted.slice(0, take));
  }

  return selected
    .sort((a, b) => b.distinctiveness - a.distinctiveness)
    .slice(0, budget)
    .sort((a, b) => a.start - b.start);
}
