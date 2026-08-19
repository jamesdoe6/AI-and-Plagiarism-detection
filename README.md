# AI-Plagiarism-Detector

Détecteur de texte généré par IA **et** de plagiat, entièrement côté client.
Interface en verre dépoli (*glass skin*), analyse locale, API externes
optionnelles.

> **Les scores produits sont des estimations statistiques, pas des preuves.**
> Ils n'ont aucune valeur juridique ni disciplinaire. Lisez
> [`docs/LIMITATIONS.md`](docs/LIMITATIONS.md) avant tout usage réel.

---

## Démarrer

Aucune installation, aucune dépendance, aucune étape de build.

```bash
git clone https://github.com/jamesdoe6/AI-and-Plagiarism-detection.git
cd AI-and-Plagiarism-detection
npm start          # ou : python3 -m http.server 4173
```

Puis ouvrez <http://localhost:4173>.

> Un serveur est nécessaire : l'application utilise des modules ES, que les
> navigateurs refusent de charger via `file://`. N'importe quel hébergement
> statique convient (GitHub Pages, Netlify, un dossier derrière nginx…).

```bash
npm test           # tests de non-régression (Node ≥ 20)
```

## Ce que ça fait

### Détection d'IA — hors ligne, sans modèle à télécharger

- **730 à 950 métriques** par analyse : richesse lexicale, rythme des phrases,
  ponctuation, entropie, répétition, lisibilité, stylométrie (une dimension par
  mot-outil), marqueurs lexicaux.
- **8 détecteurs indépendants** combinés en ensemble pondéré par fiabilité.
- Score 0–100 %, **niveau de confiance**, et une explication en langage clair de
  ce qui a produit ce score.
- **Mode expert** : toutes les métriques, tous les indices intermédiaires, tous
  les résultats par détecteur.
- Deux détecteurs distants optionnels (jugement LLM, classifieur Hugging Face).

### Détection de plagiat

- Segmentation en passages avec recouvrement, sélection des plus distinctifs,
  répartis sur toute la longueur du document.
- Requêtes exactes sur le moteur configuré (Google CSE, Serper, Brave, Bing, ou
  votre propre endpoint).
- Téléchargement des pages candidates et comparaison fine : shingles,
  containment, cosinus pondéré, plus longue sous-séquence commune sur les mots
  de contenu.
- Tableau des sources avec URL cliquable, titre, extrait comparable et score de
  similarité ; score global = part du texte couverte, pondérée par la similarité.
- **Mode hors ligne** : comparaison à des documents de référence que vous collez
  vous-même, sans aucune API.

### Entrées

`.txt` · `.md` · `.rtf` · `.html` · `.csv` · `.docx` · `.odt` · `.pdf`
ou collage direct. Limites : 25 Mo, 100 000 mots.

DOCX et ODT sont lus **sans aucune bibliothèque** (lecture ZIP + API native
`DecompressionStream`). Les PDF passent par pdf.js chargé à la demande, avec un
extracteur de secours interne si le CDN est injoignable.

### Sorties

Rapport HTML autonome (imprimable en PDF), export JSON des données brutes.
Les deux embarquent l'intégralité des avertissements méthodologiques.

## Les 8 détecteurs

| Détecteur | Mesure | Poids |
|---|---|---|
| **Prévisibilité** | Variabilité de la densité informationnelle entre phrases, surprise lexicale | 1,35 |
| **Burstiness** | Dispersion des longueurs de phrases, régularité des paragraphes | 1,25 |
| **Marqueurs lexicaux** | Expressions et connecteurs sur-représentés dans les sorties de LLM | 1,15 |
| **Uniformité stylométrique** | Stabilité de la signature mots-outils le long du texte | 1,00 |
| **Patrons syntaxiques** | Réutilisation de moules de phrase et de séquences de mots-outils | 0,95 |
| **Richesse lexicale** | Position dans la bande de diversité typique des modèles | 0,90 |
| **Redondance** | Gain de compression structurel, reprise de n-grammes (≥ 600 mots) | 0,85 |
| **Structure** | Listes homogènes, titres, conclusion récapitulative | 0,80 |
| *Jugement LLM distant* | Second avis sémantique (optionnel) | 1,60 |
| *Classifieur distant* | Modèle entraîné humain/IA (optionnel) | 1,50 |

Les signaux sont volontairement **orthogonaux** : c'est ce qui donne son intérêt
à l'ensemble. Détail dans [`docs/METRICS.md`](docs/METRICS.md).

## Prudence intégrée

Ce ne sont pas des options, ce sont des garde-fous :

- moins de 40 mots → **aucun score n'est produit** ;
- moins de 300 mots → confiance plafonnée, avertissement affiché ;
- désaccord entre détecteurs → le score est **ramené vers 50 %** ;
- langue non supportée → score contracté, confiance réduite ;
- rampes douces → aucune métrique isolée ne vote 0 % ou 100 % ;
- détecteur sans matière suffisante → **il s'abstient** au lieu de deviner ;
- seuil d'alerte à 85 % par défaut, jamais 30 % ;
- correspondance trouvée sur plus de 6 domaines → traitée comme une expression
  courante, pas comme un emprunt.

## Architecture

```
index.html
assets/css/     base.css (tokens) · glass.css (surfaces) · components.css
assets/js/
  config.js               seuils, poids, fournisseurs — tout le réglable
  core/                   tokenize · stats · language
  data/                   mots-outils · marqueurs · tables de fréquence
  features/               8 extracteurs → vecteur de ~800 dimensions
  detectors/              8 détecteurs locaux + 2 distants + ensemble
  plagiarism/             segmenter · similarity · providers · fetcher · engine
  io/                     file-parsers · docx · pdf · report
  ui/                     settings · render · disclaimers
  app.js                  contrôleur
docs/                     METRICS · LIMITATIONS · API-SETUP
tests/                    échantillons de calibration + non-régression
```

### Étendre

- **Ajouter une métrique** → un module de `features/`, préfixe cohérent. Elle
  apparaît automatiquement en mode expert et dans l'export JSON.
- **Ajouter un détecteur** → un module exportant `{ id, label, description,
  run(ctx) }`, à enregistrer dans `detectors/ensemble.js` et `DETECTOR_WEIGHTS`.
- **Ajouter un moteur de recherche** → une fonction dans
  `plagiarism/providers.js` renvoyant `[{url, title, snippet}]`.
- **Réglages** (seuils, poids, budgets) → tous centralisés dans `config.js`.

## Configuration

Tout est optionnel — l'analyse IA fonctionne sans rien configurer.
Voir [`docs/API-SETUP.md`](docs/API-SETUP.md) pour la recherche web et les
détecteurs distants.

Les clés d'API restent dans le `localStorage` du navigateur et ne sont
transmises qu'au fournisseur sélectionné.

## Compatibilité

Chrome/Edge 111+, Firefox 113+, Safari 16.4+.
Requiert `CompressionStream`, `DecompressionStream`, `color-mix()` et les
modules ES. `backdrop-filter` a un repli propre si absent.

## Licence

MIT — voir [`LICENSE`](LICENSE).
