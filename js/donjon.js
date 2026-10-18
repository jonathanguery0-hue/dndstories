// Générateur du Gouffre aux Mille Marches : le donjon est créé 5 étages à la fois (une « section »).
// Chaque étage est un petit plan de salles reliées par des portes (nord, sud, est, ouest), avec un
// thème, des ennemis dosés selon le niveau du personnage, des pièges, des trésors, un sanctuaire et
// l'escalier. Le 5e étage de chaque section est gardé par un boss.

import * as des from "./des.js";
import { reglesChargees } from "./regles.js";

export const ETAGES_PAR_SECTION = 5;

export const DIRECTIONS = {
  nord: [0, -1], sud: [0, 1], est: [1, 0], ouest: [-1, 0],
};
const OPPOSEE = { nord: "sud", sud: "nord", est: "ouest", ouest: "est" };

// Monstres disponibles et leur XP. Les noms français sont ceux du bestiaire du jeu ; les noms anglais
// viennent du SRD complet (utilisés seulement quand le SRD est chargé).
const XP = {
  Kobold: 25, "Rat géant": 25, Bandit: 25, Gobelin: 50, Squelette: 50, Zombie: 50, Loup: 50, Orc: 100,
  Hobgobelin: 100, Gnoll: 100, Goule: 200, "Araignée géante": 200, Gobelours: 200, Ogre: 450,
  Stirge: 25, "Giant Centipede": 50, "Swarm of Bats": 50, "Swarm of Rats": 50, Shadow: 100, Worg: 100,
  Lizardfolk: 100, Thug: 100, "Rust Monster": 100, Specter: 200, "Dire Wolf": 200, Harpy: 200, Imp: 200,
  Ghast: 450, Gargoyle: 450, "Ochre Jelly": 450, Grick: 450, "Minotaur Skeleton": 450, "Ogre Zombie": 450,
  "Cult Fanatic": 450, "Gelatinous Cube": 450, Wight: 700, Mummy: 700, Owlbear: 700, Minotaur: 700,
  Basilisk: 700, "Phase Spider": 700, "Giant Scorpion": 700, "Hell Hound": 700, Manticore: 700,
  "Black Pudding": 1100, Ettin: 1100, Troll: 1800, Wraith: 1800, "Hill Giant": 1800, "Flesh Golem": 1800,
  "Vampire Spawn": 1800,
};
const DU_BESTIAIRE = new Set(["Kobold", "Rat géant", "Bandit", "Gobelin", "Squelette", "Zombie", "Loup", "Orc",
  "Hobgobelin", "Gnoll", "Goule", "Araignée géante", "Gobelours", "Ogre"]);

