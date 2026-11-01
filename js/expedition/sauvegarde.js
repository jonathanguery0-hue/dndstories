// Sauvegarde du mode « Expéditions » dans le navigateur : le profil (niveaux, talents, or, forge) et
// l'expédition en cours (pour la reprendre si on ferme la page en route).

import { creerProfil, normaliserProfil } from "./moteur.js";

const PREFIXE = "contes-dragons:expedition:";
const CLE_PROFIL = `${PREFIXE}profil`;
const CLE_COURSE = `${PREFIXE}course`;
const CLE_REGLAGES = `${PREFIXE}reglages`;

export const REGLAGES_DEFAUT = { mj_ia: true, son: true, vitesse: "normale", karma: true };

function lire(cle) {
  try {
    const brut = localStorage.getItem(cle);
    return brut ? JSON.parse(brut) : null;
  } catch {
    return null;
  }
}

function ecrire(cle, valeur) {
  try {
    localStorage.setItem(cle, JSON.stringify(valeur));
    return true;
  } catch {
    return false; // navigation privée ou stockage plein : le jeu continue sans sauvegarde
  }
}

export const chargerProfil = () => normaliserProfil(lire(CLE_PROFIL) ?? creerProfil());
export const enregistrerProfil = (profil) => ecrire(CLE_PROFIL, profil);

export function chargerCourse() {
  const c = lire(CLE_COURSE);
  return c && c.carte && !c.bilan ? c : null;
}
export const enregistrerCourse = (course) => ecrire(CLE_COURSE, course);
export function effacerCourse() {
  try { localStorage.removeItem(CLE_COURSE); } catch { /* rien */ }
}

export const chargerReglages = () => ({ ...REGLAGES_DEFAUT, ...lire(CLE_REGLAGES) });
export const enregistrerReglages = (r) => ecrire(CLE_REGLAGES, r);

/** Contenu du fichier d'export (profil + expédition en cours). */
export function exporter(profil, course) {
  return JSON.stringify({ jeu: "contes-dragons-expedition", version: 1, profil, course: course ?? null }, null, 1);
}

export function importer(texte) {
  let donnees;
  try {
    donnees = JSON.parse(texte);
  } catch {
    throw new Error("Ce fichier n'est pas une sauvegarde valide.");
  }
  if (donnees?.jeu !== "contes-dragons-expedition" || !donnees.profil) {
    throw new Error("Ce fichier n'est pas une sauvegarde des Expéditions.");
  }
  return { profil: normaliserProfil(donnees.profil), course: donnees.course?.carte && !donnees.course.bilan ? donnees.course : null };
}
