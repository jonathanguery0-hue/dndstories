// Interface de l'atelier : bibliothèque de scénarios, plan, formulaires, aperçu en direct, import/export.

import * as modele from "./modele.js";
import { ancreDe, echapper, livret } from "./rendu.js";
import * as base from "./stockage.js";
import { enregistrerScenarioJeu, supprimerScenarioJeu } from "../stockage.js";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

let S = null;                        // scénario ouvert
let selection = { type: "infos" };   // élément affiché dans le formulaire
let minuteurSauvegarde = null;
let minuteurApercu = null;
let apercuAncre = null;
let apercuDefilement = 0;

const idJeu = (s) => `perso-${s.id}`;

// ------------------------------------------------------------------ chemins dans le scénario

const lire = (chemin) => chemin.split(".").reduce((o, k) => o?.[k], S);
function ecrire(chemin, valeur) {
  const cles = chemin.split(".");
  const derniere = cles.pop();
  cles.reduce((o, k) => o[k], S)[derniere] = valeur;
}

// ------------------------------------------------------------------ bibliothèque

async function afficherBibliotheque() {
  S = null;
  history.replaceState(null, "", location.pathname);
  $("#editeur").hidden = true;
  $("#actions-scenario").hidden = true;
  $("#bibliotheque").hidden = false;
  $("#etat-sauvegarde").textContent = "";
  document.title = "Atelier de scénarios";
  const liste = await base.lister().catch((e) => { $("#erreur-bibliotheque").textContent = e.message; return []; });
  $("#liste-scenarios").innerHTML = liste.length ? liste.map((s) => `
    <div class="scenario-ligne">
      <div><strong>${echapper(s.titre || "Sans titre")}</strong><br>
        <small class="discret">Niveau ${s.niveau} · ${s.parties} partie(s) · ${s.pnj} PNJ · modifié le ${new Date(s.maj_le).toLocaleString("fr-FR")}</small></div>
      <div class="actions">
        <button type="button" class="bouton principal" data-ouvrir="${echapper(s.id)}">Ouvrir</button>
        <button type="button" class="bouton danger" data-supprimer-scenario="${echapper(s.id)}" title="Supprimer">🗑️</button>
      </div>
    </div>`).join("") : '<p class="discret">Aucun scénario pour l\'instant. Crée le premier, ou importe un fichier reçu d\'un co-auteur.</p>';
}

$("#liste-scenarios").addEventListener("click", async (e) => {
  const ouvrirB = e.target.closest("[data-ouvrir]");
  const suppr = e.target.closest("[data-supprimer-scenario]");
  if (ouvrirB) ouvrir(ouvrirB.dataset.ouvrir);
  if (suppr && confirm("Supprimer définitivement ce scénario de ce navigateur ? (Exporte-le d'abord pour le garder.)")) {
    await base.supprimer(suppr.dataset.supprimerScenario);
    supprimerScenarioJeu(`perso-${suppr.dataset.supprimerScenario}`);
    afficherBibliotheque();
  }
});

$("#nouveau-scenario").addEventListener("click", async () => {
  const s = modele.nouveauScenario("Mon one-shot");
  await base.enregistrer(s);
  ouvrir(s.id);
});

$("#importer-scenario").addEventListener("change", async (e) => {
  const fichier = e.target.files[0];
  e.target.value = "";
  if (!fichier) return;
  $("#erreur-bibliotheque").textContent = "";
  try {
    const s = modele.normaliser(JSON.parse(await fichier.text()));
    if (await base.charger(s.id) && !confirm(`« ${s.titre} » existe déjà dans ce navigateur. Le remplacer par ce fichier ?\n(Annuler : l'importer comme une copie.)`)) {
      s.id = modele.nouvelId("s");
      s.titre += " (copie)";
    }
    await base.enregistrer(s);
    ouvrir(s.id);
  } catch (err) {
    $("#erreur-bibliotheque").textContent = err instanceof SyntaxError ? "Ce fichier est illisible (ce n'est pas un fichier de scénario)." : err.message;
  }
});

// ------------------------------------------------------------------ ouverture d'un scénario

