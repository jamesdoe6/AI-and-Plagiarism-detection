# Configuration des API

L'application est **statique et 100 % côté client**. Elle ne peut appeler que
des API autorisant le CORS depuis un navigateur. Aucune clé ne transite par un
serveur tiers : elles restent dans le `localStorage` de votre navigateur et ne
sont envoyées qu'au fournisseur sélectionné.

Tout se règle dans **⚙ Réglages**.

---

## Sans aucune API

L'analyse IA fonctionne **entièrement hors ligne**. Seule la recherche web de
plagiat nécessite un fournisseur.

Pour détecter du plagiat sans API, utilisez le champ **Sources locales** :
collez-y les documents de référence (copies d'élèves, corpus interne, articles
sources), séparés par une ligne contenant `---`. La comparaison est faite
localement, avec les mêmes mesures de similarité.

---

## Recherche web

### Google Programmable Search (recommandé pour démarrer)

Quota gratuit : 100 requêtes/jour.

1. Créez un moteur sur <https://programmablesearchengine.google.com/> et activez
   « Rechercher sur l'ensemble du Web ».
2. Notez l'**ID du moteur** (`cx`).
3. Activez la *Custom Search API* dans la console Google Cloud et créez une clé.
4. Dans Réglages : fournisseur « Google Programmable Search », collez la clé et
   l'ID `cx`.

### Serper.dev

Résultats Google, 2 500 requêtes gratuites à l'inscription.
Créez une clé sur <https://serper.dev> et collez-la. Rien d'autre à configurer.

### Brave Search API

Offre gratuite de 2 000 requêtes/mois.
Clé sur <https://brave.com/search/api/>.

### Bing Web Search (Azure)

Créez une ressource *Bing Search v7* dans le portail Azure et récupérez la clé.

### Endpoint personnalisé

Pour brancher n'importe quel moteur derrière votre propre proxy. L'application
appelle `GET <votre-url>?q=<requête>` et attend :

```json
{ "results": [ { "url": "...", "title": "...", "snippet": "..." } ] }
```

Un tableau nu est également accepté, de même que les clés `link`, `name` et
`description`. Si vous renseignez une clé d'API, elle est envoyée en
`Authorization: Bearer <clé>`.

C'est aussi la solution si votre moteur préféré n'autorise pas le CORS : un
proxy de dix lignes suffit.

### Budget de requêtes

Réglable de 4 à 120 requêtes par analyse (24 par défaut). Chaque requête
consomme votre quota. Plus le budget est élevé, plus la couverture du document
est fine — les passages interrogés sont répartis sur toute sa longueur, pas
concentrés au début.

---

## Extraction du contenu des pages

Un navigateur ne peut pas télécharger une page tierce (politique d'origine
croisée). Sans service d'extraction, la comparaison se limite aux extraits de
quelques lignes renvoyés par le moteur — nettement moins fiable.

Par défaut : `https://r.jina.ai/{url}`, qui renvoie le texte brut d'une page et
autorise le CORS. `{url}` est remplacé par l'adresse candidate.

**Ce que cela implique :** les URL trouvées transitent par ce service. Votre
texte, lui, n'est pas transmis. Si ce n'est pas acceptable, décochez
« Télécharger les pages pour comparaison fine » ou remplacez le modèle d'URL par
votre propre extracteur.

---

## Détecteur IA distant (optionnel)

⚠️ **Le texte analysé est envoyé au fournisseur choisi** (tronqué à 12 000
caractères). Désactivé par défaut.

### Claude (Anthropic)

Fournisseur « Claude », clé depuis <https://console.anthropic.com>.
Modèle par défaut : `claude-sonnet-5`.
L'en-tête `anthropic-dangerous-direct-browser-access` est envoyé automatiquement,
il est nécessaire pour appeler l'API depuis un navigateur.

### Endpoint compatible OpenAI

Pour OpenAI, un modèle local (Ollama, LM Studio, vLLM) ou tout service exposant
`/chat/completions`. Renseignez l'URL de base (sans `/chat/completions`), la clé
et le nom du modèle.

Un modèle local évite complètement l'envoi de données vers un tiers.

### Hugging Face Inference (classifieur)

Branche un vrai classifieur « humain vs IA ». Modèle par défaut :
`openai-community/roberta-base-openai-detector`.

Autres modèles utilisables : `Hello-SimpleAI/chatgpt-detector-roberta`,
`desklib/ai-text-detector-v1.01`.

Le texte est découpé en segments d'environ 1 400 caractères sur les frontières de
phrases (8 segments maximum), et les scores sont moyennés. Une forte dispersion
entre segments est signalée : elle indique souvent un texte mixte humain + IA.

> Ces modèles publics ont été entraînés sur des générations anciennes. Ils
> apportent une voix supplémentaire à l'ensemble, pas un verdict.

---

## Dépannage

| Symptôme | Cause probable |
|---|---|
| « cle refusee (HTTP 401/403) » | Clé invalide, ou API non activée côté fournisseur |
| « quota depasse (HTTP 429) » | Quota épuisé — réduisez le budget de requêtes |
| « Lecture impossible de … » | Le service d'extraction n'a pas pu lire la page (paywall, robots, timeout). L'analyse continue sur l'extrait de recherche |
| « Delai depasse » | Réseau lent ou fournisseur indisponible. Les requêtes sont rejouées deux fois avec un délai croissant |
| Erreur CORS en console | Le fournisseur n'autorise pas les appels navigateur : passez par un endpoint personnalisé |

Le journal affiché pendant l'analyse détaille chaque incident. Les erreurs
n'interrompent jamais l'analyse : le score de plagiat est alors partiel, et
l'interface l'indique explicitement comme un minorant.
