// Plateau de dés : le joueur lance lui-même ses d20, avec une animation, un bruit de dés et une vibration.

import * as des from "./des.js";
import { signe } from "./personnage.js";

const CLE = "contes-dragons:des";
const DUREE_ROULEMENT = 1000; // ms

export function chargerPreferencesDes() {
  try {
    return { manuel: true, son: true, karma: 2, ...JSON.parse(localStorage.getItem(CLE) ?? "{}") };
  } catch {
    return { manuel: true, son: true, karma: 2 };
  }
}

export function enregistrerPreferencesDes(modifs) {
  const prefs = { ...chargerPreferencesDes(), ...modifs };
  try { localStorage.setItem(CLE, JSON.stringify(prefs)); } catch { /* sans gravité */ }
  return prefs;
}

const $ = (sel) => document.querySelector(sel);

// Icosaèdre stylisé (vue de face d'un d20).
const SVG_D20 = `<svg viewBox="0 0 100 100" aria-hidden="true">
  <polygon class="face" points="50,4 92,28 92,72 50,96 8,72 8,28"/>
  <g class="aretes">
    <polygon points="50,24 76,66 24,66"/>
    <path d="M50 4 L50 24 M92 28 L76 66 M8 28 L24 66 M92 72 L76 66 M8 72 L24 66 M50 96 L50 66 M50 24 L92 28 M50 24 L8 28 M50 96 L24 66 M50 96 L76 66"/>
  </g>
</svg>`;

let audio = null;

/** Petit bruit de dés qui roulent, synthétisé (aucun fichier son à télécharger). */
function bruitDeDes() {
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    const debut = audio.currentTime;
    for (let i = 0; i < 7; i++) {
      const t = debut + i * 0.11 + Math.random() * 0.05;
      const duree = 0.035;
      const tampon = audio.createBuffer(1, Math.floor(audio.sampleRate * duree), audio.sampleRate);
      const donnees = tampon.getChannelData(0);
      for (let j = 0; j < donnees.length; j++) donnees[j] = (Math.random() * 2 - 1) * (1 - j / donnees.length) ** 3;
      const source = audio.createBufferSource();
      source.buffer = tampon;
      const filtre = audio.createBiquadFilter();
      filtre.type = "bandpass";
      filtre.frequency.value = 1800 + Math.random() * 1800;
      const volume = audio.createGain();
      volume.gain.value = 0.5 * (1 - i / 9);
      source.connect(filtre).connect(volume).connect(audio.destination);
      source.start(t);
    }
  } catch { /* pas de son, tant pis */ }
}

/** Attend un clic (ou Espace / Entrée), avec un délai maximal facultatif. */
function attendreClic(elements, delaiMax = 0) {
  return new Promise((resolve) => {
    let minuterie = null;
    const fini = (e) => {
      if (e?.type === "keydown" && ![" ", "Enter"].includes(e.key)) return;
      e?.preventDefault();
      clearTimeout(minuterie);
      elements.forEach((el) => el.removeEventListener("click", fini));
      document.removeEventListener("keydown", fini);
      resolve();
    };
    elements.forEach((el) => el.addEventListener("click", fini));
    document.addEventListener("keydown", fini);
    if (delaiMax) minuterie = setTimeout(fini, delaiMax);
  });
}

const attendre = (ms) => new Promise((r) => { setTimeout(r, ms); });

/** Texte du verdict affiché sous les dés (le moteur de règles reste seul juge). */
export function verdict(jet, resultat) {
  const total = resultat + (jet.bonus ?? 0);
  const calcul = jet.bonus ? `${resultat} ${signe(jet.bonus)} = ${total}` : `${total}`;
  if (jet.chanceux) return { texte: `Relance : ${resultat}`, classe: "" };
  if (resultat === 20) return { texte: `${calcul} — 20 naturel ! ${jet.attaque ? "Coup critique !" : "Réussite éclatante !"}`, classe: "critique" };
  if (resultat === 1) return { texte: `${calcul} — 1 naturel… ${jet.attaque ? "Raté !" : "Échec cuisant."}`, classe: "echec" };
  if (jet.seuil == null) return { texte: `Total : ${calcul}`, classe: "" };
  const reussi = total >= jet.seuil;
  return {
    texte: `${calcul} contre ${jet.nomSeuil ?? "DD"} ${jet.seuil} → ${reussi ? (jet.attaque ? "Touché !" : "Réussite !") : (jet.attaque ? "Raté" : "Échec")}`,
    classe: reussi ? "reussite" : "echec",
  };
}

