# Métriques calculées

Le vecteur de caractéristiques contient **entre 730 et 950 dimensions** selon la
langue détectée et la longueur du texte. Le compte exact est affiché dans
l'interface (badge « N métriques ») et dans le rapport.

Le mode expert affiche l'intégralité des valeurs, famille par famille.

---

## 1. Lexique et richesse — `lex.*` (≈ 57 métriques)

| Métrique | Description |
|---|---|
| `lex.ttr`, `rootTtr`, `corrTtr`, `logTtr` | Type/Token Ratio et ses variantes normalisées (Guiraud, Carroll, Herdan) |
| `lex.mattr`, `mattr50`, `msttr` | Diversité lexicale sur fenêtre glissante — robuste à la longueur, contrairement au TTR brut |
| `lex.hapaxRatio`, `disLegomenaRatio` | Part des mots employés une ou deux fois |
| `lex.honoreR`, `brunetW`, `yuleK`, `simpsonD`, `maas` | Indices classiques de richesse lexicale |
| `lex.wordLen*` | Moyenne, écart-type, CV, asymétrie, aplatissement, médiane, P90, IQR des longueurs de mots |
| `lex.wordLenBin1..18` | Histogramme complet des longueurs de mots |
| `lex.freqEntropy`, `freqGini`, `zipfSlope` | Forme de la distribution de fréquence du vocabulaire |
| `lex.capitalizedRatio`, `allCapsRatio`, `digitTokenRatio`… | Morphologie de surface |

## 2. Syntaxe et burstiness — `syn.*` (≈ 60 métriques)

Famille la plus discriminante de l'ensemble.

| Métrique | Description |
|---|---|
| `syn.sentLenCv` | **Coefficient de variation des longueurs de phrases.** Signal central : en dessous de 0,30 le rythme est anormalement stable |
| `syn.burstiness` | Coefficient de Goh & Barabási `(σ−μ)/(σ+μ)` ; proche de −1 = régularité mécanique |
| `syn.adjacentDeltaMean/Norm` | Écart de longueur entre phrases consécutives |
| `syn.sentBin0..12` | Histogramme des longueurs de phrases |
| `syn.shortSentRatio`, `fragmentRatio`, `sentLenMin` | Présence de phrases très brèves, rare dans le texte généré |
| `syn.openerDiversity`, `openerEntropy`, `opener2Diversity` | Variété des débuts de phrase |
| `syn.commasPerSentence*`, `multiClauseRatio`, `subordinationRate` | Complexité intra-phrase |
| `syn.paraLenCv`, `paraSentCv`, `paraUniformity` | Régularité des paragraphes |

## 3. Ponctuation et typographie — `punc.*` / `char.*` (≈ 93 métriques)

Une fréquence par signe (37 signes), plus :

- `punc.curlyRatio` — apostrophes et guillemets typographiques vs droits ;
- `punc.emDashPer1k`, `emDashSentenceRatio` — usage du tiret cadratin ;
- `punc.doubleSpace`, `spaceBeforePunct`, `repeatedPunct` — **anomalies de saisie humaine** ;
- `punc.perSentenceCv` — régularité de la ponctuation d'une phrase à l'autre ;
- `char.a` … `char.z`, `char.0` … `char.9` — distribution complète des caractères ;
- `char.entropy`, `accentRatio`, `uppercaseRatio`, `emojiRatio`.

## 4. Information et perplexité — `ent.*` (≈ 40 métriques)

> ⚠️ Ce n'est **pas** une perplexité de modèle de langue réelle. C'est une
> approximation calculable côté client, sans appel réseau ni modèle lourd.

| Métrique | Description |
|---|---|
| `ent.sentenceSurprisalCv`, `sentenceSurprisalSd` | **Variabilité de la densité informationnelle entre phrases.** Signal dominant du détecteur de prévisibilité |
| `ent.ivSurprisalMean/Cv` | Surprise restreinte au vocabulaire connu — neutralise l'effet de registre |
| `ent.oovRate` | Part de mots hors des tables de fréquence embarquées |
| `ent.surprisalMean/Cv/Delta*` | Surprise zipfienne globale et sa dispersion |
| `ent.wordCondEntropy2/3`, `selfPredictability` | Auto-prédictibilité n-gramme (modèle appris sur le texte lui-même) |
| `ent.charEntropy1..4`, `charEntropyNorm1..4` | Entropie de caractères à plusieurs ordres |
| `ent.ngramDiversity2..5` | Diversité des n-grammes de mots |

