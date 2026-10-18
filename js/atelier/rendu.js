// Mise en page d'un scénario de l'atelier : produit le HTML du livret (couverture, mot au MJ, sommaire,
// parties en deux colonnes, aides de jeu, fiches PNJ, licence). Le même HTML sert à l'aperçu et au PDF.

import { CARACS, modificateur, signe } from "./modele.js";

export const echapper = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const ancre = (prefixe, id) => `${prefixe}-${String(id).replace(/[^\w-]/g, "")}`;

/**
 * Mise en forme légère : **gras**, *italique*, __souligné__, [[Nom d'un PNJ]] ou [[Nom|texte affiché]]
 * (renvoi souligné vers sa fiche).
 */
export function enLigne(texte, s) {
  const pnj = new Map((s?.pnj ?? []).map((n) => [n.nom.trim().toLowerCase(), n]));
  return echapper(texte)
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, nom, affiche) => {
      const n = pnj.get(nom.trim().toLowerCase());
      const texte = affiche ?? nom;
      return n ? `<a class="renvoi" href="#${ancre("pnj", n.id)}">${texte}</a>` : `<u>${texte}</u>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<u>$1</u>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

/** Paragraphes (ligne vide), listes à puces (« - ») et numérotées (« 1. »). */
export function paragraphes(texte, s) {
  const blocs = String(texte ?? "").replace(/\r/g, "").split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return blocs.map((b) => {
    const lignes = b.split("\n");
    if (lignes.every((l) => /^\s*[-•]\s+/.test(l))) {
      return `<ul>${lignes.map((l) => `<li>${enLigne(l.replace(/^\s*[-•]\s+/, ""), s)}</li>`).join("")}</ul>`;
    }
    if (lignes.every((l) => /^\s*\d+[.)]\s+/.test(l))) {
      return `<ol>${lignes.map((l) => `<li>${enLigne(l.replace(/^\s*\d+[.)]\s+/, ""), s)}</li>`).join("")}</ol>`;
    }
    return `<p>${lignes.map((l) => enLigne(l, s)).join("<br>")}</p>`;
  }).join("");
}

const img = (s, id, classe = "", alt = "") => (id && s.images[id]
  ? `<img class="${classe}" src="${s.images[id]}" alt="${echapper(alt)}">` : "");

function bloc(b, s) {
  switch (b.type) {
    case "intertitre": return `<h3 class="intertitre">${enLigne(b.texte, s)}</h3>`;
    case "lire": return `<div class="encadre lire">${paragraphes(b.texte, s)}</div>`;
    case "mj": return `<div class="encadre mj">${paragraphes(b.texte, s)}</div>`;
    case "image": {
      const image = img(s, b.image, "", b.legende);
      if (!image) return "";
      return `<figure class="illustration ${b.taille === "page" ? "pleine-largeur" : ""}">${image}`
        + `${b.legende ? `<figcaption>${enLigne(b.legende, s)}</figcaption>` : ""}</figure>`;
    }
    case "saut": return '<div class="saut-colonne"></div>';
    default: return paragraphes(b.texte, s);
  }
}

function couverture(s) {
  return `<section class="page couverture" id="couverture">
    <h1 class="titre-couverture">${s.prefixe ? `${echapper(s.prefixe)} - ` : ""}${echapper(s.titre)}</h1>
    ${img(s, s.couverture, "image-couverture", s.titre)}
    ${s.accroche ? `<p class="accroche">${enLigne(s.accroche, s)}</p>` : ""}
    <p class="niveau-couverture">pour des personnages de niveau ${s.niveau}${s.duree ? ` · ${echapper(s.duree)}` : ""}</p>
    <div class="pied-couverture">
      <div class="marque">${img(s, s.logo, "logo", s.marque)}${s.marque && !s.logo ? `<span>${echapper(s.marque)}</span>` : ""}</div>
      ${s.mention ? `<div class="mention">${echapper(s.mention)}</div>` : ""}
    </div>
  </section>`;
}

function motAuMj(s) {
  const m = s.mot_mj;
  return `<section class="page mot-mj" id="mot-mj">
    ${img(s, m.image, "bandeau")}
    <div class="deux-colonnes">
      <div>
        <h2 class="titre-manuscrit">${echapper(m.titre)}</h2>
        ${paragraphes(m.texte, s)}
        ${m.signature ? `<div class="signature">${paragraphes(m.signature, s)}</div>` : ""}
      </div>
      <div>
        <div class="encadre lire"><p>Tout au long de l'aventure, vous rencontrerez du texte dans des encadrés blancs.
          Ils contiennent des descriptions, des indices ou des dialogues destinés à être lus à voix haute à vos joueurs.</p></div>
        <div class="encadre mj"><p>Les encadrés gris contiennent des informations pour le MJ : conseils, rappels de règles et
          variantes. Vous pouvez les ignorer : le plus important est de vous amuser.</p></div>
        ${m.a_savoir ? `<h4 class="a-savoir">À savoir :</h4>${paragraphes(m.a_savoir, s)}` : ""}
        ${s.pnj.length ? '<p class="note-renvoi"><u>Profils</u> : un nom souligné renvoie à la fiche du PNJ ou de la créature en annexe.</p>' : ""}
      </div>
    </div>
  </section>`;
}

function sommaire(s) {
  const entrees = [
    ...s.parties.map((p) => [ancre("partie", p.id), p.titre]),
    ...(s.aides.length ? [[ancre("aide", s.aides[0].id), s.aides.length > 1 ? "Aides de jeu" : "Aide de jeu"]] : []),
    ...(s.pnj.length ? [["pnj-liste", "PNJ et monstres"]] : []),
    ["licence", "Licence et crédits"],
  ];
  return `<section class="page sommaire" id="sommaire">
    <h2 class="titre-sommaire">Sommaire</h2>
    <ul class="liste-sommaire">${entrees.map(([id, titre]) => `<li><a href="#${id}"><span>${echapper(titre)}</span></a></li>`).join("")}</ul>
    ${img(s, s.sommaire_image, "image-sommaire")}
  </section>`;
}

/** Blocs en deux colonnes ; une image « pleine largeur » interrompt les colonnes (plus fiable à l'impression). */
function colonnes(blocs, s) {
  const morceaux = [];
  let courant = [];
  const fermer = () => {
    if (courant.length) morceaux.push(`<div class="colonnes">${courant.join("")}</div>`);
    courant = [];
  };
  for (const b of blocs) {
    if (b.type === "image" && b.taille === "page") {
      fermer();
      morceaux.push(bloc(b, s));
    } else {
      courant.push(bloc(b, s));
    }
  }
  fermer();
  return morceaux.join("");
}

function partie(p, s, index) {
  return `<section class="partie" id="${ancre("partie", p.id)}">
    ${index === 0 ? `<h1 class="titre-scenario">${echapper(s.titre)}</h1>` : ""}
    <h2 class="titre-partie">${enLigne(p.titre, s)}</h2>
    ${img(s, p.image, "bandeau")}
    ${colonnes(p.blocs, s)}
  </section>`;
}

function aide(a, s) {
  return `<section class="page aide" id="${ancre("aide", a.id)}">
    ${a.titre ? `<h2 class="titre-aide">${enLigne(a.titre, s)}</h2>` : ""}
    ${a.consigne ? `<div class="encadre mj">${paragraphes(a.consigne, s)}</div>` : ""}
    ${a.texte ? `<div class="texte-aide ${a.manuscrit ? "manuscrit" : ""}">${paragraphes(a.texte, s)}</div>` : ""}
    ${img(s, a.image, "image-aide", a.titre)}
  </section>`;
}

function fiche(n, s) {
  const lignes = (liste) => liste.filter((t) => t.nom || t.texte)
    .map((t) => `<p><u>${enLigne(t.nom, s)}</u>${t.nom ? ". " : ""}${enLigne(t.texte, s)}</p>`).join("");
  const infos = [
    ["Compétences", n.competences], ["Sens", n.sens], ["Langues", n.langues],
    ["Puissance", n.puissance ? `${n.puissance}${n.xp ? ` (${n.xp} PX)` : ""}` : ""],
  ].filter(([, v]) => v);
  return `<article class="fiche-pnj" id="${ancre("pnj", n.id)}">
    ${img(s, n.image, "filigrane")}
    <div class="fiche-gauche">
      <h2 class="nom-pnj">${echapper(n.nom)}</h2>
      <p class="type-pnj">${echapper([n.type, n.alignement].filter(Boolean).join(", "))}</p>
      ${n.description ? `<p class="description-pnj">${enLigne(n.description, s)}</p>` : ""}
      <p class="defenses">Classe d'armure ${echapper(n.ca)}${n.ca_detail ? ` (${echapper(n.ca_detail)})` : ""}<br>
        Points de vie ${echapper(n.pv)}${n.pv_formule ? ` (${echapper(n.pv_formule)})` : ""}<br>Vitesse ${echapper(n.vitesse)}</p>
      <table class="caracs"><tr>${CARACS.map((c) => `<th>${c}</th>`).join("")}</tr>
        <tr>${CARACS.map((c) => `<td>${n.caracs[c]} (${signe(modificateur(n.caracs[c]))})</td>`).join("")}</tr></table>
      ${infos.map(([k, v]) => `<p class="info-pnj"><u>${k}</u> : ${enLigne(v, s)}</p>`).join("")}
    </div>
    <div class="fiche-droite">
      ${n.traits.length ? `<h3>Capacités</h3>${lignes(n.traits)}` : ""}
      ${n.actions.length ? `<h3>Actions</h3>${lignes(n.actions)}` : ""}
    </div>
  </article>`;
}

function licence(s) {
  const annee = new Date(s.maj_le || Date.now()).getFullYear();
  return `<section class="page licence" id="licence">
    <h2 class="titre-sommaire">Licence et crédits</h2>
    ${s.credits ? paragraphes(s.credits, s) : ""}
    <p>Ce scénario utilise des règles issues du <em>System Reference Document 5.1</em> (« SRD 5.1 ») de
      Wizards of the Coast LLC, disponible sur https://dnd.wizards.com/resources/systems-reference-document.
      Le SRD 5.1 est publié sous licence Creative Commons Attribution 4.0 International
      (https://creativecommons.org/licenses/by/4.0/legalcode).</p>
    <p lang="en"><em>This work includes material taken from the System Reference Document 5.1 (“SRD 5.1”) by Wizards of
      the Coast LLC and available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed
      under the Creative Commons Attribution 4.0 International License available at
      https://creativecommons.org/licenses/by/4.0/legalcode.</em></p>
    <p>Ce produit n'est ni affilié à Wizards of the Coast ni approuvé par elle.</p>
    <div class="pied-licence">${img(s, s.logo, "logo")}
      <span>© ${annee} ${echapper(s.marque || s.auteurs || "")}${s.auteurs && s.marque ? ` — ${echapper(s.auteurs)}` : ""}</span></div>
  </section>`;
}

/** Le livret complet. */
export function livret(s) {
  return `<article class="livret">
    ${couverture(s)}
    ${motAuMj(s)}
    ${sommaire(s)}
    ${s.parties.map((p, i) => partie(p, s, i)).join("")}
    ${s.aides.map((a) => aide(a, s)).join("")}
    ${s.pnj.length ? `<section class="partie pnj-liste" id="pnj-liste"><h2 class="titre-partie">Liste PNJ et monstres</h2>
      ${s.pnj.map((n) => fiche(n, s)).join("")}</section>` : ""}
    ${licence(s)}
  </article>`;
}

/** Identifiant HTML d'un élément du scénario, pour faire défiler l'aperçu jusqu'à lui. */
export function ancreDe(type, id) {
  return { partie: ancre("partie", id), pnj: ancre("pnj", id), aide: ancre("aide", id) }[type]
    ?? { infos: "couverture", mot: "mot-mj", pnj_liste: "pnj-liste", licence: "licence" }[type] ?? "";
}
