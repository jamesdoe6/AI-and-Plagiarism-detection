# Computed metrics

The feature vector holds **between 730 and 950 dimensions** depending on the detected language and
the text length. The exact count is shown in the interface (the "N metrics" badge) and in the report.

Expert mode displays every value, family by family.

---

## 1. Lexis and richness — `lex.*` (≈ 57 metrics)

| Metric | Description |
|---|---|
| `lex.ttr`, `rootTtr`, `corrTtr`, `logTtr` | Type/Token Ratio and its normalised variants (Guiraud, Carroll, Herdan) |
| `lex.mattr`, `mattr50`, `msttr` | Lexical diversity over a moving window — robust to length, unlike raw TTR |
| `lex.hapaxRatio`, `disLegomenaRatio` | Share of words used once or twice |
| `lex.honoreR`, `brunetW`, `yuleK`, `simpsonD`, `maas` | Classic lexical richness indices |
| `lex.wordLen*` | Mean, standard deviation, CV, skewness, kurtosis, median, P90, IQR of word lengths |
| `lex.wordLenBin1..18` | Full histogram of word lengths |
| `lex.freqEntropy`, `freqGini`, `zipfSlope` | Shape of the vocabulary frequency distribution |
| `lex.capitalizedRatio`, `allCapsRatio`, `digitTokenRatio`… | Surface morphology |

## 2. Syntax and burstiness — `syn.*` (≈ 60 metrics)

The most discriminative family in the ensemble.

| Metric | Description |
|---|---|
| `syn.sentLenCv` | **Coefficient of variation of sentence lengths.** Central signal: below 0.30 the rhythm is abnormally stable |
| `syn.burstiness` | Goh & Barabási coefficient `(σ−μ)/(σ+μ)`; close to −1 means mechanical regularity |
| `syn.adjacentDeltaMean/Norm` | Length gap between consecutive sentences |
| `syn.sentBin0..12` | Histogram of sentence lengths |
| `syn.shortSentRatio`, `fragmentRatio`, `sentLenMin` | Presence of very short sentences, rare in generated text |
| `syn.openerDiversity`, `openerEntropy`, `opener2Diversity` | Variety of sentence openings |
| `syn.commasPerSentence*`, `multiClauseRatio`, `subordinationRate` | Intra-sentence complexity |
| `syn.paraLenCv`, `paraSentCv`, `paraUniformity` | Paragraph regularity |

## 3. Punctuation and typography — `punc.*` / `char.*` (≈ 93 metrics)

One frequency per mark (37 marks), plus:

- `punc.curlyRatio` — typographic vs straight apostrophes and quotes;
- `punc.emDashPer1k`, `emDashSentenceRatio` — em-dash usage;
- `punc.doubleSpace`, `spaceBeforePunct`, `repeatedPunct` — **human typing anomalies**;
- `punc.perSentenceCv` — punctuation regularity from one sentence to the next;
- `char.a` … `char.z`, `char.0` … `char.9` — full character distribution;
- `char.entropy`, `accentRatio`, `uppercaseRatio`, `emojiRatio`.

## 4. Information and perplexity — `ent.*` (≈ 40 metrics)

> ⚠️ This is **not** a real language-model perplexity. It is an approximation computable
> client-side, with no network call and no heavy model.

| Metric | Description |
|---|---|
| `ent.sentenceSurprisalCv`, `sentenceSurprisalSd` | **Variability of information density between sentences.** Dominant signal of the predictability detector |
| `ent.ivSurprisalMean/Cv` | Surprisal restricted to known vocabulary — neutralises the register effect |
| `ent.oovRate` | Share of words outside the bundled frequency tables |
| `ent.surprisalMean/Cv/Delta*` | Global Zipfian surprisal and its dispersion |
| `ent.wordCondEntropy2/3`, `selfPredictability` | N-gram self-predictability (model learned from the text itself) |
| `ent.charEntropy1..4`, `charEntropyNorm1..4` | Character entropy at several orders |
| `ent.ngramDiversity2..5` | Diversity of word n-grams |

**Method.** A word's surprisal is reconstructed from its rank in bundled frequency lists
(1,854 English words, 1,117 French) via Zipf's law: `p(rank) ≈ 1 / (rank^1.07 × H)`. Out-of-list
words receive a floor surprisal derived from their length.

