// Interface du mode « Expéditions » : camp, carte du repaire, salles, combats animés et bilan.

import * as M from "./moteur.js";
import { COMPETENCES, DIFFICULTES, ENNEMIS, EVENEMENTS, FORGE, HEROS, NB_ETAGES, NIVEAU_MAX, OBJETS, ORDRE_HEROS, RELIQUES, TYPES_SALLES, xpPourNiveau } from "./donnees.js";
import * as S from "./sauvegarde.js";
import * as C from "./compte.js";
import { creerNarrateur, iaDisponible } from "./narrateur.js";
import { dessinerCamp, dessinerDonjon, dessinerSprite, spriteCanvas } from "./sprites.js";

const $ = (sel, racine = document) => racine.querySelector(sel);
const jeu = $("#jeu");

let profil = S.chargerProfil();
let course = S.chargerCourse();
let reglages = S.chargerReglages();
let narrateur = creerNarrateur({ actif: reglages.mj_ia, memoire: course?.memoire ?? [] });
let herosChoisi = profil.debloques.includes(profil.dernier_heros) ? profil.dernier_heros : "guerrier";
let diffChoisie = profil.difficultes.includes(profil.difficulte) ? profil.difficulte : "normal";
let scene = null; // scène animée affichée (camp ou salle)
let occupe = false; // une animation de combat est en cours
let cibleId = null;
let modeActions = "principal";

// ================================================================== utilitaires

/** Crée un élément : h("button", { class: "bouton", onclick }, "texte", enfant…). Le texte n'est jamais interprété comme du HTML. */
function h(tag, props = {}, ...enfants) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "style") e.style.cssText = v;
    else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const c of enfants.flat(Infinity)) {
    if (c == null || c === false) continue;
    e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return e;
}

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const VITESSES = { lente: 1.6, normale: 1, rapide: 0.5 };
const pause = (ms) => attendre(ms * (VITESSES[reglages.vitesse] ?? 1));

/** Empreinte du contenu sauvegardé (sans la date) : sert à savoir si quelque chose a vraiment changé. */
function empreinteSauvegarde() {
  const { maj_le: _date, ...reste } = profil;
  return JSON.stringify([reste, course && !course.bilan ? course : null]);
}
let derniereEmpreinte = null;

function sauver() {
  if (course && !course.bilan) course.memoire = narrateur.souvenirs;
  const empreinte = empreinteSauvegarde();
  if (empreinte !== derniereEmpreinte) {
    if (derniereEmpreinte !== null) profil.maj_le = Date.now();
    derniereEmpreinte = empreinte;
    planifierEnvoi();
  }
  S.enregistrerProfil(profil);
  if (course && !course.bilan) S.enregistrerCourse(course);
  $("#or-profil").textContent = `💰 ${profil.or}`;
}

// ================================================================== compte : synchronisation entre appareils

let minuterieEnvoi = 0;
let envoiEnCours = null;

const donneesASynchroniser = () => ({ profil, course: course && !course.bilan ? course : null });

function planifierEnvoi() {
  if (!C.compteActuel()) return;
  clearTimeout(minuterieEnvoi);
  minuterieEnvoi = setTimeout(() => envoyerMaintenant(), 2500);
}

/** Envoie la progression au compte ; en cas de conflit, garde la plus récente des deux. */
async function envoyerMaintenant({ keepalive = false, essai = 0 } = {}) {
  clearTimeout(minuterieEnvoi);
  if (!C.compteActuel()) return;
  if (envoiEnCours && !keepalive) {
    await envoiEnCours;
    return envoyerMaintenant({ keepalive, essai });
  }
  let encore = false;
  const tache = (async () => {
    try {
      await C.envoyer(donneesASynchroniser(), profil.maj_le ?? Date.now(), { keepalive });
      majBoutonCompte();
    } catch (e) {
      if (e.code === "conflit" && e.donnees?.sauvegarde) {
        const srv = e.donnees.sauvegarde;
        if ((srv.maj_le ?? 0) > (profil.maj_le ?? 0)) {
          adopter(srv, "☁️ Une partie plus récente a été jouée sur un autre appareil : elle est chargée.");
        } else if (essai < 2) {
          C.majCompte({ version: srv.version });
          encore = true;
        }
      } else if (e.code === "non_connecte") {
        toast("Session expirée : reconnecte-toi avec le bouton 👤.", "erreur");
      }
      majBoutonCompte(e.code === "hors_ligne" ? "hors ligne" : null);
    }
  })();
  envoiEnCours = tache;
  await tache;
  if (envoiEnCours === tache) envoiEnCours = null;
  if (encore) await envoyerMaintenant({ keepalive, essai: essai + 1 });
}

/** Remplace la progression de cet appareil par celle du compte. */
function adopter(srv, message) {
  const donnees = srv.donnees ?? {};
  profil = M.normaliserProfil(donnees.profil);
  profil.maj_le = srv.maj_le;
  course = donnees.course?.carte && !donnees.course.bilan ? donnees.course : null;
  if (!course) S.effacerCourse();
  C.majCompte({ version: srv.version, synchro_le: Date.now() });
  narrateur = creerNarrateur({ actif: reglages.mj_ia, memoire: course?.memoire ?? [] });
  herosChoisi = profil.debloques.includes(profil.dernier_heros) ? profil.dernier_heros : "guerrier";
  diffChoisie = profil.difficultes.includes(profil.difficulte) ? profil.difficulte : "normal";
  derniereEmpreinte = empreinteSauvegarde();
  S.enregistrerProfil(profil);
  if (course) S.enregistrerCourse(course);
  $("#or-profil").textContent = `💰 ${profil.or}`;
  if (message) toast(message, "or");
  majBoutonCompte();
  fermerModale();
  rendre();
}

/** Au démarrage (et au retour sur l'onglet) : récupère la partie du compte si elle est plus récente. */
async function synchroniser() {
  if (!C.compteActuel() || occupe) return;
  try {
    const srv = await C.telecharger();
    if (occupe) return;
    if (srv && (srv.maj_le ?? 0) > (profil.maj_le ?? 0)) adopter(srv, "☁️ Progression récupérée depuis ton compte.");
    else if (!srv || (profil.maj_le ?? 0) > (srv.maj_le ?? 0)) await envoyerMaintenant();
    majBoutonCompte();
  } catch (e) {
    if (e.code === "non_connecte") toast("Session expirée : reconnecte-toi avec le bouton 👤.", "erreur");
    majBoutonCompte(e.code === "hors_ligne" ? "hors ligne" : null);
  }
}

function majBoutonCompte(etat = null) {
  const b = $("#ouvrir-compte");
  if (!b) return;
  const c = C.compteActuel();
  b.replaceChildren("👤", h("span", { class: "nom-compte" }, c ? ` ${c.nom}` : " Connexion"));
  b.classList.toggle("connecte", Boolean(c));
  b.title = c ? `Connecté : ${c.nom}${etat ? ` (${etat})` : c.synchro_le ? " — progression synchronisée" : ""}` : "Se connecter pour retrouver sa progression partout";
  b.classList.toggle("hors-ligne", etat === "hors ligne");
}

function ouvrirCompte() {
  if (!C.comptesPossibles()) {
    ouvrirModale(
      h("h2", {}, "👤 Comptes joueurs"),
      h("p", {}, "Les comptes passent par le serveur du jeu, qui n'est pas joignable depuis cette adresse."),
      h("p", {}, "👉 Ouvre le jeu depuis ton adresse Vercel (elle ressemble à ", h("b", {}, "https://dndstories….vercel.app/expedition.html"),
        ") : tu la trouves sur vercel.com, dans ton projet dndstories, bouton « Visit »."),
      h("p", { class: "discret" }, "En attendant, ta progression est enregistrée dans ce navigateur, et tu peux l'exporter dans ⚙️ Réglages."));
    return;
  }
  const c = C.compteActuel();
  if (c) {
    const quand = c.synchro_le ? new Date(c.synchro_le).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "pas encore";
    ouvrirModale(
      h("h2", {}, `👤 Compte : ${c.nom}`),
      h("p", {}, "Ta progression (héros, niveaux, or, équipement et expédition en cours) est enregistrée sur ton compte. "
        + "Connecte-toi avec le même nom sur la Tesla, ton téléphone ou ton ordinateur pour la retrouver."),
      h("p", { class: "discret" }, `Dernière synchronisation : ${quand}.`),
      h("div", { class: "rangee" },
        h("button", { class: "bouton principal", onclick: async () => {
          await envoyerMaintenant();
          await synchroniser();
          toast("☁️ Progression synchronisée.");
          if (!$("#modale").classList.contains("cache")) ouvrirCompte();
        } }, "🔄 Synchroniser maintenant"),
        h("button", { class: "bouton danger", onclick: async () => {
          await envoyerMaintenant();
          await C.deconnecter();
          majBoutonCompte();
          fermerModale();
          toast("Déconnecté. Ta progression reste aussi sur cet appareil.");
        } }, "🚪 Se déconnecter")));
    return;
  }
  const nom = h("input", { type: "text", autocomplete: "username", autocapitalize: "none", spellcheck: "false", maxlength: "24", placeholder: "ex. jonathan" });
  const mdp = h("input", { type: "password", autocomplete: "current-password", maxlength: "128", placeholder: "6 caractères minimum" });
  const voir = h("label", { class: "interrupteur" }, h("input", { type: "checkbox", onchange: (e) => { mdp.type = e.target.checked ? "text" : "password"; } }), "Afficher le mot de passe");
  const erreurTxt = h("p", { class: "erreur" });
  const boutons = [];
  const valider = async (action) => {
    erreurTxt.textContent = "";
    boutons.forEach((b) => { b.disabled = true; });
    try {
      const r = await C.entrer(action, nom.value, mdp.value);
      await apresConnexion(r, action);
    } catch (e) {
      erreurTxt.textContent = e.message;
      boutons.forEach((b) => { b.disabled = false; });
    }
  };
  boutons.push(
    h("button", { class: "bouton principal", onclick: () => valider("connexion") }, "🔑 Se connecter"),
    h("button", { class: "bouton", onclick: () => valider("inscription") }, "✨ Créer un compte"));
  mdp.addEventListener("keydown", (e) => { if (e.key === "Enter") valider("connexion"); });
  ouvrirModale(
    h("h2", {}, "👤 Retrouver ta progression partout"),
    h("p", {}, "Crée un compte une fois (un nom et un mot de passe), puis connecte-toi avec les mêmes identifiants sur "
      + "chaque appareil : la Tesla, ton téléphone, ton ordinateur… Tes héros, ton or et ton expédition en cours te suivent."),
    h("div", { class: "champ" }, h("label", {}, "Nom de compte"), nom),
    h("div", { class: "champ" }, h("label", {}, "Mot de passe"), mdp),
    voir,
    erreurTxt,
    h("div", { class: "rangee" }, boutons),
    h("p", { class: "discret" }, "🔒 Le mot de passe est protégé (haché) sur le serveur du jeu, jamais enregistré en clair. "
      + "Choisis-en un que tu n'utilises nulle part ailleurs."));
  setTimeout(() => nom.focus(), 50);
}

