// Moteur du mode « Expéditions » : progression du profil, génération de la carte, combats au tour par tour,
// événements, marchand et bilan. Tout est ici, sans interface : l'IA ne fait que raconter.

import { d, d20, lancer } from "../des.js";
import {
  COMPETENCES, DIFFICULTES, ENNEMIS, EVENEMENTS, FORGE, HEROS, NB_ETAGES, NIVEAU_MAX, OBJETS, ORDRE_HEROS,
  RELIQUES, xpPourNiveau,
} from "./donnees.js";

export const VERSION_PROFIL = 1;

export const mod = (valeur) => Math.floor((valeur - 10) / 2);
export const maitrise = (niveau) => 2 + Math.floor((niveau - 1) / 4);
const entre = (min, max) => min + d(max - min + 1) - 1;
const hasard = (liste) => liste[d(liste.length) - 1];
const signe = (n) => (n >= 0 ? `+${n}` : `${n}`);

// ================================================================== profil (progression permanente)

const nouveauHeros = () => ({ niveau: 1, xp: 0, talents: [], forge: { arme: 0, armure: 0, talisman: 0 } });

export function creerProfil() {
  return {
    version: VERSION_PROFIL,
    or: 0,
    heros: Object.fromEntries(ORDRE_HEROS.map((id) => [id, nouveauHeros()])),
    debloques: ["guerrier", "mage", "roublard"],
    difficultes: ["facile", "normal", "difficile"],
    provisions: {},
    stats: { expeditions: 0, victoires: 0, morts: 0, gobelins: 0, meilleur_etage: 0 },
    dernier_heros: "guerrier",
    difficulte: "normal",
  };
}

/** Complète un profil enregistré par une version plus ancienne du jeu. */
export function normaliserProfil(brut) {
  const base = creerProfil();
  if (!brut || typeof brut !== "object") return base;
  const p = { ...base, ...brut, stats: { ...base.stats, ...brut.stats }, provisions: { ...brut.provisions } };
  p.heros = {};
  for (const id of ORDRE_HEROS) {
    const h = brut.heros?.[id] ?? {};
    p.heros[id] = { ...nouveauHeros(), ...h, forge: { ...nouveauHeros().forge, ...h.forge },
      talents: Array.isArray(h.talents) ? h.talents.filter((t) => tousLesTalents(id).some((x) => x.id === t)) : [] };
  }
  p.debloques = [...new Set([...base.debloques, ...(Array.isArray(brut.debloques) ? brut.debloques : [])])]
    .filter((id) => HEROS[id]);
  p.difficultes = [...new Set([...base.difficultes, ...(Array.isArray(brut.difficultes) ? brut.difficultes : [])])]
    .filter((id) => DIFFICULTES[id]);
  if (!HEROS[p.dernier_heros]) p.dernier_heros = "guerrier";
  if (!DIFFICULTES[p.difficulte]) p.difficulte = "normal";
  return p;
}

export const tousLesTalents = (heroId) => HEROS[heroId].branches.flatMap((b) => b.talents);
export const pointsDisponibles = (h) => Math.max(0, h.niveau - 1 - h.talents.length);

/** Raison pour laquelle le talent ne peut pas être appris (ou null s'il le peut). */
export function blocageTalent(profil, heroId, talentId) {
  const h = profil.heros[heroId];
  const t = tousLesTalents(heroId).find((x) => x.id === talentId);
  if (!t) return "Talent inconnu.";
  if (h.talents.includes(talentId)) return "Déjà appris.";
  if (t.requis && !h.talents.includes(t.requis)) return "Apprends d'abord le talent précédent.";
  if (pointsDisponibles(h) < 1) return "Pas de point de talent : monte de niveau.";
  return null;
}

export function apprendreTalent(profil, heroId, talentId) {
  const blocage = blocageTalent(profil, heroId, talentId);
  if (blocage) throw new Error(blocage);
  profil.heros[heroId].talents.push(talentId);
}

/** Rend les points de talent d'un héros (gratuit, pour essayer d'autres combinaisons). */
export function oublierTalents(profil, heroId) {
  profil.heros[heroId].talents = [];
}

export function prixForge(profil, heroId, emplacement) {
  const niveau = profil.heros[heroId].forge[emplacement];
  return FORGE[emplacement].prix[niveau] ?? null;
}

export function acheterForge(profil, heroId, emplacement) {
  const prix = prixForge(profil, heroId, emplacement);
  if (prix == null) throw new Error("Déjà au maximum.");
  if (profil.or < prix) throw new Error("Pas assez d'or.");
  profil.or -= prix;
  profil.heros[heroId].forge[emplacement] += 1;
}

export const MAX_PROVISIONS = 3;

export function acheterProvision(profil, objetId) {
  const objet = OBJETS[objetId];
  if (!objet) throw new Error("Objet inconnu.");
  const total = Object.values(profil.provisions).reduce((a, b) => a + b, 0);
  if (total >= MAX_PROVISIONS) throw new Error(`Tu ne peux emporter que ${MAX_PROVISIONS} provisions.`);
  if (profil.or < objet.prix) throw new Error("Pas assez d'or.");
  profil.or -= objet.prix;
  profil.provisions[objetId] = (profil.provisions[objetId] ?? 0) + 1;
}

/** Ajoute de l'XP au héros. Renvoie le nombre de niveaux gagnés. */
export function gagnerXP(profil, heroId, xp) {
  const h = profil.heros[heroId];
  let gagnes = 0;
  if (h.niveau >= NIVEAU_MAX) return 0;
  h.xp += Math.max(0, Math.round(xp));
  while (h.niveau < NIVEAU_MAX && h.xp >= xpPourNiveau(h.niveau)) {
    h.xp -= xpPourNiveau(h.niveau);
    h.niveau += 1;
    gagnes += 1;
  }
  if (h.niveau >= NIVEAU_MAX) h.xp = 0;
  return gagnes;
}

// ================================================================== statistiques calculées

function cumulerEffets(listes) {
  const total = {};
  for (const effets of listes) {
    for (const [cle, valeur] of Object.entries(effets ?? {})) {
      if (typeof valeur === "number") total[cle] = (total[cle] ?? 0) + valeur;
      else (total[cle] ??= []).push(valeur);
    }
  }
  return total;
}

