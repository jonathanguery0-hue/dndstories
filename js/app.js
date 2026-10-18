import * as des from "./des.js";
import * as srd from "./srd.js";
import { SCENARIOS } from "./scenarios.js";
import { creerPersonnage, vueFiche } from "./personnage.js";
import { nouvellePartie } from "./moteur.js";
import { clientOpenAI, clientServeur, condenserMemoire, jouerTour, listerModeles, verifierCode } from "./mj.js";
import { SERVEUR_URL } from "./serveur.js";
import { chargerRegles } from "./regles.js";
import * as stockage from "./stockage.js";
import { syntheseOpenAI, syntheseServeur, ErreurVoix, VOIX_IA } from "./tts.js";
import * as voix from "./voix.js";
import { chargerPreferencesDes, enregistrerPreferencesDes, lancerAuPlateau } from "./plateau.js";

// ------------------------------------------------------------------ utilitaires

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function echapper(texte) {
  return String(texte ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

function signe(n) { return n >= 0 ? `+${n}` : `${n}`; }

// Mini-Markdown : paragraphes, **gras**, *italique*, listes simples.
function markdown(texte) {
  return echapper(texte)
    .split(/\n{2,}/)
    .map((bloc) => {
      const html = bloc
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
      if (/^\s*[-•] /m.test(html) && html.split("\n").every((l) => /^\s*[-•] /.test(l) || !l.trim())) {
        return "<ul>" + html.split("\n").filter((l) => l.trim())
          .map((l) => `<li>${l.replace(/^\s*[-•] /, "")}</li>`).join("") + "</ul>";
      }
      return `<p>${html.replace(/\n/g, "<br>")}</p>`;
    })
    .join("");
}

const grandEcran = () => window.matchMedia("(min-width: 901px)").matches;

/** Coût estimé d'une partie, en texte (« ≈ 0,04 $ »), ou "" si rien n'a encore été consommé. */
function texteCout(c) {
  if (!c?.appels) return "";
  if (!c.cout && c.cout_inconnu) return `${Math.round((c.entree + c.sortie) / 1000)} k jetons`;
  const montant = c.cout < 0.01 ? "moins de 0,01"
    : `≈ ${c.cout.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `${montant} $${c.cout_inconnu ? " (partiel)" : ""}`;
}

function afficherEcran(nom) {
  $$(".ecran").forEach((e) => e.classList.add("cache"));
  $(`#ecran-${nom}`).classList.remove("cache");
  document.body.classList.toggle("mode-jeu", nom === "jeu");
  if (nom !== "jeu") voix.arreter();
  fermerPanneau();
  window.scrollTo(0, 0);
}

function telecharger(nomFichier, contenu) {
  const url = URL.createObjectURL(new Blob([contenu], { type: "application/json" }));
  const lien = document.createElement("a");
  lien.href = url;
  lien.download = nomFichier;
  document.body.append(lien);
  lien.click();
  lien.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const REGLES = {
  caracs: srd.CARACS,
  noms_caracs: srd.NOMS_CARACS,
  tableau_standard: srd.TABLEAU_STANDARD,
  races: srd.RACES,
  classes: srd.CLASSES,
  competences: srd.COMPETENCES,
  scenarios: SCENARIOS,
};
let CONFIG = stockage.chargerConfig();

// Lien d'invitation : https://…/#code=lune-bleue-17 enregistre le code d'accès automatiquement.
function appliquerInvitation() {
  const invitation = location.hash.match(/^#code=([^&]+)/);
  if (!invitation || !SERVEUR_URL) return false;
  try {
    CONFIG = stockage.enregistrerConfig({ mode: "serveur", code: decodeURIComponent(invitation[1]) });
  } catch { /* navigateur sans stockage : le joueur saisira son code */ }
  history.replaceState(null, "", location.pathname);
  return true;
}
appliquerInvitation();
window.addEventListener("hashchange", () => { if (appliquerInvitation()) chargerAccueil(); });

function creerClient(cfg) {
  return cfg.mode === "serveur" ? clientServeur({ url: SERVEUR_URL, code: cfg.code }) : clientOpenAI(cfg);
}

// ------------------------------------------------------------------ accueil

function chargerAccueil() {
  afficherEcran("accueil");
  history.replaceState(null, "", location.pathname);
  CONFIG = stockage.chargerConfig();
  $("#alerte-config").classList.toggle("cachee", stockage.estConfigure(CONFIG));
  $("#alerte-quoi").textContent = CONFIG.mode === "serveur" ? "code d'accès" : "clé API OpenAI";
  $("#erreur-accueil").textContent = "";
  const parties = stockage.listerParties();
  const liste = $("#liste-parties");
  if (!parties.length) {
    liste.innerHTML = '<p class="discret">Aucune partie pour l\'instant.</p>';
    return;
  }
  liste.innerHTML = parties.map((p) => `
    <div class="partie">
      <div class="infos">
        <strong>${echapper(p.nom)}</strong> — ${echapper(p.race)} ${echapper(p.classe)} niv. ${p.niveau}<br>
        <small class="discret">${echapper(REGLES.scenarios[p.scenario]?.titre ?? p.scenario)} ·
          ${new Date(p.maj_le * 1000).toLocaleString("fr-FR")}${texteCout(p.consommation) ? ` · IA ${texteCout(p.consommation)}` : ""}</small>
      </div>
      <div class="actions">
        <button class="bouton principal" data-jouer="${p.id}">Continuer</button>
        <button class="bouton" data-exporter="${p.id}" title="Exporter (télécharger la sauvegarde)">💾</button>
        <button class="bouton danger" data-supprimer="${p.id}" title="Supprimer">🗑️</button>
      </div>
    </div>`).join("");
}

$("#liste-parties").addEventListener("click", (e) => {
  const jouer = e.target.closest("[data-jouer]");
  const exporter = e.target.closest("[data-exporter]");
  const supprimer = e.target.closest("[data-supprimer]");
  if (jouer) ouvrirPartie(jouer.dataset.jouer);
  if (exporter) {
    const partie = stockage.charger(exporter.dataset.exporter);
    if (partie) {
      const nom = partie.personnage.nom.replace(/[^\p{L}\p{N}_-]+/gu, "_");
      telecharger(`contes-dragons-${nom}.json`, JSON.stringify(partie));
    }
  }
  if (supprimer && confirm("Supprimer définitivement cette partie ?")) {
    stockage.supprimer(supprimer.dataset.supprimer);
    chargerAccueil();
  }
});

$("#importer").addEventListener("click", () => $("#fichier-import").click());
$("#fichier-import").addEventListener("change", async (e) => {
  const fichier = e.target.files[0];
  e.target.value = "";
  if (!fichier) return;
  try {
    let donnees;
    try { donnees = JSON.parse(await fichier.text()); } catch { donnees = null; }
    const partie = stockage.validerImport(donnees);
    if (stockage.charger(partie.id) && !confirm("Cette partie existe déjà ici. La remplacer par le fichier importé ?")) {
      return;
    }
    stockage.sauvegarder(partie);
    chargerAccueil();
  } catch (err) {
    $("#erreur-accueil").textContent = err.message;
  }
});

$("#lien-accueil").addEventListener("click", (e) => { e.preventDefault(); chargerAccueil(); });
$("#nouvelle-partie").addEventListener("click", () => {
  if (!stockage.estConfigure(CONFIG)) { ouvrirReglages(); return; }
  demarrerCreation();
});

// ------------------------------------------------------------------ réglages

function modeChoisi() {
  return $('input[name="mode"]:checked')?.value ?? "cle";
}

function afficherMode() {
  const mode = modeChoisi();
  $("#section-serveur").classList.toggle("cache", mode !== "serveur");
  $("#section-cle").classList.toggle("cache", mode !== "cle");
}

function remplirVoix() {
  const prefs = voix.chargerPreferences();
  const liste = voix.voixFrancaises();
  $("#choix-voix").innerHTML = liste.length
    ? liste.map((v) => `<option value="${echapper(v.name)}" ${v.name === prefs.voix ? "selected" : ""}>${echapper(v.name)}</option>`).join("")
    : '<option value="">Voix française par défaut</option>';
  $("#choix-voix-ia").innerHTML = Object.entries(VOIX_IA)
    .map(([id, nom]) => `<option value="${id}" ${id === prefs.voixIA ? "selected" : ""}>${echapper(nom)}</option>`).join("");
  const moteur = voix.voixAppareilDisponible() ? prefs.moteur : "ia";
  $$('input[name="moteur-voix"]').forEach((r) => { r.checked = r.value === moteur; });
  $("#option-voix-appareil").classList.toggle("cache", !voix.voixAppareilDisponible());
  afficherMoteurVoix();
}

function moteurVoixChoisi() {
  return $('input[name="moteur-voix"]:checked')?.value ?? "ia";
}

function afficherMoteurVoix() {
  const ia = moteurVoixChoisi() === "ia";
  $("#ligne-voix-ia").classList.toggle("cache", !ia);
  $("#ligne-voix-appareil").classList.toggle("cache", ia);
  $("#aide-voix").textContent = ia
    ? "Voix générée par OpenAI avec ta clé (ou le code d'accès de l'organisateur). Une réponse déjà écoutée n'est pas payée deux fois."
    : "Les voix viennent de ton appareil : les voix « naturelles » de Edge, Chrome, Android ou iPhone sont les meilleures.";
}

function preferencesVoixFormulaire() {
  return {
    moteur: moteurVoixChoisi(), voix: $("#choix-voix").value, voixIA: $("#choix-voix-ia").value,
    vitesse: Number($("#vitesse-voix").value),
  };
}

$$('input[name="moteur-voix"]').forEach((r) => r.addEventListener("change", afficherMoteurVoix));

/** Le joueur lance son d20 sur le plateau ; le maître du jeu attend pendant ce temps. */
async function demanderJet(jet) {
  $("#reflexion").classList.add("cachee");
  voix.arreter();
  try {
    return await lancerAuPlateau(jet);
  } finally {
    $("#reflexion").classList.remove("cachee");
  }
}

function ouvrirReglages() {
  const prefsDes = chargerPreferencesDes();
  $("#des-manuels").checked = prefsDes.manuel;
  $("#des-son").checked = prefsDes.son;
  $("#section-voix").classList.toggle("cache", !voix.voixDisponible());
  if (voix.voixDisponible()) {
    remplirVoix();
    const vitesse = voix.chargerPreferences().vitesse;
    $("#vitesse-voix").value = vitesse;
    $("#valeur-vitesse").textContent = vitesse;
  }
  $("#choix-mode").classList.toggle("cache", !SERVEUR_URL);
  $$('input[name="mode"]').forEach((r) => { r.checked = r.value === CONFIG.mode; });
  $("#code-acces").value = CONFIG.code;
  $("#etat-code").textContent = "Le jeu est prêt : tu n'as rien à saisir. Entre un code seulement si on t'en a donné un.";
  $("#etat-code").classList.remove("succes");
  $("#cle-api").value = "";
  $("#cle-actuelle").textContent = CONFIG.cle
    ? `Clé actuelle : ${stockage.masquer(CONFIG.cle)} (laisse vide pour la garder)` : "";
  $("#modele").value = CONFIG.modele;
  $("#base-url").value = CONFIG.adresse;
  $("#erreur-reglages").textContent = "";
  afficherMode();
  $("#reglages").showModal();
}

function valeursReglages() {
  return {
    mode: SERVEUR_URL ? modeChoisi() : "cle",
    code: $("#code-acces").value.trim(),
    cle: $("#cle-api").value.trim() || CONFIG.cle,
    modele: $("#modele").value.trim() || CONFIG.modele,
    adresse: $("#base-url").value.trim(),
  };
}

$$('input[name="mode"]').forEach((r) => r.addEventListener("change", afficherMode));

$("#verifier-code").addEventListener("click", async () => {
  const bouton = $("#verifier-code");
  const code = $("#code-acces").value.trim();
  $("#erreur-reglages").textContent = "";
  bouton.disabled = true;
  try {
    const { joueur } = await verifierCode({ url: SERVEUR_URL, code });
    $("#etat-code").textContent = joueur === "anonyme"
      ? "✅ Serveur du jeu joignable : tout est prêt, bonne aventure !"
      : `✅ Code valide — bienvenue, ${joueur} !`;
    $("#etat-code").classList.add("succes");
  } catch (err) {
    $("#erreur-reglages").textContent = err.message;
  } finally {
    bouton.disabled = false;
  }
});

$("#ouvrir-reglages").addEventListener("click", ouvrirReglages);
$("#lien-reglages").addEventListener("click", (e) => { e.preventDefault(); ouvrirReglages(); });

$("#enregistrer-reglages").addEventListener("click", (e) => {
  e.preventDefault();
  try {
    CONFIG = stockage.enregistrerConfig(valeursReglages());
    enregistrerPreferencesDes({ manuel: $("#des-manuels").checked, son: $("#des-son").checked });
    if (voix.voixDisponible()) {
      voix.enregistrerPreferences(preferencesVoixFormulaire());
    }
    $("#reglages").close();
    $("#alerte-config").classList.toggle("cachee", stockage.estConfigure(CONFIG));
    $("#alerte-quoi").textContent = CONFIG.mode === "serveur" ? "code d'accès" : "clé API OpenAI";
  } catch (err) {
    $("#erreur-reglages").textContent = err.message;
  }
});

$("#charger-modeles").addEventListener("click", async () => {
  const bouton = $("#charger-modeles");
  $("#erreur-reglages").textContent = "";
  const v = valeursReglages();
  if (!v.cle && !v.adresse) {
    $("#erreur-reglages").textContent = "Colle d'abord ta clé API.";
    return;
  }
  bouton.disabled = true;
  bouton.textContent = "…";
  try {
    const modeles = await listerModeles(v);
    $("#liste-modeles").innerHTML = modeles.map((m) => `<option value="${echapper(m)}">`).join("");
    $("#modele").value = "";
    $("#modele").placeholder = `${modeles.length} modèles disponibles — clique pour choisir`;
    $("#modele").focus();
  } catch (err) {
    $("#erreur-reglages").textContent = err.message;
  } finally {
    bouton.disabled = false;
    bouton.textContent = "Voir la liste";
  }
});

// ------------------------------------------------------------------ création de personnage

const ETAPES = ["Race", "Classe", "Caractéristiques", "Compétences", "Identité", "Aventure"];
let etape = 0;
let creation = null;

function demarrerCreation() {
  creation = {
    race: null, classe: null, methode: "standard", valeurs: [...REGLES.tableau_standard],
    affectation: {}, competences: [], nom: "", historique: "", apparence: "", scenario: "brumesaule",
  };
  etape = 0;
  afficherEcran("creation");
  afficherEtape();
}

function bonusRace(race) {
  const r = REGLES.races[race];
  const bonus = { ...r.bonus };
  return { bonus, libres: r.bonus_libres };
}

function caracsFinales() {
  const res = {};
  if (!creation.race) return res;
  const { bonus, libres } = bonusRace(creation.race);
  for (const c of REGLES.caracs) {
    const i = creation.affectation[c];
    res[c] = i === undefined ? null : creation.valeurs[i] + (bonus[c] || 0);
  }
  if (libres) {
    const autres = REGLES.caracs.filter((c) => !(c in bonus) && res[c] !== null)
      .sort((a, b) => res[b] - res[a]).slice(0, libres);
    autres.forEach((c) => { res[c] += 1; });
  }
  return res;
}

function afficherEtape() {
  $("#etapes").innerHTML = ETAPES.map((n, i) =>
    `<li class="${i === etape ? "actif" : i < etape ? "fait" : ""}">${i + 1}. ${n}</li>`).join("");
  $("#erreur-creation").textContent = "";
  $("#etape-precedente").style.visibility = etape === 0 ? "hidden" : "visible";
  $("#etape-suivante").textContent = etape === ETAPES.length - 1 ? "⚔️ Commencer l'aventure" : "Suivant →";
  const zone = $("#etape-contenu");
  const rendu = [rendreRace, rendreClasse, rendreCaracs, rendreCompetences, rendreIdentite, rendreAventure][etape];
  zone.innerHTML = rendu();
  brancherEtape();
}

function rendreRace() {
  const cartes = Object.entries(REGLES.races).map(([nom, r]) => {
    const bonus = Object.entries(r.bonus).length === 6 ? "+1 partout"
      : Object.entries(r.bonus).map(([c, v]) => `${c} +${v}`).join(", ") + (r.bonus_libres ? `, +1 ×${r.bonus_libres}` : "");
    return `<button class="choix ${creation.race === nom ? "selection" : ""}" data-race="${echapper(nom)}">
      <strong>${echapper(nom)}</strong><small>${bonus} · ${r.vitesse} m</small></button>`;
  }).join("");
  const details = creation.race ? `<div class="details-choix"><b>${echapper(creation.race)}</b><ul>${
    REGLES.races[creation.race].traits.map((t) => `<li>${echapper(t)}</li>`).join("")}</ul></div>` : "";
  return `<h2>Choisis ta race</h2><div class="choix-grille">${cartes}</div>${details}`;
}

function rendreClasse() {
  const cartes = Object.entries(REGLES.classes).map(([nom, c]) => `
    <button class="choix ${creation.classe === nom ? "selection" : ""}" data-classe="${echapper(nom)}">
      <strong>${echapper(nom)}</strong><small>${echapper(c.description)}</small>
      <small>Dé de vie d${c.de_vie}${c.lanceur ? " · lanceur de sorts" : ""}</small></button>`).join("");
  let details = "";
  if (creation.classe) {
    const c = REGLES.classes[creation.classe];
    details = `<div class="details-choix"><b>${echapper(creation.classe)}</b><ul>
      <li>Points de vie : ${c.de_vie} + modificateur de CON au niveau 1</li>
      <li>Sauvegardes maîtrisées : ${c.sauvegardes.join(", ")}</li>
      <li>Armure : ${echapper(c.armure)} · Armes : ${c.armes.map(echapper).join(", ")}</li>
      <li>Caractéristiques importantes : ${c.conseil.slice(0, 2).join(", ")}</li></ul></div>`;
  }
  return `<h2>Choisis ta classe</h2><div class="choix-grille">${cartes}</div>${details}`;
}

function rendreCaracs() {
  const { bonus } = bonusRace(creation.race);
  const finales = caracsFinales();
  const utilises = Object.values(creation.affectation);
  const boites = REGLES.caracs.map((c) => {
    const options = creation.valeurs.map((v, i) => {
      const prise = utilises.includes(i) && creation.affectation[c] !== i;
      return `<option value="${i}" ${creation.affectation[c] === i ? "selected" : ""} ${prise ? "disabled" : ""}>${v}</option>`;
    }).join("");
    const f = finales[c];
    const m = f === null ? "" : signe(Math.floor((f - 10) / 2));
    return `<div class="carac-boite">
      <label for="carac-${c}">${REGLES.noms_caracs[c]}</label>
      <select id="carac-${c}" data-carac="${c}"><option value="">—</option>${options}</select>
      <div class="final">${f ?? "—"} <small class="discret">${m}</small></div>
      <div class="bonus-race">${bonus[c] ? `race +${bonus[c]}` : "&nbsp;"}</div></div>`;
  }).join("");
  return `<h2>Répartis tes caractéristiques</h2>
    <p class="discret">Attribue chaque valeur à une caractéristique. Pour un ${echapper(creation.classe)},
      privilégie <b>${REGLES.classes[creation.classe].conseil.slice(0, 2).join(" et ")}</b>.</p>
    <div class="ligne">
      <button class="bouton ${creation.methode === "standard" ? "principal" : ""}" id="methode-standard">Valeurs standard</button>
      <button class="bouton ${creation.methode === "des" ? "principal" : ""}" id="methode-des">🎲 Lancer les dés (4d6)</button>
      <button class="bouton" id="auto-caracs">Répartition conseillée</button>
    </div>
    <p>Valeurs : <b>${creation.valeurs.join(", ")}</b></p>
    <div class="caracs-grille">${boites}</div>`;
}

function rendreCompetences() {
  const c = REGLES.classes[creation.classe];
  const race = REGLES.races[creation.race];
  const finales = caracsFinales();
  const cases = c.competences.map((nom) => {
    const carac = REGLES.competences[nom];
    const b = Math.floor((finales[carac] - 10) / 2) + 2;
    return `<label><input type="checkbox" data-competence="${echapper(nom)}"
      ${creation.competences.includes(nom) ? "checked" : ""}> ${echapper(nom)}
      <small class="discret">(${carac}, ${signe(b)})</small></label>`;
  }).join("");
  const offertes = race.competences?.length ? `<p class="discret">Ta race t'offre déjà : ${race.competences.join(", ")}.</p>` : "";
  return `<h2>Choisis ${c.nb_competences} compétences</h2>
    <p class="discret">Tu ajoutes ton bonus de maîtrise (+2) aux tests de ces compétences.
      Choisies : <b id="compte-competences">${creation.competences.length}</b> / ${c.nb_competences}</p>
    ${offertes}<div class="competences-liste">${cases}</div>`;
}

function rendreIdentite() {
  return `<h2>Qui es-tu ?</h2>
    <label>Nom du personnage<input type="text" id="nom-perso" maxlength="60" value="${echapper(creation.nom)}"></label>
    <label>Historique <small class="discret">(facultatif : origine, motivations, secrets… le MJ s'en servira)</small>
      <textarea id="historique-perso" rows="4" maxlength="1500">${echapper(creation.historique)}</textarea></label>
    <label>Apparence et personnalité <small class="discret">(facultatif)</small>
      <textarea id="apparence-perso" rows="3" maxlength="800">${echapper(creation.apparence)}</textarea></label>`;
}

function rendreAventure() {
  const cartes = Object.entries(REGLES.scenarios).map(([id, s]) => `
    <button class="choix ${creation.scenario === id ? "selection" : ""}" data-scenario="${id}">
      <strong>${echapper(s.titre)}</strong><small>${echapper(s.accroche)}</small><small>${echapper(s.niveau)}</small>
    </button>`).join("");
  return `<h2>Choisis ton aventure</h2><div class="choix-grille">${cartes}</div>`;
}

function brancherEtape() {
  const zone = $("#etape-contenu");
  zone.querySelectorAll("[data-race]").forEach((b) => b.addEventListener("click", () => {
    creation.race = b.dataset.race; afficherEtape();
  }));
  zone.querySelectorAll("[data-classe]").forEach((b) => b.addEventListener("click", () => {
    if (creation.classe !== b.dataset.classe) creation.competences = [];
    creation.classe = b.dataset.classe; afficherEtape();
  }));
  zone.querySelectorAll("[data-scenario]").forEach((b) => b.addEventListener("click", () => {
    creation.scenario = b.dataset.scenario; afficherEtape();
  }));
  zone.querySelectorAll("[data-carac]").forEach((s) => s.addEventListener("change", () => {
    if (s.value === "") delete creation.affectation[s.dataset.carac];
    else creation.affectation[s.dataset.carac] = Number(s.value);
    afficherEtape();
  }));
  zone.querySelectorAll("[data-competence]").forEach((cb) => cb.addEventListener("change", () => {
    const max = REGLES.classes[creation.classe].nb_competences;
    const nom = cb.dataset.competence;
    if (cb.checked) {
      if (creation.competences.length >= max) { cb.checked = false; return; }
      creation.competences.push(nom);
    } else {
      creation.competences = creation.competences.filter((c) => c !== nom);
    }
    $("#compte-competences").textContent = creation.competences.length;
  }));
  const standard = $("#methode-standard");
  if (standard) {
    standard.addEventListener("click", () => {
      creation.methode = "standard"; creation.valeurs = [...REGLES.tableau_standard];
      creation.affectation = {}; afficherEtape();
    });
    $("#methode-des").addEventListener("click", () => {
      const valeurs = Array.from({ length: 6 }, () => des.lancer("4d6kh3").total);
      creation.methode = "des"; creation.valeurs = valeurs.sort((a, b) => b - a);
      creation.affectation = {}; afficherEtape();
    });
    $("#auto-caracs").addEventListener("click", () => {
      const ordre = REGLES.classes[creation.classe].conseil;
      const indices = creation.valeurs.map((v, i) => i).sort((a, b) => creation.valeurs[b] - creation.valeurs[a]);
      creation.affectation = {};
      ordre.forEach((c, rang) => { creation.affectation[c] = indices[rang]; });
      afficherEtape();
    });
  }
  const nom = $("#nom-perso");
  if (nom) {
    nom.addEventListener("input", () => { creation.nom = nom.value; });
    $("#historique-perso").addEventListener("input", (e) => { creation.historique = e.target.value; });
    $("#apparence-perso").addEventListener("input", (e) => { creation.apparence = e.target.value; });
    nom.focus();
  }
}

function validerEtape() {
  switch (etape) {
    case 0: return creation.race ? "" : "Choisis une race.";
    case 1: return creation.classe ? "" : "Choisis une classe.";
    case 2: return Object.keys(creation.affectation).length === 6 ? "" : "Attribue une valeur à chaque caractéristique.";
    case 3: {
      const n = REGLES.classes[creation.classe].nb_competences;
      return creation.competences.length === n ? "" : `Choisis exactement ${n} compétences.`;
    }
    case 4: return creation.nom.trim() ? "" : "Donne un nom à ton personnage.";
    default: return "";
  }
}

$("#etape-precedente").addEventListener("click", () => { if (etape > 0) { etape -= 1; afficherEtape(); } });
$("#etape-suivante").addEventListener("click", () => {
  const erreur = validerEtape();
  if (erreur) { $("#erreur-creation").textContent = erreur; return; }
  if (etape < ETAPES.length - 1) { etape += 1; afficherEtape(); return; }
  const caracs = {};
  for (const c of REGLES.caracs) caracs[c] = creation.valeurs[creation.affectation[c]];
  try {
    const perso = creerPersonnage({
      nom: creation.nom, race: creation.race, classe: creation.classe, caracs,
      competences: creation.competences, historique: creation.historique, apparence: creation.apparence,
    });
    const partie = nouvellePartie(perso, creation.scenario);
    stockage.sauvegarder(partie);
    ouvrirPartie(partie.id);
  } catch (err) {
    $("#erreur-creation").textContent = err.message;
  }
});

// ------------------------------------------------------------------ jeu

let PARTIE = null;
let enAttente = false;

function ouvrirPartie(id) {
  const partie = stockage.charger(id);
  if (!partie) {
    chargerAccueil();
    $("#erreur-accueil").textContent = "Cette partie est introuvable dans ce navigateur.";
    return;
  }
  PARTIE = partie;
  chargerRegles(); // préchargement du SRD pendant que le joueur lit
  history.replaceState(null, "", `${location.pathname}#${id}`);
  afficherEcran("jeu");
  $("#titre-aventure").textContent = REGLES.scenarios[PARTIE.scenario]?.titre ?? "";
  $("#erreur-jeu").textContent = "";
  rendreHistoire();
  rendrePanneau();
  if (!PARTIE.affichage.length) envoyer("");  // introduction de l'aventure
  else if (grandEcran()) $("#action").focus();
}

function rendreEntree(entree, index = -1) {
  if (entree.type === "mj") {
    const bouton = voix.voixDisponible() && index >= 0
      ? `<button class="lire${voix.lectureEnCours() === index ? " lecture" : ""}" data-lire="${index}" title="Écouter" aria-label="Écouter">🔊</button>` : "";
    return `<div class="mj">${bouton}${markdown(entree.texte)}</div>`;
  }
  if (entree.type === "joueur") return `<div class="joueur">${echapper(entree.texte)}</div>`;
  const classe = { systeme: "systeme", regle: "regle" }[entree.type] ?? "de";
  return `<div class="${classe}">${echapper(entree.texte)}</div>`;
}

function rendreHistoire({ debutDernierTour = false } = {}) {
  const h = $("#histoire");
  h.innerHTML = PARTIE.affichage.map(rendreEntree).join("")
    || '<p class="discret"><i>L\'aventure va commencer…</i></p>';
  // Après un tour, on se place au début de la nouvelle réponse pour la lire depuis le début.
  const repere = debutDernierTour ? [...h.querySelectorAll(".joueur")].at(-1) : null;
  h.scrollTop = repere ? repere.offsetTop - 8 : h.scrollHeight;
  rendreChoix();
}

/** Boutons des actions proposées par le maître du jeu dans sa dernière réponse. */
function rendreChoix() {
  const derniere = PARTIE.affichage.at(-1);
  const choix = derniere?.type === "mj" ? derniere.choix ?? [] : [];
  $("#choix-ia").innerHTML = choix.map((c) => `<button type="button" data-choix="${echapper(c)}">${echapper(c)}</button>`).join("");
}

$("#choix-ia").addEventListener("click", (e) => {
  const b = e.target.closest("[data-choix]");
  if (b && !enAttente) envoyer(b.dataset.choix);
});

function classeJauge(v, max) {
  const r = max ? v / max : 0;
  return r > 0.5 ? "" : r > 0.25 ? "moyen" : "bas";
}

function rendrePanneau() {
  const p = vueFiche(PARTIE.personnage);
  const etat = p.mort.mort ? "Mort" : p.pv === 0 ? (p.mort.stable ? "Stabilisé" : "Inconscient") : "";
  const pctPv = Math.round((p.pv / p.pv_max) * 100);
  const prochain = p.xp_prochain ? ` / ${p.xp_prochain}` : "";

  $("#onglet-fiche").innerHTML = `
    <div class="entete-perso">
      <h2>${echapper(p.nom)}</h2>
      <div class="sous">${echapper(p.race)} · ${echapper(p.classe)} niveau ${p.niveau}</div>
    </div>
    <p style="margin:.6rem 0 .2rem">PV <b>${p.pv}</b> / ${p.pv_max}
      ${etat ? `<span class="pastille alerte-etat">${etat}</span>` : ""}
      ${p.pv === 0 && !p.mort.mort ? `<small class="discret"> (${p.mort.succes}✓ ${p.mort.echecs}✗)</small>` : ""}</p>
    <div class="jauge ${classeJauge(p.pv, p.pv_max)}"><span style="width:${pctPv}%"></span></div>
    <div class="stats">
      <div class="stat"><b>${p.ca}</b><small>CA</small></div>
      <div class="stat"><b>${signe(p.mods.DEX)}</b><small>Initiative</small></div>
      <div class="stat"><b>${p.vitesse} m</b><small>Vitesse</small></div>
      <div class="stat"><b>+${p.maitrise}</b><small>Maîtrise</small></div>
      <div class="stat"><b>${p.xp}</b><small>XP${prochain}</small></div>
      <div class="stat"><b>${p.des_de_vie.restants}d${p.des_de_vie.faces}</b><small>Dés de vie</small></div>
    </div>
    <div class="caracs-mini">${REGLES.caracs.map((c) => `
      <div><small>${c}</small><b>${signe(p.mods[c])}</b><span>${p.caracs[c]}</span></div>`).join("")}</div>
    ${p.conditions.length ? `<p>Conditions : ${p.conditions.map((c) => `<span class="pastille">${echapper(c)}</span>`).join(" ")}</p>` : ""}
    <h3>Attaques</h3>
    <ul class="liste-simple">${p.attaques.map((a) => `
      <li><span>${echapper(a.nom)}</span><span class="valeur">${signe(a.bonus)} · ${echapper(a.degats)}</span></li>`).join("")}</ul>
    <h3>Capacités</h3>
    <ul class="liste-simple">${p.capacites.map((c) => `
      <li class="bloc"><div class="capacite-entete"><span><b>${echapper(c.nom)}</b>${c.utilisations_max
        ? ` <span class="pastille">${c.utilisations}/${c.utilisations_max}</span>` : ""}</span>
        ${c.utilisations_max ? `<button class="bouton petit" data-capacite="${echapper(c.nom)}"
          ${c.utilisations > 0 && p.pv > 0 ? "" : "disabled"}>Utiliser</button>` : ""}</div>
        <span class="desc">${echapper(c.description)}</span></li>`).join("")}
      ${p.traits.map((t) => `<li class="bloc"><span class="desc">${echapper(t)}</span></li>`).join("")}</ul>
    <h3>Sauvegardes</h3>
    <ul class="liste-simple">${p.toutes_sauvegardes.map((s) => `
      <li class="${s.maitrise ? "maitrise" : "non-maitrise"}"><span>${s.maitrise ? "●" : "○"} ${REGLES.noms_caracs[s.carac]}</span>
      <span class="valeur">${signe(s.bonus)}</span></li>`).join("")}</ul>
    <h3>Compétences</h3>
    <ul class="liste-simple">${p.toutes_competences.map((c) => `
      <li class="${c.maitrise ? "maitrise" : "non-maitrise"}"><span>${c.maitrise ? "●" : "○"} ${echapper(c.nom)}
      <small class="discret">(${c.carac})</small></span><span class="valeur">${signe(c.bonus)}</span></li>`).join("")}</ul>`;

  $("#onglet-inventaire").innerHTML = `
    <p>💰 <b>${p.or}</b> pièces d'or</p>
    <ul class="liste-simple">${p.inventaire.map((o) => `
      <li><span>${echapper(o.nom)}</span><span class="valeur">${o.quantite > 1 ? "×" + o.quantite : ""}</span></li>`).join("")
      || "<li class='discret'>Sac vide</li>"}</ul>
    <h3>Armure</h3><p>${echapper(p.armure)}${p.bouclier ? " + bouclier" : ""}${p.armure_du_mage ? " (Armure du mage)" : ""}</p>`;

  if (p.sorts.length) {
    const emplacements = Object.entries(p.emplacements).map(([n, e]) =>
      `<span>Niv. ${n} <span class="pions">${"◆".repeat(e.restants)}${"◇".repeat(e.max - e.restants)}</span></span>`).join("");
    $("#onglet-sorts").innerHTML = `
      <p>Attaque de sort <b>${signe(p.sort_attaque)}</b> · DD de sauvegarde <b>${p.sort_dd}</b></p>
      <div class="emplacements">${emplacements}</div>
      <ul class="liste-simple">${p.sorts.map((s) => `
        <li class="bloc"><b>${echapper(s.nom)}</b> <span class="pastille">${s.niveau === 0 ? "mineur" : "niv. " + s.niveau}</span>
        <span class="desc">${echapper(s.description)}</span></li>`).join("")}</ul>`;
  } else {
    $("#onglet-sorts").innerHTML = '<p class="discret">Ce personnage ne lance pas de sorts.</p>';
  }

  const c = PARTIE.consommation;
  const consommation = c?.appels ? `<h3>Coût de l'IA</h3><p class="aide">${texteCout(c)} pour cette partie
    (${c.appels} appels, ${Math.round(c.entree / 1000)} k jetons lus dont ${Math.round((c.cache / Math.max(c.entree, 1)) * 100)} %
    en cache, ${Math.round(c.sortie / 1000)} k écrits). Estimation hors voix IA.</p>` : "";
  $("#onglet-journal").innerHTML = (PARTIE.journal.length
    ? `<ul class="liste-simple">${PARTIE.journal.map((n) => `<li class="bloc">${echapper(n)}</li>`).join("")}</ul>`
    : '<p class="discret">Le maître du jeu notera ici les personnages, indices et quêtes importants.</p>') + consommation;

  rendreStatutMobile(p);

  const combat = $("#combat");
  if (PARTIE.combat) {
    combat.classList.remove("cache");
    combat.innerHTML = `<h3>⚔️ Combat — round ${PARTIE.combat.round}</h3>
      <small class="discret">Initiative : ${PARTIE.combat.ordre.map((o) => echapper(o.nom)).join(" → ")}</small>
      ${PARTIE.combat.ennemis.map((e) => `
        <div class="ennemi ${e.etat === "vaincu" ? "vaincu" : ""}">
          <div class="nom-ennemi"><span>${echapper(e.id)} ${e.etat !== "actif" ? `<span class="pastille">${e.etat}</span>` : ""}</span>
          <span class="discret">CA ${e.ca} · ${e.pv}/${e.pv_max}</span></div>
          <div class="jauge"><span style="width:${Math.round((e.pv / e.pv_max) * 100)}%"></span></div>
        </div>`).join("")}`;
  } else {
    combat.classList.add("cache");
  }
}

$$(".onglets button").forEach((b) => b.addEventListener("click", () => {
  $$(".onglets button").forEach((x) => x.classList.toggle("actif", x === b));
  $$(".onglet").forEach((o) => o.classList.toggle("cache", o.id !== `onglet-${b.dataset.onglet}`));
}));

function rendreStatutMobile(p) {
  const ennemis = PARTIE.combat?.ennemis.filter((e) => e.etat !== "vaincu") ?? [];
  $("#statut-mobile").innerHTML = `
    <span>PV <b>${p.pv}/${p.pv_max}</b>
      <span class="jauge ${classeJauge(p.pv, p.pv_max)}"><span style="width:${Math.round((p.pv / p.pv_max) * 100)}%"></span></span></span>
    <span>CA <b>${p.ca}</b></span>
    ${p.conditions.map((c) => `<span class="pastille">${echapper(c)}</span>`).join("")}
    ${ennemis.length ? `<span class="ennemis-mini">⚔️ ${ennemis.map((e) => `${echapper(e.id)} ${e.pv}/${e.pv_max}`).join(" · ")}</span>` : ""}`;
}

function ouvrirPanneau() {
  $("#panneau").classList.add("ouvert");
  $("#voile").classList.add("visible");
}

function fermerPanneau() {
  $("#panneau").classList.remove("ouvert");
  $("#voile").classList.remove("visible");
}

$("#bascule-panneau").addEventListener("click", ouvrirPanneau);
$("#fermer-panneau").addEventListener("click", fermerPanneau);
$("#voile").addEventListener("click", fermerPanneau);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") fermerPanneau(); });

$("#onglet-fiche").addEventListener("click", (e) => {
  const b = e.target.closest("[data-capacite]");
  if (!b) return;
  fermerPanneau();
  envoyer(`J'utilise ma capacité « ${b.dataset.capacite} » !`, { outil: "utiliser_capacite", args: { nom: b.dataset.capacite } });
});

async function envoyer(texte, actionDirecte = null) {
  if (enAttente) return;
  enAttente = true;
  voix.arreter();
  if (voix.chargerPreferences().auto) voix.deverrouiller(); // iPhone : autorise la lecture de la réponse
  $("#envoyer").disabled = true;
  $("#erreur-jeu").textContent = "";
  $("#reflexion").classList.remove("cachee");
  const h = $("#histoire");
  if (texte) {
    h.insertAdjacentHTML("beforeend", rendreEntree({ type: "joueur", texte }));
    h.scrollTop = h.scrollHeight;
    $$("#choix-ia button").forEach((b) => { b.disabled = true; });
    $$("[data-capacite]").forEach((b) => { b.disabled = true; });
  }
  try {
    if (!stockage.estConfigure(CONFIG)) {
      throw new Error(CONFIG.mode === "serveur" ? "Aucun code d'accès. Ouvre les Réglages (⚙️) pour l'ajouter."
        : "Aucune clé API configurée. Ouvre les Réglages (⚙️) pour l'ajouter.");
    }
    const appeler = creerClient(CONFIG);
    // On joue le tour sur une copie : en cas d'erreur, la partie reste intacte et on peut réessayer.
    const copie = structuredClone(PARTIE);
    await jouerTour(copie, texte.slice(0, 2000), appeler, actionDirecte,
      { demanderJet: chargerPreferencesDes().manuel ? demanderJet : null });
    try { await condenserMemoire(copie, appeler); } catch { /* on réessaiera au prochain tour */ }
    PARTIE = copie;
    if (!actionDirecte) $("#action").value = "";
    rendreHistoire({ debutDernierTour: true });
    if (voix.chargerPreferences().auto) lireEntree(PARTIE.affichage.length - 1);
  } catch (err) {
    const garde = texte && !actionDirecte ? " Ton action est restée dans la zone de texte." : "";
    $("#erreur-jeu").textContent = err.message + garde;
    if (texte) h.lastElementChild?.remove();
    if (!texte) {
      $("#erreur-jeu").insertAdjacentHTML("beforeend",
        ' <button class="bouton" id="reessayer-intro">Réessayer</button>');
      $("#reessayer-intro").addEventListener("click", () => envoyer(""));
    }
  }
  try {
    stockage.sauvegarder(PARTIE);
  } catch (err) {
    $("#erreur-jeu").textContent = err.message;
  } finally {
    enAttente = false;
    $("#envoyer").disabled = false;
    rendreChoix(); // boutons réactivés (ou remplacés par les nouveaux choix)
    $("#reflexion").classList.add("cachee");
    rendrePanneau();
    if (grandEcran()) $("#action").focus();
  }
}

$("#formulaire-action").addEventListener("submit", (e) => {
  e.preventDefault();
  const texte = $("#action").value.trim();
  if (texte) envoyer(texte);
});

$("#action").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    $("#formulaire-action").requestSubmit();
  }
});

$("#suggestions").addEventListener("click", (e) => {
  const b = e.target.closest("[data-texte]");
  if (b) { $("#action").value = b.dataset.texte; $("#action").focus(); }
});

// ------------------------------------------------------------------ démarrage

const idDepart = location.hash.slice(1);
chargerAccueil();
if (/^[0-9a-f]{12}$/.test(idDepart)) ouvrirPartie(idDepart);

// Installation comme application (écran d'accueil du téléphone, bureau de l'ordinateur).
if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch(() => { /* le jeu marche aussi sans */ });
}

