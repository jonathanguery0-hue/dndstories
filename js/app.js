import * as des from "./des.js";
import * as srd from "./srd.js";
import { SCENARIOS } from "./scenarios.js";
import { NIVEAUX_DE_DEPART, creerPersonnage, mettreAJourPersonnage, sousClasse, vueFiche } from "./personnage.js";
import { nouvellePartie, POTIONS } from "./moteur.js";
import { clientOpenAI, clientServeur, condenserMemoire, extraireChoix, jouerTour, listerModeles, verifierCode } from "./mj.js";
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
  $("#des-karma").value = String(prefsDes.karma ?? 2);
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
    enregistrerPreferencesDes({ manuel: $("#des-manuels").checked, son: $("#des-son").checked, karma: Number($("#des-karma").value) });
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
    affectation: {}, competences: [], nom: "", historique: "", apparence: "", scenario: "brumesaule", niveau: 1,
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
    const sc = srd.SOUS_CLASSES[creation.classe];
    details += `<h3>${echapper(sc.titre)} <small class="discret">(${sc.niveau === 1 ? "dès le niveau 1" : `à partir du niveau ${sc.niveau}`})</small></h3>
      <div class="choix-grille">${sc.options.map((o) => {
        const caps = Object.values(o.capacites).flat();
        return `<button type="button" class="choix ${creation.sous_classe === o.nom ? "selection" : ""}" data-sous-classe="${echapper(o.nom)}">
          <strong>${echapper(o.nom)}${o.srd ? "" : ' <span class="etiquette">création originale</span>'}</strong>
          <small>${echapper(o.description)}</small>
          ${caps.map((k) => `<small class="discret">${echapper(k.description)}</small>`).join("")}</button>`;
      }).join("")}</div>`;
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
  const niveaux = SCENARIOS_TOUS_NIVEAUX.includes(creation.scenario) ? `
    <h3>Niveau de départ</h3>
    <div class="choix-niveau">${NIVEAUX_DE_DEPART.map((n) => `
      <button type="button" class="choix ${creation.niveau === n ? "selection" : ""}" data-niveau="${n}">
        <strong>Niveau ${n}</strong><small>${DESCRIPTION_NIVEAU[n]}</small></button>`).join("")}
    </div>` : "";
  return `<h2>Choisis ton aventure</h2><div class="choix-grille">${cartes}</div>${niveaux}`;
}

// Les aventures écrites sont prévues pour un héros débutant ; le donjon et l'aventure libre s'adaptent.
const SCENARIOS_TOUS_NIVEAUX = ["donjon", "libre"];
const DESCRIPTION_NIVEAU = {
  1: "Débutant : tout est à découvrir.",
  3: "Aguerri : sous-classe et plus de ressources.",
  5: "Vétéran : attaque supplémentaire, sorts de niveau 3, ennemis redoutables.",
};