/** Caractéristiques, PV, CA, attaques… du héros, avec talents, forge et reliques. */
export function statsHeros(profil, heroId, reliques = []) {
  const def = HEROS[heroId];
  const h = profil.heros[heroId];
  const niveau = h.niveau;
  const talents = tousLesTalents(heroId).filter((t) => h.talents.includes(t.id));
  const e = cumulerEffets([...talents.map((t) => t.effets), ...reliques.map((r) => RELIQUES[r]?.effets)]);
  const caracs = { ...def.caracs };
  // Amélioration de caractéristique aux niveaux 4 et 8, comme en 5e édition.
  caracs[def.principale] += (niveau >= 4 ? 2 : 0) + (niveau >= 8 ? 2 : 0);
  const caracArme = def.arme.carac ?? def.principale;
  const bonusMaitrise = maitrise(niveau);
  const forge = h.forge;
  return {
    id: heroId, nom: def.nom, titre: def.titre, niveau, caracs, principale: def.principale,
    pvMax: def.pv + (niveau - 1) * def.pv_niveau + mod(caracs.CON) * niveau + (e.pv ?? 0) + 5 * forge.talisman,
    pmMax: def.pm + Math.floor((niveau - 1) / 3) + (e.pm ?? 0) + Math.max(0, forge.talisman - 1),
    ca: def.ca + forge.armure + (e.ca ?? 0),
    maitrise: bonusMaitrise,
    arme: def.arme.nom,
    desArme: def.arme.des,
    att: bonusMaitrise + mod(caracs[caracArme]) + forge.arme + (e.att ?? 0),
    degats: mod(caracs[caracArme]) + forge.arme + (e.degats ?? 0),
    attSort: bonusMaitrise + mod(caracs[def.principale]) + (e.att ?? 0),
    dd: 8 + bonusMaitrise + mod(caracs[def.principale]),
    crit: Math.max(18, 20 - (e.crit ?? 0)),
    sorts: e.sorts ?? 0,
    soins: e.soins ?? 0,
    garde: 3 + (e.garde ?? 0),
    regen: e.regen ?? 0,
    regenTour: e.regen_tour ?? 0,
    bonusOr: e.or ?? 0,
    bonusPotions: e.potions ?? 0,
    premiere: Boolean(e.premiere),
    competences: [...def.competences, ...(e.competence ?? [])],
  };
}

// ================================================================== carte

const MAX_PAR_CARTE = { marchand: 2, repos: 2, tresor: 2, elite: 3 };
const ETAGE_MIN = { marchand: 2, repos: 2, tresor: 1, elite: 2, evenement: 1 };

function choisirType(etage, dejaPris, compte) {
  if (etage === 0) return "combat";
  const poids = [["combat", 45], ["evenement", 22], ["tresor", 9], ["marchand", 6], ["repos", 6], ["elite", 12]]
    .filter(([t]) => etage >= (ETAGE_MIN[t] ?? 0))
    .filter(([t]) => (compte[t] ?? 0) < (MAX_PAR_CARTE[t] ?? 99))
    .filter(([t]) => !(["marchand", "repos", "tresor", "elite"].includes(t) && dejaPris.includes(t)));
  const total = poids.reduce((a, [, p]) => a + p, 0);
  let r = d(total);
  for (const [type, p] of poids) {
    r -= p;
    if (r <= 0) return type;
  }
  return "combat";
}

/** Carte en étages : chaque salle mène à une ou deux salles de l'étage suivant, puis au boss. */
export function genererCarte() {
  const etages = [];
  const compte = {};
  // Le marchand du milieu et le feu de camp de la fin sont garantis plus bas : on leur garde une place.
  compte.marchand = 1;
  compte.repos = 1;
  for (let i = 0; i < NB_ETAGES; i++) {
    const n = i === 0 ? 2 : entre(2, 3);
    const salles = [];
    for (let j = 0; j < n; j++) {
      const type = choisirType(i, salles.map((s) => s.type), compte);
      compte[type] = (compte[type] ?? 0) + 1;
      salles.push({ id: `${i}-${j}`, etage: i, col: j, n, type, suivants: [] });
    }
    etages.push(salles);
  }
  // Salles garanties : un marchand au milieu, un feu de camp juste avant le boss.
  const garantir = (etage, type) => {
    if (!etages[etage].some((s) => s.type === type)) hasard(etages[etage]).type = type;
  };
  garantir(3, "marchand");
  garantir(NB_ETAGES - 1, "repos");
  const pos = (s) => (s.col + 0.5) / s.n;
  for (let i = 0; i < NB_ETAGES - 1; i++) {
    const suivants = etages[i + 1];
    for (const s of etages[i]) {
      const tries = [...suivants].sort((a, b) => Math.abs(pos(a) - pos(s)) - Math.abs(pos(b) - pos(s)));
      s.suivants.push(tries[0].id);
      if (tries[1] && d(2) === 1) s.suivants.push(tries[1].id);
    }
    for (const cible of suivants) {
      if (!etages[i].some((s) => s.suivants.includes(cible.id))) {
        const proche = [...etages[i]].sort((a, b) => Math.abs(pos(a) - pos(cible)) - Math.abs(pos(b) - pos(cible)))[0];
        proche.suivants.push(cible.id);
      }
    }
  }
  for (const s of etages[NB_ETAGES - 1]) s.suivants.push("boss");
  return { etages, boss: { id: "boss", etage: NB_ETAGES, col: 0, n: 1, type: "boss", suivants: [] } };
}

export const salleParId = (carte, id) => (id === "boss" ? carte.boss : carte.etages.flat().find((s) => s.id === id));

// ================================================================== expédition

export function nouvelleCourse(profil, heroId, difficulte = "normal", { karma = true } = {}) {
  if (!profil.debloques.includes(heroId)) throw new Error("Ce héros n'est pas encore débloqué.");
  if (!profil.difficultes.includes(difficulte)) throw new Error("Cette difficulté n'est pas encore débloquée.");
  const st = statsHeros(profil, heroId);
  const objets = { potion: 2 };
  for (const [id, n] of Object.entries(profil.provisions)) objets[id] = (objets[id] ?? 0) + n;
  profil.provisions = {};
  profil.dernier_heros = heroId;
  profil.difficulte = difficulte;
  return {
    id: Math.random().toString(16).slice(2, 10),
    heros: heroId, difficulte, debut: Date.now(),
    niveau_depart: st.niveau,
    carte: genererCarte(),
    position: null,
    visitees: [],
    pv: st.pvMax, pm: st.pmMax,
    reliques: [], objets,
    or: 0, xp: 0, tues: 0, niveaux: 0,
    salle: null,
    terminee: false, issue: null, bilan: null,
    karma, malchance: 0,
  };
}