async function ouvrir(id) {
  const brut = await base.charger(id);
  if (!brut) { afficherBibliotheque(); return; }
  S = modele.normaliser(brut);
  selection = { type: "infos" };
  apercuAncre = null;
  history.replaceState(null, "", `#${encodeURIComponent(S.id)}`);
  $("#bibliotheque").hidden = true;
  $("#editeur").hidden = false;
  $("#actions-scenario").hidden = false;
  rendrePlan();
  rendreFormulaire();
  rendreApercu();
}

$("#bouton-bibliotheque").addEventListener("click", async () => { await sauver(); afficherBibliotheque(); });

// ------------------------------------------------------------------ sauvegarde

function modifie({ plan = false } = {}) {
  $("#etat-sauvegarde").textContent = "Modifications…";
  clearTimeout(minuteurSauvegarde);
  minuteurSauvegarde = setTimeout(sauver, 800);
  clearTimeout(minuteurApercu);
  minuteurApercu = setTimeout(rendreApercu, 700);
  if (plan) rendrePlan();
}

async function sauver() {
  if (!S) return;
  clearTimeout(minuteurSauvegarde);
  try {
    S.images = modele.pourExport(S).images; // on ne garde que les images utilisées
    await base.enregistrer(S);
    if (S.publie) enregistrerScenarioJeu(modele.versScenarioJeu(S));
    else supprimerScenarioJeu(idJeu(S));
    $("#etat-sauvegarde").textContent = "✓ Enregistré";
  } catch (err) {
    $("#etat-sauvegarde").textContent = `⚠️ ${err.message}`;
  }
}

window.addEventListener("beforeunload", () => { if (S) sauver(); });

// ------------------------------------------------------------------ plan

