/**
 * Metriques de repetition et de redondance.
 *
 * Deux phenomenes opposes sont mesures :
 *  - la repetition *litterale* (n-grammes repris), plutot signe de texte
 *    genere long ou de copier-coller ;
 *  - la repetition *structurelle* (memes debuts, memes patrons de phrase),
 *    signature forte des LLM.
 *
 * Le ratio de compression gzip sert de mesure globale de redondance : il est
 * calcule via l'API native CompressionStream, sans dependance externe.
 */

import { counter, mean, stdev, entropy } from '../core/stats.js';
import { ngrams, words } from '../core/tokenize.js';

export function repetitionFeatures(doc) {
  const f = {};
  const tokens = doc.lower;
  if (tokens.length < 10) return { features: f };

  for (const n of [2, 3, 4, 5, 6, 8]) {
    const grams = ngrams(tokens, n);
    if (!grams.length) { f[`rep.repeat${n}`] = 0; f[`rep.maxRepeat${n}`] = 0; continue; }
    const freq = counter(grams);
    const repeated = [...freq.values()].filter((c) => c > 1);
    f[`rep.repeat${n}`] = repeated.reduce((a, b) => a + b - 1, 0) / grams.length;
    f[`rep.maxRepeat${n}`] = Math.max(...freq.values()) / grams.length;
    f[`rep.uniqueRatio${n}`] = freq.size / grams.length;
  }

  // Repetition de contenu (hors mots-outils) : mots de plus de 5 lettres.
  const content = tokens.filter((w) => w.length > 5);
  const contentFreq = counter(content);
  f['rep.contentRepeatRate'] = content.length
    ? 1 - contentFreq.size / content.length : 0;
  f['rep.contentTopShare'] = content.length
    ? Math.max(0, ...contentFreq.values()) / content.length : 0;
  f['rep.contentEntropy'] = entropy(contentFreq);

  // Repetition entre phrases : chevauchement lexical moyen de phrases voisines.
  const sentSets = doc.sentences.map((s) => new Set(words(s.text.toLowerCase()).filter((w) => w.length > 3)));
  const overlaps = [];
  for (let i = 1; i < sentSets.length; i += 1) {
    const a = sentSets[i - 1];
    const b = sentSets[i];
    if (!a.size || !b.size) continue;
    let inter = 0;
    for (const w of b) if (a.has(w)) inter += 1;
    overlaps.push(inter / Math.min(a.size, b.size));
  }
  f['rep.adjacentSentenceOverlap'] = mean(overlaps);
  f['rep.adjacentSentenceOverlapSd'] = stdev(overlaps);

  // Chevauchement global toutes paires (echantillonne pour rester lineaire).
  f['rep.globalSentenceOverlap'] = sampledPairwiseOverlap(sentSets);

  // Patrons de phrase : squelette mot-outil / longueur.
  const skeletons = doc.sentences.map((s) => sentenceSkeleton(s.text));
  const skeletonFreq = counter(skeletons);
  f['rep.skeletonDiversity'] = skeletons.length ? skeletonFreq.size / skeletons.length : 0;
  f['rep.skeletonTopShare'] = skeletons.length ? Math.max(0, ...skeletonFreq.values()) / skeletons.length : 0;

  return { features: f };
}

/** Squelette : 4 premiers mots reduits a leur categorie grossiere. */
function sentenceSkeleton(text) {
  return words(text)
    .slice(0, 4)
    .map((w) => {
      const lw = w.toLowerCase();
      if (/^\d+$/.test(lw)) return '#';
      if (lw.length <= 3) return 's';
      if (lw.length <= 6) return 'm';
      return 'L';
    })
    .join('');
}

function sampledPairwiseOverlap(sets, maxPairs = 4000) {
  const n = sets.length;
  if (n < 3) return 0;
  const step = Math.max(1, Math.floor((n * (n - 1)) / 2 / maxPairs));
  let total = 0;
  let count = 0;
  let k = 0;
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      k += 1;
      if (k % step !== 0) continue;
      const a = sets[i];
      const b = sets[j];
      if (!a.size || !b.size) continue;
      let inter = 0;
      for (const w of b) if (a.has(w)) inter += 1;
      total += inter / Math.min(a.size, b.size);
      count += 1;
    }
  }
  return count ? total / count : 0;
}

/**
 * Profil de compression.
 *
 * Le taux de compression brut depend beaucoup de la longueur et de la langue.
 * On le compare donc a une *ligne de base nulle* : le meme texte avec les mots
 * melanges aleatoirement. Le melange detruit la redondance de sequence tout en
 * conservant le vocabulaire et la longueur. Le rapport entre les deux
 * (structuralGain) isole la redondance reellement structurelle, presque
 * independamment de la taille du texte.
 *
 * Utilise l'API native CompressionStream ; renvoie null si indisponible
 * (l'ensemble ignore alors ce signal plutot que de deviner).
 */
export async function compressionProfile(text) {
  try {
    if (typeof CompressionStream === 'undefined') return null;
    const ratio = await gzipRatio(text);
    if (ratio === null) return null;

    const tokens = text.split(/(\s+)/);
    const shuffled = shuffle(tokens.filter((t) => t.trim().length)).join(' ');
    const baseline = await gzipRatio(shuffled);
    if (baseline === null) return { ratio, baseline: null, structuralGain: null };

    return {
      ratio,
      baseline,
      // < 1 : le texte est plus compressible que sa version melangee, donc
      // porteur de redondance de sequence.
      structuralGain: baseline > 0 ? ratio / baseline : null,
    };
  } catch {
    return null;
  }
}

/** Compatibilite : ancien point d'entree ne renvoyant que le taux brut. */
export async function compressionRatio(text) {
  const profile = await compressionProfile(text);
  return profile ? profile.ratio : null;
}

async function gzipRatio(text) {
  const bytes = new TextEncoder().encode(text);
  if (!bytes.length) return null;
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  const compressed = await new Response(stream).arrayBuffer();
  return compressed.byteLength / bytes.length;
}

/** Melange deterministe (graine fixe) : deux analyses du meme texte concordent. */
function shuffle(items) {
  const out = [...items];
  let seed = 20260419;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