export const statsCourse = (profil, course) => statsHeros(profil, course.heros, course.reliques);

/** Salles où le héros peut aller maintenant. */
export function sallesAccessibles(course) {
  if (course.terminee) return [];
  if (course.salle && !course.salle.fini) return [];
  if (!course.position) return course.carte.etages[0].map((s) => s.id);
  return salleParId(course.carte, course.position).suivants;
}

export function entrerSalle(profil, course, salleId) {
  if (!sallesAccessibles(course).includes(salleId)) throw new Error("Cette salle n'est pas accessible.");
  const salle = salleParId(course.carte, salleId);
  course.position = salleId;
  course.visitees.push(salleId);
  const diff = DIFFICULTES[course.difficulte];
  const etage = salle.etage;
  switch (salle.type) {
    case "combat":
    case "elite":
    case "boss":
      course.salle = nouveauCombat(profil, course, compositionCombat(salle.type, etage), salle.type);
      break;
    case "evenement": {
      const dejaVus = course.evenements_vus ?? [];
      const possibles = EVENEMENTS.filter((ev) => !dejaVus.includes(ev.id));
      const ev = hasard(possibles.length ? possibles : EVENEMENTS);
      course.evenements_vus = [...dejaVus, ev.id];
      course.salle = { type: "evenement", evenement: ev.id, resultat: null, fini: false };
      break;
    }
    case "tresor": {
      const st = statsCourse(profil, course);
      course.salle = { type: "tresor", or: Math.round(entre(25, 45) * diff.or * (1 + st.bonusOr)), relique: reliqueAuHasard(course), pris: false, fini: false };
      break;
    }
    case "marchand":
      course.salle = { type: "marchand", stock: stockMarchand(course), fini: false };
      break;
    case "repos":
      course.salle = { type: "repos", choix: null, fini: false };
      break;
    default:
      throw new Error(`Type de salle inconnu : ${salle.type}`);
  }
  course.salle.etage = etage;
  course.salle.genre = salle.type;
  return course.salle;
}

function reliqueAuHasard(course, exclues = []) {
  const libres = Object.keys(RELIQUES).filter((id) => !course.reliques.includes(id) && !exclues.includes(id));
  return libres.length ? hasard(libres) : null;
}

export function ajouterRelique(profil, course, id) {
  if (!id || !RELIQUES[id] || course.reliques.includes(id)) return false;
  const avant = statsCourse(profil, course);
  course.reliques.push(id);
  const apres = statsCourse(profil, course);
  course.pv += Math.max(0, apres.pvMax - avant.pvMax);
  course.pm += Math.max(0, apres.pmMax - avant.pmMax);
  return true;
}

const ajouterObjet = (course, id, n = 1) => { course.objets[id] = (course.objets[id] ?? 0) + n; };

function soignerHeros(profil, course, montant) {
  const st = statsCourse(profil, course);
  const avant = course.pv;
  course.pv = Math.min(st.pvMax, course.pv + Math.max(0, Math.round(montant)));
  return course.pv - avant;
}

/** Ajoute l'XP au héros (et à la course). Les PV max gagnés en montant de niveau sont rendus tout de suite. */
function donnerXP(profil, course, xp) {
  const avant = statsCourse(profil, course);
  const niveaux = gagnerXP(profil, course.heros, xp);
  course.xp += Math.round(xp);
  if (niveaux) {
    const apres = statsCourse(profil, course);
    course.pv += apres.pvMax - avant.pvMax;
    course.pm += apres.pmMax - avant.pmMax;
    course.niveaux += niveaux;
  }
  return niveaux;
}

// ================================================================== combat : création

export function compositionCombat(genre, etage) {
  if (genre === "boss") return ["roi"];
  if (genre === "elite") {
    const chef = hasard(["gobelours", "capitaine"]);
    return etage >= 4 ? [chef, hasard(["gobelin", "archer"])] : [chef];
  }
  const pool = etage >= 1 ? ["gobelin", "gobelin", "archer", "chaman", "loup"] : ["gobelin", "archer"];
  let budget = 2 + etage * 0.45;
  const liste = [];
  while (budget >= 1 && liste.length < 3) {
    const possibles = pool.filter((t) => ENNEMIS[t].cout <= budget + 0.01);
    if (!possibles.length) break;
    const type = hasard(possibles);
    liste.push(type);
    budget -= ENNEMIS[type].cout;
  }
  return liste.length ? liste : ["gobelin"];
}

const LETTRES = "ABCDEFGH";

export function creerEnnemi(type, etage, difficulte, index) {
  const base = ENNEMIS[type];
  const diff = DIFFICULTES[difficulte];
  const pv = Math.max(1, Math.round(base.pv * (1 + 0.05 * etage) * diff.pv));
  return {
    id: `e${index}`, type, nom: base.nom, sprite: base.sprite,
    pv, pvMax: pv,
    ca: base.ca + (etage >= 5 ? 1 : 0),
    att: base.att + diff.att + Math.floor(etage / 4),
    degats: base.degats, mult: diff.degats,
    dex: base.dex,
    xp: Math.round(base.xp * diff.xp),
    or: base.or,
    ia: base.ia ?? null, taille: base.taille ?? 1,
    elite: Boolean(base.elite), boss: Boolean(base.boss),
    statuts: [], compteur: 0, mort: false,
  };
}

function nommerEnnemis(ennemis) {
  const compte = {};
  for (const e of ennemis) compte[e.type] = (compte[e.type] ?? 0) + 1;
  const vus = {};
  for (const e of ennemis) {
    if (compte[e.type] > 1 && !e.boss) {
      vus[e.type] = (vus[e.type] ?? 0) + 1;
      e.nom = `${ENNEMIS[e.type].nom} ${LETTRES[vus[e.type] - 1]}`;
    }
  }
}

function nouveauCombat(profil, course, types, genre, bonusOr = 0) {
  const ennemis = types.map((t, i) => creerEnnemi(t, course.carte ? salleEtage(course) : 0, course.difficulte, i));
  nommerEnnemis(ennemis);
  course.pm = statsCourse(profil, course).pmMax; // les PM reviennent au début de chaque combat
  return {
    type: "combat", genre, ennemis, tour: 1, statuts: [], utilisations: {},
    premiere: true, butin_or: bonusOr, butin_xp: 0, issue: null, fini: false,
  };
}

