/**
 * Listes de mots ordonnees par frequence decroissante (corpus generalistes).
 *
 * On ne stocke pas les frequences absolues : la loi de Zipf permet de
 * reconstruire une probabilite exploitable a partir du seul rang
 *   p(rang) ~= 1 / (rang^s * H_N(s))
 * ce qui suffit largement pour un proxy de perplexite (on cherche une
 * *tendance*, pas une valeur absolue de vraisemblance).
 *
 * Les mots hors liste (OOV) recoivent une surprise plancher dependant de leur
 * longueur et de leur composition : c'est precisement le vocabulaire rare qui
 * fait grimper la perplexite d'un texte humain.
 */

export const TOP_WORDS_EN = `the be to of and a in that have i it for not on with he as you do at
this but his by from they we say her she or an will my one all would there their what so up out if about who get which go me
when make can like time no just him know take people into year your good some could them see other than then now look only come
its over think also back after use two how our work first well way even new want because any these give day most us is are was
were been being has had did does said made went could should must may might shall will would can am were
man world life hand part child eye woman place week case point government company number group problem fact
say get make go know take see come think look want give use find tell ask work seem feel try leave call
great little own other old right big high different small large next early young important few public bad same able
each such last long only very much many more most other another every own both few several own
under between through during before after above below against among within without across behind beyond
system program question government night point home water room mother area money story month lot right study book
job word business issue side kind head house service friend father power hour game line end member law car city
community name president team minute idea kid body information back parent face others level office door health person art
war history party result change morning reason research girl guy moment air teacher force education foot boy age policy
process music market sense nation plan college interest death experience effect use class control care field development
role effort rule
develop developed developing development create created creating creation provide provided providing
require required requirement include included including increase increased increasing reduce reduced
support supported supporting consider considered allow allowed allowing continue continued remain remained
receive received report reported reports become became begin began bring brought build built buy bought
carry carried catch caught choose chose cause caused change changed close closed cover covered cut
decide decided describe described design designed determine determined die died draw drew drive drove
eat ate enter entered establish established expect expected explain explained fall fell fill filled
follow followed force forced forget forgot form formed grow grew happen happened hear heard help helped
hold held hope hoped identify identified improve improved indicate increase involve involved join joined
keep kept kill killed lead led learn learned lie lay lose lost love loved maintain maintained manage
mean meant meet met move moved need needed occur occurred offer offered open opened order ordered
pass passed pay paid perform performed place placed play played prepare prepared present presented
produce produced protect protected prove proved pull pulled push pushed put raise raised reach reached
read realize recognize recognized reflect reflected relate related release released represent represented
result return returned run ran save saved send sent serve served set share shared shoot show showed
sit sat sleep slept sound speak spoke spend spent stand stood start started stay stayed stop stopped
strike study studied suggest suggested supply teach taught tend tested thank think thought throw threw
train treat treated try turn turned understand understood use used visit wait waited walk walked want
watch watched wear win won wonder work worked write wrote
ability access account action activity addition address administration advance advantage advice age agency
agreement air amount analysis animal answer application approach area argument arm army art article aspect
attack attempt attention author authority available average award baby background balance bank base basis
battle beach beginning behavior belief benefit bill bit blood board boat book bottom box boy brain branch
bridge brother budget building business camera camp campaign cancer capital card care career case cash
cause cell center central century chair challenge chance character charge chart check chest chief child
choice church circle citizen city civil claim class clear client climate clock club coach coast code
coffee cold collection college color column combination comment commercial commission committee common
communication community company comparison competition complete computer concept concern conclusion
condition conference confidence conflict congress connection consequence consideration construction contact
content context continued contract contrast control conversation cook copy corner cost country county
couple course court cover crime crisis critical crowd culture cup current customer cycle damage dance
danger data date daughter day deal death debate debt decade decision defense degree demand democracy
department depth description design desire detail development device difference difficulty dinner direction
director discipline discovery discussion disease distance distribution district doctor document dog door
doubt draft drama dream dress drink drive drop drug duty earth east economy edge edition education effect
effort election element emergency emotion emphasis employee employer end energy engine engineer english
enterprise entry environment equipment error escape essay establishment estate estimate event evidence
exam example exchange excitement executive exercise exhibition existence expansion expectation expense
experience experiment expert explanation expression extent eye face facility fact factor factory failure
faith fall family farm farmer fashion father fault fear feature federal feedback feeling female field
fight figure file film final finance finding fire firm fish flight floor flow focus food foot football
force foreign forest form format formula fortune forum foundation frame freedom friend front fruit fuel
function fund furniture future gain game gap garden gas gate gender general generation gift girl glass
goal god gold golf good government grade grand grant grass green ground group growth guard guest guide
guy habit hair half hall hand handle happiness hard hardware harm hat head health hearing heart heat
height help hero high highway hill history hit hole holiday home honor hope horse hospital host hotel
hour house housing human hundred hunt husband ice idea identity image impact implementation importance
impression improvement incident income increase independence index indication individual industry
inflation influence information initiative injury inner input inquiry insect inside insight instance
institution instruction instrument insurance intelligence intention interaction interest internal
international internet interview introduction investment investigation iron island issue item job join
joint joke journal journey joy judge judgment juice jump junior jury justice keep key kid kind king
kitchen knee knife knowledge lab labor lack lady lake land landscape language laptop law lawyer layer
leader leadership league leave lecture leg legal legend length lesson letter level library license life
light limit line link liquid list literature living load loan local location lock log logic loss lot
love luck lunch machine magazine mail main maintenance major majority man management manager manner
manufacturer map margin mark market marketing marriage master match material math matter maximum meal
meaning measure meat media medicine medium meeting member membership memory mention menu message metal
method middle midnight might mile military milk mind mine minimum minister minor minute mirror mission
mistake mix mixture mobile mode model moment money monitor month mood moon moral morning mother motion
motor mountain mouse mouth move movement movie mud murder muscle museum music mystery nail name nation
national native nature near neck need negative neighbor nerve net network news newspaper night noise
normal north nose note nothing notice novel number nurse nut object objective obligation observation
occasion ocean offer office officer official oil operation opinion opportunity opposition option orange
order organization origin original other outcome outlook output outside overall owner package page pain
paint pair panel paper paragraph parent park part participant particular partner party passage passenger
past path patience patient pattern payment peace peak pen penalty pension people percent percentage
perception performance period permission person personal personality perspective phase phenomenon philosophy
phone photo phrase physical picture piece pilot pipe pitch place plan plane plant plastic plate platform
play player pleasure plenty poem poet point police policy politics pollution pool population port portion
position positive possession possibility post pot potato potential pound poverty powder power practice
praise prayer preference pregnancy premium preparation presence present president press pressure price
pride priest primary principle print priority prison privacy private prize probability problem procedure
process producer product production profession professor profile profit program progress project promise
promotion proof property proportion proposal prospect protection protein protest provider province public
publication publisher punishment purchase purpose push quality quantity quarter queen question quiet quote
race radio rail rain raise range rank rate ratio reach reaction reader reading reality reason receipt
recession recipe recognition recommendation record recovery reduction reference reflection reform refusal
region register regulation relation relationship relative release relief religion remark remedy removal
rent repair repeat replacement reply report reporter representation representative reputation request
requirement research reserve residence resident resistance resolution resort resource respect response
responsibility rest restaurant result retail retirement return revenue review revolution reward rhythm
rice rich ride right ring rise risk river road rock role roll roof room root rope rose round route row
royal rule run runner rush safety sail salary sale salt sample sanction sand satisfaction sauce scale
scene schedule scheme scholar school science scope score screen script sea search season seat second
secret secretary section sector security seed segment selection self sell senate senior sense sentence
separation sequence series servant service session set setting settlement sex shadow shape share shelf
shell shelter shift ship shirt shock shoe shop shopping shore short shot shoulder show shower side sight
sign signal signature significance silence silver similarity simple sin singer single sink sister site
situation size skill skin sky sleep slice slide slip slope smell smile smoke snow society sock soft
software soil soldier solution somewhere son song sort soul sound soup source south space speaker special
species specialist speech speed spending spirit spite split sponsor spot spread spring square stability
staff stage stair stake stand standard star start state statement station statistics status stay steel
step stick stock stomach stone stop storage store storm story strain stranger strategy stream street
strength stress stretch strike string strip stroke structure struggle student studio study stuff style
subject submission substance success suggestion suit summary summer sun supermarket supply support
surface surgery surprise survey survival suspect sweet swimming switch symbol sympathy system table tackle
tail take tale talent talk tank tape target task taste tax tea teacher teaching team tear technique
technology telephone television temperature temple tendency tennis tension term terminal territory test
text theme theory therapy thing thinking thought thread threat throat thumb ticket tie time tip tissue
title today toe tone tongue tool tooth top topic total touch tour tourist tower town track trade tradition
traffic trail train training transfer transition transport travel treat treatment tree trend trial trick
trip trouble truck trust truth tube turn twist type uncle understanding union unit unity universe university
update upper usage use user usual utility valley value van variation variety vehicle version victim victory
video view village violence virtue vision visit visitor voice volume vote wage wall war warning waste
watch water wave way weakness wealth weapon weather web wedding week weekend weight welcome welfare west
wheel while whole wife wind window wine wing winner winter wire wisdom wish witness woman wonder wood
word work worker working world worry worth wound writer writing yard year yellow yesterday youth zone
`.trim().split(/\s+/);

