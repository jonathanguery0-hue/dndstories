// Enregistrement local (dans le navigateur) des réglages et des parties.

const PREFIXE = "contes-dragons:";
const CLE_CONFIG = `${PREFIXE}config`;
const PREFIXE_PARTIE = `${PREFIXE}partie:`;

export const CONFIG_DEFAUT = { cle: "", modele: "gpt-5-mini", adresse: "" };

/** Erreur d'enregistrement avec un message compréhensible. */
export class ErreurStockage extends Error {}

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
  } catch (e) {
    if (e?.name === "QuotaExceededError") {
      throw new ErreurStockage("Le navigateur n'a plus de place pour sauvegarder. Exporte puis supprime "
        + "d'anciennes parties depuis l'accueil.");
    }
    throw new ErreurStockage("Impossible d'enregistrer dans ce navigateur (navigation privée ?).");
  }
}

export function chargerConfig() {
  return { ...CONFIG_DEFAUT, ...(lire(CLE_CONFIG) ?? {}) };
}

export function enregistrerConfig(modifs) {
  const cfg = chargerConfig();
  for (const cle of Object.keys(CONFIG_DEFAUT)) {
    if (modifs[cle] !== undefined && modifs[cle] !== null) cfg[cle] = String(modifs[cle]).trim();
  }
  ecrire(CLE_CONFIG, cfg);
  return cfg;
}

// Un serveur local (Ollama…) n'a pas besoin de vraie clé.
export const estConfigure = (cfg) => Boolean(cfg.cle || cfg.adresse);

export function masquer(cle) {
  if (!cle) return "";
  return cle.length > 10 ? `${cle.slice(0, 3)}…${cle.slice(-4)}` : "…";
}

const idValide = (id) => /^[0-9a-f]{12}$/.test(id ?? "");

export function sauvegarder(partie) {
  partie.maj_le = Date.now() / 1000;
  ecrire(PREFIXE_PARTIE + partie.id, partie);
}

export function charger(id) {
  return idValide(id) ? lire(PREFIXE_PARTIE + id) : null;
}

export function supprimer(id) {
  try { localStorage.removeItem(PREFIXE_PARTIE + id); } catch { /* rien à faire */ }
}

export function listerParties() {
  const parties = [];
  let cles = [];
  try {
    cles = Object.keys(localStorage).filter((c) => c.startsWith(PREFIXE_PARTIE));
  } catch {
    return [];
  }
  for (const cle of cles) {
    const p = lire(cle);
    if (!p?.personnage) continue;
    const perso = p.personnage;
    parties.push({
      id: p.id, maj_le: p.maj_le, scenario: p.scenario,
      nom: perso.nom, race: perso.race, classe: perso.classe, niveau: perso.niveau,
    });
  }
  return parties.sort((a, b) => b.maj_le - a.maj_le);
}

/** Vérifie qu'un fichier importé ressemble bien à une partie. */
export function validerImport(donnees) {
  const ok = donnees && typeof donnees === "object" && idValide(donnees.id)
    && donnees.personnage?.nom && Array.isArray(donnees.messages) && Array.isArray(donnees.affichage)
    && Array.isArray(donnees.journal) && typeof donnees.scenario === "string";
  if (!ok) throw new ErreurStockage("Ce fichier n'est pas une sauvegarde de Contes & Dragons.");
  return donnees;
}