let invitationInstallation = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  invitationInstallation = e;
  $("#installer").classList.remove("cache");
});
$("#installer").addEventListener("click", async () => {
  if (!invitationInstallation) return;
  invitationInstallation.prompt();
  await invitationInstallation.userChoice;
  invitationInstallation = null;
  $("#installer").classList.add("cache");
});
const dejaInstalle = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
if (/iPhone|iPad|iPod/.test(navigator.userAgent) && !dejaInstalle) $("#aide-ios").classList.remove("cache");

// ------------------------------------------------------------------ lecteur vocal

function lireEntree(index) {
  const entree = PARTIE?.affichage[index];
  if (entree?.type === "mj") voix.lire(entree.texte, index);
}

function majBoutonVoix() {
  const auto = voix.chargerPreferences().auto;
  $("#bouton-voix").setAttribute("aria-pressed", String(auto));
  $("#bouton-voix").textContent = auto ? "🔊 Voix" : "🔇 Voix";
}

if (voix.voixDisponible()) {
  $("#bouton-voix").classList.remove("cache");
  majBoutonVoix();
  if (voix.voixAppareilDisponible()) {
    speechSynthesis.addEventListener?.("voiceschanged", () => { if ($("#reglages").open) remplirVoix(); });
  }
}

// Voix IA : passe par la clé du joueur ou par le serveur relais, selon les réglages.
voix.definirSourceIA((texte, voixIA) => {
  if (!stockage.estConfigure(CONFIG)) throw new ErreurVoix("Ajoute ta clé ou ton code d'accès pour la voix IA.");
  return CONFIG.mode === "serveur"
    ? syntheseServeur({ url: SERVEUR_URL, code: CONFIG.code }, texte, voixIA)
    : syntheseOpenAI(CONFIG, texte, voixIA);
});

