/**
 * Metriques d'information : entropie, surprise (proxy de perplexite),
 * previsibilite locale.
 *
 * Le proxy de perplexite combine trois signaux independants :
 *  1. la surprise moyenne selon une loi de Zipf sur des listes de frequence
 *     embarquees (pas d'appel reseau, pas de modele lourd) ;
 *  2. l'entropie conditionnelle d'un modele n-gramme *appris sur le texte
 *     lui-meme* : un texte genere se predit mieux lui-meme ;
 *  3. la variance de la surprise mot a mot, qui est l'equivalent lexical de la
 *     burstiness (un LLM produit une courbe de surprise lisse).
 *
 * Ce n'est PAS une perplexite de modele de langue reelle. C'est une
 * approximation calculable cote client, documentee comme telle.
 */

import { mean, stdev, cv, entropy, normalizedEntropy, counter, quantile, skewness } from '../core/stats.js';
import { wordSurprisal, inVocabSurprisal } from '../data/word-freq.js';
import { charNgrams, ngrams } from '../core/tokenize.js';

export function entropyFeatures(doc, lang = 'en') {
  const f = {};
  const tokens = doc.lower;
  if (tokens.length < 5) return { features: f, surprisals: [] };

  // 1. Surprise zipfienne
  const surprisals = tokens.map((w) => wordSurprisal(w, lang));
  f['ent.surprisalMean'] = mean(surprisals);
  f['ent.surprisalSd'] = stdev(surprisals);
  f['ent.surprisalCv'] = cv(surprisals);
  f['ent.surprisalSkew'] = skewness(surprisals);
  f['ent.surprisalP10'] = quantile(surprisals, 0.1);
  f['ent.surprisalP50'] = quantile(surprisals, 0.5);
  f['ent.surprisalP90'] = quantile(surprisals, 0.9);
  f['ent.surprisalIqr'] = quantile(surprisals, 0.75) - quantile(surprisals, 0.25);
  f['ent.pseudoPerplexity'] = 2 ** mean(surprisals);
  f['ent.lowSurprisalRatio'] = surprisals.filter((s) => s < 8).length / surprisals.length;
  f['ent.highSurprisalRatio'] = surprisals.filter((s) => s > 16).length / surprisals.length;

  // Surprise restreinte au vocabulaire connu + taux de mots hors vocabulaire.
  // Ces deux signaux separent le "texte previsible" du "texte savant", que la
  // surprise brute confond systematiquement.
  const iv = tokens.map((w) => inVocabSurprisal(w, lang)).filter((v) => v !== null);
  f['ent.oovRate'] = 1 - iv.length / tokens.length;
  f['ent.ivSurprisalMean'] = mean(iv);
  f['ent.ivSurprisalSd'] = stdev(iv);
  f['ent.ivSurprisalCv'] = cv(iv);
  f['ent.ivSurprisalP90'] = quantile(iv, 0.9);
  f['ent.ivLowRatio'] = iv.length ? iv.filter((s) => s < 7).length / iv.length : 0;

  // Burstiness de la surprise : moyenne des ecarts absolus successifs.
  const deltas = [];
  for (let i = 1; i < surprisals.length; i += 1) deltas.push(Math.abs(surprisals[i] - surprisals[i - 1]));
  f['ent.surprisalDeltaMean'] = mean(deltas);
  f['ent.surprisalDeltaSd'] = stdev(deltas);

  // Surprise agregee par phrase : un humain a des phrases inegalement "denses".
  const perSentence = doc.sentences.map((s) => {
    const ws = s.text.toLowerCase().match(/[\p{L}\p{N}'’-]+/gu) ?? [];
    return ws.length ? mean(ws.map((w) => wordSurprisal(w, lang))) : 0;
  }).filter((v) => v > 0);
  f['ent.sentenceSurprisalMean'] = mean(perSentence);
  f['ent.sentenceSurprisalSd'] = stdev(perSentence);
  f['ent.sentenceSurprisalCv'] = cv(perSentence);

  // 2. Auto-predictibilite n-gramme (modele appris sur le texte)
  for (const n of [2, 3]) {
    const cond = conditionalEntropy(tokens, n);
    f[`ent.wordCondEntropy${n}`] = cond;
  }
  f['ent.wordUnigramEntropy'] = entropy(counter(tokens));
  f['ent.wordUnigramEntropyNorm'] = normalizedEntropy(counter(tokens));
  f['ent.selfPredictability'] = f['ent.wordUnigramEntropy'] > 0
    ? 1 - f['ent.wordCondEntropy2'] / f['ent.wordUnigramEntropy'] : 0;

  // 3. Entropie de caracteres a plusieurs ordres
  const canonical = doc.canonical;
  for (const n of [1, 2, 3, 4]) {
    const grams = counter(charNgrams(canonical.slice(0, 60000), n));
    f[`ent.charEntropy${n}`] = entropy(grams);
    f[`ent.charEntropyNorm${n}`] = normalizedEntropy(grams);
  }
  f['ent.charCondEntropy'] = (f['ent.charEntropy3'] || 0) - (f['ent.charEntropy2'] || 0);

  // Diversite des n-grammes de mots : plus elle est faible, plus le texte est previsible.
  for (const n of [2, 3, 4, 5]) {
    const grams = ngrams(tokens, n);
    const uniq = new Set(grams).size;
    f[`ent.ngramDiversity${n}`] = grams.length ? uniq / grams.length : 0;
  }

  return { features: f, surprisals };
}

/**
 * Entropie conditionnelle H(w_n | w_1..w_{n-1}) estimee sur le texte lui-meme.
 * Une valeur basse par rapport a l'entropie unigramme signale un texte tres
 * auto-similaire.
 */
export function conditionalEntropy(tokens, n = 2) {
  if (tokens.length <= n) return 0;
  const contexts = new Map();
  for (let i = 0; i + n <= tokens.length; i += 1) {
    const ctx = tokens.slice(i, i + n - 1).join(' ');
    const next = tokens[i + n - 1];
    if (!contexts.has(ctx)) contexts.set(ctx, new Map());
    const bucket = contexts.get(ctx);
    bucket.set(next, (bucket.get(next) || 0) + 1);
  }
  let total = 0;
  let weighted = 0;
  for (const bucket of contexts.values()) {
    const count = [...bucket.values()].reduce((a, b) => a + b, 0);
    total += count;
    weighted += count * entropy(bucket);
  }
  return total ? weighted / total : 0;
}
