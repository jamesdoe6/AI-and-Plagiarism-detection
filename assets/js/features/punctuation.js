/**
 * Punctuation and typography metrics.
 *
 * An often underrated signal: LLMs use curly quotes, em dashes and semicolons
 * with a regularity few humans reproduce at a keyboard. Conversely, double
 * spaces, ellipses improvised as "..." and straight quotes betray human typing.
 */

import { mean, stdev, entropy, counter } from '../core/stats.js';

const MARKS = {
  period: /\./g,
  comma: /,/g,
  semicolon: /;/g,
  colon: /:/g,
  question: /\?/g,
  exclamation: /!/g,
  emDash: /—/g,
  enDash: /–/g,
  hyphen: /(?<=\w)-(?=\w)/g,
  spacedHyphen: / - /g,
  ellipsisChar: /…/g,
  ellipsisDots: /\.\.\./g,
  curlyApostrophe: /’/g,
  straightApostrophe: /'/g,
  curlyQuoteOpen: /“/g,
  curlyQuoteClose: /”/g,
  guillemets: /[«»]/g,
  straightQuote: /"/g,
  parenOpen: /\(/g,
  bracket: /\[/g,
  brace: /\{/g,
  slash: /\//g,
  ampersand: /&/g,
  asterisk: /\*/g,
  percent: /%/g,
  hash: /#/g,
  at: /@/g,
  plus: /\+/g,
  equals: /=/g,
  pipe: /\|/g,
  backtick: /`/g,
  underscore: /_/g,
  tilde: /~/g,
  degree: /°/g,
  euro: /€/g,
  dollar: /\$/g,
};

export function punctuationFeatures(doc) {
  const f = {};
  const text = doc.text;
  const chars = Math.max(1, text.length);
  const wordsCount = Math.max(1, doc.wordCount);

  let totalPunct = 0;
  const counts = new Map();
  for (const [name, re] of Object.entries(MARKS)) {
    const n = (text.match(re) ?? []).length;
    counts.set(name, n);
    totalPunct += n;
    f[`punc.${name}Per1k`] = (n / wordsCount) * 1000;
  }

  f['punc.totalPer1k'] = (totalPunct / wordsCount) * 1000;
  f['punc.density'] = totalPunct / chars;
  f['punc.diversity'] = [...counts.values()].filter((c) => c > 0).length / counts.size;
  f['punc.entropy'] = entropy([...counts.values()]);

  // "Clean" typography vs human typing.
  const curly = counts.get('curlyApostrophe') + counts.get('curlyQuoteOpen') + counts.get('curlyQuoteClose');
  const straight = counts.get('straightApostrophe') + counts.get('straightQuote');
  f['punc.curlyRatio'] = curly + straight ? curly / (curly + straight) : 0;
  f['punc.emDashPer1k'] = (counts.get('emDash') / wordsCount) * 1000;
  f['punc.emDashSentenceRatio'] = doc.sentences.length
    ? doc.sentences.filter((s) => s.text.includes('—')).length / doc.sentences.length : 0;
  f['punc.semicolonSentenceRatio'] = doc.sentences.length
    ? doc.sentences.filter((s) => s.text.includes(';')).length / doc.sentences.length : 0;

  // Human typing anomalies.
  f['punc.doubleSpace'] = ((text.match(/ {2}/g) ?? []).length / wordsCount) * 1000;
  f['punc.spaceBeforePunct'] = ((text.match(/ [,.;:!?]/g) ?? []).length / wordsCount) * 1000;
  f['punc.missingSpaceAfterPunct'] = ((text.match(/[,.;:][A-Za-zÀ-ÿ]/g) ?? []).length / wordsCount) * 1000;
  f['punc.repeatedPunct'] = ((text.match(/([!?])\1+/g) ?? []).length / wordsCount) * 1000;
  f['punc.trailingSpaceLines'] = (text.split('\n').filter((l) => / $/.test(l)).length) / Math.max(1, text.split('\n').length);

  // Punctuation regularity from one sentence to the next.
  const perSentence = doc.sentences.map((s) => (s.text.match(/[,;:()—–]/g) ?? []).length);
  f['punc.perSentenceMean'] = mean(perSentence);
  f['punc.perSentenceSd'] = stdev(perSentence);
  f['punc.perSentenceCv'] = mean(perSentence) ? stdev(perSentence) / mean(perSentence) : 0;

  // Character distribution (alphabet + digits): 40 metrics.
  const lower = text.toLowerCase();
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const letterCounts = counter([...lower].filter((c) => alphabet.includes(c)));
  const totalLetters = Math.max(1, [...letterCounts.values()].reduce((a, b) => a + b, 0));
  for (const ch of alphabet) f[`char.${ch}`] = (letterCounts.get(ch) || 0) / totalLetters;
  f['char.entropy'] = entropy(letterCounts);
  f['char.accentRatio'] = ([...lower].filter((c) => /[à-ÿœ]/.test(c)).length) / chars;
  f['char.uppercaseRatio'] = ([...text].filter((c) => /[A-ZÀ-Þ]/.test(c)).length) / chars;
  f['char.digitRatio'] = ([...text].filter((c) => /\d/.test(c)).length) / chars;
  f['char.whitespaceRatio'] = ([...text].filter((c) => /\s/.test(c)).length) / chars;
  f['char.emojiRatio'] = ((text.match(/\p{Extended_Pictographic}/gu) ?? []).length / chars);

  return { features: f };
}