function rendrePlan() {
  const alertes = modele.verifier(S).length;
  const el = (type, index, texte) => {
    const actif = selection.type === type && (index === undefined || selection.index === index);
    return `<button type="button" class="element-plan ${actif ? "actif" : ""}" data-aller="${type}${index === undefined ? "" : `:${index}`}">${texte}</button>`;
  };
  $("#structure").innerHTML = `
    <div class="groupe-plan"><div class="titre-groupe">Livret</div>
      ${el("infos", undefined, "📕 Couverture et infos")}${el("mot", undefined, "✉️ Mot au MJ")}</div>
    <div class="groupe-plan"><div class="titre-groupe">Parties <button type="button" class="ajouter-plan" data-action="ajouter-partie">＋ Ajouter</button></div>
      ${S.parties.map((p, i) => el("partie", i, `📜 ${echapper(modele.texteBrut(p.titre) || `Partie ${i + 1}`)}`)).join("")}</div>
    <div class="groupe-plan"><div class="titre-groupe">PNJ et monstres <button type="button" class="ajouter-plan" data-action="ajouter-pnj">＋ Ajouter</button></div>
      ${S.pnj.map((n, i) => el("pnj", i, `👤 ${echapper(n.nom || "Sans nom")}`)).join("") || '<small class="discret">&nbsp;Aucun pour l\'instant</small>'}</div>
    <div class="groupe-plan"><div class="titre-groupe">Aides de jeu <button type="button" class="ajouter-plan" data-action="ajouter-aide">＋ Ajouter</button></div>
      ${S.aides.map((a, i) => el("aide", i, `🧩 ${echapper(modele.texteBrut(a.titre) || modele.texteBrut(a.texte).split("\n")[0] || `Aide ${i + 1}`)}`)).join("") || '<small class="discret">&nbsp;Aucune pour l\'instant</small>'}</div>
    <div class="groupe-plan"><div class="titre-groupe">Finitions</div>
      ${el("ia", undefined, `🤖 Jouer avec l'IA${S.publie ? " ✓" : ""}`)}
      ${el("verif", undefined, `${alertes ? `<span class="alerte">⚠️ Vérifications (${alertes})</span>` : "✅ Vérifications"}`)}</div>`;
}

$("#structure").addEventListener("click", (e) => {
  const b = e.target.closest("[data-aller]");
  if (!b) return;
  const [type, index] = b.dataset.aller.split(":");
  aller(type, index === undefined ? undefined : Number(index));
});

function aller(type, index) {
  selection = { type, index };
  rendrePlan();
  rendreFormulaire();
  afficherVue("formulaire");
  defilerApercu();
  $("#formulaire").scrollTop = 0;
}

// ------------------------------------------------------------------ champs de formulaire

const valeur = (chemin) => echapper(lire(chemin) ?? "");
const lignes = (texte) => Math.min(Math.max(String(texte ?? "").split("\n").length + Math.ceil(String(texte ?? "").length / 75), 3), 22);

const champTexte = (libelle, chemin, { plan = false, placeholder = "" } = {}) => `<label class="champ"><span>${libelle}</span>
  <input type="text" data-champ="${chemin}" ${plan ? 'data-plan="1"' : ""} value="${valeur(chemin)}" placeholder="${echapper(placeholder)}"></label>`;
const champZone = (libelle, chemin, { placeholder = "" } = {}) => `<label class="champ"><span>${libelle}</span>
  <textarea data-champ="${chemin}" rows="${lignes(lire(chemin))}" placeholder="${echapper(placeholder)}">${valeur(chemin)}</textarea></label>`;
const champNombre = (libelle, chemin, { min = 0, max = 99 } = {}) => `<label class="champ"><span>${libelle}</span>
  <input type="number" data-champ="${chemin}" min="${min}" max="${max}" value="${valeur(chemin)}"></label>`;
const caseACocher = (libelle, chemin) => `<label class="case"><input type="checkbox" data-champ="${chemin}" ${lire(chemin) ? "checked" : ""}> ${libelle}</label>`;

function champImage(libelle, chemin) {
  const id = lire(chemin);
  const src = id && S.images[id];
  return `<div class="champ"><span>${libelle}</span><div class="choix-image">
    ${src ? `<img src="${src}" alt="">` : '<div class="vide">🖼️</div>'}
    <label class="bouton petit">${src ? "Changer" : "Choisir une image"}<input type="file" accept="image/*" data-image="${chemin}" hidden></label>
    ${src ? `<button type="button" class="bouton petit danger" data-action="retirer-image" data-chemin="${chemin}">Retirer</button>` : ""}
  </div></div>`;
}

const AIDE_SAISIE = `<p class="aide-saisie">Mise en forme : <code>**gras**</code>, <code>*italique*</code>, <code>__souligné__</code>,
  <code>[[Nom du PNJ]]</code> pour renvoyer vers sa fiche (ou <code>[[Nom|texte affiché]]</code>). Une ligne vide sépare les
  paragraphes ; des lignes commençant par <code>- </code> ou <code>1. </code> font une liste.</p>`;

function entete(titre, liste, index) {
  return `<div class="entete-form"><h2>${titre}</h2>${liste ? `<div class="actions">
    <button type="button" class="bouton petit" data-action="monter" data-liste="${liste}" data-index="${index}" ${index === 0 ? "disabled" : ""} title="Monter">↑</button>
    <button type="button" class="bouton petit" data-action="descendre" data-liste="${liste}" data-index="${index}" ${index === S[liste].length - 1 ? "disabled" : ""} title="Descendre">↓</button>
    <button type="button" class="bouton petit danger" data-action="supprimer" data-liste="${liste}" data-index="${index}" title="Supprimer">🗑️</button>
  </div>` : ""}</div>`;
}

// ------------------------------------------------------------------ formulaires

const FORMULAIRES = {
  infos: () => `${entete("Couverture et infos")}
    ${champTexte("Titre du scénario", "titre", { plan: true })}
    <div class="ligne">${champTexte("Préfixe du titre", "prefixe", { placeholder: "One Shot" })}${champNombre("Niveau des personnages", "niveau", { min: 1, max: 20 })}
      ${champTexte("Durée de jeu", "duree", { placeholder: "3 à 4 heures" })}</div>
    ${champTexte("Accroche (sous l'illustration)", "accroche", { placeholder: "Jusqu'où pourrez-vous aller…" })}
    ${champImage("Illustration de couverture", "couverture")}
    <div class="ligne">${champTexte("Marque ou studio", "marque")}${champTexte("Auteurs", "auteurs")}</div>
    ${champImage("Logo", "logo")}
    ${champTexte("Mention en bas de couverture", "mention", { placeholder: "Compatible 5e" })}
    <p class="aide-saisie">N'écris pas « Donjons &amp; Dragons » ni « D&amp;D » : ce sont des marques. « Compatible 5e » est la mention d'usage.</p>
    ${champImage("Illustration de la page de sommaire", "sommaire_image")}
    ${champZone("Crédits (page de licence)", "credits", { placeholder: "Scénario : … Illustrations : …" })}`,

  mot: () => `${entete("Mot au MJ")}
    ${champTexte("Titre", "mot_mj.titre")}
    ${champImage("Illustration en bandeau", "mot_mj.image")}
    ${champZone("Texte", "mot_mj.texte")}
    ${champZone("Signature", "mot_mj.signature")}
    ${champZone("À savoir (avertissements, contenu sensible…)", "mot_mj.a_savoir")}
    <p class="aide-saisie">Les explications sur les encadrés blancs (à lire) et gris (MJ) sont ajoutées automatiquement.</p>`,

  partie: (i) => {
    const p = S.parties[i];
    const base = `parties.${i}`;
    return `${entete(echapper(modele.texteBrut(p.titre)) || `Partie ${i + 1}`, "parties", i)}
      ${champTexte("Titre", `${base}.titre`, { plan: true })}
      ${champImage("Illustration en bandeau (facultatif)", `${base}.image`)}
      ${AIDE_SAISIE}
      ${p.blocs.map((b, j) => formulaireBloc(b, `${base}.blocs.${j}`, j, p.blocs.length)).join("")}
      <div class="ajout-blocs">${Object.entries(modele.TYPES_BLOCS).map(([type, t]) =>
        `<button type="button" class="bouton petit" data-action="ajouter-bloc" data-type="${type}">＋ ${t.icone} ${t.nom}</button>`).join("")}</div>`;
  },

  pnj: (i) => {
    const b = `pnj.${i}`;
    const n = S.pnj[i];
    const liste = (cle, nom) => `<h3>${nom}</h3>${n[cle].map((t, j) => `<div class="sous-element"><div>
        <input type="text" data-champ="${b}.${cle}.${j}.nom" value="${valeur(`${b}.${cle}.${j}.nom`)}" placeholder="Nom (ex. Attaques multiples)">
        <textarea data-champ="${b}.${cle}.${j}.texte" rows="${lignes(t.texte)}" placeholder="Description">${valeur(`${b}.${cle}.${j}.texte`)}</textarea></div>
        <button type="button" class="bouton petit danger" data-action="retirer-ligne" data-chemin="${b}.${cle}" data-index="${j}" title="Retirer">✕</button></div>`).join("")}
      <button type="button" class="bouton petit" data-action="ajouter-ligne" data-chemin="${b}.${cle}">＋ Ajouter</button>`;
    return `${entete(echapper(n.nom || "PNJ"), "pnj", i)}
      ${champTexte("Nom (à citer dans le texte avec [[Nom]])", `${b}.nom`, { plan: true })}
      <div class="ligne">${champTexte("Type et taille", `${b}.type`, { placeholder: "Humanoïde (Humain) de taille M" })}${champTexte("Alignement", `${b}.alignement`)}</div>
      ${champTexte("Description courte (pour l'IA et la fiche)", `${b}.description`)}
      ${champImage("Illustration (en filigrane sur la fiche)", `${b}.image`)}
      <div class="ligne">${champNombre("Classe d'armure", `${b}.ca`, { min: 1, max: 30 })}${champTexte("Détail CA", `${b}.ca_detail`, { placeholder: "armure naturelle" })}
        ${champNombre("Points de vie", `${b}.pv`, { min: 1, max: 999 })}${champTexte("Formule PV", `${b}.pv_formule`, { placeholder: "6d8+6" })}${champTexte("Vitesse", `${b}.vitesse`)}</div>
      <div class="caracs-form">${modele.CARACS.map((c) => champNombre(c, `${b}.caracs.${c}`, { min: 1, max: 30 })).join("")}</div>
      ${champTexte("Compétences, résistances, immunités", `${b}.competences`)}
      <div class="ligne">${champTexte("Sens", `${b}.sens`)}${champTexte("Langues", `${b}.langues`)}</div>
      <div class="ligne">${champTexte("Puissance (FP)", `${b}.puissance`)}${champNombre("PX", `${b}.xp`, { min: 0, max: 100000 })}</div>
      ${liste("traits", "Capacités")}
      ${liste("actions", "Actions")}
      <h3>Pour les combats joués avec l'IA</h3>
      <p class="aide-saisie">Le jeu fait combattre ce personnage avec une attaque type. Le bouton remplit ces champs depuis ses actions.</p>
      <div class="ligne">${champNombre("Bonus d'attaque", `${b}.combat.attaque`, { min: -5, max: 20 })}${champTexte("Dégâts", `${b}.combat.degats`, { placeholder: "1d6+2" })}
        ${champTexte("Type de dégâts", `${b}.combat.type_degats`, { placeholder: "perforant" })}${champNombre("Attaques par tour", `${b}.combat.attaques`, { min: 1, max: 4 })}</div>
      <button type="button" class="bouton petit" data-action="remplir-combat" data-index="${i}">🪄 Remplir depuis les actions</button>`;
  },

  aide: (i) => {
    const b = `aides.${i}`;
    return `${entete(`Aide de jeu ${i + 1}`, "aides", i)}
      ${champTexte("Titre (facultatif)", `${b}.titre`, { plan: true })}
      ${champZone("Consigne au MJ (encadré gris)", `${b}.consigne`, { placeholder: "Ce document est à donner aux joueurs…" })}
      ${champZone("Texte", `${b}.texte`)}
      ${caseACocher("Écriture manuscrite (lettre, note griffonnée…)", `${b}.manuscrit`)}
      ${champImage("Image (carte, plan, document…)", `${b}.image`)}`;
  },

  ia: () => {
    const jeu = modele.versScenarioJeu(S);
    return `${entete("Jouer avec l'IA")}
      ${caseACocher("Proposer ce scénario dans le jeu (liste des aventures)", "publie")}
      <p class="aide-saisie">Le bouton ▶️ « Jouer avec l'IA » l'active et lance la création d'un héros. Le scénario prévu pour une
        table est adapté automatiquement à un joueur seul ; les PNJ et monstres de tes fiches sont utilisables en combat.</p>
      ${champZone("Scène d'ouverture pour l'IA (facultatif)", "ia.intro", { placeholder: "Commence la partie : le héros est attablé dans une taverne…" })}
      ${champZone("Consignes pour l'IA (facultatif)", "ia.consignes", { placeholder: "Ce qu'un bon MJ doit savoir pour mener ce scénario : ambiance, secrets, pièges à éviter…" })}
      <details><summary>Voir ce que lit l'IA (≈ ${Math.round(jeu.notes_mj.length / 3.6).toLocaleString("fr-FR")} jetons)</summary>
        <pre style="white-space:pre-wrap;font-size:.85rem;color:var(--discret)">${echapper(jeu.notes_mj)}</pre></details>`;
  },

  verif: () => {
    const alertes = modele.verifier(S);
    return `${entete("Vérifications")}
      ${alertes.length ? `<ul class="alertes">${alertes.map((a) => `<li>${echapper(a)}</li>`).join("")}</ul>`
        : '<p class="tout-va-bien">✅ Rien à signaler : ton scénario est prêt à être mis en page et joué.</p>'}
      <p class="aide-saisie">Pense aussi à faire relire le texte (orthographe) et à tester le scénario en vraie partie avant de le publier.</p>`;
  },
};

function formulaireBloc(b, chemin, j, total) {
  const t = modele.TYPES_BLOCS[b.type];
  const types = ["texte", "lire", "mj", "intertitre"];
  let corps;
  if (b.type === "intertitre") corps = `<input type="text" data-champ="${chemin}.texte" value="${valeur(`${chemin}.texte`)}" placeholder="Intertitre">`;
  else if (b.type === "image") {
    corps = `${champImage("Image", `${chemin}.image`)}${champTexte("Légende (facultatif)", `${chemin}.legende`)}
      <label class="champ"><span>Taille</span><select data-champ="${chemin}.taille">
        <option value="colonne" ${b.taille !== "page" ? "selected" : ""}>Dans la colonne</option>
        <option value="page" ${b.taille === "page" ? "selected" : ""}>Pleine largeur (carte, plan)</option></select></label>`;
  } else if (b.type === "saut") corps = "Le contenu suivant commence en haut de la colonne suivante.";
  else {
    const indications = { texte: "Texte de l'aventure…", lire: "Texte à lire à voix haute aux joueurs…", mj: "Conseil, rappel de règle ou variante pour le MJ…" };
    corps = `<textarea data-champ="${chemin}.texte" rows="${lignes(b.texte)}" placeholder="${indications[b.type]}">${valeur(`${chemin}.texte`)}</textarea>`;
  }
  const choixType = types.includes(b.type)
    ? `<select data-champ="${chemin}.type" data-retracer="1" title="Changer le type de bloc">${types.map((ty) =>
      `<option value="${ty}" ${ty === b.type ? "selected" : ""}>${modele.TYPES_BLOCS[ty].icone} ${modele.TYPES_BLOCS[ty].nom}</option>`).join("")}</select>`
    : `<span>${t.icone} ${t.nom}</span>`;
  return `<div class="bloc ${b.type}"><div class="bloc-entete"><span class="type">${choixType}</span>
      <button type="button" data-action="bloc-monter" data-index="${j}" ${j === 0 ? "disabled" : ""} title="Monter">↑</button>
      <button type="button" data-action="bloc-descendre" data-index="${j}" ${j === total - 1 ? "disabled" : ""} title="Descendre">↓</button>
      <button type="button" data-action="bloc-supprimer" data-index="${j}" title="Supprimer">✕</button></div>
    <div class="bloc-corps">${corps}</div></div>`;
}

function rendreFormulaire() {
  const f = FORMULAIRES[selection.type];
  if (!f || (selection.index !== undefined && selection.index >= (S[{ partie: "parties", pnj: "pnj", aide: "aides" }[selection.type]]?.length ?? 0))) {
    selection = { type: "infos" };
    return rendreFormulaire();
  }
  const defilement = $("#formulaire").scrollTop;
  $("#formulaire").innerHTML = f(selection.index);
  $("#formulaire").scrollTop = defilement;
  document.title = `${S.titre || "Scénario"} — Atelier`;
}

// ------------------------------------------------------------------ saisie

$("#formulaire").addEventListener("input", (e) => {
  const el = e.target.closest("[data-champ]");
  if (!el || el.tagName === "SELECT") return;
  const v = el.type === "checkbox" ? el.checked : el.type === "number" ? (el.value === "" ? 0 : Number(el.value)) : el.value;
  ecrire(el.dataset.champ, v);
  if (el.tagName === "TEXTAREA") el.rows = lignes(el.value);
  modifie({ plan: el.dataset.plan === "1" || el.type === "checkbox" });
});

$("#formulaire").addEventListener("change", async (e) => {
  const select = e.target.closest("select[data-champ]");
  if (select) {
    ecrire(select.dataset.champ, select.value);
    if (select.dataset.retracer) rendreFormulaire();
    modifie();
    return;
  }
  const fichier = e.target.closest("input[type=file][data-image]");
  if (fichier?.files[0]) {
    try {
      const id = modele.nouvelId("img");
      S.images[id] = await compresser(fichier.files[0]);
      ecrire(fichier.dataset.image, id);
      rendreFormulaire();
      modifie();
    } catch {
      alert("Cette image n'a pas pu être lue. Essaie un fichier JPG, PNG ou WebP.");
    }
  }
});

/** Réduit les grandes images (1600 px max, WebP si possible) pour que le scénario reste léger. */
async function compresser(fichier, max = 1600) {
  const url = await new Promise((ok, ko) => {
    const lecteur = new FileReader();
    lecteur.onload = () => ok(lecteur.result);
    lecteur.onerror = ko;
    lecteur.readAsDataURL(fichier);
  });
  const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = url; });
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  let sortie = c.toDataURL("image/webp", 0.85);
  if (!sortie.startsWith("data:image/webp")) sortie = fichier.type === "image/png" ? c.toDataURL("image/png") : c.toDataURL("image/jpeg", 0.85);
  return sortie.length < url.length ? sortie : url;
}

// ------------------------------------------------------------------ actions (boutons)

const LISTES = { parties: "partie", pnj: "pnj", aides: "aide" };

function deplacer(liste, i, delta) {
  const j = i + delta;
  if (j < 0 || j >= liste.length) return false;
  [liste[i], liste[j]] = [liste[j], liste[i]];
  return true;
}

function remplirCombat(n) {
  const actions = [...n.actions, ...n.traits];
  const attaque = actions.find((a) => /au toucher/i.test(a.texte));
  if (!attaque) {
    alert("Aucune action avec « +X au toucher » trouvée : remplis les champs à la main.");
    return;
  }
  const bonus = attaque.texte.match(/([+-]\s*\d+)\s*au toucher/i);
  const degats = attaque.texte.match(/\((\d+d\d+(?:\s*[+-]\s*\d+)?)\)\s*(?:dégâts?|points? de dégâts?)\s*([a-zéèêàç]+)?/i);
  if (bonus) n.combat.attaque = Number(bonus[1].replace(/\s+/g, ""));
  if (degats) {
    n.combat.degats = degats[1].replace(/\s+/g, "");
    if (degats[2]) n.combat.type_degats = degats[2].toLowerCase().replace(/s$/, "");
  }
  const multiples = actions.find((a) => /attaques? multiples/i.test(a.nom));
  const nombre = { deux: 2, trois: 3, quatre: 4 }[multiples?.texte.match(/\b(deux|trois|quatre)\b/i)?.[1]?.toLowerCase()];
  n.combat.attaques = multiples ? nombre ?? 2 : 1;
}

document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-action]");
  if (!b || !S) return;
  const i = Number(b.dataset.index);
  const partie = selection.type === "partie" ? S.parties[selection.index] : null;
  switch (b.dataset.action) {
    case "ajouter-partie":
      S.parties.push(modele.nouvellePartieLivret(`Partie ${S.parties.length}`));
      modifie();
      aller("partie", S.parties.length - 1);
      return;
    case "ajouter-pnj":
      S.pnj.push(modele.nouveauPnj());
      modifie();
      aller("pnj", S.pnj.length - 1);
      return;
    case "ajouter-aide":
      S.aides.push(modele.nouvelleAide());
      modifie();
      aller("aide", S.aides.length - 1);
      return;
    case "monter":
    case "descendre":
      if (deplacer(S[b.dataset.liste], i, b.dataset.action === "monter" ? -1 : 1)) {
        modifie();
        aller(LISTES[b.dataset.liste], i + (b.dataset.action === "monter" ? -1 : 1));
      }
      return;
    case "supprimer": {
      const liste = S[b.dataset.liste];
      if (b.dataset.liste === "parties" && liste.length === 1) { alert("Un scénario a besoin d'au moins une partie."); return; }
      if (!confirm("Supprimer cet élément ?")) return;
      liste.splice(i, 1);
      modifie();
      aller(liste.length ? LISTES[b.dataset.liste] : "infos", liste.length ? Math.max(i - 1, 0) : undefined);
      return;
    }
    case "ajouter-bloc":
      partie.blocs.push(modele.nouveauBloc(b.dataset.type));
      rendreFormulaire();
      modifie();
      $$("#formulaire .bloc").at(-1)?.scrollIntoView({ block: "center" });
      $$("#formulaire .bloc").at(-1)?.querySelector("textarea, input[type=text]")?.focus();
      return;
    case "bloc-monter":
    case "bloc-descendre":
      if (deplacer(partie.blocs, i, b.dataset.action === "bloc-monter" ? -1 : 1)) { rendreFormulaire(); modifie(); }
      return;
    case "bloc-supprimer":
      if (partie.blocs[i].texte?.trim() && !confirm("Supprimer ce bloc et son texte ?")) return;
      partie.blocs.splice(i, 1);
      rendreFormulaire();
      modifie();
      return;
    case "ajouter-ligne":
      lire(b.dataset.chemin).push({ nom: "", texte: "" });
      rendreFormulaire();
      modifie();
      return;
    case "retirer-ligne":
      lire(b.dataset.chemin).splice(i, 1);
      rendreFormulaire();
      modifie();
      return;
    case "retirer-image":
      ecrire(b.dataset.chemin, null);
      rendreFormulaire();
      modifie();
      return;
    case "remplir-combat":
      remplirCombat(S.pnj[i]);
      rendreFormulaire();
      modifie();
      return;
    default:
  }
});

// ------------------------------------------------------------------ export, PDF, jeu

const nomFichier = (s) => (s.titre || "scenario").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "scenario";

$("#bouton-exporter").addEventListener("click", async () => {
  await sauver();
  const blob = new Blob([JSON.stringify(modele.pourExport(S))], { type: "application/json" });
  const lien = document.createElement("a");
  lien.href = URL.createObjectURL(blob);
  lien.download = `${nomFichier(S)}.json`;
  lien.click();
  setTimeout(() => URL.revokeObjectURL(lien.href), 5000);
});

$("#bouton-pdf").addEventListener("click", async () => {
  await sauver();
  window.open(`impression.html#${encodeURIComponent(S.id)}`, "_blank");
});

