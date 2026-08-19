/**
 * Lexiques de marqueurs frequemment sur-representes dans les productions de
 * LLM grand public (GPT / Claude / Gemini / Llama, versions "chat" alignees
 * RLHF).
 *
 * ATTENTION : aucun de ces marqueurs n'est une preuve. Un humain peut ecrire
 * "il est important de noter que". Ils ne pesent que par accumulation et sont
 * volontairement ponderes faiblement dans l'ensemble.
 *
 * Chaque entree devient une metrique du vecteur de caracteristiques.
 */

export const AI_PHRASES_EN = [
  'it is important to note', "it's important to note", 'it is worth noting', 'it should be noted',
  'in conclusion', 'in summary', 'to summarize', 'overall,', 'in today\'s world',
  'in the ever-evolving', 'ever-evolving landscape', 'in the realm of', 'in the world of',
  'plays a crucial role', 'plays a vital role', 'plays a significant role', 'a pivotal role',
  'delve into', 'delving into', 'dive deeper into', 'let us explore', "let's explore",
  'navigate the complexities', 'navigating the', 'shed light on', 'a testament to',
  'when it comes to', 'as we move forward', 'moving forward', 'at the end of the day',
  'first and foremost', 'last but not least', 'on the other hand', 'that being said',
  'furthermore,', 'moreover,', 'additionally,', 'consequently,', 'nevertheless,', 'nonetheless,',
  'in essence', 'ultimately,', 'notably,', 'importantly,', 'crucially,',
  'not only', 'but also', 'both a and', 'ranging from', 'a wide range of', 'a myriad of',
  'a plethora of', 'a wealth of', 'a variety of', 'numerous benefits', 'key takeaways',
  'it is essential', 'it is crucial', 'it is vital', 'it is imperative',
  'unlock the potential', 'harness the power', 'leverage the', 'streamline the',
  'foster a', 'fostering', 'empower', 'empowering', 'robust', 'seamless', 'seamlessly',
  'cutting-edge', 'state-of-the-art', 'game-changer', 'transformative', 'holistic',
  'comprehensive understanding', 'multifaceted', 'nuanced', 'intricate', 'underscores',
  'highlights the importance', 'emphasizes the need', 'paves the way', 'paving the way',
  'in the digital age', 'rapidly changing', 'fast-paced world', 'landscape of',
  'tapestry', 'realm', 'embark on', 'journey', 'beacon', 'testament',
  'i hope this helps', 'as an ai', 'as a language model', 'i cannot provide',
  'here are some', 'here is a', 'below are', 'the following are',
  'by understanding', 'by leveraging', 'by embracing', 'through careful',
  'while it is true', 'it is worth mentioning', 'this raises the question',
  'a double-edged sword', 'the bottom line', 'in other words', 'simply put',
];

export const AI_PHRASES_FR = [
  'il est important de noter', 'il convient de noter', 'il est essentiel de',
  'il est crucial de', 'il est primordial de', 'il faut souligner', 'a noter que',
  'en conclusion', 'pour conclure', 'en resume', 'pour resumer', 'en somme',
  'dans le monde d\'aujourd\'hui', 'a l\'ere du numerique', 'a l\'heure actuelle',
  'dans un monde en constante evolution', 'en constante evolution', 'paysage en mutation',
  'joue un role cle', 'joue un role crucial', 'joue un role essentiel', 'un role central',
  'plongeons dans', 'explorons', 'decouvrons ensemble', 'examinons de plus pres',
  'il est a noter', 'force est de constater', 'on ne peut nier',
  'par ailleurs,', 'de plus,', 'en outre,', 'neanmoins,', 'toutefois,', 'cependant,',
  'ainsi,', 'par consequent,', 'en definitive', 'en effet,', 'notamment,',
  'non seulement', 'mais aussi', 'mais egalement', 'un large eventail', 'une multitude de',
  'une pluralite de', 'un vaste choix', 'de nombreux avantages', 'points cles',
  'permet de', 'offre la possibilite', 'ouvre la voie', 'ouvrant la voie',
  'exploiter le potentiel', 'tirer parti de', 'optimiser', 'rationaliser',
  'favoriser', 'renforcer', 'robuste', 'transparent', 'de pointe', 'revolutionnaire',
  'incontournable', 'holistique', 'multifacette', 'nuance', 'complexe et',
  'souligne l\'importance', 'met en lumiere', 'met en evidence', 'temoigne de',
  'dans ce contexte', 'dans cette optique', 'dans cette perspective', 'a cet egard',
  'il est donc essentiel', 'en definitive,', 'en fin de compte',
  'voici quelques', 'voici les', 'les elements suivants', 'la liste suivante',
  'en comprenant', 'en adoptant', 'grace a une', 'un veritable',
  'une arme a double tranchant', 'un enjeu majeur', 'un defi de taille',
  'j\'espere que cela vous aide', 'en tant qu\'ia', 'en tant que modele de langage',
];

