/**
 * Echantillons de calibration.
 *
 * Ce ne sont PAS des donnees d'entrainement : le detecteur n'apprend rien.
 * Ils servent de garde-fou de non-regression : on verifie que les textes
 * clairement generes se placent au-dessus des textes clairement humains, et
 * que les seuils de prudence sont respectes.
 */

export const AI_LIKE = [
  {
    id: 'ai-corporate-en',
    lang: 'en',
    text: `Artificial intelligence has emerged as a transformative force in the modern business landscape. It is important to note that organizations across every sector are now grappling with the multifaceted implications of this technology. Furthermore, the pace of change shows no signs of slowing down.

One of the key considerations for decision makers is the question of data governance. By leveraging robust frameworks, companies can unlock the potential of their information assets while maintaining compliance with an ever-evolving regulatory environment. Moreover, a comprehensive approach to data quality ensures that downstream applications deliver reliable outcomes.

Another crucial factor is the human dimension. While automation offers significant efficiency gains, it is essential to recognize that employees require support during periods of transition. Organizations that invest in reskilling programs tend to experience smoother adoption curves and higher levels of engagement. Additionally, transparent communication fosters trust across the entire workforce.

Security considerations also play a vital role in any deployment strategy. As systems become more interconnected, the attack surface expands accordingly. Consequently, a defense-in-depth posture becomes not merely advisable but imperative. Regular audits, continuous monitoring, and clear incident response procedures form the foundation of a resilient architecture.

In conclusion, the strategic adoption of artificial intelligence represents a significant opportunity for forward-thinking organizations. By embracing a holistic approach that balances innovation with responsibility, businesses can position themselves for sustainable competitive advantage in an increasingly complex marketplace. Ultimately, success depends not on the technology itself but on the thoughtfulness with which it is applied.`,
  },
  {
    id: 'ai-listicle-en',
    lang: 'en',
    text: `Improving your sleep quality does not require expensive equipment or complicated routines. Below are several evidence-based strategies that can help you rest more effectively.

First and foremost, maintain a consistent schedule. Going to bed and waking up at the same time each day helps regulate your circadian rhythm. This consistency signals to your body when it should feel alert and when it should wind down.

Second, optimize your sleep environment. A cool, dark, and quiet room provides the ideal conditions for restorative rest. Consider blackout curtains, a white noise machine, or a comfortable mattress suited to your preferred sleeping position.

Third, limit screen exposure before bedtime. The blue light emitted by phones and laptops can suppress melatonin production, making it harder to fall asleep. Establishing a screen-free window of at least an hour before bed is a simple yet effective adjustment.

Fourth, be mindful of what you consume. Caffeine can remain in your system for many hours, and while alcohol may initially induce drowsiness, it tends to fragment sleep later in the night. Similarly, heavy meals close to bedtime can cause discomfort.

Finally, incorporate a relaxing pre-sleep routine. Reading, gentle stretching, or breathing exercises can signal to your nervous system that it is time to transition into rest.

In summary, better sleep is largely a matter of consistency and environment. By implementing these strategies gradually, you can create sustainable habits that support your overall wellbeing.`,
  },
  {
    id: 'ai-corporate-fr',
    lang: 'fr',
    text: `La transformation numerique represente aujourd'hui un enjeu majeur pour l'ensemble des organisations. Il est important de noter que cette evolution ne se limite pas a l'adoption de nouveaux outils : elle implique une refonte profonde des processus et des cultures d'entreprise.

Dans ce contexte, la gouvernance des donnees joue un role central. En effet, la qualite et la tracabilite des informations conditionnent directement la pertinence des decisions prises. Par ailleurs, le respect du cadre reglementaire, notamment en matiere de protection des donnees personnelles, constitue une exigence incontournable.

La dimension humaine merite egalement une attention particuliere. Si l'automatisation permet des gains d'efficacite significatifs, il est essentiel d'accompagner les collaborateurs tout au long de la transition. Les organisations qui investissent dans la formation continue observent generalement une adoption plus fluide et un engagement renforce.

La question de la securite ne saurait etre negligee. A mesure que les systemes se complexifient, la surface d'exposition aux risques s'elargit. Par consequent, une approche de defense en profondeur devient non seulement souhaitable mais indispensable. Des audits reguliers, une supervision continue et des procedures claires de gestion des incidents constituent le socle d'une architecture resiliente.

En conclusion, la reussite d'une transformation numerique repose moins sur la technologie elle-meme que sur la maniere dont elle est mise en oeuvre. En adoptant une demarche globale, alliant innovation et responsabilite, les organisations peuvent se positionner durablement dans un environnement en constante evolution.`,
  },
];

