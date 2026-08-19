# Known limitations

This document is not boilerplate. It describes what the tool **cannot** do, because a score
displayed without its limits becomes an item of evidence.

---

## 1. What the AI score actually measures

The score is not a probability in the statistical sense. It is an **aggregation of regularity
indicators**: how predictable the text is, how uniformly it is paced, how stylistically stable, and
how sparse in markers of subjectivity.

A text can show all of these without having been generated:

- an essay written to an imposed plan;
- an administrative or legal document in a deliberately neutral style;
- writing by a non-native speaker, drawing on a narrower lexical and syntactic repertoire;
- a translation, especially machine-translated and then edited;
- standardised technical documentation.

**This is the primary source of false positives, and it is concentrated on identifiable groups.**
It is the central methodological criticism levelled at commercial detectors.

To make the risk visible rather than hide it, the interface computes a **formality index** and
displays an explicit warning when a high score coincides with a highly formal register.

## 2. What the AI score does not catch

- **Generated text that was then edited.** A few minutes of human rewriting is enough to
  reintroduce rhythmic variability and break the lexical markers.
- **Paraphrased text** run through a rewriting tool.
- **Mixed text**, human + AI: the score averages the two regimes and lands in the 40–60 % band,
  the least informative one.
- **Recent models** deliberately producing less uniform text (high temperature, style instructions,
  author imitation).

A low score therefore proves nothing.

## 3. Realistic accuracy

Published work puts the best detectors at around **80–90 % accuracy on raw, unedited text**, with a
marked drop as soon as the text is edited, paraphrased, translated or mixed.

This tool uses **no locally trained model**: its heuristic detectors are, by construction, below
that ceiling. They are built to be **explainable and cautious**, not to maximise a detection rate.

The optional remote detector (Hugging Face) lets you plug in a genuinely trained classifier, but the
available public models were trained on older generations and degrade sharply on recent ones.

## 4. Acknowledged uncertainty band

| Score | Reading |
|---|---|
| < 30 % | Rather human signature |
| 30–55 % | Undetermined |
| 55–70 % | Mixed signals |
| 70–85 % | Likely generated or heavily assisted |
| ≥ 85 % | Signature strongly consistent with AI |

The default alert threshold is **85 %**, adjustable between 55 and 95 %. Lowering it mechanically
multiplies false positives. Changing it moves the entire scale, so the displayed bands always match
the threshold actually in force.

**The 55–85 % range is where detectors go wrong most often.** The interface says so explicitly when
a score lands there.

## 5. Hard-coded safeguards

- Texts under **40 words**: not scored at all.
- Below **300 words**: confidence capped, warning displayed.
- **Detector disagreement**: the score is pulled back towards 50 % in proportion to the spread.
  Uncertainty is displayed, not hidden.
- **Unsupported language** (neither French nor English): linguistic resources do not apply, the
  score is contracted towards 50 % and confidence reduced by 30 %.
- **Soft ramps**: no single metric can produce a 0 % or 100 % vote. The extremes are ~6 % and ~94 %.
- A detector short of material (compression below 600 words) **abstains** rather than voting at random.

## 6. Limitations of the plagiarism score

- It measures **lexical overlap**, not misconduct. A properly attributed quotation counts as
  overlap: only a human reading can tell the difference.
- Coverage never exceeds 100 %: intervals are merged and weighted by similarity, so a passage found
  on five sites counts once.
- **Search only covers the web indexed** by the configured engine, and only within the query budget
  (24 by default). The absence of a match does not mean the absence of a source.
- Paywalled content, closed academic databases, unpublished student work and unindexed PDFs are
  **out of reach**.
- Without a page-extraction service, comparison is limited to the few lines the engine returns:
  scores are then less reliable, and the interface says so ("compared against search snippet only").
- **Paraphrase** is partially caught (3-gram containment and longest common subsequence over content
  words), but a deep rewrite escapes any lexical approach.

## 7. Privacy

- Local AI analysis and local-source comparison **never leave the browser**.
- Web search sends **11-word extracts** of your text to the configured engine.
- The page-extraction service receives **candidate URLs**, not your text.
- The remote AI detector, if enabled, receives **the full text** (truncated to 12,000 characters).
  It is off by default and the interface says so.
- API keys are stored in the browser's `localStorage`.

## 8. Responsible use

**No decision about a person — a grade, a sanction, a hire, a publication — should rest on these
scores.**

They exist to *direct* a human review:

1. read the text;
2. look at the indicators displayed, not just the percentage;
3. check the flagged sources one by one, following the links;
4. talk to the person concerned before drawing any conclusion.

A detection tool does not replace that work. It only frames it.