async function apresConnexion(r, action) {
  const srv = r.sauvegarde;
  majBoutonCompte();
  if (!srv) {
    await envoyerMaintenant();
    fermerModale();
    toast(action === "inscription" ? "✨ Compte créé ! Ta progression est enregistrée dessus." : "☁️ Connecté : ta progression est enregistrée sur ton compte.", "or");
    return;
  }
  const profilCompte = M.normaliserProfil(srv.donnees?.profil);
  if (C.profilVierge(profil)) {
    adopter(srv, `☁️ Bon retour, ${r.nom} ! Ta progression est chargée.`);
    return;
  }
  // Les deux ont de la progression : on demande laquelle garder.
  ouvrirModale(
    h("h2", {}, "Quelle progression garder ?"),
    h("p", {}, "Ce compte et cet appareil ont chacun une progression différente."),
    h("div", { class: "choix" },
      h("button", { class: "bouton principal", onclick: () => adopter(srv, "☁️ Progression du compte chargée.") },
        "☁️ Celle du compte", h("span", { class: "sous" }, C.resumeProfil(profilCompte))),
      h("button", { class: "bouton", onclick: async () => {
        C.majCompte({ version: srv.version });
        await envoyerMaintenant();
        fermerModale();
        toast("📱 Progression de cet appareil enregistrée sur ton compte.", "or");
      } }, "📱 Celle de cet appareil", h("span", { class: "sous" }, C.resumeProfil(profil)))),
    h("p", { class: "discret" }, "L'autre progression sera remplacée."));
}

function toast(texte, genre = "") {
  const t = h("div", { class: `toast ${genre}` }, texte);
  $("#toasts").append(t);
  setTimeout(() => t.remove(), 3200);
}

function vider() {
  if (scene) scene.arreter();
  scene = null;
  jeu.replaceChildren();
  window.scrollTo(0, 0);
}

const niveauHeros = () => profil.heros[course?.heros ?? herosChoisi].niveau;

function signalerNiveau(avant) {
  const apres = niveauHeros();
  if (apres > avant) {
    son("niveau");
    toast(`⬆️ Niveau ${apres} ! +${apres - avant} point${apres - avant > 1 ? "s" : ""} de talent à dépenser au camp.`, "or");
  }
}

// ================================================================== sons (petits bips rétro, sans fichier)

let audio = null;
function son(type) {
  if (!reglages.son) return;
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === "suspended") audio.resume();
    const notes = {
      coup: [[150, 0.06, "square"], [90, 0.08, "square"]],
      crit: [[300, 0.05, "square"], [500, 0.05, "square"], [200, 0.1, "square"]],
      rate: [[220, 0.08, "triangle"]],
      aie: [[120, 0.1, "sawtooth"], [80, 0.12, "sawtooth"]],
      soin: [[440, 0.07, "triangle"], [660, 0.07, "triangle"], [880, 0.1, "triangle"]],
      victoire: [[523, 0.1, "square"], [659, 0.1, "square"], [784, 0.1, "square"], [1046, 0.25, "square"]],
      defaite: [[392, 0.18, "triangle"], [330, 0.18, "triangle"], [262, 0.4, "triangle"]],
      niveau: [[660, 0.08, "square"], [880, 0.08, "square"], [1320, 0.2, "square"]],
      piece: [[988, 0.05, "square"], [1319, 0.12, "square"]],
      clic: [[700, 0.03, "square"]],
      alerte: [[200, 0.12, "sawtooth"], [200, 0.12, "sawtooth"]],
    }[type];
    if (!notes) return;
    let t = audio.currentTime;
    for (const [freq, duree, forme] of notes) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = forme;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.06, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + duree);
      osc.connect(gain).connect(audio.destination);
      osc.start(t);
      osc.stop(t + duree);
      t += duree * 0.9;
    }
  } catch { /* pas de son sur cet appareil */ }
}

// ================================================================== scènes animées (canvas)

/**
 * Crée une scène animée dans `conteneur`. acteurs : [{ id, sprite, x (0 à 1), taille, miroir }].
 * Les positions sont en pixels CSS ; le canvas suit la taille de son conteneur.
 */