function salleEtage(course) {
  const s = course.position ? salleParId(course.carte, course.position) : null;
  return s ? s.etage : 0;
}

// ================================================================== combat : outils

/** Lance une formule de dégâts ; un critique double les dés (pas le bonus fixe). */
export function lancerDegats(formule, critique = false) {
  const r = lancer(formule);
  if (!critique) return r.total;
  const des = String(formule).replace(/\s+/g, "").match(/\d*d\d+/g) ?? [];
  return r.total + des.reduce((t, f) => t + lancer(f).total, 0);
}

const actifs = (salle) => salle.ennemis.filter((e) => !e.mort);
const statut = (liste, id) => liste.find((s) => s.id === id);

function bonusStatuts(salle) {
  const b = { att: 0, ca: 0, degats: 0 };
  for (const s of salle.statuts) {
    for (const k of ["att", "ca", "degats"]) b[k] += s.effet?.[k] ?? 0;
  }
  return b;
}

/** CA effective du héros (avec défense et effets en cours). */
export function caHeros(st, salle) {
  return st.ca + (salle ? bonusStatuts(salle).ca : 0);
}

function infligerEnnemi(profil, course, salle, ennemi, montant, ev, source = "", detail = "") {
  const degats = Math.max(1, Math.round(montant));
  ennemi.pv = Math.max(0, ennemi.pv - degats);
  ev.push({ type: "degats", cible: ennemi.id, montant: degats, source, ...(detail ? { detail } : {}) });
  if (ennemi.pv <= 0 && !ennemi.mort) {
    ennemi.mort = true;
    course.tues += 1;
    const st = statsCourse(profil, course);
    salle.butin_or += Math.round(entre(...ennemi.or) * DIFFICULTES[course.difficulte].or * (1 + st.bonusOr));
    salle.butin_xp += ennemi.xp;
    ev.push({ type: "ko", cible: ennemi.id, texte: `${ennemi.nom} est vaincu !` });
  }
}

function infligerHeros(course, montant, ev, source, detail = "") {
  const degats = Math.max(1, Math.round(montant));
  course.pv = Math.max(0, course.pv - degats);
  ev.push({ type: "degats", cible: "heros", montant: degats, source, ...(detail ? { detail } : {}) });
}

function attaqueHeros(profil, course, salle, st, cible, { avantage = false, desBonus = null, sort = null } = {}, ev) {
  let av = avantage;
  if (salle.premiere && st.premiere) av = true;
  // Dé karmique : après 2 échecs d'affilée, avantage jusqu'à la prochaine réussite.
  const karma = karmaActif(course);
  if (karma) av = true;
  const aTerre = statut(salle.statuts, "a_terre");
  if (aTerre) salle.statuts = salle.statuts.filter((s) => s !== aTerre);
  const jet = d20(av, Boolean(aTerre));
  const nat = jet.resultat;
  const b = bonusStatuts(salle);
  const bonus = (sort ? st.attSort : st.att) + b.att;
  const total = nat + bonus;
  const critique = nat >= st.crit;
  const touche = nat !== 1 && (critique || total >= cible.ca);
  noterChance(course, touche);
  ev.push({ type: "jet", qui: "heros", cible: cible.id, des: jet.des, nat, bonus, total, ca: cible.ca, touche, critique,
    avantage: av && !aTerre, desavantage: Boolean(aTerre) && !av, karma: karma && !aTerre });
  if (!touche) return;
  const j = sort
    ? jetDegats([sort.des], (sort.carac ? mod(st.caracs[sort.carac]) : 0) + st.sorts, critique)
    : jetDegats([st.desArme, desBonus], st.degats + b.degats, critique);
  infligerEnnemi(profil, course, salle, cible, j.total, ev, sort ? "sort" : "arme", j.detail);
  return true;
}

/**
 * Lance des dés de dégâts plus un bonus fixe ; un critique double les dés (pas le bonus).
 * Renvoie { total, detail } où detail montre chaque dé, ex. « 1d8 [5] + 1d6 [3] + 3 ».
 */
export function jetDegats(formules, bonus = 0, critique = false) {
  let total = 0;
  const morceaux = [];
  for (const f of formules.filter(Boolean)) {
    const des = String(f).replace(/\s+/g, "").match(/\d*d\d+/g) ?? [];
    const r = lancer(f);
    total += r.total;
    morceaux.push(des.length === 1 ? `${des[0]} ${r.detail}` : r.detail);
    // Critique : on relance les dés seulement, le bonus fixe ne compte qu'une fois.
    if (critique) {
      for (const de of des) {
        const x = lancer(de);
        total += x.total;
        morceaux.push(`${de} ${x.detail}`);
      }
    }
  }
  total += bonus;
  if (bonus) morceaux.push(String(bonus));
  return { total, detail: morceaux.join(" + ").replace(/\+ -/g, "− ") };
}

function appliquerStatutEnnemi(cible, s, ev) {
  if (!s || cible.mort) return;
  const existant = statut(cible.statuts, s.id);
  if (existant) existant.restant = Math.max(existant.restant, s.duree);
  else cible.statuts.push({ id: s.id, restant: s.duree, valeur: s.valeur ?? null });
  const noms = { poison: "empoisonné", etourdi: "étourdi", affaibli: "affaibli" };
  ev.push({ type: "statut", cible: cible.id, statut: s.id, texte: `${cible.nom} est ${noms[s.id] ?? s.id}.` });
}

// ================================================================== combat : action du joueur

/**
 * Liste des actions possibles en combat, avec leur disponibilité.
 * Renvoie { competences: [{id, nom, icone, cout, desc, possible, raison}], objets: [...] }.
 */
export function actionsDisponibles(profil, course) {
  const salle = course.salle;
  const st = statsCourse(profil, course);
  const competences = st.competences.map((id) => {
    const c = COMPETENCES[id];
    let raison = null;
    if (c.par_combat && (salle?.utilisations?.[id] ?? 0) >= c.par_combat) raison = "Déjà utilisée ce combat";
    else if (c.cout > course.pm) raison = `${c.cout} PM requis`;
    return { id, ...c, possible: !raison, raison };
  });
  const objets = Object.entries(course.objets).filter(([, n]) => n > 0).map(([id, n]) => ({ id, n, ...OBJETS[id] }));
  return { competences, objets };
}

