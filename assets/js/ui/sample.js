/**
 * Demo texts, one per interface language.
 *
 * Both were deliberately produced by a language model and left untouched: they
 * let a visitor see what a high score looks like. The interface labels them as
 * such, so nobody is misled about their nature.
 */

const SAMPLES = {
  en: `Artificial intelligence has emerged as a transformative force in the modern business landscape. It is important to note that this evolution is not limited to the adoption of new tools: it implies a profound overhaul of processes, skills and corporate cultures.

In this context, data governance plays a central role. Indeed, the quality, traceability and accessibility of information directly condition the relevance of the decisions taken. Furthermore, compliance with the regulatory framework, particularly regarding the protection of personal data, constitutes an unavoidable requirement for any responsible organisation.

The human dimension also deserves particular attention. While automation delivers significant efficiency gains, it is essential to support employees throughout the transition. Companies that invest in continuous training generally observe smoother adoption, stronger engagement and a notable reduction in resistance to change.

The question of security cannot be neglected. As systems become more complex and interconnected, the risk exposure surface mechanically widens. Consequently, a defence-in-depth approach becomes not merely desirable but indispensable. Regular audits, continuous monitoring and clear incident management procedures constitute the foundation of a resilient architecture.

In conclusion, the success of a transformation built on artificial intelligence depends less on the technology itself than on the manner in which it is implemented. By adopting a holistic approach that combines innovation and responsibility, organisations can position themselves sustainably in a constantly evolving environment.`,

  fr: `L'intelligence artificielle s'impose aujourd'hui comme un levier de transformation majeur pour l'ensemble des organisations. Il est important de noter que cette evolution ne se limite pas a l'adoption de nouveaux outils : elle implique une refonte profonde des processus, des competences et des cultures d'entreprise.

Dans ce contexte, la gouvernance des donnees joue un role central. En effet, la qualite, la tracabilite et l'accessibilite des informations conditionnent directement la pertinence des decisions prises. Par ailleurs, le respect du cadre reglementaire, notamment en matiere de protection des donnees personnelles, constitue une exigence incontournable pour toute organisation responsable.

La dimension humaine merite egalement une attention particuliere. Si l'automatisation permet des gains d'efficacite significatifs, il est essentiel d'accompagner les collaborateurs tout au long de la transition. Les entreprises qui investissent dans la formation continue observent generalement une adoption plus fluide, un engagement renforce et une reduction notable des resistances au changement.

La question de la securite ne saurait etre negligee. A mesure que les systemes se complexifient et s'interconnectent, la surface d'exposition aux risques s'elargit mecaniquement. Par consequent, une approche de defense en profondeur devient non seulement souhaitable mais indispensable. Des audits reguliers, une supervision continue et des procedures claires de gestion des incidents constituent le socle d'une architecture resiliente.

En conclusion, la reussite d'une transformation reposant sur l'intelligence artificielle depend moins de la technologie elle-meme que de la maniere dont elle est mise en oeuvre. En adoptant une demarche globale, alliant innovation et responsabilite, les organisations peuvent se positionner durablement dans un environnement en constante evolution.`,
};

export function getSample(lang = 'en') {
  return SAMPLES[lang] ?? SAMPLES.en;
}
