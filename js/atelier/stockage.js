// Scénarios de l'atelier enregistrés dans le navigateur (IndexedDB : les images y tiennent, pas dans localStorage).

const BASE = "contes-dragons-atelier";
const MAGASIN = "scenarios";

function ouvrir() {
  return new Promise((resoudre, rejeter) => {
    const requete = indexedDB.open(BASE, 1);
    requete.onupgradeneeded = () => requete.result.createObjectStore(MAGASIN, { keyPath: "id" });
    requete.onsuccess = () => resoudre(requete.result);
    requete.onerror = () => rejeter(new Error("Impossible d'ouvrir l'enregistrement du navigateur (navigation privée ?)."));
  });
}

async function transaction(mode, action) {
  const base = await ouvrir();
  return new Promise((resoudre, rejeter) => {
    const t = base.transaction(MAGASIN, mode);
    const requete = action(t.objectStore(MAGASIN));
    t.oncomplete = () => { base.close(); resoudre(requete?.result); };
    t.onerror = () => {
      base.close();
      rejeter(new Error(t.error?.name === "QuotaExceededError"
        ? "Le navigateur n'a plus de place : exporte puis supprime d'anciens scénarios, ou allège les images."
        : "Impossible d'enregistrer le scénario dans ce navigateur."));
    };
  });
}

export const enregistrer = (scenario) => transaction("readwrite", (m) => m.put({ ...scenario, maj_le: Date.now() }));
export const charger = (id) => transaction("readonly", (m) => m.get(id));
export const supprimer = (id) => transaction("readwrite", (m) => m.delete(id));

/** Liste légère (sans les images) triée du plus récent au plus ancien. */
export async function lister() {
  const tous = (await transaction("readonly", (m) => m.getAll())) ?? [];
  return tous.map(({ id, titre, niveau, maj_le, parties, pnj }) => ({
    id, titre, niveau, maj_le, parties: parties?.length ?? 0, pnj: pnj?.length ?? 0,
  })).sort((a, b) => b.maj_le - a.maj_le);
}
