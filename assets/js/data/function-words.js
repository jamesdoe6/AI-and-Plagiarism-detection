/**
 * Function-word lists.
 *
 * The frequency of these words is the classic stylometric signature (Mosteller &
 * Wallace): near-unconscious in a human author, very regular in an LLM. Every
 * word in these lists becomes an independent metric in the feature vector,
 * which by itself accounts for several hundred dimensions.
 */

export const FUNCTION_WORDS_EN = [
  'a', 'about', 'above', 'across', 'after', 'again', 'against', 'all', 'almost', 'along',
  'already', 'also', 'although', 'always', 'am', 'among', 'an', 'and', 'another', 'any',
  'anyone', 'anything', 'are', 'around', 'as', 'at', 'back', 'be', 'because', 'been',
  'before', 'behind', 'being', 'below', 'beneath', 'beside', 'besides', 'between', 'beyond', 'both',
  'but', 'by', 'can', 'cannot', 'could', 'despite', 'did', 'do', 'does', 'doing',
  'done', 'down', 'during', 'each', 'either', 'else', 'enough', 'even', 'ever', 'every',
  'everyone', 'everything', 'except', 'few', 'for', 'from', 'further', 'had', 'has', 'have',
  'having', 'he', 'hence', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his',
  'how', 'however', 'i', 'if', 'in', 'indeed', 'inside', 'instead', 'into', 'is',
  'it', 'its', 'itself', 'just', 'least', 'less', 'like', 'likely', 'many', 'may',
  'me', 'might', 'mine', 'more', 'moreover', 'most', 'much', 'must', 'my', 'myself',
  'near', 'neither', 'never', 'nevertheless', 'no', 'none', 'nor', 'not', 'nothing', 'now',
  'of', 'off', 'often', 'on', 'once', 'one', 'only', 'onto', 'or', 'other',
  'others', 'otherwise', 'our', 'ours', 'ourselves', 'out', 'outside', 'over', 'own', 'perhaps',
  'rather', 'really', 'same', 'seem', 'seems', 'several', 'shall', 'she', 'should', 'similarly',
  'since', 'so', 'some', 'someone', 'something', 'sometimes', 'somewhat', 'still', 'such', 'than',
  'that', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'therefore', 'these',
  'they', 'this', 'those', 'though', 'through', 'throughout', 'thus', 'to', 'together', 'too',
  'toward', 'towards', 'under', 'unless', 'until', 'up', 'upon', 'us', 'very', 'via',
  'was', 'we', 'well', 'were', 'what', 'whatever', 'when', 'whenever', 'where', 'whereas',
  'whether', 'which', 'while', 'who', 'whom', 'whose', 'why', 'will', 'with', 'within',
  'without', 'would', 'yet', 'you', 'your', 'yours', 'yourself',
];

export const FUNCTION_WORDS_FR = [
  'a', 'afin', 'ailleurs', 'ainsi', 'alors', 'apres', 'assez', 'au', 'aucun', 'aucune',
  'aujourd', 'auparavant', 'aupres', 'auquel', 'aussi', 'autant', 'autour', 'autre', 'autres', 'aux',
  'avaient', 'avait', 'avant', 'avec', 'avoir', 'beaucoup', 'bien', 'car', 'ce', 'ceci',
  'cela', 'celle', 'celles', 'celui', 'cependant', 'certains', 'ces', 'cet', 'cette', 'ceux',
  'chacun', 'chaque', 'chez', 'combien', 'comme', 'comment', 'contre', 'dans', 'davantage', 'de',
  'debut', 'dedans', 'dehors', 'deja', 'depuis', 'des', 'desormais', 'dessous', 'dessus', 'deux',
  'devant', 'doit', 'donc', 'dont', 'du', 'duquel', 'durant', 'elle', 'elles', 'en',
  'encore', 'enfin', 'ensuite', 'entre', 'envers', 'environ', 'est', 'et', 'etaient', 'etait',
  'etant', 'etc', 'ete', 'etre', 'eux', 'faire', 'fait', 'grace', 'hors', 'ici',
  'il', 'ils', 'jamais', 'je', 'jusqu', 'jusque', 'la', 'laquelle', 'le', 'lequel',
  'les', 'lesquelles', 'lesquels', 'leur', 'leurs', 'lors', 'lorsque', 'lui', 'ma', 'mais',
  'malgre', 'me', 'meme', 'memes', 'mes', 'mien', 'mieux', 'moi', 'moins', 'mon',
  'ne', 'ni', 'non', 'nos', 'notamment', 'notre', 'nous', 'nul', 'on', 'ont',
  'ou', 'outre', 'par', 'parce', 'parfois', 'parmi', 'partant', 'pas', 'pendant', 'peu',
  'peut', 'plus', 'plusieurs', 'plutot', 'pour', 'pourquoi', 'pourtant', 'pouvoir', 'pres', 'puis',
  'puisque', 'qu', 'quand', 'quant', 'que', 'quel', 'quelle', 'quelles', 'quelque', 'quelques',
  'quels', 'qui', 'quoi', 'quoique', 'sa', 'sans', 'sauf', 'se', 'selon', 'sera',
  'serait', 'ses', 'si', 'sien', 'sinon', 'soit', 'son', 'sont', 'sous', 'souvent',
  'suivant', 'sur', 'surtout', 'ta', 'tandis', 'tant', 'te', 'tel', 'telle', 'telles',
  'tels', 'tes', 'toi', 'ton', 'toujours', 'tous', 'tout', 'toute', 'toutefois', 'toutes',
  'tres', 'trop', 'tu', 'un', 'une', 'vers', 'via', 'voici', 'voila', 'vos',
  'votre', 'vous', 'y',
];