export const HUMAN_LIKE = [
  {
    id: 'human-blog-en',
    lang: 'en',
    text: `So I finally got round to fixing the boiler yesterday. Took me four hours. Four! The manual said twenty minutes, which, honestly, made me laugh out loud in an empty kitchen.

Turns out the previous owner had wedged a bit of cardboard behind the pressure valve. No idea why. Cardboard. In a boiler. My neighbour Tom came over halfway through with tea and mostly stood there saying things like "hmm, that doesn't look right", which was accurate but not especially useful.

Here's the thing about old boilers. Everyone tells you they're simple. They are not simple. There are twelve pipes and eleven of them look identical and one of them is apparently very important. I found this out the hard way, at about two in the afternoon, when a small amount of water came out of somewhere it definitely should not have.

Anyway. It works now. Mostly. There's a rattle when it kicks in around six in the morning and I've decided that's a problem for future me, who I'm sure will be delighted.

One thing I did learn: photograph the wiring before you pull anything apart. I didn't. I spent an hour staring at three identical brown wires with a growing sense of dread, googling phrases like "boiler wiring which brown one" as if that would help. It did not help.

Next weekend it's the shed door. The shed door has been broken since March. I have made peace with the shed door.`,
  },
  {
    id: 'human-review-en',
    lang: 'en',
    text: `Bought this laptop in March after my old one died mid-presentation, which was fun. Three months in, here's where I've landed.

The screen is genuinely great. Colours are accurate enough that I stopped second-guessing my photo edits, and the matte finish means I can work by a window without seeing my own face staring back. Battery lasts a full working day if I'm mostly in a browser and a text editor. If I open the video software, that drops to maybe four hours, which the marketing did not mention anywhere.

Keyboard: fine. Not great. The arrow keys are tiny and I keep hitting page-up instead of up. Trackpad is excellent though, no complaints there.

Two actual problems. The fan spins up for no reason I can determine, sometimes when nothing is running. Support told me to reset something called the SMC. It helped for about a week. Second, the hinge creaks. Not loose, just creaks. It's been doing it since week two and it bothers me more than it should.

Would I buy it again? Probably, yeah. It does the job and I've stopped thinking about it, which is the highest compliment I can pay a computer. But I'd wait for a sale. Full price felt steep for what you get, especially with the charger being sold separately, which is a decision someone made on purpose and should feel bad about.`,
  },
  {
    id: 'human-blog-fr',
    lang: 'fr',
    text: `Bon, alors, le marche du samedi matin. J'y vais depuis quoi, six ans maintenant ? Et j'ai toujours le meme probleme : je pars pour trois trucs et je reviens avec un sac de dix kilos et zero plan pour le diner.

La semaine derniere, par exemple. Il me fallait des oeufs. Juste des oeufs. Je suis rentre avec des oeufs, oui, mais aussi trois bottes de radis (pourquoi trois ?), un fromage dont j'ai oublie le nom, et un poulet entier que le type m'a vendu en me racontant l'histoire de sa ferme pendant dix minutes. Je n'ai pas ose partir. C'etait un bon poulet cela dit.

Ce que j'aime bien, en vrai, c'est le bruit. Ca gueule dans tous les sens, il y a toujours quelqu'un qui negocie pour un cageot de tomates, et vers midi les prix s'effondrent parce que personne ne veut remballer. C'est la que ma voisine du dessus fait ses courses. Elle m'a explique sa strategie une fois. Elle a une strategie.

Le seul truc qui m'agace : la queue chez le poissonnier. Vingt minutes. A chaque fois. J'ai essaye d'y aller a huit heures, c'etait pire. J'ai renonce, maintenant j'achete le poisson au supermarche et je m'en veux un peu.

Bref. J'y retourne samedi. Il me faut des oeufs.`,
  },
];

export const EDGE_CASES = [
  {
    id: 'too-short',
    text: 'Ce texte est beaucoup trop court pour etre analyse serieusement.',
    expect: 'tooShort',
  },
  {
    id: 'technical-human',
    lang: 'en',
    text: `The migration failed on the third shard because the index rebuild ran out of temp space. We had allocated 40GB, which was sized off the staging dataset, and production turned out to be 3.2x larger. Obvious in hindsight.

Fix was in two parts. First we bumped temp to 200GB on the affected nodes, which is wasteful but we needed the migration to complete before the maintenance window closed at 06:00. Second, we changed the rebuild to run per-partition instead of across the whole table, so peak temp usage now scales with the largest partition rather than the total.

Rollback plan was to restore from the pre-migration snapshot, which we tested on shard 5 beforehand. Restore took 22 minutes, well inside the window, so we were comfortable proceeding.

Open item: the sizing script still reads from staging. Ticket filed. Until that's fixed, anyone running this needs to check production row counts by hand, and I'd rather we not rely on people remembering to do that.`,
    note: 'Texte humain technique et sobre : piege classique a faux positif.',
  },
];
