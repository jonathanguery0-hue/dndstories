// Le SRD 5.1 complet (regles/srd-5.1.json), consultable par l'IA maître du jeu.
// Le fichier est chargé une seule fois, à la première partie, puis gardé en mémoire.

const LONGUEUR_MAX = 4000; // caractères renvoyés par fiche

let corpus = null;
let chargement = null;

const normaliser = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9]+/g, " ").trim();

/** Installe un corpus déjà lu (utilisé par les tests). */
export function definirCorpus(donnees) {
  corpus = {
    ...donnees,
    entrees: donnees.entrees.map((e) => ({ ...e, tn: normaliser(e.t), xn: normaliser(e.x) })),
  };
  chargement = Promise.resolve(corpus);
  return corpus;
}

/** Charge le SRD (une seule fois). Renvoie null si le fichier est inaccessible : le jeu continue sans. */
export function chargerRegles() {
  if (!chargement) {
    chargement = fetch(new URL("../regles/srd-5.1.json", import.meta.url))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(definirCorpus)
      .catch(() => {
        chargement = null; // on réessaiera au prochain tour
        return null;
      });
  }
  return chargement;
}

export const reglesChargees = () => Boolean(corpus);

// Termes français courants → terme anglais du SRD (sorts et monstres du jeu, conditions, règles fréquentes).
const GLOSSAIRE = {
  "trait de feu": "Fire Bolt", "rayon de givre": "Ray of Frost", "lumiere": "Light", "main du mage": "Mage Hand",
  "flamme sacree": "Sacred Flame", "thaumaturgie": "Thaumaturgy", "assistance": "Guidance",
  "projectile magique": "Magic Missile", "armure du mage": "Mage Armor", "sommeil": "Sleep", "bouclier": "Shield",
  "mains brulantes": "Burning Hands", "detection de la magie": "Detect Magic", "soins": "Cure Wounds",
  "mot de guerison": "Healing Word", "benediction": "Bless", "eclair tracant": "Guiding Bolt",
  "rayon ardent": "Scorching Ray", "pas brumeux": "Misty Step", "toile d araignee": "Web",
  "arme spirituelle": "Spiritual Weapon", "priere de guerison": "Prayer of Healing", "boule de feu": "Fireball",
  "eclair": "Lightning Bolt", "invisibilite": "Invisibility", "charme personne": "Charm Person",
  "aveugle": "Blinded", "charme": "Charmed", "assourdi": "Deafened", "effraye": "Frightened", "agrippe": "Grappled",
  "neutralise": "Incapacitated", "paralyse": "Paralyzed", "petrifie": "Petrified", "empoisonne": "Poisoned",
  "a terre": "Prone", "entrave": "Restrained", "etourdi": "Stunned", "inconscient": "Unconscious",
  "epuisement": "Exhaustion", "gobelin": "Goblin", "loup": "Wolf", "rat geant": "Giant Rat", "squelette": "Skeleton",
  "hobgobelin": "Hobgoblin", "goule": "Ghoul", "araignee geante": "Giant Spider", "gobelours": "Bugbear",
  "hibours": "Owlbear", "dragon rouge": "Red Dragon", "second souffle": "Second Wind",
  "attaque sournoise": "Sneak Attack", "repos court": "Short Rest", "repos long": "Long Rest",
  "jets contre la mort": "Death Saving Throws", "jet contre la mort": "Death Saving Throws", "abri": "Cover",
  "attaque d opportunite": "Opportunity Attacks", "chute": "Falling", "lutte": "Grappling",
  "potion de soins": "Potion of Healing", "sac sans fond": "Bag of Holding", "avantage": "Advantage and Disadvantage",
  "concentration": "Concentration", "surprise": "Surprise", "initiative": "Initiative",
};

function traduire(requete) {
  if (GLOSSAIRE[requete]) return normaliser(GLOSSAIRE[requete]);
  let r = requete;
  for (const [fr, en] of Object.entries(GLOSSAIRE)) {
    if (fr.includes(" ") && r.includes(fr)) r = r.replace(fr, normaliser(en));
  }
  return r;
}

export const CATEGORIES = ["regle", "condition", "sort", "monstre", "objet-magique", "equipement", "capacite",
  "trait", "race", "classe", "historique", "don", "competence"];

/**
 * Recherche dans le SRD. Renvoie les fiches les plus pertinentes (texte complet) et d'autres titres proches.
 */
export function rechercher(recherche, categorie = "", nombre = 3) {
  if (!corpus) return { erreur: "Le SRD n'est pas disponible pour le moment. Applique les règles de mémoire." };
  const requete = traduire(normaliser(recherche));
  if (!requete) return { erreur: "Recherche vide." };
  const mots = requete.split(" ").filter((m) => m.length > 1 || /\d/.test(m));
  const resultats = [];
  for (const e of corpus.entrees) {
    if (categorie && e.c !== categorie) continue;
    let score = 0;
    if (e.tn === requete) score += 1000;
    else if (e.tn.startsWith(requete)) score += 300;
    else if (e.tn.includes(requete)) score += 150;
    if (e.xn.includes(requete)) score += 20;
    for (const m of mots) {
      if (new RegExp(`\\b${m}\\b`).test(e.tn)) score += 40;
      else if (e.tn.includes(m)) score += 15;
      const occurrences = e.xn.split(m).length - 1;
      score += Math.min(occurrences, 6) * 2;
    }
    if (score > 0) resultats.push({ e, score });
  }
  resultats.sort((a, b) => b.score - a.score || a.e.t.length - b.e.t.length);
  if (!resultats.length) {
    return { resultats: [], note: "Aucune fiche trouvée. Le SRD est en anglais : essaie le terme anglais (ex. 'Grappled', 'Fireball')." };
  }
  return {
    resultats: resultats.slice(0, nombre).map(({ e }) => ({
      categorie: e.c, titre: e.t,
      texte: e.x.length > LONGUEUR_MAX ? `${e.x.slice(0, LONGUEUR_MAX)}… (suite tronquée)` : e.x,
    })),
    autres_fiches: resultats.slice(nombre, nombre + 8).map(({ e }) => `${e.t} (${e.c})`),
  };
}

/** Statistiques de combat d'un monstre du SRD (nom anglais), ou null. */
export function monstreSRD(nom) {
  if (!corpus) return null;
  return corpus.monstres[String(nom ?? "").trim().toLowerCase()] ?? null;
}