/**
 * Part-of-speech markers approximated without a heavy model.
 * Each category acts as a POS proxy: the relative distribution of these
 * categories is a highly discriminative stylometric metric.
 */
export const POS_PROXY = {
  en: {
    determiners: ['the', 'a', 'an', 'this', 'that', 'these', 'those', 'my', 'your', 'his', 'her', 'its', 'our', 'their', 'each', 'every', 'some', 'any', 'no', 'both', 'either', 'neither'],
    pronouns: ['i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them', 'myself', 'yourself', 'himself', 'herself', 'itself', 'ourselves', 'themselves', 'who', 'whom', 'which', 'what'],
    prepositions: ['of', 'in', 'to', 'for', 'with', 'on', 'at', 'by', 'from', 'about', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'under', 'over', 'against', 'among', 'within', 'without', 'toward', 'upon', 'across', 'behind', 'beyond'],
    conjunctions: ['and', 'or', 'but', 'nor', 'so', 'yet', 'because', 'although', 'though', 'while', 'whereas', 'since', 'unless', 'until', 'if', 'when', 'whenever', 'wherever', 'that', 'whether'],
    auxiliaries: ['is', 'am', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'shall', 'should', 'can', 'could', 'may', 'might', 'must'],
    adverbsMarker: /(ly)$/,
    adjectivesMarker: /(ous|ive|ful|less|able|ible|al|ic|ical|ent|ant)$/,
    nounsMarker: /(tion|sion|ment|ness|ity|ance|ence|ism|ship|hood|age|ure)$/,
    verbsMarker: /(ize|ise|ate|ify|en)$/,
  },
  fr: {
    determiners: ['le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'ce', 'cet', 'cette', 'ces', 'mon', 'ma', 'mes', 'son', 'sa', 'ses', 'notre', 'nos', 'votre', 'vos', 'leur', 'leurs', 'chaque', 'tout', 'toute', 'tous', 'toutes'],
    pronouns: ['je', 'tu', 'il', 'elle', 'on', 'nous', 'vous', 'ils', 'elles', 'me', 'te', 'se', 'lui', 'leur', 'moi', 'toi', 'soi', 'eux', 'qui', 'que', 'quoi', 'dont', 'y', 'en', 'celui', 'celle', 'ceux', 'celles'],
    prepositions: ['de', 'a', 'dans', 'par', 'pour', 'en', 'vers', 'avec', 'sans', 'sous', 'sur', 'entre', 'chez', 'depuis', 'pendant', 'apres', 'avant', 'contre', 'malgre', 'selon', 'parmi', 'envers', 'jusqu'],
    conjunctions: ['et', 'ou', 'mais', 'donc', 'or', 'ni', 'car', 'que', 'quand', 'comme', 'si', 'lorsque', 'puisque', 'quoique', 'bien', 'tandis', 'alors', 'ainsi'],
    auxiliaries: ['est', 'sont', 'etait', 'etaient', 'ete', 'etre', 'suis', 'es', 'sommes', 'etes', 'a', 'ai', 'as', 'avons', 'avez', 'ont', 'avait', 'avaient', 'avoir', 'sera', 'seront', 'serait', 'aura', 'auront'],
    adverbsMarker: /(ment)$/,
    adjectifsMarker: /(eux|euse|if|ive|able|ible|al|ale|aux|ique|ant|ante|ent|ente)$/,
    adjectivesMarker: /(eux|euse|if|ive|able|ible|al|ale|aux|ique|ant|ante|ent|ente)$/,
    nounsMarker: /(tion|sion|ment|ite|ance|ence|isme|age|ure|eur|esse|ade)$/,
    verbsMarker: /(er|ir|re|ez|ons|ent|ait|aient|era|eront)$/,
  },
};

export const FUNCTION_WORDS = { en: FUNCTION_WORDS_EN, fr: FUNCTION_WORDS_FR };
