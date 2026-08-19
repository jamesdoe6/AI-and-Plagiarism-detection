/**
 * Stylometrie : signature d'auteur.
 *
 * Chaque mot-outil devient une metrique independante (plusieurs centaines de
 * dimensions), plus une approximation de la distribution des categories
 * grammaticales (POS proxy) obtenue par listes fermees + suffixes.
 *
 * On mesure ensuite la *distance a un profil de reference machine* : les LLM
 * ont des preferences stables (sur-emploi de "the/of/and", de connecteurs,
 * sous-emploi de pronoms de premiere personne).
 */

import { counter, mean, stdev, cv, entropy, normalizedEntropy } from '../core/stats.js';
import { FUNCTION_WORDS, POS_PROXY } from '../data/function-words.js';
import { words } from '../core/tokenize.js';

export function stylometryFeatures(doc, lang = 'en') {
  const f = {};
  const tokens = doc.lower;
  const n = Math.max(1, tokens.length);
  const freq = counter(tokens);

  // --- Frequences individuelles des mots-outils (≈ 200 a 350 metriques) ---
  const list = FUNCTION_WORDS[lang] ?? FUNCTION_WORDS.en;
  let functionTotal = 0;
  const profile = [];
  for (const word of list) {
    const c = freq.get(word) || 0;
    functionTotal += c;
    const rate = (c / n) * 1000;
    f[`fw.${lang}.${word}`] = rate;
    profile.push(rate);
  }
  f['sty.functionWordRatio'] = functionTotal / n;
  f['sty.functionWordEntropy'] = entropy(profile.filter((v) => v > 0));
  f['sty.functionWordCv'] = cv(profile.filter((v) => v > 0));
  f['sty.functionWordCoverage'] = profile.filter((v) => v > 0).length / list.length;

  // --- POS proxy ---
  const pos = POS_PROXY[lang] ?? POS_PROXY.en;
  const posCounts = {
    determiners: 0, pronouns: 0, prepositions: 0, conjunctions: 0,
    auxiliaries: 0, adverbs: 0, adjectives: 0, nouns: 0, verbs: 0, other: 0,
  };
  const sets = {
    determiners: new Set(pos.determiners),
    pronouns: new Set(pos.pronouns),
    prepositions: new Set(pos.prepositions),
    conjunctions: new Set(pos.conjunctions),
    auxiliaries: new Set(pos.auxiliaries),
  };
  for (const token of tokens) {
    let matched = false;
    for (const [key, set] of Object.entries(sets)) {
      if (set.has(token)) { posCounts[key] += 1; matched = true; break; }
    }
    if (matched) continue;
    if (pos.adverbsMarker.test(token)) posCounts.adverbs += 1;
    else if (pos.adjectivesMarker.test(token)) posCounts.adjectives += 1;
    else if (pos.nounsMarker.test(token)) posCounts.nouns += 1;
    else if (pos.verbsMarker.test(token)) posCounts.verbs += 1;
    else posCounts.other += 1;
  }
  for (const [key, count] of Object.entries(posCounts)) f[`pos.${key}`] = count / n;
  f['pos.entropy'] = entropy(Object.values(posCounts));
  f['pos.entropyNorm'] = normalizedEntropy(Object.values(posCounts));
  f['pos.contentFunctionRatio'] = (posCounts.nouns + posCounts.verbs + posCounts.adjectives + posCounts.adverbs)
    / Math.max(1, posCounts.determiners + posCounts.pronouns + posCounts.prepositions + posCounts.conjunctions + posCounts.auxiliaries);
  f['pos.nominalRatio'] = (posCounts.nouns + posCounts.determiners) / n;
  f['pos.verbalRatio'] = (posCounts.verbs + posCounts.auxiliaries) / n;

  // --- Pronoms de personne : marqueur d'implication humaine ---
  const first = lang === 'fr'
    ? ['je', "j'", 'me', 'moi', 'mon', 'ma', 'mes', 'nous', 'notre', 'nos']
    : ['i', 'me', 'my', 'mine', 'myself', 'we', 'us', 'our', 'ours'];
  const second = lang === 'fr' ? ['tu', 'te', 'toi', 'ton', 'ta', 'tes', 'vous', 'votre', 'vos'] : ['you', 'your', 'yours', 'yourself'];
  const third = lang === 'fr' ? ['il', 'elle', 'ils', 'elles', 'on', 'lui', 'leur', 'son', 'sa', 'ses'] : ['he', 'she', 'it', 'they', 'him', 'her', 'them', 'his', 'their', 'its'];
  f['sty.firstPerson'] = countAny(freq, first) / n;
  f['sty.secondPerson'] = countAny(freq, second) / n;
  f['sty.thirdPerson'] = countAny(freq, third) / n;
  f['sty.personRatio'] = f['sty.firstPerson'] / Math.max(1e-6, f['sty.thirdPerson']);

  // --- Regularite stylistique inter-paragraphes ---
  const paraProfiles = doc.paragraphs
    .filter((p) => words(p).length >= 25)
    .map((p) => {
      const pt = words(p.toLowerCase());
      const pf = counter(pt);
      return list.slice(0, 60).map((w) => (pf.get(w) || 0) / pt.length);
    });
  f['sty.paragraphProfileDrift'] = profileDrift(paraProfiles);
  f['sty.paragraphProfileCount'] = paraProfiles.length;

  // --- Variabilite de la richesse selon la fenetre ---
  const windows = chunk(tokens, 200).filter((c) => c.length >= 100);
  const ttrs = windows.map((c) => new Set(c).size / c.length);
  f['sty.windowTtrMean'] = mean(ttrs);
  f['sty.windowTtrSd'] = stdev(ttrs);
  f['sty.windowTtrCv'] = cv(ttrs);
  f['sty.windowCount'] = windows.length;

  return { features: f, posCounts, profile };
}

function countAny(freq, list) {
  let total = 0;
  for (const w of list) total += freq.get(w) || 0;
  return total;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Distance moyenne entre profils stylometriques de paragraphes consecutifs. */
function profileDrift(profiles) {
  if (profiles.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < profiles.length; i += 1) {
    let d = 0;
    for (let j = 0; j < profiles[i].length; j += 1) d += (profiles[i][j] - profiles[i - 1][j]) ** 2;
    total += Math.sqrt(d);
  }
  return total / (profiles.length - 1);
}