function creerScene(conteneur, { decor = "donjon", boss = false } = {}) {
  const canvas = h("canvas", { class: "decor", "aria-hidden": "true" });
  conteneur.prepend(canvas);
  const ctx = canvas.getContext("2d");
  const acteurs = [];
  let raf = 0;
  let largeur = 0;
  let hauteur = 0;
  let surRedimension = null;

  function mesurer() {
    const r = conteneur.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (Math.round(r.width) !== largeur || Math.round(r.height) !== hauteur) {
      largeur = Math.round(r.width);
      hauteur = Math.round(r.height);
      canvas.width = Math.max(1, Math.round(largeur * dpr));
      canvas.height = Math.max(1, Math.round(hauteur * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      surRedimension?.();
    }
  }

  const sol = () => Math.round(hauteur * (decor === "camp" ? 0.9 : 0.86));
  const taillePixel = () => Math.max(3, Math.floor(Math.min(hauteur / 52, largeur / 110)));

  /** Rectangle occupé par un acteur, en pixels CSS. */
  function rect(a) {
    const px = taillePixel() * (a.taille ?? 1);
    const cote = 16 * px;
    const x = Math.round(a.x * largeur - cote / 2 + (a.decal ?? 0));
    const y = Math.round((a.sol ?? sol()) - cote);
    return { x, y, l: cote, h: cote, px, cx: x + cote / 2 };
  }

  function dessiner(t) {
    mesurer();
    if (!largeur || !hauteur) return;
    if (decor === "camp") dessinerCamp(ctx, largeur, hauteur, t);
    else dessinerDonjon(ctx, largeur, hauteur, t, { boss });
    for (const [i, a] of acteurs.entries()) {
      if (a.cache) continue;
      const r = rect(a);
      let alpha = 1;
      if (a.mortA) {
        alpha = Math.max(0, 1 - (t - a.mortA) / 700);
        if (alpha <= 0) continue;
      }
      const souffle = a.mortA ? 0 : Math.round(Math.sin(t / 380 + i * 1.7) * r.px * 0.35);
      ctx.globalAlpha = alpha * 0.45;
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.ellipse(r.cx, r.y + r.h - r.px * 0.3, r.l * 0.32, r.px * 1.1, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = alpha;
      const secousse = a.secousse && t < a.secousse ? Math.round(Math.sin(t / 18) * r.px * 0.8) : 0;
      dessinerSprite(ctx, a.sprite, r.x + secousse, r.y + souffle, r.px, {
        miroir: a.miroir, teinte: a.flash && t < a.flash ? "#ffffff" : null,
      });
      ctx.globalAlpha = 1;
    }
  }

  function boucle(t) {
    dessiner(t);
    raf = requestAnimationFrame(boucle);
  }
  raf = requestAnimationFrame(boucle);

  return {
    acteurs, rect, conteneur,
    get largeur() { return largeur; },
    set surRedimension(f) { surRedimension = f; },
    acteur: (id) => acteurs.find((a) => a.id === id),
    arreter() { cancelAnimationFrame(raf); },
    /** Petit élan vers l'avant (attaque). */
    async elan(id, sens) {
      const a = acteurs.find((x) => x.id === id);
      if (!a) return;
      for (const v of [10, 22, 30, 22, 10, 0]) {
        a.decal = v * sens;
        await attendre(28);
      }
    },
    touche(id) {
      const a = acteurs.find((x) => x.id === id);
      if (!a) return;
      const t = performance.now();
      a.flash = t + 130;
      a.secousse = t + 260;
    },
    mourir(id) {
      const a = acteurs.find((x) => x.id === id);
      if (a && !a.mortA) a.mortA = performance.now();
    },
  };
}

function flottant(sc, id, texte, genre) {
  const a = sc.acteur(id);
  if (!a) return;
  const r = sc.rect(a);
  const f = h("div", { class: `flottant ${genre}`, style: `left:${r.cx}px; top:${Math.max(4, r.y + r.h * 0.15)}px` }, texte);
  sc.conteneur.append(f);
  // Le texte reste entièrement dans la scène, même au-dessus d'un personnage collé au bord.
  const demi = f.offsetWidth / 2;
  f.style.left = `${Math.min(Math.max(r.cx, demi + 4), sc.conteneur.clientWidth - demi - 4)}px`;
  setTimeout(() => f.remove(), 1150);
}

// ================================================================== éléments communs

function jauge(etiquette, valeur, max, genre = "") {
  const pct = Math.max(0, Math.min(100, (100 * valeur) / Math.max(1, max)));
  return h("div", { class: `jauge ${genre}` },
    h("div", { class: "etiquette" }, h("span", {}, etiquette), h("span", {}, `${valeur}/${max}`)),
    h("div", { class: "fond" }, h("div", { class: `rempli ${genre === "" && pct <= 30 ? "bas" : ""}`, style: `width:${pct}%` })));
}

const ICONES_STATUTS = { garde: "🛡️", a_terre: "💫", poison: "🧪", etourdi: "💫", affaibli: "❄️", rallie: "📯" };
const NOMS_STATUTS = { garde: "En garde", a_terre: "À terre", poison: "Empoisonné", etourdi: "Étourdi", affaibli: "Affaibli", rallie: "Galvanisé" };

function barreStatut() {
  const st = M.statsCourse(profil, course);
  const salle = course.salle;
  const statuts = salle?.type === "combat" && !salle.issue ? salle.statuts : [];
  const objets = Object.entries(course.objets).filter(([, n]) => n > 0);
  return h("div", { class: "statut-course", id: "statut" },
    spriteCanvas(course.heros, 3),
    h("div", { class: "info-course nom-statut" }, `${st.nom} · niv ${st.niveau}`),
    jauge("❤️ PV", course.pv, st.pvMax),
    jauge("🔷 PM", course.pm, st.pmMax, "pm"),
    h("div", { class: "details-statut" },
    h("span", { class: "info-course", title: "Classe d'armure" }, `🛡️ ${M.caHeros(st, salle?.type === "combat" ? salle : null)}`),
    h("span", { class: "info-course", title: "Or trouvé pendant l'expédition" }, `💰 ${course.or}`),
    objets.length ? h("span", { class: "info-course", title: "Objets" }, objets.map(([id, n]) => `${OBJETS[id].icone}${n}`).join(" ")) : null,
    statuts.length ? h("span", { class: "info-course" }, statuts.map((s) => h("span", { title: s.nom ?? NOMS_STATUTS[s.id] ?? s.id }, COMPETENCES[s.id]?.icone ?? ICONES_STATUTS[s.id] ?? "✨"))) : null,
    course.reliques.length ? h("div", { class: "reliques" }, course.reliques.map((r) => h("span", {
      class: "relique", title: `${RELIQUES[r].nom} : ${RELIQUES[r].desc}`, onclick: () => toast(`${RELIQUES[r].icone} ${RELIQUES[r].nom} : ${RELIQUES[r].desc}`),
    }, RELIQUES[r].icone))) : null),
  );
}

function majStatut() {
  const ancien = $("#statut");
  if (ancien && course) ancien.replaceWith(barreStatut());
}

function contexteHeros() {
  const st = M.statsCourse(profil, course);
  return `${st.nom}, ${st.titre.toLowerCase()} de niveau ${st.niveau}`;
}

/** Affiche le récit du maître du jeu (déjà connu, ou demandé à l'IA) dans la boîte `boite`. */
async function raconter(boite, cle, type, contexte, cibleObjet = course.salle) {
  const p = h("p", {});
  const qui = h("div", { class: "qui" }, h("span", {}, "📜 Le maître du jeu"), h("span", {}, ""));
  boite.replaceChildren(qui, p);
  const deja = cibleObjet?.[cle];
  if (deja) {
    p.textContent = deja.texte;
    qui.lastChild.textContent = deja.ia ? "🤖 IA" : "";
    return deja;
  }
  boite.classList.add("attente");
  p.textContent = reglages.mj_ia && iaDisponible() ? "✒️ Le maître du jeu prend sa plume…" : "";
  const r = await narrateur.raconter(type, { heros: contexteHeros(), ...contexte });
  boite.classList.remove("attente");
  if (cibleObjet) cibleObjet[cle] = { texte: r.texte, ia: r.ia };
  if (boite.isConnected) {
    p.textContent = r.texte;
    qui.lastChild.textContent = r.ia ? "🤖 IA" : "";
  }
  sauver();
  return r;
}

// ================================================================== aiguillage

function rendre() {
  occupe = false;
  modeActions = "principal";
  if (course && course.terminee && !course.bilan) {
    afficherBilan(terminer(course.issue));
    return;
  }
  if (course && !course.bilan) {
    if (course.salle && !course.salle.fini) afficherSalle();
    else afficherCarte();
    return;
  }
  afficherCamp();
}

function terminer(issue) {
  const bilan = M.terminerCourse(profil, course, issue);
  profil.dernier_bilan = bilan;
  S.effacerCourse();
  sauver();
  return bilan;
}

// ================================================================== camp

function afficherCamp() {
  vider();
  const scn = h("div", { class: "camp-scene" },
    h("div", { class: "titre-scene" }, h("h1", {}, "Le Repaire de Grokk"),
      h("p", {}, "Des expéditions de 10 minutes au cœur du repaire des gobelins")));
  jeu.append(scn);
  scene = creerScene(scn, { decor: "camp" });
  const debloques = ORDRE_HEROS.filter((id) => profil.debloques.includes(id));
  const positions = [0.32, 0.68, 0.2, 0.8];
  debloques.forEach((id, i) => scene.acteurs.push({ id, sprite: id, x: positions[i], taille: 0.75, miroir: positions[i] > 0.5 }));

  if (course && !course.bilan) {
    const st = M.statsCourse(profil, course);
    jeu.append(h("div", { class: "panneau" },
      h("h2", {}, "⏳ Expédition en cours"),
      h("p", {}, `${st.nom} (${st.titre}) — salle ${course.visitees.length}/${NB_ETAGES + 1}, ${course.pv}/${st.pvMax} PV, ${course.or} or.`),
      h("div", { class: "rangee" },
        h("button", { class: "bouton principal grand", onclick: () => { son("clic"); rendre(); } }, "▶️ Reprendre l'expédition"),
        h("button", { class: "bouton danger", onclick: abandonner }, "🏳️ Abandonner"))));
  }

  const def = HEROS[herosChoisi];
  const hh = profil.heros[herosChoisi];
  const st = M.statsHeros(profil, herosChoisi);
  const points = M.pointsDisponibles(hh);

  const cartes = h("div", { class: "choix-heros" }, ORDRE_HEROS.map((id) => {
    const ok = profil.debloques.includes(id);
    const p = profil.heros[id];
    const pts = M.pointsDisponibles(p);
    return h("button", {
      class: `carte-heros ${id === herosChoisi ? "choisi" : ""} ${ok ? "" : "verrouille"}`,
      onclick: () => {
        if (!ok) { toast(`🔒 ${HEROS[id].deblocage ?? "Pas encore débloqué"}`); return; }
        son("clic");
        herosChoisi = id;
        afficherCamp();
      },
    },
    spriteCanvas(id, 4),
    h("span", { class: "nom" }, ok ? HEROS[id].nom : "???", pts && ok ? h("span", { class: "badge-points" }, `+${pts}`) : null),
    h("span", { class: "classe" }, HEROS[id].titre),
    ok ? h("span", { class: "niv" }, `Niveau ${p.niveau}`) : h("span", { class: "classe" }, "🔒 Verrouillé"),
    ok ? h("div", { class: "barre-xp", title: `${p.xp}/${xpPourNiveau(p.niveau)} XP` },
      h("span", { style: `width:${p.niveau >= NIVEAU_MAX ? 100 : (100 * p.xp) / xpPourNiveau(p.niveau)}%` })) : null);
  }));

  const fiche = h("div", { class: "panneau" },
    h("div", { class: "fiche-heros" },
      spriteCanvas(herosChoisi, 6),
      h("div", {},
        h("h2", {}, `${def.nom}, ${def.titre}`),
        h("p", { class: "discret" }, def.desc),
        h("div", { class: "stats" },
          stat(st.pvMax, "PV"), stat(st.pmMax, "PM"), stat(st.ca, "CA"), stat(`+${st.att}`, `Attaque (${st.arme})`),
          stat(hh.niveau >= NIVEAU_MAX ? "MAX" : `${hh.xp}/${xpPourNiveau(hh.niveau)}`, "XP"),
          ...Object.entries(st.caracs).map(([c, v]) => stat(`${v}`, `${c} (${M.mod(v) >= 0 ? "+" : ""}${M.mod(v)})`))),
        h("div", { class: "liste-comp" }, st.competences.map((id) => h("span", { class: "puce", title: COMPETENCES[id].desc }, `${COMPETENCES[id].icone} ${COMPETENCES[id].nom}`))))));

  const diffs = h("div", { class: "difficultes" }, Object.entries(DIFFICULTES).map(([id, dd]) => {
    const ok = profil.difficultes.includes(id);
    return h("button", {
      class: `bouton ${id === diffChoisie ? "choisi" : ""}`, disabled: !ok, title: dd.desc,
      onclick: () => { son("clic"); diffChoisie = id; afficherCamp(); },
    }, ok ? dd.nom : `🔒 ${dd.nom}`, h("span", { class: "sous" }, id === "facile" ? "Détente" : id === "normal" ? "Équilibré" : id === "difficile" ? "Butin ×1,4" : "Butin ×1,8"));
  }));

  jeu.append(h("div", { class: "camp-grille" },
    h("div", { class: "panneau" },
      h("h2", {}, "Choisis ton héros"), cartes,
      h("h3", {}, "Difficulté"), diffs,
      h("p", { class: "discret" }, DIFFICULTES[diffChoisie].desc),
      h("div", { class: "rangee centre", style: "margin-top:.6rem" },
        h("button", { class: "bouton principal grand", onclick: partir, disabled: Boolean(course && !course.bilan) },
          "⚔️ Partir en expédition"))),
    h("div", {},
      fiche,
      h("div", { class: "panneau", style: "margin-top:.8rem" },
        h("h2", {}, "Le camp"),
        h("div", { class: "pnj" },
          pnj("🌳", "Talents", points ? `${points} point${points > 1 ? "s" : ""} à dépenser !` : "Arbre de compétences", ouvrirTalents, points > 0),
          pnj("⚒️", "Forge", "Brunhilde, forgeronne", ouvrirForge),
          pnj("🧪", "Apothicaire", "Provisions de départ", ouvrirApothicaire),
          pnj("🧙", "Maître Orin", "Conseils du vieux sage", ouvrirConseiller),
          pnj("🏆", "Exploits", "Tes statistiques", ouvrirExploits))))));
  sauver();
}

const stat = (valeur, nom) => h("div", { class: "stat" }, h("b", {}, valeur), h("small", {}, nom));
const pnj = (icone, nom, sous, action, important = false) => h("button", { class: `bouton ${important ? "principal" : ""}`, onclick: () => { son("clic"); action(); } },
  h("span", { class: "icone" }, icone), nom, h("span", { class: "sous" }, sous));

async function partir() {
  if (course && !course.bilan) return;
  son("clic");
  try {
    course = M.nouvelleCourse(profil, herosChoisi, diffChoisie);
  } catch (e) {
    toast(e.message, "erreur");
    return;
  }
  narrateur = creerNarrateur({ actif: reglages.mj_ia });
  course.recit_depart = null;
  sauver();
  afficherCarte(true);
}

function abandonner() {
  confirmer("Abandonner l'expédition ?", "Tu gardes l'XP gagnée et la moitié de l'or trouvé.", "🏳️ Abandonner", () => {
    const bilan = terminer("abandon");
    afficherBilan(bilan);
  });
}

// ================================================================== carte du repaire

function afficherCarte(depart = false) {
  vider();
  occupe = false;
  jeu.append(barreStatut());
  const recit = h("div", { class: "recit" });
  if (depart || course.recit_depart) {
    jeu.append(recit);
    raconter(recit, "recit_depart", "depart", { difficulte: DIFFICULTES[course.difficulte].nom }, course);
  }
  const accessibles = M.sallesAccessibles(course);
  jeu.append(h("p", { class: "pixel", style: "margin:0" }, accessibles.length ? "🗺️ Choisis ta prochaine salle (celles qui brillent) :" : ""));
  const conteneur = h("div", { class: "carte-repaire" });
  jeu.append(conteneur);
  jeu.append(h("div", { class: "legende" }, Object.entries(TYPES_SALLES).map(([, t]) => h("span", {}, `${t.icone} ${t.nom}`)),
    h("button", { class: "bouton petit", style: "margin-left:auto", onclick: () => afficherCamp() }, "🏕️ Voir le camp")));
  dessinerCarte(conteneur, accessibles);
  const prochaine = conteneur.querySelector(".noeud.accessible");
  if (prochaine && conteneur.clientWidth < 640 && course.visitees.length) prochaine.scrollIntoView({ block: "center" });
  const redessiner = () => { if (conteneur.isConnected) dessinerCarte(conteneur, M.sallesAccessibles(course)); };
  window.onresize = redessiner;
}

function dessinerCarte(conteneur, accessibles) {
  conteneur.replaceChildren();
  const horizontal = conteneur.clientWidth >= 640;
  conteneur.style.minHeight = horizontal ? "360px" : `${(NB_ETAGES + 1) * 86 + 60}px`;
  const L = conteneur.clientWidth;
  const H = conteneur.clientHeight;
  const marge = 50;
  const toutes = [...course.carte.etages.flat(), course.carte.boss];
  const pos = (s) => {
    const a = (s.etage + 0.5) / (NB_ETAGES + 1);
    const b = (s.col + 0.5) / s.n;
    return horizontal
      ? { x: marge + a * (L - 2 * marge), y: marge + b * (H - 2 * marge) }
      : { x: marge + b * (L - 2 * marge), y: marge + a * (H - 2 * marge) };
  };
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", L);
  svg.setAttribute("height", H);
  const visitees = course.visitees;
  for (const s of toutes) {
    const p1 = pos(s);
    for (const id of s.suivants) {
      const s2 = M.salleParId(course.carte, id);
      const p2 = pos(s2);
      const ligne = document.createElementNS("http://www.w3.org/2000/svg", "line");
      ligne.setAttribute("x1", p1.x); ligne.setAttribute("y1", p1.y);
      ligne.setAttribute("x2", p2.x); ligne.setAttribute("y2", p2.y);
      const parcouru = visitees.includes(s.id) && visitees.includes(id) && visitees.indexOf(id) === visitees.indexOf(s.id) + 1;
      const possible = course.position === s.id && accessibles.includes(id);
      ligne.setAttribute("stroke", parcouru ? "#ecc038" : possible ? "#b99cf0" : "#4b3d60");
      ligne.setAttribute("stroke-width", parcouru || possible ? 6 : 4);
      ligne.setAttribute("stroke-dasharray", parcouru ? "" : "8 8");
      ligne.setAttribute("stroke-linecap", "round");
      svg.append(ligne);
    }
  }
  conteneur.append(svg);
  for (const s of toutes) {
    const p = pos(s);
    const t = TYPES_SALLES[s.type];
    const acces = accessibles.includes(s.id);
    const classes = ["noeud", s.type === "boss" ? "boss" : "", visitees.includes(s.id) ? "visite" : "", course.position === s.id ? "actuel" : "", acces ? "accessible" : "inaccessible"];
    conteneur.append(h("button", {
      class: classes.join(" "), style: `left:${p.x}px; top:${p.y}px`, title: t.nom, "aria-label": t.nom, disabled: !acces,
      onclick: () => entrer(s.id),
    }, t.icone));
  }
}

function entrer(id) {
  if (occupe) return;
  son("clic");
  window.onresize = null;
  const avant = niveauHeros();
  M.entrerSalle(profil, course, id);
  sauver();
  signalerNiveau(avant);
  afficherSalle();
}

// ================================================================== salles

function afficherSalle() {
  window.onresize = null;
  const salle = course.salle;
  if (salle.type === "combat") return afficherCombat();
  vider();
  jeu.append(barreStatut());
  const scn = h("div", { class: "scene" });
  jeu.append(scn);
  scene = creerScene(scn, {});
  scene.acteurs.push({ id: "heros", sprite: course.heros, x: 0.25 });
  const recit = h("div", { class: "recit" });
  const zone = h("div", { class: "panneau" });
  jeu.append(recit, zone);
  if (salle.type === "evenement") salleEvenement(recit, zone);
  else if (salle.type === "tresor") salleTresor(recit, zone);
  else if (salle.type === "marchand") salleMarchand(recit, zone);
  else if (salle.type === "repos") salleRepos(recit, zone);
}

const boutonContinuer = () => h("button", { class: "bouton principal grand", onclick: () => { son("clic"); afficherCarte(); } }, "➡️ Continuer");

function salleEvenement(recit, zone) {
  const salle = course.salle;
  const ev = EVENEMENTS.find((e) => e.id === salle.evenement);
  scene.acteurs.push({ id: "pnj", sprite: ev.id === "gobelin_blesse" || ev.id === "des" ? "gobelin" : null, x: 0.7, cache: !(ev.id === "gobelin_blesse" || ev.id === "des") });
  raconter(recit, "recit", "evenement", { titre: ev.titre, texte: ev.texte, etage: salle.etage + 1 });
  const st = M.statsCourse(profil, course);
  const dessiner = () => {
    zone.replaceChildren(h("h2", {}, `${ev.icone} ${ev.titre}`));
    if (!salle.resultat) {
      zone.append(h("div", { class: "choix" }, ev.choix.map((c, i) => {
        const bonus = c.test ? M.mod(st.caracs[c.test.carac]) + (c.test.carac === st.principale ? st.maitrise : 0) : 0;
        const chance = c.test ? Math.round(100 * Math.min(0.95, Math.max(0.05, (21 - (c.test.dd - bonus)) / 20))) : null;
        return h("button", {
          class: "bouton", disabled: Boolean(c.cout && course.or < c.cout),
          onclick: () => choisir(i),
        }, c.texte, c.test ? h("span", { class: "sous" }, `Test de ${c.test.carac} DD ${c.test.dd} (${bonus >= 0 ? "+" : ""}${bonus}) · ~${chance} %`) : h("span", { class: "sous" }, "Sans risque"));
      })));
      return;
    }
    const r = salle.resultat;
    const res = h("div", { class: "resultat" });
    if (r.jet) res.append(h("p", { class: "jet-texte" }, `🎲 ${r.jet.carac} : d20 ${r.jet.nat} ${r.jet.bonus >= 0 ? "+" : ""}${r.jet.bonus} = ${r.jet.total} contre DD ${r.jet.dd} — ${r.jet.reussi ? "réussite !" : "échec"}`));
    const p = h("p", {}, r.texte);
    res.append(p);
    if (r.effets.length) res.append(h("div", { class: "effets" }, r.effets.map((e) => h("span", { class: "puce" }, e))));
    zone.append(res, h("div", { class: "rangee centre", style: "margin-top:.6rem" },
      r.combat
        ? h("button", { class: "bouton danger grand", onclick: () => { son("clic"); afficherCombat(); } }, "⚔️ Au combat !")
        : boutonContinuer()));
  };
  async function choisir(i) {
    if (occupe) return;
    occupe = true;
    son("clic");
    const avant = niveauHeros();
    let r;
    try {
      r = M.choisirEvenement(profil, course, i);
    } catch (e) {
      toast(e.message, "erreur");
      occupe = false;
      return;
    }
    sauver();
    signalerNiveau(avant);
    if (r.jet) await animerDe(scene, r.jet.nat, r.jet.reussi ? "" : "fumble", `${r.jet.total} vs DD ${r.jet.dd}`);
    son(r.jet && !r.jet.reussi ? "aie" : "piece");
    majStatut();
    dessiner();
    occupe = false;
    // Le MJ raconte l'issue (sans changer les effets, déjà appliqués par le jeu).
    const cibleRecit = r.combat ? course.salle : salle;
    raconter(recit, "recit_resultat", "resultat", { choix: ev.choix[i].texte, resultat: r.texte }, cibleRecit);
  }
  dessiner();
}

function salleTresor(recit, zone) {
  const salle = course.salle;
  scene.acteurs.push({ id: "coffre", sprite: null, x: 0.7, cache: true });
  raconter(recit, "recit", "tresor", {});
  const dessiner = (effets = null) => {
    zone.replaceChildren(h("h2", {}, "💰 Trésor"));
    if (!salle.pris) {
      zone.append(h("p", {}, "Une cachette pleine de butin gobelin t'attend."),
        h("div", { class: "rangee centre" }, h("button", { class: "bouton principal grand", onclick: prendre }, "🖐️ Tout ramasser")));
    } else {
      zone.append(h("div", { class: "effets" }, (effets ?? ["Déjà ramassé."]).map((e) => h("span", { class: "puce" }, e))),
        h("div", { class: "rangee centre", style: "margin-top:.6rem" }, boutonContinuer()));
    }
  };
  function prendre() {
    const effets = M.prendreTresor(profil, course);
    son("piece");
    sauver();
    majStatut();
    dessiner(effets);
  }
  dessiner();
}

function salleMarchand(recit, zone) {
  scene.acteurs.push({ id: "zibb", sprite: "gobelin", x: 0.72 });
  raconter(recit, "recit", "marchand", {});
  const dessiner = () => {
    const salle = course.salle;
    zone.replaceChildren(h("h2", {}, `🛒 L'étal de Zibb — tu as 💰 ${course.or}`),
      h("div", { class: "etal" }, salle.stock.map((a) => {
        const info = a.type === "objet" ? OBJETS[a.id] : a.type === "relique" ? RELIQUES[a.id] : { nom: "Soins de Zibb", icone: "🩹", desc: "Rend la moitié de tes PV max." };
        return h("button", {
          class: "bouton article", disabled: a.vendu || course.or < a.prix,
          onclick: () => acheterArticle(a.index),
        }, h("span", { class: "icone" }, info.icone),
        h("span", { class: "txt" }, info.nom, h("span", { class: "sous" }, a.type === "relique" ? `Relique : ${info.desc}` : info.desc)),
        h("span", { class: "prix" }, a.vendu ? "Vendu" : `${a.prix} or`));
      })),
      h("div", { class: "rangee centre", style: "margin-top:.8rem" },
        h("button", { class: "bouton principal grand", onclick: () => { M.quitterSalle(course); sauver(); son("clic"); afficherCarte(); } }, "👋 Partir")));
  };
  function acheterArticle(i) {
    try {
      const a = M.acheter(profil, course, i);
      son("piece");
      toast(`Acheté : ${a.type === "objet" ? OBJETS[a.id].nom : a.type === "relique" ? RELIQUES[a.id].nom : "soins"}`);
    } catch (e) {
      toast(e.message, "erreur");
    }
    sauver();
    majStatut();
    dessiner();
  }
  dessiner();
}

function salleRepos(recit, zone) {
  raconter(recit, "recit", "repos", {});
  const st = M.statsCourse(profil, course);
  const xp = Math.round(40 * DIFFICULTES[course.difficulte].xp);
  const dessiner = (effets = null) => {
    zone.replaceChildren(h("h2", {}, "🔥 Feu de camp"));
    if (!effets) {
      zone.append(h("div", { class: "choix" },
        h("button", { class: "bouton vert", onclick: () => choisir("dormir") }, "😴 Dormir", h("span", { class: "sous" }, `Soigne ${Math.round(st.pvMax * 0.4)} PV`)),
        h("button", { class: "bouton bleu", onclick: () => choisir("entrainer") }, "🏋️ S'entraîner", h("span", { class: "sous" }, `+${xp} XP`))));
    } else {
      zone.append(h("div", { class: "effets" }, effets.map((e) => h("span", { class: "puce" }, e))),
        h("div", { class: "rangee centre", style: "margin-top:.6rem" }, boutonContinuer()));
    }
  };
  function choisir(c) {
    const avant = niveauHeros();
    const effets = M.reposer(profil, course, c);
    son(c === "dormir" ? "soin" : "niveau");
    sauver();
    signalerNiveau(avant);
    majStatut();
    dessiner(effets);
  }
  dessiner();
}

// ================================================================== combat

function placementEnnemis(ennemis) {
  const vivants = ennemis;
  const n = vivants.length;
  return vivants.map((e, i) => ({ e, x: n === 1 ? 0.72 : 0.56 + (0.34 * i) / (n - 1) }));
}

function afficherCombat() {
  vider();
  const salle = course.salle;
  cibleId = salle.ennemis.find((e) => !e.mort)?.id ?? null;
  modeActions = "principal";
  jeu.append(barreStatut());
  const scn = h("div", { class: "scene" });
  jeu.append(scn);
  scene = creerScene(scn, { boss: salle.genre === "boss" });
  scene.acteurs.push({ id: "heros", sprite: course.heros, x: 0.2 });
  for (const { e, x } of placementEnnemis(salle.ennemis)) {
    scene.acteurs.push({ id: e.id, sprite: e.sprite, x, taille: e.taille, cache: e.mort });
  }
  scene.surRedimension = () => placerEtiquettes();
  const recit = h("div", { class: "recit" });
  const journal = h("div", { class: "journal-combat", id: "journal" });
  jeu.append(h("div", { class: "bas-scene" }, recit, journal));
  jeu.append(h("div", { id: "actions" }));
  for (const ligne of salle.journal ?? []) ajouterJournal(ligne.texte, ligne.genre, false);
  const noms = decrireGroupe(salle.ennemis);
  const type = salle.genre === "boss" ? "boss" : salle.genre === "elite" ? "elite" : "combat";
  raconter(recit, "recit", type, { ennemis: noms, etage: (salle.etage ?? 0) + 1 });
  setTimeout(placerEtiquettes, 30);
  // La police pixel change la largeur des noms : on replace les étiquettes une fois qu'elle est chargée.
  document.fonts?.ready.then(() => placerEtiquettes());
  dessinerActions();
}

const NOMBRES = ["", "un", "deux", "trois", "quatre", "cinq"];
const pluriel = (nom) => nom.split(" ").map((m) => (["de", "des", "du", "la", "le"].includes(m) || /[sx]$/.test(m) ? m : `${m}s`)).join(" ");

/** « un Gobelin et deux Archers gobelins » (le boss garde son nom). */
function decrireGroupe(ennemis) {
  const groupes = [];
  for (const e of ennemis) {
    const base = ENNEMIS[e.type];
    if (base.boss) { groupes.push(base.nom); continue; }
    const g = groupes.find((x) => x.type === e.type);
    if (g) g.n += 1;
    else groupes.push({ type: e.type, n: 1, nom: base.nom });
  }
  const textes = groupes.map((g) => (typeof g === "string" ? g : `${NOMBRES[g.n] ?? g.n} ${g.n > 1 ? pluriel(g.nom) : g.nom}`));
  return textes.length > 1 ? `${textes.slice(0, -1).join(", ")} et ${textes.at(-1)}` : textes[0] ?? "";
}

function placerEtiquettes() {
  if (!scene || course?.salle?.type !== "combat") return;
  const salle = course.salle;
  scene.conteneur.querySelectorAll(".cible-ennemi, .alerte-boss").forEach((x) => x.remove());
  for (const e of salle.ennemis) {
    const a = scene.acteur(e.id);
    if (!a) continue;
    const r = scene.rect(a);
    const etats = e.statuts.map((s) => ICONES_STATUTS[s.id] ?? "").join("") + (e.prepare ? "⚠️" : "");
    const b = h("button", {
      class: `cible-ennemi ${e.id === cibleId ? "vise" : ""} ${e.mort ? "mort" : ""}`,
      style: `left:${r.cx}px; top:${Math.max(0, r.y - 58)}px`, "data-id": e.id,
      "aria-label": `Viser ${e.nom}, ${e.pv} PV sur ${e.pvMax}`,
      onclick: () => { if (e.mort) return; cibleId = e.id; son("clic"); placerEtiquettes(); },
    },
    h("span", { class: "nom-ennemi" }, e.nom),
    h("span", { class: "pv-ennemi" }, h("span", { style: `width:${(100 * e.pv) / e.pvMax}%` })),
    h("span", { class: "etats" }, etats),
    h("span", { class: "zone", style: `width:${r.l}px; height:${r.h}px` }));
    scene.conteneur.append(b);
    const demi = b.offsetWidth / 2;
    const gauche = Math.min(Math.max(r.cx, demi + 2), scene.conteneur.clientWidth - demi - 2);
    if (gauche !== r.cx) {
      b.style.left = `${gauche}px`;
      b.querySelector(".zone").style.transform = `translateX(${r.cx - gauche}px)`;
    }
  }
}

function ajouterJournal(texte, genre = "", memoriser = true) {
  const j = $("#journal");
  if (j) j.prepend(h("p", { class: genre }, texte));
  if (memoriser && course?.salle?.type === "combat") {
    const salle = course.salle;
    salle.journal = [...(salle.journal ?? []), { texte, genre }].slice(-30);
  }
}

function dessinerActions() {
  const zone = $("#actions");
  if (!zone) return;
  const salle = course.salle;
  zone.replaceChildren();
  if (salle.issue) return;
  const dispo = M.actionsDisponibles(profil, course);
  if (modeActions === "competences") {
    zone.append(h("div", { class: "sous-actions" },
      dispo.competences.map((c) => h("button", {
        class: "bouton", disabled: occupe || !c.possible, title: c.desc,
        onclick: () => agir({ type: "competence", id: c.id, cible: cibleId }),
      }, h("span", { class: "icone" }, c.icone), h("span", { class: "txt" }, c.nom, h("span", { class: "sous" }, c.raison ?? c.desc)),
      h("span", { class: "cout" }, c.cout ? `${c.cout} PM` : c.par_combat ? "1×/combat" : ""))),
      h("button", { class: "bouton", onclick: () => { modeActions = "principal"; dessinerActions(); } }, "↩️ Retour")));
    return;
  }
  if (modeActions === "objets") {
    zone.append(h("div", { class: "sous-actions" },
      dispo.objets.map((o) => h("button", {
        class: "bouton", disabled: occupe, onclick: () => agir({ type: "objet", id: o.id }),
      }, h("span", { class: "icone" }, o.icone), h("span", { class: "txt" }, `${o.nom} ×${o.n}`, h("span", { class: "sous" }, o.desc)))),
      h("button", { class: "bouton", onclick: () => { modeActions = "principal"; dessinerActions(); } }, "↩️ Retour")));
    return;
  }
  const st = M.statsCourse(profil, course);
  const nbComp = dispo.competences.filter((c) => c.possible).length;
  zone.append(h("div", { class: "actions" },
    h("button", { class: "bouton danger", disabled: occupe, onclick: () => agir({ type: "attaque", cible: cibleId }) },
      h("span", { class: "icone" }, "⚔️"), "Attaquer", h("span", { class: "sous" }, `${st.arme} · +${st.att}`)),
    h("button", { class: "bouton bleu", disabled: occupe, onclick: () => { son("clic"); modeActions = "competences"; dessinerActions(); } },
      h("span", { class: "icone" }, "✨"), "Compétences", h("span", { class: "sous" }, `${nbComp} disponible${nbComp > 1 ? "s" : ""} · ${course.pm} PM`)),
    h("button", { class: "bouton", disabled: occupe || !dispo.objets.length, onclick: () => { son("clic"); modeActions = "objets"; dessinerActions(); } },
      h("span", { class: "icone" }, "🎒"), "Objets", h("span", { class: "sous" }, dispo.objets.length ? dispo.objets.map((o) => `${o.icone}${o.n}`).join(" ") : "Sac vide")),
    h("button", { class: "bouton vert", disabled: occupe, onclick: () => agir({ type: "defense" }) },
      h("span", { class: "icone" }, "🛡️"), "Défendre", h("span", { class: "sous" }, `+${st.garde} CA, +1 PM`))));
}

async function agir(action) {
  if (occupe) return;
  occupe = true;
  son("clic");
  dessinerActions();
  const avant = niveauHeros();
  let evs;
  try {
    evs = M.jouerAction(profil, course, action);
  } catch (e) {
    toast(e.message, "erreur");
    occupe = false;
    dessinerActions();
    return;
  }
  sauver();
  await jouerEvenements(evs);
  modeActions = "principal";
  const salle = course.salle;
  if (!salle.ennemis.find((e) => e.id === cibleId && !e.mort)) cibleId = salle.ennemis.find((e) => !e.mort)?.id ?? null;
  placerEtiquettes();
  majStatut();
  signalerNiveau(avant);
  if (salle.issue === "victoire") return finCombatVictoire();
  if (salle.issue === "defaite") {
    son("defaite");
    await pause(1400);
    afficherBilan(terminer("defaite"));
    return;
  }
  occupe = false;
  dessinerActions();
}

async function animerDe(sc, valeur, genre, legende) {
  const de = h("div", { class: "de20 roule" }, "?");
  sc.conteneur.append(de);
  for (let i = 0; i < 5; i++) {
    de.textContent = String(1 + Math.floor(Math.random() * 20));
    await pause(40);
  }
  de.classList.remove("roule");
  de.textContent = String(valeur);
  if (genre) de.classList.add(genre);
  if (legende) de.append(h("small", {}, legende));
  await pause(340);
  setTimeout(() => de.remove(), 250 * (VITESSES[reglages.vitesse] ?? 1));
}

async function jouerEvenements(evs) {
  const salle = course.salle;
  const nom = (id) => (id === "heros" ? "Toi" : salle.ennemis.find((e) => e.id === id)?.nom ?? id);
  for (const ev of evs) {
    switch (ev.type) {
      case "action":
        ajouterJournal(ev.texte, ev.qui ? "ennemi" : "heros");
        if (ev.qui) await scene.elan(ev.qui, -1);
        else if (!ev.competence || ["coup_puissant", "attaque_sournoise", "lame_empoisonnee", "coup_bas", "tourbillon"].includes(ev.competence)) await scene.elan("heros", 1);
        await pause(120);
        break;
      case "jet": {
        const genre = ev.critique ? "crit" : ev.nat === 1 ? "fumble" : ev.qui === "heros" ? "" : "ennemi";
        await animerDe(scene, ev.nat, genre, `${ev.total} vs CA ${ev.ca}`);
        ajouterJournal(`🎲 ${M.descriptionJet(ev, nom(ev.qui))}`, ev.qui === "heros" ? "heros" : "ennemi");
        if (!ev.touche) {
          flottant(scene, ev.cible, "Raté !", "rate");
          son("rate");
          await pause(250);
        } else if (ev.critique) {
          flottant(scene, ev.cible, "CRITIQUE !", "crit");
          son("crit");
        }
        break;
      }
      case "automatique":
        ajouterJournal(`✨ ${ev.texte} (pas de jet d'attaque)`, "heros");
        break;
      case "sauvegarde":
        ajouterJournal(`🎲 ${nom(ev.cible)} : sauvegarde ${ev.total} contre DD ${ev.dd} — ${ev.reussi ? "moitié des dégâts" : "plein fouet"}`);
        break;
      case "degats":
        scene.touche(ev.cible);
        flottant(scene, ev.cible, `-${ev.montant}`, "degats");
        son(ev.cible === "heros" ? "aie" : "coup");
        if (ev.cible === "heros") {
          ajouterJournal(`💥 Tu perds ${ev.montant} PV${ev.detail ? ` (${ev.detail})` : ""}.`, "ennemi");
          majStatut();
        } else {
          const pourquoi = ev.detail ?? (ev.source === "poison" ? "poison" : ev.source === "aura" ? "esprits" : "");
          ajouterJournal(`💥 ${nom(ev.cible)} perd ${ev.montant} PV${pourquoi ? ` (${pourquoi})` : ""}.`, "heros");
          placerEtiquettes();
        }
        await pause(300);
        break;
      case "soin":
        flottant(scene, ev.cible, `+${ev.montant}`, "soin");
        son("soin");
        if (!ev.discret) ajouterJournal(ev.cible === "heros" ? `💖 Tu récupères ${ev.montant} PV.` : `💚 ${nom(ev.cible)} récupère ${ev.montant} PV.`, "bon");
        majStatut();
        placerEtiquettes();
        await pause(300);
        break;
      case "pm":
        flottant(scene, ev.cible, `+${ev.montant} PM`, "pm");
        majStatut();
        await pause(250);
        break;
      case "ko":
        scene.mourir(ev.cible);
        ajouterJournal(`☠️ ${ev.texte}`, "bon");
        placerEtiquettes();
        await pause(350);
        break;
      case "statut":
        ajouterJournal(`✨ ${ev.texte}`, ev.cible === "heros" ? "ennemi" : "heros");
        placerEtiquettes();
        majStatut();
        break;
      case "alerte":
        son("alerte");
        ajouterJournal(ev.texte, "alerte");
        toast(ev.texte);
        placerEtiquettes();
        await pause(500);
        break;
      case "renforts": {
        ajouterJournal(`📣 ${ev.texte}`, "alerte");
        // On replace tous les ennemis pour faire de la place aux renforts.
        const places = placementEnnemis(salle.ennemis);
        for (const { e, x } of places) {
          const a = scene.acteur(e.id);
          if (a) a.x = x;
          else scene.acteurs.push({ id: e.id, sprite: e.sprite, x, taille: e.taille });
        }
        placerEtiquettes();
        await pause(500);
        break;
      }
      case "defaite":
        scene.mourir("heros");
        ajouterJournal(`💀 ${ev.texte}`, "alerte");
        break;
      case "victoire":
        son("victoire");
        break;
      default:
        break;
    }
  }
  sauver();
}

function finCombatVictoire() {
  const salle = course.salle;
  const b = salle.butin ?? {};
  const voile = h("div", { class: "voile" }, h("div", { class: "bandeau-victoire" }, salle.genre === "boss" ? "👑 GROKK EST VAINCU !" : "VICTOIRE !"));
  scene.conteneur.append(voile);
  const effets = [`+${b.xp} XP`, `+${b.or} or`];
  if (b.regen) effets.push(`+${b.regen} PV (souffle)`);
  if (b.relique) effets.push(`${RELIQUES[b.relique].icone} ${RELIQUES[b.relique].nom} (${RELIQUES[b.relique].desc})`);
  if (b.objet) effets.push(`${OBJETS[b.objet].icone} ${OBJETS[b.objet].nom}`);
  const zone = $("#actions");
  zone.replaceChildren(h("div", { class: "panneau" },
    h("div", { class: "effets" }, effets.map((e) => h("span", { class: "puce" }, e))),
    h("div", { class: "rangee centre", style: "margin-top:.6rem" },
      course.terminee
        ? h("button", { class: "bouton principal grand", onclick: () => afficherBilan(terminer("victoire")) }, "🏆 Voir le bilan")
        : h("button", { class: "bouton principal grand", onclick: () => { son("clic"); afficherCarte(); } }, "➡️ Continuer l'exploration"))));
  majStatut();
  const recit = $(".recit");
  const st = M.statsCourse(profil, course);
  if (recit && salle.genre !== "boss") {
    raconter(recit, "recit_fin", "victoire_combat", { ennemis: decrireGroupe(salle.ennemis), blesse: course.pv < st.pvMax * 0.35 });
  }
  occupe = false;
  sauver();
}

// ================================================================== bilan

function afficherBilan(bilan) {
  vider();
  window.onresize = null;
  const def = HEROS[bilan.heros];
  const titre = bilan.issue === "victoire" ? "🏆 Victoire !" : bilan.issue === "defaite" ? "💀 Défaite…" : "🏳️ Retraite";
  const recit = h("div", { class: "recit" });
  jeu.append(h("div", { class: "panneau bilan" },
    h("h1", {}, titre),
    h("div", { class: "rangee centre" }, spriteCanvas(bilan.heros, 6)),
    h("p", { style: "text-align:center" }, `${def.nom}, ${def.titre} — ${DIFFICULTES[bilan.difficulte].nom}`),
    h("div", { class: "chiffres" },
      stat(bilan.etage > NB_ETAGES ? "👑" : `${bilan.etage}/${NB_ETAGES + 1}`, "Salles"),
      stat(bilan.tues, "Ennemis vaincus"),
      stat(`+${bilan.xp}`, "XP gagnée"),
      stat(bilan.niveau > bilan.niveau_depart ? `${bilan.niveau_depart} → ${bilan.niveau}` : bilan.niveau, "Niveau"),
      stat(`+${bilan.or_garde}`, bilan.issue === "victoire" ? "Or rapporté" : `Or rapporté (½ de ${bilan.or_trouve})`),
      stat(`${Math.floor(bilan.duree / 60)} min`, "Durée")),
    bilan.deblocages.length ? h("div", { class: "effets", style: "justify-content:center" }, bilan.deblocages.map((d) => h("span", { class: "puce" }, `🔓 ${d}`))) : null,
    bilan.points ? h("p", { style: "text-align:center" }, `🌳 Tu as ${bilan.points} point${bilan.points > 1 ? "s" : ""} de talent à dépenser au camp !`) : null,
    recit,
    h("div", { class: "rangee centre", style: "margin-top:.8rem" },
      h("button", { class: "bouton principal grand", onclick: () => { course = null; son("clic"); afficherCamp(); } }, "🏕️ Retour au camp"))));
  const objet = { };
  raconter(recit, "chronique", "fin", { issue: bilan.issue, etage: bilan.etage, tues: bilan.tues, heros: def.nom }, objet).then((r) => {
    profil.derniere_chronique = r.texte;
    S.enregistrerProfil(profil);
  });
  if (bilan.issue === "victoire") son("victoire");
}

// ================================================================== fenêtres du camp

function ouvrirModale(...contenu) {
  $("#modale-contenu").replaceChildren(...contenu.flat().filter((c) => c != null && c !== false));
  $("#modale").classList.remove("cache");
}
function fermerModale() {
  $("#modale").classList.add("cache");
  $("#modale-contenu").replaceChildren();
}
$("#fermer-modale").addEventListener("click", fermerModale);
$("#modale").addEventListener("click", (e) => { if (e.target.id === "modale") fermerModale(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") fermerModale(); });

function confirmer(titre, texte, libelle, action) {
  ouvrirModale(h("h2", {}, titre), h("p", {}, texte), h("div", { class: "rangee" },
    h("button", { class: "bouton danger", onclick: () => { fermerModale(); action(); } }, libelle),
    h("button", { class: "bouton", onclick: fermerModale }, "Annuler")));
}

function rafraichirCamp() {
  if (!course || course.bilan || !$("#statut")) afficherCamp();
}

function ouvrirTalents() {
  const id = herosChoisi;
  const def = HEROS[id];
  const hh = profil.heros[id];
  const points = M.pointsDisponibles(hh);
  ouvrirModale(
    h("h2", {}, `🌳 Talents de ${def.nom}`),
    h("p", {}, points ? `Tu as ${points} point${points > 1 ? "s" : ""} à dépenser. ` : "Aucun point disponible : chaque niveau gagné t'en donne un. ",
      h("span", { class: "discret" }, "Les talents d'une branche s'apprennent de haut en bas.")),
    course && !course.bilan && course.heros === id ? h("p", { class: "discret" }, "Les talents appris maintenant s'appliquent aussi à l'expédition en cours.") : null,
    h("div", { class: "arbre" }, def.branches.map((b) => h("div", { class: "branche" },
      h("h3", {}, b.nom),
      b.talents.map((t, i) => {
        const appris = hh.talents.includes(t.id);
        const blocage = M.blocageTalent(profil, id, t.id);
        return [
          i ? h("div", { class: "fleche" }, "▼") : null,
          h("button", {
            class: `bouton talent ${appris ? "appris" : !blocage ? "dispo" : ""}`, disabled: !appris && Boolean(blocage),
            title: blocage ?? "",
            onclick: () => {
              if (appris) return;
              try {
                M.apprendreTalent(profil, id, t.id);
                son("niveau");
                sauver();
                ouvrirTalents();
                rafraichirCamp();
              } catch (e) { toast(e.message, "erreur"); }
            },
          }, `${appris ? "✅ " : ""}${t.nom}`, h("span", { class: "sous" }, t.desc)),
        ];
      })))),
    h("div", { class: "rangee", style: "margin-top:.8rem" },
      h("button", { class: "bouton petit", disabled: !hh.talents.length, onclick: () => {
        M.oublierTalents(profil, id);
        sauver();
        ouvrirTalents();
        rafraichirCamp();
        toast("Points de talent rendus : répartis-les comme tu veux.");
      } }, "🔄 Réinitialiser (gratuit)")));
}

const PHRASES_FORGE = [
  "« Une lame bien forgée, c'est la moitié du travail. L'autre moitié, c'est toi. »",
  "« Les gobelins frappent comme des moustiques. Avec mes armures, tu ne les sentiras même plus. »",
  "« Apporte-moi de l'or, je t'apporte de la gloire. »",
];

function ouvrirForge() {
  const id = herosChoisi;
  const def = HEROS[id];
  const hh = profil.heros[id];
  ouvrirModale(
    h("h2", {}, `⚒️ La forge de Brunhilde — équipement de ${def.nom}`),
    h("p", { class: "discret" }, PHRASES_FORGE[Math.floor(Math.random() * PHRASES_FORGE.length)]),
    h("p", { class: "pixel" }, `💰 Or du camp : ${profil.or}`),
    h("div", { class: "forge" }, Object.entries(FORGE).map(([emp, f]) => {
      const niveau = hh.forge[emp];
      const prix = M.prixForge(profil, id, emp);
      return h("div", { class: "emplacement" },
        h("div", { class: "rangee" }, h("span", { class: "icone" }, f.icone), h("div", {}, h("b", { class: "pixel" }, `${f.nom} : ${f.niveaux[niveau]}`),
          h("div", { class: "discret" }, niveau ? f.desc(niveau) : emp === "talisman" ? "Aucun bonus" : "Équipement de base"))),
        h("div", { class: "niveaux-forge" }, [1, 2, 3].map((n) => h("span", { class: n <= niveau ? "oui" : "" }))),
        prix == null
          ? h("p", { class: "pixel", style: "color:var(--or)" }, "✨ Niveau maximum")
          : h("button", {
            class: "bouton principal", disabled: profil.or < prix,
            onclick: () => {
              try {
                M.acheterForge(profil, id, emp);
                son("piece");
                sauver();
                toast(`${f.icone} ${f.nom} améliorée : ${f.niveaux[hh.forge[emp]]} !`, "or");
                ouvrirForge();
                rafraichirCamp();
              } catch (e) { toast(e.message, "erreur"); }
            },
          }, `${f.niveaux[niveau + 1]} — ${prix} or`, h("span", { class: "sous" }, f.desc(niveau + 1))));
    })),
    course && !course.bilan ? h("p", { class: "discret" }, "L'équipement acheté s'applique aussi à l'expédition en cours.") : null);
}

function ouvrirApothicaire() {
  const total = Object.values(profil.provisions).reduce((a, b) => a + b, 0);
  ouvrirModale(
    h("h2", {}, "🧪 L'apothicaire Mirabelle"),
    h("p", {}, "« Emporte quelques provisions pour ta prochaine expédition, mon petit. Une potion de soins t'est toujours offerte, plus une deuxième par la maison ! »"),
    h("p", { class: "pixel" }, `💰 Or du camp : ${profil.or} · Provisions : ${total}/${M.MAX_PROVISIONS}`,
      total ? ` (${Object.entries(profil.provisions).map(([id, n]) => `${OBJETS[id].icone}×${n}`).join(" ")})` : ""),
    h("div", { class: "etal" }, Object.entries(OBJETS).map(([id, o]) => h("button", {
      class: "bouton article", disabled: profil.or < o.prix || total >= M.MAX_PROVISIONS,
      onclick: () => {
        try {
          M.acheterProvision(profil, id);
          son("piece");
          sauver();
          ouvrirApothicaire();
        } catch (e) { toast(e.message, "erreur"); }
      },
    }, h("span", { class: "icone" }, o.icone), h("span", { class: "txt" }, o.nom, h("span", { class: "sous" }, o.desc)), h("span", { class: "prix" }, `${o.prix} or`)))));
}

function ouvrirConseiller() {
  const boite = h("div", { class: "recit" });
  const st = M.statsHeros(profil, herosChoisi);
  const hh = profil.heros[herosChoisi];
  const b = profil.dernier_bilan;
  const situation = [
    `Le héros choisi est ${st.nom}, ${st.titre.toLowerCase()} de niveau ${st.niveau} (${st.pvMax} PV, CA ${st.ca}, compétences : ${st.competences.map((c) => COMPETENCES[c].nom).join(", ")}).`,
    M.pointsDisponibles(hh) ? `Il a ${M.pointsDisponibles(hh)} point(s) de talent non dépensé(s).` : "",
    `Or du camp : ${profil.or}. Équipement : arme niveau ${hh.forge.arme}, armure niveau ${hh.forge.armure}, talisman niveau ${hh.forge.talisman}.`,
    b ? `Dernière expédition : ${b.issue === "victoire" ? "victoire contre Grokk" : b.issue === "defaite" ? `défaite à la salle ${b.etage}` : "abandon"} en difficulté ${DIFFICULTES[b.difficulte].nom}.` : "C'est sa toute première expédition.",
  ].filter(Boolean).join(" ");
  const objet = {};
  ouvrirModale(
    h("div", { class: "rangee" }, spriteCanvas("mage", 4, {}), h("div", {}, h("h2", {}, "🧙 Maître Orin"),
      h("p", { class: "discret" }, "Ancien aventurier, il a perdu une jambe et trois dents dans ce repaire. Il en connaît tous les secrets."))),
    boite,
    h("div", { class: "rangee", style: "margin-top:.6rem" },
      h("button", { class: "bouton", onclick: () => { delete objet.conseil; raconter(boite, "conseil", "conseil", { situation }, objet); } }, "💬 Un autre conseil")));
  raconter(boite, "conseil", "conseil", { situation }, objet);
}

function ouvrirExploits() {
  const s = profil.stats;
  ouvrirModale(
    h("h2", {}, "🏆 Exploits"),
    h("div", { class: "chiffres" },
      stat(s.expeditions, "Expéditions"), stat(s.victoires, "Victoires sur Grokk"), stat(s.morts, "Défaites"),
      stat(s.gobelins, "Ennemis vaincus"), stat(s.meilleur_etage > NB_ETAGES ? "👑" : s.meilleur_etage, "Meilleure salle"),
      ...ORDRE_HEROS.filter((id) => profil.debloques.includes(id)).map((id) => stat(`niv ${profil.heros[id].niveau}`, HEROS[id].nom))),
    profil.derniere_chronique ? h("div", { class: "recit" }, h("div", { class: "qui" }, "📜 Dernière chronique"), h("p", {}, profil.derniere_chronique)) : null);
}

function ouvrirReglages() {
  const ia = iaDisponible();
  const fichier = h("input", { type: "file", accept: ".json,application/json", hidden: true });
  fichier.addEventListener("change", async () => {
    const f = fichier.files?.[0];
    if (!f) return;
    try {
      const r = S.importer(await f.text());
      profil = r.profil;
      course = r.course;
      narrateur = creerNarrateur({ actif: reglages.mj_ia, memoire: course?.memoire ?? [] });
      herosChoisi = profil.dernier_heros;
      sauver();
      if (!course) S.effacerCourse();
      fermerModale();
      toast("Sauvegarde importée !", "or");
      rendre();
    } catch (e) { toast(e.message, "erreur"); }
  });
  const coche = (cle, libelle, apres) => {
    const input = h("input", { type: "checkbox" });
    input.checked = Boolean(reglages[cle]);
    input.addEventListener("change", () => {
      reglages[cle] = input.checked;
      S.enregistrerReglages(reglages);
      apres?.();
    });
    return h("label", { class: "interrupteur" }, input, libelle);
  };
  const vitesse = h("select", {}, Object.keys(VITESSES).map((v) => {
    const o = h("option", { value: v }, v === "lente" ? "Lente" : v === "normale" ? "Normale" : "Rapide");
    if (v === reglages.vitesse) o.selected = true;
    return o;
  }));
  vitesse.addEventListener("change", () => { reglages.vitesse = vitesse.value; S.enregistrerReglages(reglages); });
  ouvrirModale(
    h("h2", {}, "⚙️ Réglages"),
    coche("mj_ia", "🤖 Maître du jeu IA (récits uniques à chaque salle)", () => { narrateur.actif = reglages.mj_ia; }),
    h("p", { class: "discret" }, ia
      ? "✅ L'IA est prête : elle utilise la connexion réglée dans Contes & Dragons."
      : "⚠️ Aucune IA configurée : le jeu utilise des récits écrits à l'avance. ",
      ia ? null : h("a", { href: "index.html" }, "Configurer l'IA dans Contes & Dragons ⚙️")),
    coche("son", "🔊 Effets sonores"),
    h("div", { class: "champ" }, h("label", {}, "⏩ Vitesse des animations"), vitesse),
    h("h3", {}, "💾 Sauvegarde"),
    h("p", { class: "discret" }, "Ta progression est enregistrée automatiquement dans ce navigateur. Exporte-la pour la garder ou changer d'appareil."),
    h("div", { class: "rangee" },
      h("button", { class: "bouton", onclick: exporterSauvegarde }, "⬇️ Exporter"),
      h("button", { class: "bouton", onclick: () => fichier.click() }, "📂 Importer"), fichier),
    course && !course.bilan ? h("div", { class: "rangee", style: "margin-top:.6rem" }, h("button", { class: "bouton danger", onclick: abandonner }, "🏳️ Abandonner l'expédition")) : null,
    h("h3", {}, "Zone dangereuse"),
    h("button", { class: "bouton danger petit", onclick: () => confirmer("Tout effacer ?", "Niveaux, talents, or et équipement de tous les héros seront perdus.", "🗑️ Tout effacer", () => {
      profil = M.creerProfil();
      course = null;
      S.effacerCourse();
      herosChoisi = "guerrier";
      sauver();
      afficherCamp();
    }) }, "🗑️ Recommencer à zéro"));
}

function exporterSauvegarde() {
  const blob = new Blob([S.exporter(profil, course && !course.bilan ? course : null)], { type: "application/json" });
  const a = h("a", { href: URL.createObjectURL(blob), download: `repaire-de-grokk-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

$("#ouvrir-reglages").addEventListener("click", ouvrirReglages);
$("#ouvrir-compte").addEventListener("click", () => { son("clic"); ouvrirCompte(); });
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") envoyerMaintenant({ keepalive: true });
  else synchroniser();
});

// Garde l'ennemi visé et les étiquettes bien placés si l'écran change de taille (rotation…).
window.addEventListener("orientationchange", () => setTimeout(() => placerEtiquettes(), 300));

derniereEmpreinte = empreinteSauvegarde();
majBoutonCompte();
rendre();
synchroniser();