**Why in-vocabulary surprisal exists.** Raw surprisal conflates "predictable text" with "learned
text", because a word absent from the table scores high purely for being long. Separating known
words (where the choice between frequent and less-frequent words is genuinely measured) from the
out-of-vocabulary rate largely neutralises the register effect.

## 5. Repetition and redundancy — `rep.*` (≈ 30 metrics)

- `rep.repeat2..8`, `maxRepeat*`, `uniqueRatio*` — n-gram reuse;
- `rep.adjacentSentenceOverlap`, `globalSentenceOverlap` — lexical overlap between sentences;
- `rep.skeletonDiversity` — diversity of sentence skeletons;
- `rep.gzipRatio`, `gzipShuffledRatio`, **`gzipStructuralGain`**.

**The structural gain** is the ratio between the text's compression and that of the same text with
its words shuffled (fixed seed, therefore reproducible). This null baseline neutralises the effect
of vocabulary and length, and isolates genuinely structural redundancy.

## 6. Readability — `read.*` (≈ 17 metrics)

Flesch, Flesch adapted to French (Kandel-Moles), Flesch-Kincaid, Gunning Fog, SMOG, ARI,
Coleman-Liau, LIX, RIX.

Taken alone these indices say **nothing** about a text's origin. What is exploited is their
**stability from one paragraph to the next** (`read.paragraphFleschCv`).

## 7. Stylometry — `sty.*` / `fw.*` / `pos.*` (≈ 240 to 380 metrics)

- **`fw.<lang>.<word>`** — one metric per function word (207 in English, 213 in French). This is
  the classic Mosteller & Wallace stylometric signature: near-unconscious in a human author, very
  regular in an LLM.
- `pos.*` — part-of-speech approximation via closed lists and suffixes (determiners, pronouns,
  prepositions, conjunctions, auxiliaries, adverbs, adjectives, nouns, verbs).
- `sty.paragraphProfileDrift` — **drift of the stylometric profile between consecutive paragraphs.**
  A human drifts; a model stays stable.
- `sty.firstPerson`, `secondPerson`, `thirdPerson`, `personRatio`.
- `sty.functionWordEntropy`, `functionWordCoverage` — breadth of the repertoire.
- `sty.windowTtrCv` — richness variability per 200-word window.

## 8. Lexical markers — `mk.*` (≈ 250 metrics)

One metric per entry in the bundled lexicons:

| Lexicon | Size | Role |
|---|---|---|
| LLM phrases (`AI_PHRASES`) | 118 EN / 116 FR | Pull towards AI |
| Connectives (`TRANSITIONS`) | 26 per language | Pull towards AI, especially sentence-initial |
| Hedging (`HEDGES`) | ~20 per language | Pull weakly towards AI |
| Subjectivity (`PERSONAL_MARKERS`) | ~21 per language | **Pull towards human** |
| Informal register (`HUMAN_NOISE`) | ~18 per language | **Pull towards human** |

Plus rhetorical patterns (`mk.notOnlyButAlso`, `mk.tricolon`, `mk.rhetoricalQuestion`) and
formatting markers (`mk.bulletLineRatio`, `mk.bulletUniformity`, `mk.headingCount`, `mk.boldCount`).

> These markers are **the easiest to defeat** and the biggest producers of false positives on
> academic and institutional writing. The corresponding detector has a bounded score (10 %–92 %) and
> a confidence capped at 75 %.

---

## A note on calibration

Metrics that separate the reference samples are not automatically good signals. A scan of all 768
metrics showed that most of the strongest separators (word length, readability, adjective density)
were tracking **register**, not **origin** — calibrating on them would have produced a formality
detector, which is exactly the documented false-positive failure mode.

The detectors therefore lean on the theory-backed signals only: rhythm regularity, variability of
information density, stylometric drift. The register-correlated metrics remain in the vector, are
visible in expert mode, and feed the **formality index** — which warns the user rather than moving
the score.

---

## Adding a metric

1. Add it to the relevant `assets/js/features/` module, with a consistent prefix
   (`lex.`, `syn.`, …).
2. It appears automatically in the vector, in expert mode and in the JSON export.
3. For it to **weigh** on a score, consume it in a `assets/js/detectors/` module — mere presence in
   the vector influences nothing.