function brancherEtape() {
  const zone = $("#etape-contenu");
  zone.querySelectorAll("[data-race]").forEach((b) => b.addEventListener("click", () => {
    creation.race = b.dataset.race; afficherEtape();
  }));
  zone.querySelectorAll("[data-classe]").forEach((b) => b.addEventListener("click", () => {
    if (creation.classe !== b.dataset.classe) {
      creation.competences = [];
      creation.sous_classe = srd.SOUS_CLASSES[b.dataset.classe].options[0].nom;
    }
    creation.classe = b.dataset.classe; afficherEtape();
  }));
  zone.querySelectorAll("[data-sous-classe]").forEach((b) => b.addEventListener("click", () => {
    creation.sous_classe = b.dataset.sousClasse; afficherEtape();
  }));
  zone.querySelectorAll("[data-scenario]").forEach((b) => b.addEventListener("click", () => {
    creation.scenario = b.dataset.scenario;
    if (!SCENARIOS_TOUS_NIVEAUX.includes(creation.scenario)) creation.niveau = 1;
    afficherEtape();
  }));
  zone.querySelectorAll("[data-niveau]").forEach((b) => b.addEventListener("click", () => {
    creation.niveau = Number(b.dataset.niveau); afficherEtape();
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
      niveau: creation.niveau, sous_classe: creation.sous_classe,
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
  if (mettreAJourPersonnage(PARTIE.personnage)) stockage.sauvegarder(PARTIE);
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
    // extraireChoix : nettoie aussi les anciennes réponses où la ligne « CHOIX: » était restée dans le récit.
    return `<div class="mj">${bouton}${markdown(extraireChoix(entree.texte).texte)}</div>`;
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
      <div class="sous">${echapper(p.race)} · ${echapper(p.classe)} (${echapper(sousClasse(p).nom)}) niveau ${p.niveau}</div>
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
      <li><span>${echapper(o.nom)}</span><span class="valeur">${o.quantite > 1 ? "×" + o.quantite : ""}
        ${POTIONS[o.nom.toLowerCase()] && p.pv > 0 ? `<button type="button" class="bouton petit" data-boire="${echapper(o.nom)}">Boire</button>` : ""}</span></li>`).join("")
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
  rendreBandeauCombat(p);
  rendreFinDePartie(p);
  const titre = REGLES.scenarios[PARTIE.scenario]?.titre ?? "";
  const d = PARTIE.donjon;
  const etageCourant = d?.position ? Number(d.position.split("-")[0]) : null;
  $("#titre-aventure").textContent = etageCourant ? `${titre} · Étage ${etageCourant}` : titre;
  $("#titre-aventure").title = d?.record ? `Record : étage ${d.record}` : "";
  rendreCarteDonjon();

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

// ------------------------------------------------------------------ fin de partie

/** Quand le héros est mort : bilan et boutons pour rejouer, à la place de la saisie. */
function rendreFinDePartie(p) {
  const zone = $("#fin-partie");
  const mort = p.mort.mort;
  zone.classList.toggle("cache", !mort);
  $("#formulaire-action").classList.toggle("cache", mort);
  $("#suggestions").classList.toggle("cache", mort);
  if (mort) $("#choix-ia").innerHTML = "";
  if (!mort) return;
  const record = PARTIE.donjon?.record ? ` · record : étage ${PARTIE.donjon.record}` : "";
  zone.innerHTML = `
    <p class="titre-fin">☠️ ${echapper(p.nom)} est tombé au combat</p>
    <p class="aide">Niveau ${p.niveau} · ${p.xp} XP${record}</p>
    <div class="ligne">
      ${p.creation ? `<button type="button" class="bouton principal" data-fin="rejouer">🔁 Rejouer avec ${echapper(p.nom)} (niveau ${p.creation.niveau ?? 1})</button>` : ""}
      <button type="button" class="bouton" data-fin="nouveau">✨ Nouveau héros</button>
      <button type="button" class="bouton" data-fin="accueil">🏠 Accueil</button>
    </div>`;
}

$("#fin-partie").addEventListener("click", (e) => {
  const b = e.target.closest("[data-fin]");
  if (!b) return;
  if (b.dataset.fin === "accueil") chargerAccueil();
  if (b.dataset.fin === "nouveau") demarrerCreation();
  if (b.dataset.fin === "rejouer") {
    try {
      const perso = creerPersonnage(PARTIE.personnage.creation);
      const partie = nouvellePartie(perso, PARTIE.scenario);
      stockage.sauvegarder(partie);
      ouvrirPartie(partie.id);
    } catch (err) {
      $("#erreur-jeu").textContent = err.message;
    }
  }
});

// ------------------------------------------------------------------ carte du donjon

// Pistes de la grille : salles (34 px) et couloirs (12 px) en alternance.
const pistes = (n) => Array.from({ length: n }, (_, i) => (i % 2 === 0 ? "var(--case)" : "var(--couloir)")).join(" ");

const ICONES_SALLES = {
  entree: "🚪", combat: "⚔️", boss: "👑", tresor: "💰", piege: "⚠️", calme: "·", sanctuaire: "⛩️", escalier: "⬇️",
};

/** Mini-carte de l'étage : salles visitées, portes vers l'inconnu, salle actuelle ; clic = s'y rendre. */
const FLECHES = { nord: "⬆️", ouest: "⬅️", est: "➡️", sud: "⬇️" };

function rendreCarteDonjon() {
  const zone = $("#carte-donjon");
  const d = PARTIE.donjon;
  if (PARTIE.scenario !== "donjon" || !d?.position) {
    zone.classList.add("cache");
    $("#boussole").classList.add("cache");
    return;
  }
  const etage = Number(d.position.split("-")[0]);
  const plan = d.etages[etage];
  const ici = plan.salles[d.position];
  const visibles = new Map();
  for (const salle of Object.values(plan.salles)) {
    if (!salle.visitee) continue;
    visibles.set(salle.id, salle);
    for (const id of Object.values(salle.sorties)) if (!visibles.has(id)) visibles.set(id, plan.salles[id]);
  }
  const xs = [...visibles.values()].map((s) => s.x);
  const ys = [...visibles.values()].map((s) => s.y);
  const [minX, minY] = [Math.min(...xs), Math.min(...ys)];
  const largeur = (Math.max(...xs) - minX) * 2 + 1;
  const hauteur = (Math.max(...ys) - minY) * 2 + 1;
  const accessibles = Object.fromEntries(Object.entries(ici.sorties).map(([dir, id]) => [id, dir]));
  const cases = [];
  for (const salle of visibles.values()) {
    const col = (salle.x - minX) * 2 + 1;
    const lig = (salle.y - minY) * 2 + 1;
    const dir = accessibles[salle.id];
    let icone = "❔";
    let classe = "inconnue";
    if (salle.visitee) {
      classe = salle.id === ici.id ? "ici" : "visitee";
      icone = salle.type === "combat" && salle.nettoyee ? "✔️"
        : salle.type === "boss" && salle.nettoyee ? "💀"
          : salle.type === "tresor" && salle.tresor?.pris ? "▫️" : ICONES_SALLES[salle.type] ?? "·";
    }
    const titre = salle.visitee ? salle.nom : "Salle inexplorée";
    cases.push(`<button type="button" class="salle-carte ${classe}" style="grid-column:${col};grid-row:${lig}"
      ${dir && !PARTIE.combat ? `data-direction="${dir}"` : "disabled"} title="${echapper(dir ? `${titre} — aller au ${dir}` : titre)}">${icone}</button>`);
    if (salle.visitee) {
      for (const [direction, id] of Object.entries(salle.sorties)) {
        if (direction !== "est" && direction !== "sud") continue;
        const autre = plan.salles[id];
        if (!visibles.has(id) || Math.abs(autre.x - salle.x) + Math.abs(autre.y - salle.y) !== 1) continue;
        cases.push(`<span class="couloir ${direction === "est" ? "h" : "v"}" style="grid-column:${col + (direction === "est" ? 1 : 0)};grid-row:${lig + (direction === "sud" ? 1 : 0)}"></span>`);
      }
    }
  }
  const sur = !PARTIE.combat && !(ici.ennemis && !ici.nettoyee);
  const peutDescendre = sur && (ici.type === "escalier" || (ici.type === "boss" && ici.nettoyee));
  // Téléphone : barre d'exploration sous le récit (une touche par sortie) et carte en grand.
  const boussole = $("#boussole");
  boussole.classList.toggle("cache", Boolean(PARTIE.combat) || PARTIE.personnage.mort.mort);
  boussole.innerHTML = `<button type="button" data-ouvrir-carte title="Voir la carte">🗺️ <small>Étage ${etage}</small></button>`
    + Object.keys(FLECHES).filter((dir) => ici.sorties[dir]).map((dir) => {
      const cible = plan.salles[ici.sorties[dir]];
      const nom = cible.visitee ? cible.nom : "inexploré";
      return `<button type="button" data-direction="${dir}" title="${echapper(nom)}">${FLECHES[dir]} ${dir[0].toUpperCase() + dir.slice(1)}<small>${echapper(nom)}</small></button>`;
    }).join("")
    + (sur ? '<button type="button" data-donjon="fouiller">🔍 Fouiller</button>' : "")
    + (peutDescendre ? '<button type="button" class="important" data-donjon="descendre">🪜 Descendre</button>' : "");
  zone.innerHTML = `
    <div class="entete-carte"><span>🗺️ Étage ${etage}</span><small>${echapper(plan.theme)}</small></div>
    <div class="grille-carte" style="grid-template-columns:${pistes(largeur)};grid-template-rows:${pistes(hauteur)}">${cases.join("")}</div>
    <div class="ici-carte">📍 ${echapper(ici.nom)} · record : étage ${d.record}</div>
    <div class="actions-carte">
      ${sur ? '<button type="button" class="action-combat" data-donjon="fouiller">🔍 Fouiller</button>' : ""}
      ${peutDescendre ? '<button type="button" class="action-combat" data-donjon="descendre">⬇️ Descendre</button>' : ""}
    </div>`;
  zone.classList.remove("cache");
  $("#carte-grande").innerHTML = zone.innerHTML;
}

function actionDonjon(e) {
  if (e.target.closest("[data-ouvrir-carte]")) {
    $("#dialogue-carte").showModal();
    return;
  }
  if (enAttente) return;
  const salle = e.target.closest("[data-direction]");
  const action = e.target.closest("[data-donjon]");
  if (salle || action) $("#dialogue-carte").close();
  if (salle) {
    fermerPanneau();
    envoyer(`Je prends la sortie ${salle.dataset.direction}.`, { outil: "explorer", args: { direction: salle.dataset.direction } });
  } else if (action?.dataset.donjon === "fouiller") {
    fermerPanneau();
    envoyer("Je fouille la salle.", { outil: "fouiller", args: {} });
  } else if (action?.dataset.donjon === "descendre") {
    fermerPanneau();
    envoyer("Je descends l'escalier vers l'étage suivant.", { outil: "descendre", args: {} });
  }
}
for (const id of ["#carte-donjon", "#carte-grande", "#boussole"]) $(id).addEventListener("click", actionDonjon);

// ------------------------------------------------------------------ bandeau de combat

let cibleCombat = null;
const TYPES_SORTS_COMBAT = ["attaque", "auto", "sauvegarde", "soin", "sommeil"];

/** Bandeau affiché pendant un combat : ennemis (cliquer pour viser) et actions rapides. */
function rendreBandeauCombat(p) {
  const bandeau = $("#bandeau-combat");
  const combat = PARTIE.combat;
  if (!combat) {
    bandeau.classList.add("cache");
    bandeau.innerHTML = "";
    cibleCombat = null;
    return;
  }
  const actifs = combat.ennemis.filter((e) => e.etat !== "vaincu" && e.etat !== "enfui");
  if (!actifs.some((e) => e.id === cibleCombat)) cibleCombat = actifs[0]?.id ?? null;
  const aTerre = p.pv === 0 && !p.mort.mort;

  const cartes = combat.ennemis.map((e) => {
    const pct = Math.round((e.pv / e.pv_max) * 100);
    const inactif = e.etat === "vaincu" || e.etat === "enfui";
    return `<button type="button" class="carte-ennemi ${e.id === cibleCombat ? "ciblee" : ""} ${inactif ? "hors-combat" : ""}"
      data-cible="${echapper(e.id)}" ${inactif ? "disabled" : ""} title="Viser ${echapper(e.id)}">
      <span class="nom">${e.id === cibleCombat ? "🎯 " : ""}${echapper(e.id)}</span>
      <span class="jauge-ennemi"><span style="width:${pct}%"></span></span>
      <span class="details">${inactif ? (e.etat === "vaincu" ? "☠️ vaincu" : "🏃 enfui") : `${e.pv}/${e.pv_max} PV · CA ${e.ca}`}${e.etat === "endormi" ? " · 💤" : ""}</span>
    </button>`;
  }).join("");

  let actions = "";
  if (p.mort.mort) {
    actions = '<span class="discret">Ton héros est tombé…</span>';
  } else if (aTerre) {
    actions = '<button type="button" class="action-combat urgente" data-action="mort">💀 Jet contre la mort</button>';
  } else if (cibleCombat) {
    const armes = p.attaques.map((a) => `<button type="button" class="action-combat" data-action="arme" data-arme="${echapper(a.nom)}"
      title="${signe(a.bonus)} pour toucher · ${echapper(a.degats)}">${a.distance ? "🏹" : "⚔️"} ${echapper(a.nom)}</button>`).join("");
    const sorts = p.sorts.filter((s) => TYPES_SORTS_COMBAT.includes(s.type));
    const selectSorts = sorts.length ? `<span class="groupe-sort">
      <select id="sort-combat" aria-label="Sort">${sorts.map((s) => {
        const empl = s.niveau ? p.emplacements[s.niveau]?.restants ?? 0 : null;
        return `<option value="${echapper(s.nom)}" ${empl === 0 ? "disabled" : ""}>${echapper(s.nom)}${s.niveau ? ` (niv. ${s.niveau} · ${empl} restant${empl > 1 ? "s" : ""})` : " (mineur)"}</option>`;
      }).join("")}</select>
      <button type="button" class="action-combat" data-action="sort">✨ Lancer</button></span>` : "";
    const capacites = p.capacites.filter((c) => c.utilisations_max).map((c) => `<button type="button" class="action-combat"
      data-action="capacite" data-capacite="${echapper(c.nom)}" ${c.utilisations > 0 ? "" : "disabled"}>${c.nom === "Rage" ? "🔥" : "💪"} ${echapper(c.nom)} (${c.utilisations})</button>`).join("");
    const potions = p.inventaire.filter((o) => POTIONS[o.nom.toLowerCase()]);
    const boutonPotion = potions.length ? `<button type="button" class="action-combat" data-action="potion"
      data-potion="${echapper(potions[0].nom)}">🧪 ${echapper(potions[0].nom)} (${potions[0].quantite})</button>` : "";
    actions = `${armes}${selectSorts}${capacites}${boutonPotion}
      <button type="button" class="action-combat" data-action="esquive">🛡️ Esquiver</button>
      <button type="button" class="action-combat" data-action="fuite">🏃 Fuir</button>`;
  } else {
    actions = '<span class="discret">Plus aucun ennemi debout : le maître du jeu va clore le combat.</span>';
  }

  bandeau.innerHTML = `
    <div class="entete-combat">
      <span class="titre-combat">⚔️ Combat · round ${combat.round}</span>
      <span class="ordre-combat">${combat.ordre.map((o) => `<span class="${o.joueur ? "moi" : ""}">${echapper(o.nom)} <small>${o.init}</small></span>`).join("›")}</span>
    </div>
    <div class="ennemis-combat">${cartes}</div>
    <div class="actions-combat">${actions}</div>`;
  bandeau.classList.remove("cache");
}

$("#bandeau-combat").addEventListener("click", (e) => {
  const carte = e.target.closest("[data-cible]");
  if (carte) {
    cibleCombat = carte.dataset.cible;
    rendreBandeauCombat(vueFiche(PARTIE.personnage));
    return;
  }
  const b = e.target.closest("[data-action]");
  if (!b || enAttente) return;
  const cible = cibleCombat;
  switch (b.dataset.action) {
    case "arme":
      envoyer(`J'attaque ${cible} avec ${b.dataset.arme} !`,
        { outil: "attaque_joueur", args: { arme: b.dataset.arme, cible } });
      break;
    case "sort": {
      const nom = $("#sort-combat").value;
      const sort = vueFiche(PARTIE.personnage).sorts.find((s) => s.nom === nom);
      const cibles = sort?.type === "soin" ? ["joueur"] : sort?.type === "sommeil" ? [] : [cible];
      envoyer(sort?.type === "soin" ? `Je lance ${nom} sur moi-même !` : `Je lance ${nom} sur ${cible} !`,
        { outil: "lancer_sort", args: { sort: nom, cibles } });
      break;
    }
    case "capacite":
      envoyer(`J'utilise ma capacité « ${b.dataset.capacite} » !`, { outil: "utiliser_capacite", args: { nom: b.dataset.capacite } });
      break;
    case "mort":
      envoyer("Je lutte pour rester en vie…", { outil: "jet_contre_la_mort", args: {} });
      break;
    case "potion":
      envoyer(`Je bois ma ${b.dataset.potion.toLowerCase()} !`, { outil: "boire_potion", args: { objet: b.dataset.potion } });
      break;
    case "esquive":
      envoyer("Je me mets en garde et j'esquive les coups (action Esquiver) ce tour-ci.");
      break;
    case "fuite":
      envoyer("Je tente de fuir le combat !");
      break;
    default:
  }
});