export const THEMES = [
  {
    nom: "Catacombes oubliées",
    ambiance: "ossements, niches funéraires, odeur de poussière et de cire froide",
    salles: ["Ossuaire", "Crypte effondrée", "Chapelle des morts", "Galerie des niches", "Salle des sarcophages",
      "Puits aux crânes", "Caveau scellé", "Couloir des gisants", "Autel profané"],
    monstres: ["Squelette", "Zombie", "Goule", "Shadow", "Specter", "Ghast", "Minotaur Skeleton", "Ogre Zombie",
      "Wight", "Mummy", "Wraith", "Vampire Spawn"],
    boss: ["Le Roi sans Visage", "Sœur Mortelune", "Le Gardien des Ossements"],
  },
  {
    nom: "Repaire des Crocs-Noirs",
    ambiance: "tentures en peaux, feux de camp fumants, trophées grossiers et graffitis gobelins",
    salles: ["Salle des trophées", "Garde-manger", "Dortoir puant", "Fosse aux combats", "Chenil",
      "Salle du butin", "Poste de guet", "Forge de fortune", "Salle du conseil"],
    monstres: ["Gobelin", "Hobgobelin", "Loup", "Worg", "Gobelours", "Orc", "Ogre"],
    boss: ["Grokk le Broyeur", "Chef Krâne-Fendu", "La Matrone aux Mille Crocs"],
  },
  {
    nom: "Grottes fongiques",
    ambiance: "champignons luminescents, spores dorées, humidité suintante et échos lointains",
    salles: ["Bosquet de champignons", "Mare stagnante", "Grotte aux spores", "Cheminée naturelle",
      "Galerie des stalactites", "Lac souterrain", "Nid abandonné", "Crevasse brumeuse", "Salle cristalline"],
    monstres: ["Rat géant", "Swarm of Rats", "Giant Centipede", "Araignée géante", "Ochre Jelly", "Grick",
      "Rust Monster", "Gelatinous Cube", "Phase Spider", "Black Pudding"],
    boss: ["La Reine des Spores", "Le Dévoreur Gélatineux", "Mère-Toile"],
  },
  {
    nom: "Mines naines abandonnées",
    ambiance: "rails rouillés, wagonnets renversés, piliers sculptés de runes et veines de minerai",
    salles: ["Galerie des wagonnets", "Salle des forges", "Puits d'extraction", "Hall des ancêtres",
      "Entrepôt de minerai", "Pont suspendu", "Chambre des runes", "Atelier des tailleurs", "Salle des colonnes"],
    monstres: ["Kobold", "Stirge", "Swarm of Bats", "Rust Monster", "Gargoyle", "Minotaur", "Basilisk",
      "Ettin", "Hill Giant", "Flesh Golem"],
    boss: ["Le Colosse de Fer-Noir", "Thrak le Minotaure", "La Gargouille Écarlate"],
  },
  {
    nom: "Temple du Culte de la Lune Rouge",
    ambiance: "bougies rouges, symboles lunaires peints au sang, encens lourd et chants étouffés",
    salles: ["Nef des fidèles", "Salle des offrandes", "Cellules des novices", "Bibliothèque interdite",
      "Cercle d'invocation", "Bain rituel", "Salle des masques", "Ossuaire des sacrifiés", "Sanctum voilé"],
    monstres: ["Bandit", "Thug", "Imp", "Cult Fanatic", "Hell Hound", "Giant Scorpion", "Flesh Golem"],
    boss: ["Le Grand Prêtre Vharos", "La Voix de la Lune Rouge", "Mère Supérieure Ysmeline"],
  },
  {
    nom: "Tanières sauvages",
    ambiance: "racines géantes, os rongés, griffures sur la pierre et grondements dans l'ombre",
    salles: ["Antre aux os", "Tunnel de racines", "Clairière souterraine", "Nid de harpies", "Gouffre venteux",
      "Tanière humide", "Promontoire", "Grotte aux griffes", "Source chaude"],
    monstres: ["Loup", "Gnoll", "Lizardfolk", "Dire Wolf", "Harpy", "Owlbear", "Manticore", "Troll"],
    boss: ["Croc-de-Lune, l'alpha", "La Bête des Profondeurs", "Ma'garr le Dévoreur"],
  },
];

const PIEGES = [
  { nom: "Fléchettes empoisonnées", sauvegarde: "DEX", degats: "1d10", type_degats: "poison" },
  { nom: "Fosse dissimulée", sauvegarde: "DEX", degats: "2d6", type_degats: "contondant" },
  { nom: "Rune de feu", sauvegarde: "DEX", degats: "2d6", type_degats: "feu" },
  { nom: "Gaz nauséabond", sauvegarde: "CON", degats: "2d4", type_degats: "poison" },
  { nom: "Lame pendulaire", sauvegarde: "DEX", degats: "1d12", type_degats: "tranchant" },
];

const OBJETS_RARES = ["Potion de soins supérieurs", "Anneau de protection", "Cape elfique", "Bottes de rapidité",
  "Amulette de santé", "Bâton de flammes mineur", "Bracelets de défense", "Gemme de lumière"];

// Seuils d'XP d'une rencontre pour un personnage seul (DMG 5e) : [facile, moyen, difficile, mortel].
// Un héros seul n'a personne pour le relever : les salles ordinaires vont de « facile » à « moyen ».
const SEUILS = {
  1: [25, 50, 75, 100], 2: [50, 100, 150, 200], 3: [75, 150, 225, 400], 4: [125, 250, 375, 500],
  5: [250, 500, 750, 1100], 6: [300, 600, 900, 1400], 7: [350, 750, 1100, 1700], 8: [450, 900, 1400, 2100],
  9: [550, 1100, 1600, 2400], 10: [600, 1200, 1900, 2800],
};

const hasard = (n) => des.d(n) - 1; // 0 … n-1
const piocher = (liste) => liste[hasard(liste.length)];
const melanger = (liste) => {
  const l = [...liste];
  for (let i = l.length - 1; i > 0; i--) {
    const j = hasard(i + 1);
    [l[i], l[j]] = [l[j], l[i]];
  }
  return l;
};

