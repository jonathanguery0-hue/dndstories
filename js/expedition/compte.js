// Compte joueur du Repaire de Grokk : se connecter avec un nom et un mot de passe pour retrouver sa
// progression (profil et expédition en cours) sur tous ses appareils. Passe par le serveur du jeu.

import { SERVEUR_URL } from "../serveur.js";
import { chargerConfig } from "../stockage.js";

const CLE = "contes-dragons:expedition:compte";

export class ErreurCompte extends Error {
  constructor(message, code = "", donnees = null) {
    super(message);
    this.code = code;
    this.donnees = donnees;
  }
}

export const comptesPossibles = () => Boolean(SERVEUR_URL);

/** { nom, jeton, version, synchro_le } ou null si personne n'est connecté sur cet appareil. */
export function compteActuel() {
  try {
    const c = JSON.parse(localStorage.getItem(CLE) ?? "null");
    return c?.jeton && c?.nom ? c : null;
  } catch {
    return null;
  }
}

function enregistrer(c) {
  try {
    if (c) localStorage.setItem(CLE, JSON.stringify(c));
    else localStorage.removeItem(CLE);
  } catch { /* stockage indisponible */ }
}

export function majCompte(modifs) {
  const c = compteActuel();
  if (c) enregistrer({ ...c, ...modifs });
}

async function appel(methode, corps = null, { jeton = compteActuel()?.jeton, keepalive = false } = {}) {
  if (!SERVEUR_URL) throw new ErreurCompte("Les comptes passent par le serveur du jeu : ouvre le jeu depuis son adresse Vercel.", "sans_serveur");
  const entetes = { "Content-Type": "application/json" };
  if (jeton) entetes.Authorization = `Bearer ${jeton}`;
  const code = chargerConfig().code;
  if (code) entetes["X-Code-Acces"] = code;
  let reponse;
  try {
    reponse = await fetch(`${SERVEUR_URL.replace(/\/+$/, "")}/compte`, {
      method: methode, headers: entetes, body: corps ? JSON.stringify(corps) : undefined, keepalive,
    });
  } catch {
    throw new ErreurCompte("Impossible de joindre le serveur du jeu. Vérifie ta connexion internet.", "hors_ligne");
  }
  let donnees = null;
  try { donnees = await reponse.json(); } catch { /* corps vide */ }
  if (!reponse.ok) {
    const code = donnees?.error?.code ?? "";
    if (code === "non_connecte") enregistrer(null);
    throw new ErreurCompte(donnees?.error?.message ?? `Erreur du serveur (${reponse.status}).`, code, donnees);
  }
  return donnees;
}

/** Crée un compte (ou se connecte) ; renvoie { nom, sauvegarde } où sauvegarde = { donnees, maj_le, version } ou null. */
export async function entrer(action, nom, motDePasse) {
  const r = await appel("POST", { action, nom, mot_de_passe: motDePasse }, { jeton: null });
  enregistrer({ nom: r.nom, jeton: r.jeton, version: r.sauvegarde?.version ?? null, synchro_le: null });
  return r;
}

export async function deconnecter() {
  try { await appel("POST", { action: "deconnexion" }); } catch { /* on oublie le jeton quoi qu'il arrive */ }
  enregistrer(null);
}

/** Sauvegarde du compte : { donnees, maj_le, version } ou null. */
export async function telecharger() {
  const r = await appel("GET");
  if (r.sauvegarde) majCompte({ version: r.sauvegarde.version });
  return r.sauvegarde;
}

/**
 * Envoie la sauvegarde. Si une autre machine a enregistré entre-temps, lève une ErreurCompte de code
 * « conflit » dont `donnees.sauvegarde` contient la version du serveur.
 */
export async function envoyer(donnees, majLe, { keepalive = false } = {}) {
  const c = compteActuel();
  if (!c) throw new ErreurCompte("Pas connecté.", "non_connecte");
  const r = await appel("PUT", { donnees, maj_le: majLe, version_base: c.version ?? null }, { keepalive });
  majCompte({ version: r.version, synchro_le: Date.now() });
  return r;
}

/** Vrai si le profil n'a encore aucune progression (appareil neuf). */
export function profilVierge(profil) {
  return !profil.stats?.expeditions && profil.or === 0
    && Object.values(profil.heros).every((h) => h.niveau === 1 && h.xp === 0);
}

/** Petit résumé lisible d'un profil, pour choisir quelle progression garder. */
export function resumeProfil(profil) {
  const niveaux = Object.entries(profil.heros).filter(([id]) => profil.debloques.includes(id)).map(([, h]) => h.niveau);
  return `${profil.stats?.expeditions ?? 0} expédition(s), niveau max ${Math.max(...niveaux)}, ${profil.or} or`;
}