/**
 * Affiche le plateau et attend que le joueur lance son (ou ses) d20.
 * `jet` : { libelle, bonus, seuil, nomSeuil, avantage, desavantage, nombre, attaque }. Renvoie les valeurs.
 */
export async function lancerAuPlateau(jet) {
  const plateau = $("#plateau-des");
  const zone = $("#plateau-zone");
  const bouton = $("#plateau-lancer");
  const nombre = jet.nombre ?? 1;
  $("#plateau-titre").textContent = jet.libelle ?? "Jet de dé";
  const infos = [];
  if (jet.bonus) infos.push(`bonus ${signe(jet.bonus)}`);
  if (jet.seuil != null) infos.push(`${jet.nomSeuil ?? "DD"} ${jet.seuil}`);
  if (jet.karma) infos.push("✨ karma : après plusieurs échecs, la chance tourne — avantage, on garde le meilleur");
  else if (jet.avantage) infos.push("avantage : on garde le meilleur");
  if (jet.desavantage) infos.push("désavantage : on garde le pire");
  $("#plateau-info").textContent = infos.join(" · ");
  $("#plateau-resultat").textContent = "";
  $("#plateau-resultat").className = "plateau-resultat";
  zone.innerHTML = Array.from({ length: nombre }, () =>
    `<button type="button" class="d20" aria-label="Lancer le d20">${SVG_D20}<span class="valeur">?</span></button>`).join("");
  bouton.textContent = nombre > 1 ? "🎲 Lancer les dés" : "🎲 Lancer le dé";
  bouton.disabled = false;
  plateau.classList.toggle("karma", Boolean(jet.karma));
  plateau.classList.remove("cache");
  bouton.focus();

  await attendreClic([bouton, ...zone.querySelectorAll(".d20")]);

  // Le résultat est tiré au moment du lancer.
  const valeurs = Array.from({ length: nombre }, () => des.d(20));
  const faces = [...zone.querySelectorAll(".d20")];
  bouton.disabled = true;
  bouton.textContent = "…";
  if (chargerPreferencesDes().son) bruitDeDes();
  navigator.vibrate?.([25, 60, 25, 60, 40]);
  faces.forEach((d) => d.classList.add("roule"));
  const defilement = setInterval(() => {
    faces.forEach((d) => { d.querySelector(".valeur").textContent = des.d(20); });
  }, 70);
  await attendre(DUREE_ROULEMENT);
  clearInterval(defilement);

  const garde = jet.avantage ? Math.max(...valeurs) : jet.desavantage ? Math.min(...valeurs) : valeurs[0];
  let indexGarde = valeurs.indexOf(garde);
  faces.forEach((d, i) => {
    d.classList.remove("roule");
    d.classList.add("pose");
    d.querySelector(".valeur").textContent = valeurs[i];
    if (nombre > 1 && i !== indexGarde) d.classList.add("ecarte");
    if (i === indexGarde && garde === 20) d.classList.add("vingt");
    if (i === indexGarde && garde === 1) d.classList.add("un");
    if (i === indexGarde) indexGarde = -1;
  });
  const v = verdict(jet, garde);
  $("#plateau-resultat").textContent = v.texte;
  $("#plateau-resultat").className = `plateau-resultat ${v.classe}`;
  bouton.textContent = "Continuer";
  bouton.disabled = false;

  await attendreClic([bouton, plateau], 2200);
  plateau.classList.add("cache");
  return valeurs;
}