/**
 * Joue l'action du héros puis le tour des ennemis.
 * action : { type: "attaque", cible } | { type: "competence", id, cible } | { type: "objet", id } | { type: "defense" }
 * Renvoie la liste des évènements (pour l'animation et le journal).
 */
export function jouerAction(profil, course, action) {
  const salle = course.salle;
  if (!salle || salle.type !== "combat" || salle.issue) throw new Error("Aucun combat en cours.");
  const st = statsCourse(profil, course);
  const ev = [];
  const vivants = actifs(salle);
  const cibleChoisie = vivants.find((e) => e.id === action.cible) ?? vivants[0];

  switch (action.type) {
    case "attaque":
      ev.push({ type: "action", texte: `Tu attaques ${cibleChoisie.nom} avec ${st.arme.toLowerCase().startsWith("d") ? "tes" : "ton"} ${st.arme.toLowerCase()}.` });
      attaqueHeros(profil, course, salle, st, cibleChoisie, {}, ev);
      salle.premiere = false;
      break;
    case "defense":
      salle.statuts.push({ id: "garde", restant: 1, effet: { ca: st.garde } });
      course.pm = Math.min(st.pmMax, course.pm + 1);
      ev.push({ type: "action", texte: `Tu te mets en garde (+${st.garde} CA ce tour, +1 PM).` });
      break;
    case "objet":
      utiliserObjet(profil, course, salle, st, action.id, ev);
      break;
    case "competence":
      utiliserCompetence(profil, course, salle, st, action.id, cibleChoisie, ev);
      break;
    default:
      throw new Error("Action inconnue.");
  }

  // Esprits gardiens et autres auras : à la fin de l'action du héros.
  for (const s of salle.statuts) {
    if (s.effet?.aura) {
      for (const e of actifs(salle)) infligerEnnemi(profil, course, salle, e, lancerDegats(s.effet.aura) + st.sorts, ev, "aura");
    }
  }

  if (verifierVictoire(profil, course, salle, ev)) return ev;
  tourDesEnnemis(profil, course, salle, st, ev);
  if (course.pv <= 0) {
    defaite(course, salle, ev);
    return ev;
  }
  if (verifierVictoire(profil, course, salle, ev)) return ev; // poison
  finDeRound(profil, course, salle, ev);
  return ev;
}

function utiliserObjet(profil, course, salle, st, id, ev) {
  const objet = OBJETS[id];
  if (!objet || !(course.objets[id] > 0)) throw new Error("Tu n'as pas cet objet.");
  course.objets[id] -= 1;
  if (course.objets[id] <= 0) delete course.objets[id];
  ev.push({ type: "action", texte: `Tu utilises : ${objet.nom}.` });
  if (objet.soin) {
    const soin = soignerHeros(profil, course, lancer(objet.soin).total * (1 + st.bonusPotions));
    ev.push({ type: "soin", cible: "heros", montant: soin });
  }
  if (objet.pm) {
    const avant = course.pm;
    course.pm = Math.min(st.pmMax, course.pm + objet.pm);
    ev.push({ type: "pm", cible: "heros", montant: course.pm - avant });
  }
  if (objet.zone) {
    for (const e of actifs(salle)) infligerEnnemi(profil, course, salle, e, lancer(objet.zone).total, ev, "bombe");
  }
}

function utiliserCompetence(profil, course, salle, st, id, cible, ev) {
  const c = COMPETENCES[id];
  if (!c || !st.competences.includes(id)) throw new Error("Compétence inconnue.");
  if (c.par_combat && (salle.utilisations[id] ?? 0) >= c.par_combat) throw new Error("Déjà utilisée pendant ce combat.");
  if (c.cout > course.pm) throw new Error("Pas assez de PM.");
  course.pm -= c.cout;
  salle.utilisations[id] = (salle.utilisations[id] ?? 0) + 1;
  ev.push({ type: "action", competence: id, texte: `${c.icone} ${c.nom} !` });
  const cibles = c.cible === "tous" ? actifs(salle) : [cible];
  switch (c.type) {
    case "attaque":
      for (const e of cibles) {
        const touche = attaqueHeros(profil, course, salle, st, e, { avantage: c.avantage, desBonus: c.des_bonus }, ev);
        if (touche && c.statut) appliquerStatutEnnemi(e, c.statut, ev);
      }
      salle.premiere = false;
      break;
    case "sort_attaque":
      for (const e of cibles) {
        const touche = attaqueHeros(profil, course, salle, st, e, { sort: c }, ev);
        if (touche && c.statut) appliquerStatutEnnemi(e, c.statut, ev);
      }
      salle.premiere = false;
      break;
    case "sort_auto":
      for (const e of cibles) {
        const j = jetDegats([c.des], (c.carac ? mod(st.caracs[c.carac]) : 0) + st.sorts);
        ev.push({ type: "automatique", cible: e.id, texte: `${c.nom} touche automatiquement ${e.nom}.` });
        infligerEnnemi(profil, course, salle, e, j.total, ev, "sort", j.detail);
        if (c.statut) appliquerStatutEnnemi(e, c.statut, ev);
      }
      break;
    case "sort_zone":
      for (const e of cibles) {
        const jet = d(20) + e.dex;
        const reussi = jet >= st.dd;
        const j = jetDegats([c.des], mod(st.caracs[c.carac]) + st.sorts);
        ev.push({ type: "sauvegarde", cible: e.id, total: jet, dd: st.dd, reussi });
        infligerEnnemi(profil, course, salle, e, reussi ? j.total / 2 : j.total, ev, "sort", reussi ? `${j.detail}, divisé par 2` : j.detail);
      }
      break;
    case "soin": {
      const montant = lancer(c.des).total + (c.carac ? mod(st.caracs[c.carac]) : 0) + (c.niveau ? st.niveau : 0) + st.soins;
      ev.push({ type: "soin", cible: "heros", montant: soignerHeros(profil, course, montant) });
      break;
    }
    case "buff":
      salle.statuts = salle.statuts.filter((s) => s.id !== id);
      salle.statuts.push({ id, restant: c.duree, effet: c.effet, nom: c.nom });
      break;
    default:
      throw new Error("Type de compétence inconnu.");
  }
}

// ================================================================== combat : ennemis