/** Connecteurs logiques : leur densite en debut de phrase est tres revelatrice. */
export const TRANSITIONS = {
  en: ['however', 'therefore', 'moreover', 'furthermore', 'additionally', 'consequently',
    'nevertheless', 'nonetheless', 'thus', 'hence', 'accordingly', 'similarly', 'likewise',
    'conversely', 'meanwhile', 'subsequently', 'ultimately', 'notably', 'importantly',
    'specifically', 'particularly', 'overall', 'indeed', 'instead', 'besides', 'finally'],
  fr: ['cependant', 'toutefois', 'neanmoins', 'ainsi', 'donc', 'par consequent', 'de plus',
    'en outre', 'par ailleurs', 'egalement', 'ensuite', 'enfin', 'finalement', 'notamment',
    'effectivement', 'inversement', 'parallelement', 'globalement', 'certes', 'or',
    'pourtant', 'aussi', 'puis', 'ensuite', 'premierement', 'deuxiemement'],
};

/** Marqueurs de prudence / hedging : sur-representes dans le texte aligne RLHF. */
export const HEDGES = {
  en: ['may', 'might', 'could', 'perhaps', 'possibly', 'potentially', 'generally', 'typically',
    'often', 'usually', 'somewhat', 'relatively', 'arguably', 'seemingly', 'appears to',
    'tends to', 'in some cases', 'it depends', 'largely', 'broadly', 'to some extent'],
  fr: ['peut', 'pourrait', 'semble', 'paraît', 'parait', 'generalement', 'typiquement',
    'souvent', 'habituellement', 'relativement', 'possiblement', 'potentiellement',
    'dans certains cas', 'en partie', 'dans une certaine mesure', 'plutot', 'apparemment'],
};

/** Marqueurs de subjectivite humaine : leur absence est un signal. */
export const PERSONAL_MARKERS = {
  en: ['i think', 'i believe', 'i feel', 'in my opinion', 'my experience', 'i remember',
    'i noticed', 'honestly', 'frankly', 'to be honest', 'i guess', 'i mean', 'you know',
    'my take', 'personally', 'i was', "i've", "i'm", "i'd", 'we tried', 'i tried'],
  fr: ['je pense', 'je crois', 'je trouve', 'a mon avis', 'selon moi', 'mon experience',
    'je me souviens', "j'ai remarque", 'honnetement', 'franchement', 'pour etre honnete',
    "j'imagine", 'je veux dire', 'tu sais', 'personnellement', "j'etais", "j'ai", "j'ai essaye"],
};

/** Formes lexicales tres rares chez un LLM aligne : familier, argot, fautes. */
export const HUMAN_NOISE = {
  en: ['gonna', 'wanna', 'kinda', 'sorta', 'yeah', 'nope', 'lol', 'btw', 'imo', 'tbh',
    'stuff', 'thing is', 'whatever', 'anyway', 'dunno', 'ain\'t', 'y\'know', 'huh'],
  fr: ['ouais', 'bref', 'du coup', 'genre', 'truc', 'machin', 'quoi', 'ben', 'hein',
    'mdr', 'ptdr', 'perso', 'grave', 'carrement', 'franchement', 'nickel', 'chelou'],
};

export const AI_PHRASES = { en: AI_PHRASES_EN, fr: AI_PHRASES_FR };