export const TOP_WORDS_FR = `de la le et les des en un une du dans il que pour qui est au ne pas ce sur se plus par
je avec tout faire son mais nous comme ou si leur y dire elle avant deux meme prendre aussi celui donner bien autre
apres sans grand ainsi entre premier vouloir deja falloir alors chose pouvoir venir depuis moins jour homme fois etre avoir
temps tres savoir aller voir en bon vous celui sous quand parler part mettre demander tenir seul face repondre
petit connaitre passer devoir regarder maison rester sembler heure raison monde travail nouveau lui ici toujours
enfant vie femme moment donc trouver entendre porter croire chaque cas aucun soir peut jamais tres pendant
autre etat pays partie point pouvoir prendre gouvernement question groupe droit developpement systeme service
maniere fin ordre exemple probleme personne rapport nombre suite besoin place effet niveau projet politique
societe famille eau ville force ecole moyen resultat action loi ensemble type recherche information action
mois annee semaine matin nuit tete main oeil corps coeur mot langue histoire idee esprit sens
ecrire lire penser aimer commencer finir continuer arriver sortir entrer monter descendre ouvrir fermer
grand petit jeune vieux nouveau ancien bon mauvais beau long court haut bas fort faible seul meme
tel certain different possible important general national social economique public prive naturel humain
plusieurs quelques tous toutes chaque aucune nul beaucoup peu assez trop moins autant tellement
cependant toutefois neanmoins ainsi donc alors ensuite enfin dabord puis surtout notamment
faire fait fais font faisait ferait pouvoir peut peuvent pouvait pourra pourrait devoir doit doivent
devait devrait vouloir veut veulent voulait voudrait aller va vont allait ira irait venir vient viennent
venait viendra prendre prend prennent prenait mettre met mettent mettait dire dit disent disait dira
voir voit voient voyait verra savoir sait savent savait saura donner donne donnent donnait donnera
trouver trouve trouvent parler parle parlent aimer aime aiment passer passe passent porter porte
demander demande demandent rester reste restent devenir devient deviennent tenir tient tiennent
sembler semble semblent laisser laisse laissent croire croit croient entendre entend entendent
commencer commence commencent partir part partent suivre suit suivent connaitre connait connaissent
penser pense pensent comprendre comprend comprennent attendre attend attendent vivre vit vivent
chercher cherche cherchent ecrire ecrit ecrivent lire lit lisent perdre perd perdent gagner gagne
recevoir recoit recoivent repondre repond repondent entrer entre entrent sortir sort sortent
monter monte montent descendre descend arriver arrive arrivent ouvrir ouvre ouvrent fermer ferme
travailler travaille travaillent utiliser utilise utilisent creer cree creent permettre permet
developper developpe developpent proposer propose proposent presenter presente presentent
realiser realise realisent apporter apporte apportent produire produit produisent obtenir obtient
choisir choisit choisissent decider decide decident expliquer explique expliquent montrer montre
augmenter augmente diminuer diminue changer change changent ameliorer ameliore garder garde
accord action activite adresse affaire age agence aide air ampleur analyse ancien animal annee
appareil appel application approche argent arme article aspect assemblee association attention
auteur autorite avantage avenir avis banque base bataille bateau besoin bien bilan billet blanc
bois boite bord bouche bras bruit bureau but cadre campagne capital caractere carte cas categorie
cause centre cercle chambre champ chance changement chanson chapitre charge chef chemin chiffre
choix chose ciel classe client coeur coin collection college combat comite commande commentaire
commerce commission communaute compagnie comparaison competence complement comportement composition
comprehension compte concept concert concours condition conference confiance conflit connaissance
conseil consequence consommation construction contact contenu contexte contrat controle conversation
corps cote couleur coup cour courant cours court cout couverture creation credit crise critique
croissance culture debat debut decision declaration decouverte defense degre demande demarche
dessin destin detail developpement difference difficulte dimension direction discours discussion
disposition distance distribution document domaine donnee dossier doute droit duree eau echange
echec ecole economie ecran education effet effort election element emploi employe endroit enfant
ensemble entree entreprise environnement epoque equipe erreur escalier espace espece espoir esprit
essai etage etape etat etude evenement evolution examen exemple exercice exigence existence
experience explication exposition expression facon facteur faculte famille faute femme fenetre
fete feu figure film fille fils fin finance fleur foi fois fond fonction fond force forme
formation formule fortune foule francais frere front fruit garcon gauche generation genre geste
gouvernement grandeur groupe guerre habitude haut hauteur heure histoire homme honneur hopital
horizon hotel huile idee identite image importance impression incident indice industrie influence
information initiative innovation inquietude installation instant institution instrument intention
interet interieur internet interpretation intervention introduction investissement jardin jeu jeune
joie jour journal journee juge jugement justice lac langue larme lecon lecture legume lettre
levee liberte lieu ligne limite liste litterature livre logement logique loi longueur lumiere lundi
machine main maison maitre mal maladie manque marche mari mariage marque masse match matiere matin
mecanisme medecin media membre memoire menace mer mere merite mesure methode metier metre milieu
militaire millier ministre minute mission mode modele moment monde monnaie montagne morceau mort
mot moteur mouvement moyen musee musique naissance nature navire necessite negociation niveau nom
nombre nord note nourriture nouvelle nuit numero objectif objet obligation observation occasion
oeil oeuvre offre operation opinion opposition or ordre organisation origine outil ouverture page
paix panne papier parc parcours parent parole part partie participation partenaire passage passe
patient patron pays paysage peau peine pensee perception periode permis personne perspective peuple
peur phase phenomene phrase piece pied pierre place plaisir plan plante plat plein pluie plupart
poche poids point police politique pont population porte portee position possibilite poste pouvoir
pratique precision preference premier presence presentation president presse pression preuve prime
principe prise prix probleme procedure processus produit professeur profession profit programme
progres projet promesse proportion proposition protection province public publicite puissance qualite
quantite quartier question raison rapport reaction realite recherche reconnaissance record recours
reduction reflexion reforme regard regime region regle regret relation religion remarque rencontre
rendez rentree reponse repas represention reprise reseau reserve residence resistance resolution
respect responsabilite ressource restaurant resultat retard retour reunion reussite reve revenu
revolution richesse risque role roman route rue rythme sable sac saison salle salut sang sante
satisfaction science seance secteur securite selection semaine sens sentiment separation serie service
seuil siecle siege signal signe signification silence situation societe soin soir sol soleil solution
sommet son sortie souci souffrance source sourire souvenir spectacle sport stade stage statut
strategie structure style succes suite sujet support surface surprise symbole systeme table tableau
taille tante tapis taux technique technologie television temoin temperature temps tendance tension
terme terrain terre tete texte theatre theme theorie ticket titre toit ton total tour tourisme
tradition train trait traitement transformation transport travail tribunal type union unite univers
universite usage usine utilisation vacances valeur vent vente verite verre version viande victime
victoire vie ville vin violence visage visite vitesse vitre vue voie voiture voix volonte volume
voyage vue zone
`.trim().split(/\s+/);