function rendreStatutMobile(p) {
  const ennemis = PARTIE.combat?.ennemis.filter((e) => e.etat !== "vaincu") ?? [];
  $("#statut-mobile").innerHTML = `
    <span>PV <b>${p.pv}/${p.pv_max}</b>
      <span class="jauge ${classeJauge(p.pv, p.pv_max)}"><span style="width:${Math.round((p.pv / p.pv_max) * 100)}%"></span></span></span>
    <span>CA <b>${p.ca}</b></span>
    ${p.conditions.map((c) => `<span class="pastille">${echapper(c)}</span>`).join("")}
    ${ennemis.length && !PARTIE.combat ? `<span class="ennemis-mini">⚔️ ${ennemis.map((e) => `${echapper(e.id)} ${e.pv}/${e.pv_max}`).join(" · ")}</span>` : ""}`;
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

$("#onglet-inventaire").addEventListener("click", (e) => {
  const b = e.target.closest("[data-boire]");
  if (!b || enAttente) return;
  fermerPanneau();
  envoyer(`Je bois ma ${b.dataset.boire.toLowerCase()}.`, { outil: "boire_potion", args: { objet: b.dataset.boire } });
});

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
    $$("#choix-ia button, #bandeau-combat button, #carte-donjon button, #boussole button").forEach((b) => { b.disabled = true; });
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
      { demanderJet: chargerPreferencesDes().manuel ? demanderJet : null, seuilKarma: Number(chargerPreferencesDes().karma) || 0 });
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
  if (entree?.type === "mj") voix.lire(extraireChoix(entree.texte).texte, index);
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
