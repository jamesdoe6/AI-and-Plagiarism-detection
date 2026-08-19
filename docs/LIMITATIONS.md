# Limites connues

Ce document n'est pas une clause de style. Il décrit ce que l'outil **ne peut
pas** faire, parce qu'un score affiché sans ses limites devient une pièce à
charge.

---

## 1. Ce que mesure réellement le score IA

Le score n'est pas une probabilité au sens statistique du terme. C'est une
**agrégation d'indices de régularité** : à quel point le texte est prévisible,
rythmé de façon uniforme, stylistiquement stable et pauvre en marques de
subjectivité.

Un texte peut présenter toutes ces propriétés sans avoir été généré :

- une rédaction scolaire suivant un plan imposé ;
- un document administratif ou juridique au style volontairement neutre ;
- un texte écrit par un locuteur non natif, qui puise dans un répertoire
  lexical et syntaxique plus restreint ;
- une traduction, surtout automatique puis relue ;
- une documentation technique normalisée.

**C'est la principale source de faux positifs, et elle est concentrée sur des
populations identifiables.** C'est le reproche méthodologique central adressé
aux détecteurs commerciaux.

## 2. Ce que le score IA ne détecte pas

- **Le texte généré puis édité.** Quelques minutes de réécriture humaine
  suffisent à réintroduire de la variabilité de rythme et à casser les marqueurs
  lexicaux.
- **Le texte paraphrasé** par un outil de reformulation.
- **Le texte mixte** humain + IA : le score moyenne les deux régimes et atterrit
  dans la zone 40–60 %, la moins informative.
- **Les modèles récents** produisant volontairement du texte moins uniforme
  (température élevée, consignes de style, imitation d'un auteur).

Un score bas ne prouve donc rien.

## 3. Précision réaliste

L'état de l'art publié situe les meilleurs détecteurs autour de **80–90 % de
précision sur du texte brut non retouché**, avec une chute marquée dès que le
texte est édité, paraphrasé, traduit ou mixte.

Cet outil n'utilise **aucun modèle entraîné en local** : ses détecteurs
heuristiques sont, par construction, en dessous de ce plafond. Ils sont conçus
pour être **explicables et prudents**, pas pour maximiser un taux de détection.

Le détecteur distant optionnel (Hugging Face) permet de brancher un vrai
classifieur entraîné, mais les modèles publics disponibles ont été entraînés sur
des générations anciennes et se dégradent fortement sur les modèles récents.

## 4. Zone d'incertitude assumée

| Score | Lecture |
|---|---|
| < 30 % | Signature plutôt humaine |
| 30–55 % | Indéterminé |
| 55–70 % | Signaux mixtes |
| 70–85 % | Probablement généré ou fortement assisté |
| ≥ 85 % | Signature fortement compatible avec une IA |

Le seuil d'alerte par défaut est à **85 %**, réglable entre 55 et 95 %.
L'abaisser multiplie mécaniquement les faux positifs.

**La plage 55–85 % est celle où les détecteurs se trompent le plus.** L'interface
le signale explicitement quand le score y tombe.

## 5. Garde-fous codés en dur

- Textes de moins de **40 mots** : non notés du tout.
- En dessous de **300 mots** : confiance plafonnée, avertissement affiché.
- **Désaccord entre détecteurs** : le score est ramené vers 50 % proportionnellement
  à la dispersion. L'incertitude est affichée, pas masquée.
- **Langue non supportée** (ni français ni anglais) : ressources linguistiques
  inapplicables, score contracté vers 50 % et confiance réduite de 30 %.
- **Rampes douces** : aucune métrique isolée ne peut produire un vote à 0 % ou
  100 %. Les extrêmes valent ~6 % et ~94 %.
- Un détecteur qui manque de matière (compression sous 600 mots) **s'abstient**
  au lieu de voter au hasard.

## 6. Limites du score de plagiat

- Il mesure un **recouvrement lexical**, pas une faute. Une citation
  correctement attribuée compte comme un recouvrement : seule une lecture
  humaine fait la différence.
- La couverture ne dépasse jamais 100 % : les intervalles sont fusionnés et
  pondérés par la similarité, pour qu'un passage trouvé sur cinq sites ne
  compte qu'une fois.
- **La recherche ne couvre que le web indexé** par le moteur configuré, et
  seulement dans la limite du budget de requêtes (24 par défaut). L'absence de
  correspondance ne signifie pas l'absence de source.
- Les contenus derrière un paywall, les bases académiques fermées, les travaux
  d'étudiants non publiés et les documents PDF non indexés sont **hors de portée**.
- Sans service d'extraction de page, la comparaison se limite aux extraits de
  quelques lignes renvoyés par le moteur : les scores sont alors moins fiables,
  et l'interface l'indique (« comparaison sur extrait de recherche seulement »).
- La **paraphrase** est partiellement détectée (containment sur 3-grammes et
  plus longue sous-séquence commune sur les mots de contenu), mais une
  reformulation profonde échappe à toute approche lexicale.

## 7. Vie privée

- L'analyse IA locale et la comparaison aux sources locales **ne sortent pas du
  navigateur**.
- La recherche web envoie **des extraits de 11 mots** de votre texte au moteur
  configuré.
- Le service d'extraction de page reçoit **les URL candidates**, pas votre texte.
- Le détecteur IA distant, s'il est activé, reçoit **le texte complet** (tronqué
  à 12 000 caractères). Il est désactivé par défaut et l'interface le rappelle.
- Les clés d'API sont stockées dans le `localStorage` du navigateur.

## 8. Usage responsable

**Aucune décision concernant une personne — note, sanction, recrutement,
publication — ne doit reposer sur ces scores.**

Ils servent à *orienter* une vérification humaine :

1. lire le texte ;
2. regarder les indices affichés, pas seulement le pourcentage ;
3. vérifier les sources signalées une par une, en suivant les liens ;
4. parler à la personne concernée avant toute conclusion.

Un outil de détection ne remplace pas ce travail. Il ne fait que le cadrer.