**Méthode.** La surprise d'un mot est reconstruite depuis son rang dans des
listes de fréquence embarquées (1 854 mots EN, 1 117 mots FR) via la loi de
Zipf : `p(rang) ≈ 1 / (rang^1,07 × H)`. Les mots hors liste reçoivent une
surprise plancher dérivée de leur longueur.

## 5. Répétition et redondance — `rep.*` (≈ 30 métriques)

- `rep.repeat2..8`, `maxRepeat*`, `uniqueRatio*` — reprise de n-grammes ;
- `rep.adjacentSentenceOverlap`, `globalSentenceOverlap` — recouvrement lexical entre phrases ;
- `rep.skeletonDiversity` — diversité des squelettes de phrase ;
- `rep.gzipRatio`, `gzipShuffledRatio`, **`gzipStructuralGain`**.

**Le gain structurel** est le rapport entre la compression du texte et celle du
même texte aux mots mélangés (graine fixe, donc reproductible). Cette ligne de
base nulle neutralise l'effet du vocabulaire et de la longueur, et isole la
redondance réellement structurelle.

## 6. Lisibilité — `read.*` (≈ 17 métriques)

Flesch, Flesch adapté au français (Kandel-Moles), Flesch-Kincaid, Gunning Fog,
SMOG, ARI, Coleman-Liau, LIX, RIX.

Pris isolément ces indices ne disent **rien** sur l'origine d'un texte. C'est
leur **stabilité d'un paragraphe à l'autre** (`read.paragraphFleschCv`) qui est
exploitée.

## 7. Stylométrie — `sty.*` / `fw.*` / `pos.*` (≈ 240 à 380 métriques)

- **`fw.<langue>.<mot>`** — une métrique par mot-outil (207 en anglais, 213 en
  français). C'est la signature stylométrique classique de Mosteller & Wallace :
  quasi inconsciente chez un auteur humain, très régulière chez un LLM.
- `pos.*` — approximation des catégories grammaticales par listes fermées et
  suffixes (déterminants, pronoms, prépositions, conjonctions, auxiliaires,
  adverbes, adjectifs, noms, verbes).
- `sty.paragraphProfileDrift` — **dérive du profil stylométrique entre
  paragraphes consécutifs.** Un humain dérive ; un modèle reste stable.
- `sty.firstPerson`, `secondPerson`, `thirdPerson`, `personRatio`.
- `sty.functionWordEntropy`, `functionWordCoverage` — étendue du répertoire.
- `sty.windowTtrCv` — variabilité de la richesse par fenêtre de 200 mots.

## 8. Marqueurs lexicaux — `mk.*` (≈ 250 métriques)

Une métrique par expression des lexiques embarqués :

| Lexique | Taille | Rôle |
|---|---|---|
| Expressions LLM (`AI_PHRASES`) | 118 EN / 116 FR | Tirent vers l'IA |
| Connecteurs (`TRANSITIONS`) | 26 par langue | Tirent vers l'IA, surtout en tête de phrase |
| Hedging (`HEDGES`) | ~20 par langue | Tirent faiblement vers l'IA |
| Subjectivité (`PERSONAL_MARKERS`) | ~21 par langue | **Tirent vers l'humain** |
| Registre familier (`HUMAN_NOISE`) | ~18 par langue | **Tirent vers l'humain** |

Plus des patrons rhétoriques (`mk.notOnlyButAlso`, `mk.tricolon`,
`mk.rhetoricalQuestion`) et des marqueurs de formatage (`mk.bulletLineRatio`,
`mk.bulletUniformity`, `mk.headingCount`, `mk.boldCount`).

> Ces marqueurs sont **les plus faciles à contourner** et les plus générateurs
> de faux positifs sur les textes académiques et institutionnels. Le détecteur
> correspondant a un score borné (10 %–92 %) et une confiance plafonnée à 75 %.

---

## Ajouter une métrique

1. L'ajouter dans le module `assets/js/features/` de la famille concernée, avec
   un préfixe cohérent (`lex.`, `syn.`, …).
2. Elle apparaît automatiquement dans le vecteur, le mode expert et l'export JSON.
3. Pour qu'elle **pèse** sur un score, la consommer dans un détecteur de
   `assets/js/detectors/` — la simple présence dans le vecteur n'influence rien.