function attaqueEnnemi(course, salle, st, e, ev, { formule = e.degats, nomAttaque = null, bonusAtt = 0, mult = 1 } = {}) {
  const affaibli = statut(e.statuts, "affaibli");
  const rallie = statut(e.statuts, "rallie");
  const bonus = e.att + bonusAtt + (affaibli ? -2 : 0) + (rallie ? 2 : 0);
  const jet = d20();
  const nat = jet.resultat;
  const ca = caHeros(st, salle);
  const critique = nat === 20;
  const touche = nat !== 1 && (critique || nat + bonus >= ca);
  ev.push({ type: "jet", qui: e.id, cible: "heros", des: jet.des, nat, bonus, total: nat + bonus, ca, touche, critique, attaque: nomAttaque });
  if (!touche) return false;
  const j = jetDegats([formule], 0, critique);
  const facteur = e.mult * mult;
  let degats = j.total * facteur + (affaibli ? -2 : 0);
  let detail = j.detail;
  if (facteur !== 1) detail += ` × ${String(Math.round(facteur * 100) / 100).replace(".", ",")} (difficulté)`;
  if (affaibli) detail += " − 2 (affaibli)";
  if (statut(salle.statuts, "garde") && nomAttaque === "Coup de massue") {
    degats /= 2;
    detail += ", divisé par 2 (en garde)";
  }
  infligerHeros(course, degats, ev, e.id, detail);
  return true;
}

function tourDesEnnemis(profil, course, salle, st, ev) {
  for (const e of salle.ennemis) {
    if (e.mort || course.pv <= 0) continue;
    // Poison : au début du tour de l'ennemi.
    const poison = statut(e.statuts, "poison");
    if (poison) {
      infligerEnnemi(profil, course, salle, e, lancer(poison.valeur ?? "1d4").total, ev, "poison");
      if (e.mort) continue;
    }
    const etourdi = statut(e.statuts, "etourdi");
    if (etourdi) {
      ev.push({ type: "action", qui: e.id, texte: `${e.nom} est étourdi et ne fait rien.` });
    } else {
      e.compteur += 1;
      agirEnnemi(profil, course, salle, st, e, ev);
    }
    for (const s of e.statuts) s.restant -= 1;
    e.statuts = e.statuts.filter((s) => s.restant > 0);
  }
}

function agirEnnemi(profil, course, salle, st, e, ev) {
  switch (e.ia) {
    case "chaman": {
      const blesse = actifs(salle).filter((a) => a !== e && a.pv < a.pvMax / 2).sort((a, b) => a.pv / a.pvMax - b.pv / b.pvMax)[0];
      if (blesse && d(10) <= 6) {
        const soin = Math.min(blesse.pvMax - blesse.pv, lancer("1d8+2").total);
        blesse.pv += soin;
        ev.push({ type: "action", qui: e.id, texte: `${e.nom} psalmodie et soigne ${blesse.nom}.` });
        ev.push({ type: "soin", cible: blesse.id, montant: soin });
        return;
      }
      ev.push({ type: "action", qui: e.id, texte: `${e.nom} lance un trait de feu !` });
      attaqueEnnemi(course, salle, st, e, ev, { nomAttaque: "Trait de feu" });
      return;
    }
    case "loup":
      ev.push({ type: "action", qui: e.id, texte: `${e.nom} bondit, crocs en avant !` });
      if (attaqueEnnemi(course, salle, st, e, ev) && d(10) <= 3 && course.pv > 0) {
        salle.statuts = salle.statuts.filter((s) => s.id !== "a_terre");
        salle.statuts.push({ id: "a_terre", restant: 2, nom: "À terre" });
        ev.push({ type: "statut", cible: "heros", statut: "a_terre", texte: "Tu es renversé ! Désavantage à ta prochaine attaque." });
      }
      return;
    case "capitaine":
      if (e.compteur % 3 === 1 && actifs(salle).length > 1) {
        for (const a of actifs(salle)) {
          if (a !== e) a.statuts = [...a.statuts.filter((s) => s.id !== "rallie"), { id: "rallie", restant: 2 }];
        }
        ev.push({ type: "action", qui: e.id, texte: `${e.nom} hurle un ordre : ses alliés gagnent +2 à l'attaque !` });
        return;
      }
      ev.push({ type: "action", qui: e.id, texte: `${e.nom} frappe avec discipline.` });
      attaqueEnnemi(course, salle, st, e, ev);
      return;
    case "roi": {
      if (!e.renforts && e.pv <= e.pvMax / 2) {
        e.renforts = true;
        const n = salle.ennemis.length;
        const gardes = ["gobelin", "gobelin"].map((t, i) => creerEnnemi(t, salle.etage ?? 6, course.difficulte, n + i));
        gardes.forEach((g, i) => { g.nom = `Garde royal ${LETTRES[i]}`; });
        salle.ennemis.push(...gardes);
        ev.push({ type: "renforts", qui: e.id, ennemis: gardes.map((g) => g.id), texte: `${e.nom} rugit : « GARDES ! » Deux gobelins accourent.` });
        return;
      }
      if (e.prepare) {
        e.prepare = false;
        ev.push({ type: "action", qui: e.id, texte: `${e.nom} abat sa massue de toutes ses forces !` });
        attaqueEnnemi(course, salle, st, e, ev, { formule: "2d10+3", nomAttaque: "Coup de massue", bonusAtt: 1 });
        return;
      }
      if (e.compteur % 3 === 0) {
        e.prepare = true;
        ev.push({ type: "alerte", qui: e.id, texte: `⚠️ ${e.nom} lève son énorme massue… Mets-toi en garde !` });
        return;
      }
      ev.push({ type: "action", qui: e.id, texte: `${e.nom} frappe de sa massue.` });
      attaqueEnnemi(course, salle, st, e, ev);
      return;
    }
    default: {
      const verbes = { archer: "décoche une flèche", gobelours: "abat son poing énorme", gobelin: "attaque au cimeterre" };
      ev.push({ type: "action", qui: e.id, texte: `${e.nom} ${verbes[e.type] ?? "attaque"}.` });
      attaqueEnnemi(course, salle, st, e, ev);
    }
  }
}

