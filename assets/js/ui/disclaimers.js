/**
 * Avertissements affiches dans l'interface et repris integralement dans le
 * rapport telecharge.
 *
 * Ils ne sont pas decoratifs : l'etat de l'art des detecteurs d'IA ne permet
 * pas de trancher l'origine d'un texte, et l'usage de ces scores pour
 * sanctionner une personne est une erreur methodologique documentee.
 */

export const DISCLAIMERS = [
  'Les scores affiches sont des estimations statistiques, pas des preuves. Ils n\'ont aucune valeur juridique ni disciplinaire.',
  'Les detecteurs d\'IA actuels atteignent au mieux 80 a 90 % de precision sur du texte brut non retouche. Cette precision chute fortement des que le texte est reecrit, paraphrase, traduit, ou melange humain et IA.',
  'Les faux positifs sont concentres sur des populations identifiables : locuteurs non natifs, redactions scolaires formatees, textes techniques ou administratifs au style volontairement neutre. Un score eleve sur ce type de texte doit etre considere comme suspect avant d\'etre considere comme revelateur.',
  'A l\'inverse, un texte genere puis edite par un humain, ou passe par un outil de reformulation, echappe couramment a la detection. Un score bas ne prouve rien.',
  'Le score de plagiat mesure un recouvrement lexical avec les sources trouvees en ligne. Il ne distingue pas une citation correctement attribuee d\'un emprunt non signale : cette distinction demande une lecture humaine.',
  'La recherche web ne couvre qu\'une partie du web indexe. L\'absence de correspondance ne signifie pas l\'absence de source.',
  'Aucune decision concernant une personne — note, sanction, recrutement, publication — ne doit reposer sur ces scores. Ils servent a orienter une verification humaine, jamais a la remplacer.',
];

export const AI_METHOD_NOTE = 'Le score IA combine plusieurs detecteurs independants (previsibilite, rythme des phrases, stylometrie, richesse lexicale, marqueurs lexicaux, structure, patrons syntaxiques, redondance) par moyenne ponderee par leur fiabilite. En cas de desaccord entre detecteurs, le score est ramene vers 50 % : l\'incertitude est affichee, pas masquee.';

export const PLAGIARISM_METHOD_NOTE = 'Le texte est decoupe en passages avec recouvrement. Les passages les plus distinctifs sont interroges sur le moteur de recherche configure, puis les pages candidates sont telechargees et comparees finement (shingles, containment, cosinus pondere, plus longue sous-sequence commune sur les mots de contenu). Le score global est la part du texte couverte par au moins une correspondance, ponderee par sa similarite.';