$("#bouton-jouer").addEventListener("click", async () => {
  const alertes = modele.verifier(S).filter((a) => !/n'a pas de fiche PNJ|introuvable/.test(a));
  if (alertes.length && !confirm(`À vérifier avant de jouer :\n- ${alertes.join("\n- ")}\n\nJouer quand même ?`)) return;
  S.publie = true;
  await sauver();
  location.href = `index.html?scenario=${encodeURIComponent(idJeu(S))}`;
});

// ------------------------------------------------------------------ aperçu

function rendreApercu() {
  if (!S) return;
  const cadre = $("#apercu");
  try { apercuDefilement = cadre.contentWindow?.scrollY ?? 0; } catch { apercuDefilement = 0; }
  const baseUrl = new URL(".", location.href).href;
  cadre.srcdoc = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><base href="${baseUrl}" target="_blank">
    <link rel="stylesheet" href="css/livret.css"></head><body class="apercu">${livret(S)}</body></html>`;
}

function ancreSelection() {
  if (selection.type === "partie") return ancreDe("partie", S.parties[selection.index]?.id);
  if (selection.type === "pnj") return ancreDe("pnj", S.pnj[selection.index]?.id);
  if (selection.type === "aide") return ancreDe("aide", S.aides[selection.index]?.id);
  return ancreDe(selection.type);
}

function defilerApercu() {
  const doc = $("#apercu").contentDocument;
  const cible = doc?.getElementById(ancreSelection());
  if (cible) cible.scrollIntoView({ block: "start" });
  apercuAncre = ancreSelection();
}

/** Réduit les pages A4 (210 mm ≈ 794 px) à la largeur du panneau d'aperçu. */
function ajusterApercu() {
  const cadre = $("#apercu");
  const doc = cadre.contentDocument;
  if (!doc?.body) return;
  const largeur = cadre.clientWidth;
  if (!largeur) return;
  doc.body.style.zoom = String(Math.min(1, (largeur - 32) / 794));
}
window.addEventListener("resize", ajusterApercu);

$("#apercu").addEventListener("load", () => {
  ajusterApercu();
  const ancre = ancreSelection();
  // Même élément qu'avant la mise à jour : on garde la position de lecture ; sinon on va à l'élément.
  if (ancre === apercuAncre) $("#apercu").contentWindow.scrollTo(0, apercuDefilement);
  else defilerApercu();
});

// ------------------------------------------------------------------ vues sur téléphone

function afficherVue(vue) {
  const editeur = $("#editeur");
  editeur.classList.toggle("vue-structure", vue === "structure");
  editeur.classList.toggle("vue-apercu", vue === "apercu");
  $$(".onglets-mobiles button").forEach((b) => b.classList.toggle("actif", b.dataset.vue === vue));
  if (vue === "apercu") setTimeout(() => { ajusterApercu(); defilerApercu(); }, 50);
}

$(".onglets-mobiles").addEventListener("click", (e) => {
  const b = e.target.closest("[data-vue]");
  if (b) afficherVue(b.dataset.vue);
});

// ------------------------------------------------------------------ démarrage

const demande = decodeURIComponent(location.hash.slice(1));
if (demande) ouvrir(demande); else afficherBibliotheque();