function monstresUtilisables(theme) {
  const srd = reglesChargees();
  const ok = (n) => DU_BESTIAIRE.has(n) || srd;
  const duTheme = theme.monstres.filter(ok);
  // Sans le SRD complet, certains thèmes ont trop peu de monstres : on complète avec le bestiaire du jeu.
  return duTheme.length >= 3 ? duTheme : [...new Set([...duTheme, ...DU_BESTIAIRE])];
}

/** Multiplicateur de difficulté d'un groupe (DMG 5e). */
const multiplicateur = (n) => (n <= 1 ? 1 : n === 2 ? 1.5 : n <= 6 ? 2 : 2.5);

/** Compose une rencontre d'environ `budget` XP avec les monstres du thème. */
export function composerRencontre(theme, budget) {
  let pool = monstresUtilisables(theme);
  let candidats = pool.filter((n) => XP[n] <= budget);
  if (!candidats.length) {
    // Aucun monstre du thème assez faible (ex. niveau 1) : on prend des créatures faibles du bestiaire.
    pool = [...DU_BESTIAIRE];
    candidats = pool.filter((n) => XP[n] <= budget);
  }
  const choisi = candidats.length ? piocher(candidats.slice(-4)) : pool.reduce((a, b) => (XP[a] <= XP[b] ? a : b));
  let nombre = 1;
  while (nombre < 4 && XP[choisi] * (nombre + 1) * multiplicateur(nombre + 1) <= budget) nombre++;
  const groupe = [{ nom: choisi, modele: choisi, nombre }];
  // De temps en temps, un second type d'ennemi plus faible pour varier.
  const faibles = pool.filter((n) => XP[n] < XP[choisi] && XP[n] * 2 <= budget - XP[choisi] * nombre * multiplicateur(nombre));
  if (faibles.length && hasard(3) === 0) {
    const second = piocher(faibles);
    groupe.push({ nom: second, modele: second, nombre: 1 });
  }
  return groupe.map((g) => ({ ...g, nom: g.modele }));
}

function moyenneFormule(formule) {
  let total = 0;
  for (const m of String(formule).replace(/\s+/g, "").matchAll(/([+-]?)(\d*)d(\d+)|([+-]?)(\d+)/g)) {
    if (m[3]) total += (m[1] === "-" ? -1 : 1) * Number(m[2] || 1) * (Number(m[3]) + 1) / 2;
    else if (m[5]) total += (m[4] === "-" ? -1 : 1) * Number(m[5]);
  }
  return total;
}

/** Le boss de la section : un monstre fort du thème, renforcé et nommé, avec ses sbires. */
function composerBoss(theme, niveau, statsDe) {
  const [, , difficile, mortel] = SEUILS[Math.min(niveau, 10)];
  const pool = monstresUtilisables(theme);
  // Le boss (renforcé : PV ×1,6) est choisi pour que le combat reste entre « difficile » et « mortel ».
  const candidats = pool.filter((n) => XP[n] <= (difficile + mortel) / 2 * 0.75);
  const modele = candidats.length ? candidats.reduce((a, b) => (XP[a] >= XP[b] ? a : b)) : pool[0];
  const base = statsDe(modele);
  const nom = piocher(theme.boss);
  const boss = { nom, modele, nombre: 1, xp: XP[modele] * 2 };
  if (base) {
    boss.pv = String(Math.round(moyenneFormule(base.pv) * 1.6));
    boss.ca = base.ca + 1;
    boss.attaque = base.attaque + 1;
    boss.degats = base.degats;
  }
  const sbires = pool.filter((n) => XP[n] <= mortel * 0.15);
  const groupe = [boss];
  if (sbires.length) {
    const sbire = piocher(sbires);
    groupe.push({ nom: sbire, modele: sbire, nombre: niveau >= 3 ? 2 : 1 });
  }
  return groupe.map((g, i) => (i === 0 ? g : { ...g, nom: g.modele }));
}

/** Plan d'un étage : salles placées sur une grille par marche aléatoire, reliées par des portes. */
function genererPlan(nombre) {
  const cle = (x, y) => `${x},${y}`;
  const salles = [{ x: 0, y: 0, sorties: {} }];
  const occupe = new Map([[cle(0, 0), 0]]);
  let essais = 0;
  while (salles.length < nombre && essais++ < 500) {
    const depuis = hasard(salles.length);
    const dir = piocher(Object.keys(DIRECTIONS));
    const [dx, dy] = DIRECTIONS[dir];
    const x = salles[depuis].x + dx;
    const y = salles[depuis].y + dy;
    const existant = occupe.get(cle(x, y));
    if (existant === undefined) {
      const index = salles.length;
      salles.push({ x, y, sorties: { [OPPOSEE[dir]]: depuis } });
      salles[depuis].sorties[dir] = index;
      occupe.set(cle(x, y), index);
    } else if (existant !== depuis && hasard(6) === 0) {
      salles[depuis].sorties[dir] = existant; // une boucle de temps en temps
      salles[existant].sorties[OPPOSEE[dir]] = depuis;
    }
  }
  return salles;
}