function finDeRound(profil, course, salle, ev) {
  const st = statsCourse(profil, course);
  course.pm = Math.min(st.pmMax, course.pm + 1);
  if (st.regenTour && course.pv > 0) {
    const soin = soignerHeros(profil, course, st.regenTour);
    if (soin) ev.push({ type: "soin", cible: "heros", montant: soin, discret: true });
  }
  for (const s of salle.statuts) s.restant -= 1;
  salle.statuts = salle.statuts.filter((s) => s.restant > 0);
  salle.tour += 1;
  ev.push({ type: "round", tour: salle.tour });
}

function verifierVictoire(profil, course, salle, ev) {
  if (actifs(salle).length) return false;
  const st = statsCourse(profil, course);
  salle.issue = "victoire";
  salle.fini = true;
  salle.statuts = [];
  const butin = { or: salle.butin_or, xp: salle.butin_xp, relique: null, objet: null, regen: 0 };
  course.or += butin.or;
  butin.niveaux = donnerXP(profil, course, butin.xp);
  // Souffler après la bataille : 20 % des PV max reviennent (plus les effets de régénération).
  butin.regen = soignerHeros(profil, course, st.pvMax * 0.2 + st.regen);
  if (salle.genre === "elite") {
    butin.relique = reliqueAuHasard(course);
    ajouterRelique(profil, course, butin.relique);
  } else if (salle.genre === "combat" && d(100) <= 20) {
    butin.objet = "potion";
    ajouterObjet(course, "potion");
  }
  salle.butin = butin;
  ev.push({ type: "victoire", ...butin });
  if (salle.genre === "boss") {
    course.terminee = true;
    course.issue = "victoire";
  }
  return true;
}

function defaite(course, salle, ev) {
  salle.issue = "defaite";
  course.terminee = true;
  course.issue = "defaite";
  ev.push({ type: "defaite", texte: "Tu t'effondres…" });
}

// ================================================================== autres salles

/** Jet de caractéristique : d20 + modificateur (+ maîtrise pour la caractéristique principale du héros). */
export function testCarac(st, carac, dd, avantage = false) {
  const jet = d20(avantage);
  const nat = jet.resultat;
  const bonus = mod(st.caracs[carac]) + (carac === st.principale ? st.maitrise : 0);
  return { carac, dd, nat, des: jet.des, bonus, total: nat + bonus, reussi: nat === 20 || (nat !== 1 && nat + bonus >= dd), karma: avantage };
}

/**
 * Chance (0 à 1) que le héros touche la cible avec son arme (ou un sort à jet d'attaque),
 * en tenant compte des effets en cours, du dé karmique et d'un éventuel désavantage.
 */
export function chanceToucher(profil, course, cibleId, { sort = false, avantage = false } = {}) {
  const salle = course.salle;
  if (salle?.type !== "combat") return null;
  const cible = salle.ennemis.find((e) => e.id === cibleId && !e.mort) ?? actifs(salle)[0];
  if (!cible) return null;
  const st = statsCourse(profil, course);
  return chanceReussite((sort ? st.attSort : st.att) + bonusStatuts(salle).att, cible.ca, {
    avantage: avantage || karmaActif(course) || (salle.premiere && st.premiere),
    desavantage: Boolean(statut(salle.statuts, "a_terre")),
    critique: st.crit,
  });
}

/** Le dé karmique est-il prêt (2 échecs d'affilée, option active) ? */
export const karmaActif = (course) => course.karma !== false && (course.malchance ?? 0) >= 2;

function noterChance(course, reussi) {
  course.malchance = reussi ? 0 : (course.malchance ?? 0) + 1;
}

/** Probabilité (0 à 1) de réussir un jet de d20 + bonus contre une difficulté, avec 1 raté et 20 réussi d'office. */
export function chanceReussite(bonus, difficulte, { avantage = false, desavantage = false, critique = 20 } = {}) {
  const besoin = Math.min(Math.max(difficulte - bonus, 2), critique);
  const p = (21 - besoin) / 20;
  if (avantage && !desavantage) return 1 - (1 - p) ** 2;
  if (desavantage && !avantage) return p * p;
  return p;
}

export function evenementCourant(course) {
  return EVENEMENTS.find((e) => e.id === course.salle?.evenement) ?? null;
}

/** Résout un choix d'événement. Renvoie { texte, jet, effets: [textes], combat }. */
export function choisirEvenement(profil, course, index) {
  const salle = course.salle;
  const ev = evenementCourant(course);
  if (!ev || salle.resultat) throw new Error("Aucun événement à résoudre.");
  const choix = ev.choix[index];
  if (!choix) throw new Error("Choix inconnu.");
  if (choix.cout && course.or < choix.cout) throw new Error("Pas assez d'or.");
  if (choix.cout) course.or -= choix.cout;
  const st = statsCourse(profil, course);
  let jet = null;
  let issue = choix.resultat;
  if (choix.test) {
    jet = testCarac(st, choix.test.carac, choix.test.dd, karmaActif(course));
    noterChance(course, jet.reussi);
    issue = jet.reussi ? choix.succes : choix.echec;
  }
  const effets = appliquerEffets(profil, course, issue);
  const resultat = { choix: index, texte: issue.texte, jet, effets };
  salle.resultat = resultat;
  if (issue.combat && course.pv > 0) {
    course.salle = nouveauCombat(profil, course, issue.combat, "combat", issue.bonus_or ?? 0);
    course.salle.etage = salle.etage;
    course.salle.depuis_evenement = resultat;
    resultat.combat = true;
  } else {
    salle.fini = true;
    if (course.pv <= 0) {
      course.pv = 1; // un événement ne tue jamais : il laisse le héros à 1 PV
      effets.push("Tu tiens debout de justesse (1 PV).");
    }
  }
  return resultat;
}