voix.quandErreur((message) => {
  const zone = $("#reglages").open ? $("#erreur-reglages") : $("#erreur-jeu");
  zone.textContent = message;
});

$("#bouton-voix").addEventListener("click", () => {
  const auto = !voix.chargerPreferences().auto;
  voix.enregistrerPreferences({ auto });
  majBoutonVoix();
  if (auto) {
    // Lit tout de suite la dernière réponse du maître du jeu.
    const derniere = PARTIE?.affichage.map((e) => e.type).lastIndexOf("mj") ?? -1;
    if (derniere >= 0) lireEntree(derniere);
  } else {
    voix.arreter();
  }
});

$("#histoire").addEventListener("click", (e) => {
  const b = e.target.closest("[data-lire]");
  if (!b) return;
  const index = Number(b.dataset.lire);
  if (voix.lectureEnCours() === index) voix.arreter();
  else lireEntree(index);
});

voix.quandLectureChange((id) => {
  $$("#histoire [data-lire]").forEach((b) => {
    const actif = Number(b.dataset.lire) === id;
    b.classList.toggle("lecture", actif);
    b.textContent = actif ? "⏹" : "🔊";
    b.title = actif ? "Arrêter" : "Écouter";
  });
});

$("#vitesse-voix").addEventListener("input", (e) => { $("#valeur-vitesse").textContent = e.target.value; });
const PHRASE_TEST = "La brume monte du lac Morne. Au loin, une cloche sonne trois coups… "
  + "« Qui va là ? » murmure le vieux passeur. Que fais-tu ?";

function testerVoix() {
  $("#erreur-reglages").textContent = "";
  try {
    CONFIG = stockage.enregistrerConfig(valeursReglages()); // la voix IA utilise la clé ou le code saisi
  } catch (err) {
    $("#erreur-reglages").textContent = err.message;
    return;
  }
  voix.enregistrerPreferences(preferencesVoixFormulaire());
  voix.lire(PHRASE_TEST, "test");
}

$("#tester-voix").addEventListener("click", testerVoix);
$("#tester-voix-ia").addEventListener("click", testerVoix);
$("#reglages").addEventListener("close", () => { if (voix.lectureEnCours() === "test") voix.arreter(); });