function distances(plan) {
  const dist = plan.map(() => Infinity);
  dist[0] = 0;
  const file = [0];
  while (file.length) {
    const i = file.shift();
    for (const j of Object.values(plan[i].sorties)) {
      if (dist[j] === Infinity) {
        dist[j] = dist[i] + 1;
        file.push(j);
      }
    }
  }
  return dist;
}

/**
 * Génère une section de 5 étages. `statsDe(modele)` donne les statistiques de base d'un monstre (pour
 * renforcer le boss). Les identifiants de salles sont du type « 7-3 » (étage 7, salle 3).
 */
export function genererSection(numero, niveau, statsDe = () => null) {
  const niv = Math.min(Math.max(niveau, 1), 10);
  const themes = melanger(THEMES);
  const etages = [];
  for (let k = 0; k < ETAGES_PAR_SECTION; k++) {
    const numeroEtage = (numero - 1) * ETAGES_PAR_SECTION + k + 1;
    const theme = themes[k % themes.length];
    const estBoss = k === ETAGES_PAR_SECTION - 1;
    const plan = genererPlan(5 + hasard(3) + (estBoss ? 1 : 0));
    const dist = distances(plan);
    const loin = dist.indexOf(Math.max(...dist.filter(Number.isFinite)));
    const noms = melanger(theme.salles);
    const [facile, moyen] = SEUILS[niv];
    // Plus on descend dans la section, plus les rencontres passent de « facile » à « moyen ».
    const budget = Math.round(facile + (moyen - facile) * (k / (ETAGES_PAR_SECTION - 1)));
    const autres = melanger(plan.map((_, i) => i).filter((i) => i !== 0 && i !== loin));
    const types = {};
    if (k === 1 || k === 3) types[autres.pop()] = "sanctuaire";
    for (const i of autres) {
      const t = hasard(20);
      types[i] = t < 11 ? "combat" : t < 14 ? "piege" : t < 17 ? "tresor" : "calme";
    }
    for (const i of autres) {
      if (Object.values(types).filter((t) => t === "combat").length >= 2) break;
      if (types[i] !== "sanctuaire") types[i] = "combat";
    }
    types[0] = "entree";
    types[loin] = estBoss ? "boss" : "escalier";

    const salles = {};
    plan.forEach((p, i) => {
      const id = `${numeroEtage}-${i + 1}`;
      const type = types[i];
      const salle = {
        id, x: p.x, y: p.y, type, nom: type === "entree" ? "Palier de l'escalier" : noms[i % noms.length],
        sorties: Object.fromEntries(Object.entries(p.sorties).map(([d, j]) => [d, `${numeroEtage}-${j + 1}`])),
        visitee: false,
      };
      if (type === "combat") salle.ennemis = composerRencontre(theme, budget);
      if (type === "boss") salle.ennemis = composerBoss(theme, niv, statsDe);
      if (type === "piege") {
        const piege = piocher(PIEGES);
        const mult = 1 + Math.floor((numeroEtage - 1) / ETAGES_PAR_SECTION);
        salle.piege = {
          ...piege, dd: Math.min(11 + Math.floor(numeroEtage / 2), 18),
          degats: piege.degats.replace(/^(\d+)d/, (_, n) => `${Number(n) * mult}d`), declenche: false,
        };
      }
      if (type === "tresor" || type === "boss") {
        salle.tresor = {
          or: (type === "boss" ? 50 : 5) * numeroEtage + des.d(20) * numeroEtage,
          objets: type === "boss" ? [piocher(OBJETS_RARES), "Potion de soins"]
            : hasard(5) < 2 ? ["Potion de soins"] : [],
          pris: false,
        };
      }
      salles[id] = salle;
    });
    etages.push({ numero: numeroEtage, theme: theme.nom, ambiance: theme.ambiance, entree: `${numeroEtage}-1`, salles });
  }
  return { numero, niveau: niv, etages };
}

export const sectionDeLEtage = (etage) => Math.floor((etage - 1) / ETAGES_PAR_SECTION) + 1;