function appliquerEffets(profil, course, issue) {
  const st = statsCourse(profil, course);
  const effets = [];
  const diff = DIFFICULTES[course.difficulte];
  if (issue.or) {
    const or = Math.round(issue.or * diff.or * (1 + st.bonusOr));
    course.or += or;
    effets.push(`+${or} or`);
  }
  if (issue.pv === "max") {
    effets.push(`+${soignerHeros(profil, course, st.pvMax)} PV`);
  } else if (typeof issue.pv === "number") {
    if (issue.pv < 0) {
      const degats = Math.round(-issue.pv * diff.degats);
      course.pv = Math.max(0, course.pv - degats);
      effets.push(`−${degats} PV`);
    } else effets.push(`+${soignerHeros(profil, course, issue.pv)} PV`);
  }
  if (issue.pv_pct) {
    const montant = Math.round(st.pvMax * Math.abs(issue.pv_pct));
    if (issue.pv_pct < 0) {
      course.pv = Math.max(1, course.pv - montant);
      effets.push(`−${montant} PV`);
    } else effets.push(`+${soignerHeros(profil, course, montant)} PV`);
  }
  if (issue.objet) {
    ajouterObjet(course, issue.objet);
    effets.push(`${OBJETS[issue.objet].icone} ${OBJETS[issue.objet].nom}`);
  }
  if (issue.relique) {
    const id = issue.relique === "hasard" ? reliqueAuHasard(course) : (course.reliques.includes(issue.relique) ? reliqueAuHasard(course) : issue.relique);
    if (id && ajouterRelique(profil, course, id)) effets.push(`${RELIQUES[id].icone} ${RELIQUES[id].nom} (${RELIQUES[id].desc})`);
    else {
      course.or += 30;
      effets.push("+30 or");
    }
  }
  if (issue.xp) {
    const xp = Math.round(issue.xp * diff.xp);
    const niveaux = donnerXP(profil, course, xp);
    effets.push(`+${xp} XP${niveaux ? " — niveau supérieur !" : ""}`);
  }
  return effets;
}

export function prendreTresor(profil, course) {
  const salle = course.salle;
  if (salle?.type !== "tresor" || salle.pris) throw new Error("Rien à prendre.");
  salle.pris = true;
  salle.fini = true;
  course.or += salle.or;
  const effets = [`+${salle.or} or`];
  if (salle.relique && ajouterRelique(profil, course, salle.relique)) {
    const r = RELIQUES[salle.relique];
    effets.push(`${r.icone} ${r.nom} (${r.desc})`);
  }
  return effets;
}

function stockMarchand(course) {
  const stock = [
    { type: "objet", id: "potion", prix: OBJETS.potion.prix },
    { type: "objet", id: "grande_potion", prix: OBJETS.grande_potion.prix },
    { type: "objet", id: "ether", prix: OBJETS.ether.prix },
    { type: "objet", id: "bombe", prix: OBJETS.bombe.prix },
    { type: "soin", id: "soin", prix: 30 },
  ];
  const r1 = reliqueAuHasard(course);
  const r2 = reliqueAuHasard(course, [r1]);
  for (const r of [r1, r2]) if (r) stock.push({ type: "relique", id: r, prix: entre(9, 12) * 10 });
  return stock.map((s, i) => ({ ...s, index: i, vendu: false }));
}

export function acheter(profil, course, index) {
  const salle = course.salle;
  const article = salle?.type === "marchand" ? salle.stock[index] : null;
  if (!article || article.vendu) throw new Error("Cet article n'est plus disponible.");
  if (course.or < article.prix) throw new Error("Pas assez d'or.");
  const st = statsCourse(profil, course);
  if (article.type === "soin" && course.pv >= st.pvMax) throw new Error("Tu es déjà en pleine forme.");
  course.or -= article.prix;
  if (article.type === "objet") {
    ajouterObjet(course, article.id);
  } else if (article.type === "relique") {
    ajouterRelique(profil, course, article.id);
    article.vendu = true;
  } else if (article.type === "soin") {
    soignerHeros(profil, course, st.pvMax / 2);
    article.vendu = true;
  }
  return article;
}

export function quitterSalle(course) {
  if (course.salle && course.salle.type !== "combat") course.salle.fini = true;
}

export function reposer(profil, course, choix) {
  const salle = course.salle;
  if (salle?.type !== "repos" || salle.choix) throw new Error("Tu t'es déjà reposé.");
  const st = statsCourse(profil, course);
  salle.choix = choix;
  salle.fini = true;
  if (choix === "dormir") {
    const soin = soignerHeros(profil, course, st.pvMax * 0.4);
    return [`+${soin} PV`];
  }
  if (choix === "entrainer") {
    const xp = Math.round(40 * DIFFICULTES[course.difficulte].xp);
    const niveaux = donnerXP(profil, course, xp);
    return [`+${xp} XP${niveaux ? " — niveau supérieur !" : ""}`];
  }
  throw new Error("Choix inconnu.");
}

// ================================================================== fin d'expédition

/** Applique la fin de l'expédition au profil (une seule fois). Renvoie le bilan. */
export function terminerCourse(profil, course, issue = course.issue ?? "abandon") {
  if (course.bilan) return course.bilan;
  course.terminee = true;
  course.issue = issue;
  const victoire = issue === "victoire";
  const orGarde = victoire ? course.or : Math.floor(course.or / 2);
  profil.or += orGarde;
  profil.stats.expeditions += 1;
  profil.stats.gobelins += course.tues;
  const etage = course.position === "boss" ? NB_ETAGES + 1 : (course.position ? salleParId(course.carte, course.position).etage + 1 : 0);
  profil.stats.meilleur_etage = Math.max(profil.stats.meilleur_etage, etage);
  const deblocages = [];
  if (victoire) {
    profil.stats.victoires += 1;
    if (!profil.debloques.includes("clerc")) {
      profil.debloques.push("clerc");
      deblocages.push("Nouveau héros : Sœur Aube, la Clerc !");
    }
    if (course.difficulte === "difficile" && !profil.difficultes.includes("cauchemar")) {
      profil.difficultes.push("cauchemar");
      deblocages.push("Nouvelle difficulté : Cauchemar !");
    }
  } else if (issue === "defaite") {
    profil.stats.morts += 1;
  }
  const h = profil.heros[course.heros];
  course.bilan = {
    issue, heros: course.heros, difficulte: course.difficulte,
    or_trouve: course.or, or_garde: orGarde, xp: course.xp, tues: course.tues, etage,
    niveau_depart: course.niveau_depart, niveau: h.niveau, points: pointsDisponibles(h),
    reliques: [...course.reliques], deblocages,
    duree: Math.round((Date.now() - course.debut) / 1000),
  };
  return course.bilan;
}

// ================================================================== textes utiles à l'interface

export function descriptionJet(j, nomQui = "Tu") {
  const des = j.des.length > 1 ? `[${j.des.join(", ")}]→${j.nat}` : `${j.nat}`;
  const issue = j.critique ? "CRITIQUE !" : j.nat === 1 ? "échec critique" : j.touche ? "touché" : "raté";
  return `${nomQui} : d20 ${des} ${signe(j.bonus)} = ${j.total} contre CA ${j.ca} — ${issue}`;
}