const RANK_CACHE = new Map();

function buildRankMap(list) {
  const map = new Map();
  list.forEach((word, index) => {
    if (!map.has(word)) map.set(word, index + 1);
  });
  return map;
}

export function rankMap(lang) {
  if (!RANK_CACHE.has(lang)) {
    RANK_CACHE.set(lang, buildRankMap(lang === 'fr' ? TOP_WORDS_FR : TOP_WORDS_EN));
  }
  return RANK_CACHE.get(lang);
}

const ZIPF_S = 1.07;

/**
 * Surprise (-log2 p) d'un mot selon le modele Zipf, avec plancher OOV.
 * Un texte tres previsible (beaucoup de mots ultra-frequents, peu de rares)
 * produit une surprise moyenne basse : c'est la signature typique d'un LLM
 * qui echantillonne pres du mode de la distribution.
 */
export function wordSurprisal(word, lang = 'en', vocabSize = 60000) {
  const ranks = rankMap(lang);
  const rank = ranks.get(word);
  if (rank) {
    // Normalisation approximative de la constante d'harmonisation.
    const h = 10.5; // ~ H_{60000}(1.07)
    const p = 1 / (rank ** ZIPF_S * h);
    return -Math.log2(Math.max(p, 1e-9));
  }
  // OOV : rang estime a partir de la longueur du mot (les mots longs sont rares).
  const estimatedRank = Math.min(vocabSize, 800 + word.length ** 3.1);
  const h = 10.5;
  const p = 1 / (estimatedRank ** ZIPF_S * h);
  return -Math.log2(Math.max(p, 1e-9));
}

/** Le mot figure-t-il dans la liste de frequence de la langue ? */
export function isInVocab(word, lang = 'en') {
  return rankMap(lang).has(word);
}

/**
 * Surprise restreinte au vocabulaire connu.
 * Motivation : la surprise brute confond "texte previsible" et "texte savant",
 * puisqu'un mot absent de la liste recoit une surprise elevee du seul fait de
 * sa longueur. En separant les mots connus (ou l'on mesure vraiment le choix
 * entre frequent et moins frequent) du taux de mots hors vocabulaire, on
 * neutralise en grande partie l'effet de registre.
 */
export function inVocabSurprisal(word, lang = 'en') {
  const rank = rankMap(lang).get(word);
  if (!rank) return null;
  const p = 1 / (rank ** ZIPF_S * 10.5);
  return -Math.log2(Math.max(p, 1e-9));
}
