// Création et calculs de la fiche de personnage.

import * as srd from "./srd.js";

export const mod = (score) => Math.floor((score - 10) / 2);
export const signe = (n) => (n >= 0 ? `+${n}` : `${n}`);
export const maitrise = (niveau) => 2 + Math.floor((niveau - 1) / 4);

export function niveauPourXp(xp) {
  let niveau = 1;
  for (const [n, palier] of Object.entries(srd.PALIERS_XP)) {
    if (xp >= palier) niveau = Number(n);
  }
  return niveau;
}

export function creerPersonnage({ nom, race, classe, caracs, competences, historique = "", apparence = "" }) {
  nom = String(nom ?? "").trim();
  if (!nom) throw new Error("Le personnage doit avoir un nom.");
  if (!srd.RACES[race]) throw new Error(`Race inconnue : ${race}`);
  if (!srd.CLASSES[classe]) throw new Error(`Classe inconnue : ${classe}`);
  if (!caracs || srd.CARACS.some((c) => !(c in caracs)) || Object.keys(caracs).length !== 6) {
    throw new Error("Il faut une valeur pour chaque caractéristique.");
  }
  for (const [c, v] of Object.entries(caracs)) {
    if (!Number.isInteger(v) || v < 3 || v > 18) throw new Error(`Valeur invalide pour ${c} : ${v}`);
  }
  const r = srd.RACES[race];
  const k = srd.CLASSES[classe];

  const finales = { ...caracs };
  for (const [c, b] of Object.entries(r.bonus)) finales[c] += b;
  if (r.bonus_libres) {
    srd.CARACS.filter((c) => !(c in r.bonus))
      .sort((a, b) => finales[b] - finales[a])
      .slice(0, r.bonus_libres)
      .forEach((c) => { finales[c] += 1; });
  }
  for (const c of srd.CARACS) finales[c] = Math.min(finales[c], 20);

  competences = [...new Set(competences ?? [])];
  if (competences.length !== k.nb_competences || competences.some((c) => !k.competences.includes(c))) {
    throw new Error(`Choisissez ${k.nb_competences} compétences parmi celles du ${classe}.`);
  }
  for (const c of r.competences ?? []) if (!competences.includes(c)) competences.push(c);

  const perso = {
    nom,
    race,
    classe,
    niveau: 1,
    xp: 0,
    historique: String(historique).trim(),
    apparence: String(apparence).trim(),
    caracs: finales,
    competences,
    sauvegardes: [...k.sauvegardes],
    vitesse: r.vitesse,
    armure: k.armure,
    bouclier: k.bouclier,
    armure_du_mage: false,
    armes: k.armes.map((n) => ({ nom: n, ...srd.ARMES[n] })),
    inventaire: k.inventaire.map((o) => ({ nom: o, quantite: 1 })),
    or: k.or,
    traits: [...r.traits],
    capacites: k.capacites.map((c) => ({ ...c, utilisations: c.utilisations_max ?? null })),
    des_de_vie: { faces: k.de_vie, restants: 1 },
    conditions: [],
    mort: { succes: 0, echecs: 0, stable: false, mort: false },
  };
  perso.pv_max = Math.max(k.de_vie + mod(finales.CON) + (r.pv_par_niveau ?? 0), 1);
  perso.pv = perso.pv_max;
  majEmplacements(perso);
  return perso;
}

function majEmplacements(perso) {
  if (!srd.CLASSES[perso.classe].lanceur) {
    perso.emplacements = {};
    return;
  }
  const anciens = perso.emplacements ?? {};
  const nouveaux = {};
  for (const [niv, nb] of Object.entries(srd.EMPLACEMENTS[perso.niveau])) {
    const a = anciens[niv] ?? { max: 0, restants: 0 };
    nouveaux[niv] = { max: nb, restants: Math.max(nb - (a.max - a.restants), 0) };
  }
  perso.emplacements = nouveaux;
}

export function niveauMaxSort(perso) {
  return Math.max(0, ...Object.keys(perso.emplacements ?? {}).map(Number));
}

/** Les lanceurs connaissent tous les sorts de leur classe accessibles à leur niveau (simplification). */
export function sortsConnus(perso) {
  let sorts = [];
  if (srd.CLASSES[perso.classe].lanceur) {
    const nmax = niveauMaxSort(perso);
    sorts = Object.entries(srd.SORTS)
      .filter(([, s]) => s.classes.includes(perso.classe) && s.niveau <= nmax)
      .map(([n]) => n);
  }
  if (perso.race === "Tieffelin" && !sorts.includes("Thaumaturgie")) sorts.push("Thaumaturgie");
  return sorts;
}

export const caracSort = (perso) => srd.CLASSES[perso.classe].lanceur ?? "CHA";
export const bonusAttaqueSort = (perso) => maitrise(perso.niveau) + mod(perso.caracs[caracSort(perso)]);
export const ddSort = (perso) => 8 + bonusAttaqueSort(perso);

export function ca(perso) {
  const c = perso.caracs;
  const dex = mod(c.DEX);
  let valeur;
  if (perso.armure === "Défense sans armure") {
    valeur = 10 + dex + mod(c.CON);
  } else {
    const a = srd.ARMURES[perso.armure];
    valeur = a.base;
    if (a.dex) valeur += a.plafond === null ? dex : Math.min(dex, a.plafond);
    if (perso.classe === "Guerrier" && perso.armure !== "Aucune") valeur += 1; // Style de combat : Défense
  }
  if (perso.armure_du_mage && perso.armure === "Aucune") valeur = Math.max(valeur, 13 + dex);
  if (perso.bouclier) valeur += 2;
  return valeur;
}

export function bonusCompetence(perso, competence) {
  let b = mod(perso.caracs[srd.COMPETENCES[competence]]);
  if (perso.competences.includes(competence)) b += maitrise(perso.niveau);
  return b;
}

export function bonusSauvegarde(perso, carac) {
  let b = mod(perso.caracs[carac]);
  if (perso.sauvegardes.includes(carac)) b += maitrise(perso.niveau);
  return b;
}

export function caracArme(perso, arme) {
  if (arme.carac === "FINESSE") return perso.caracs.DEX >= perso.caracs.FOR ? "DEX" : "FOR";
  return arme.carac;
}

export const bonusAttaqueArme = (perso, arme) => mod(perso.caracs[caracArme(perso, arme)]) + maitrise(perso.niveau);

export function bonusDegatsArme(perso, arme) {
  if (arme.degats === "1") return mod(perso.caracs.FOR);
  return mod(perso.caracs[caracArme(perso, arme)]);
}

/** Applique les montées de niveau dues à l'XP. Renvoie la liste des nouveaux niveaux. */
export function gagnerNiveau(perso) {
  const gagnes = [];
  const cible = niveauPourXp(perso.xp);
  while (perso.niveau < cible) {
    perso.niveau += 1;
    const gain = Math.max(
      Math.floor(perso.des_de_vie.faces / 2) + 1 + mod(perso.caracs.CON) + (srd.RACES[perso.race].pv_par_niveau ?? 0),
      1,
    );
    perso.pv_max += gain;
    perso.pv += gain;
    perso.des_de_vie.restants += 1;
    majEmplacements(perso);
    for (const cap of perso.capacites) {
      if (cap.nom === "Rage") cap.utilisations_max = perso.niveau < 3 ? 2 : perso.niveau < 6 ? 3 : 4;
    }
    gagnes.push(perso.niveau);
  }
  return gagnes;
}

/** Fiche complète avec toutes les valeurs calculées, pour l'interface. */
export function vueFiche(p) {
  const lanceur = Boolean(srd.CLASSES[p.classe].lanceur);
  return {
    ...p,
    ca: ca(p),
    maitrise: maitrise(p.niveau),
    xp_prochain: srd.PALIERS_XP[p.niveau + 1] ?? null,
    mods: Object.fromEntries(Object.entries(p.caracs).map(([c, v]) => [c, mod(v)])),
    toutes_competences: Object.entries(srd.COMPETENCES).map(([n, c]) => ({
      nom: n, carac: c, bonus: bonusCompetence(p, n), maitrise: p.competences.includes(n),
    })),
    toutes_sauvegardes: srd.CARACS.map((c) => ({
      carac: c, bonus: bonusSauvegarde(p, c), maitrise: p.sauvegardes.includes(c),
    })),
    attaques: p.armes.map((a) => {
      const bd = bonusDegatsArme(p, a);
      return {
        nom: a.nom, bonus: bonusAttaqueArme(p, a),
        degats: a.degats === "1" && bd === 0 ? a.degats : `${a.degats}${signe(bd)}`,
        type: a.type, distance: Boolean(a.distance),
      };
    }),
    sorts: sortsConnus(p).map((n) => ({ nom: n, ...srd.SORTS[n] })),
    sort_attaque: lanceur ? bonusAttaqueSort(p) : null,
    sort_dd: lanceur ? ddSort(p) : null,
  };
}

/** Résumé compact de la fiche, envoyé à l'IA à chaque tour. */
export function resumeTexte(p) {
  const v = vueFiche(p);
  const caracs = srd.CARACS.map((c) => `${c} ${p.caracs[c]} (${signe(v.mods[c])})`).join(", ");
  const lignes = [
    `${p.nom} — ${p.race} ${p.classe} niveau ${p.niveau} (XP ${p.xp})`,
    `PV ${p.pv}/${p.pv_max} · CA ${v.ca} · Vitesse ${p.vitesse} m · Maîtrise +${v.maitrise}`,
    `Caractéristiques : ${caracs}`,
    `Compétences maîtrisées : ${p.competences.join(", ") || "aucune"}`,
    `Attaques : ${v.attaques.map((a) => `${a.nom} ${signe(a.bonus)} (${a.degats} ${a.type})`).join("; ")}`,
  ];
  if (v.sorts.length) {
    const empl = Object.entries(p.emplacements).map(([n, e]) => `niv.${n} ${e.restants}/${e.max}`).join(", ");
    lignes.push(`Sorts (attaque ${signe(v.sort_attaque ?? 0)}, DD ${v.sort_dd ?? "-"}) : `
      + v.sorts.map((s) => `${s.nom} (niv.${s.niveau})`).join(", "));
    if (empl) lignes.push(`Emplacements de sorts : ${empl}`);
  }
  lignes.push("Capacités : " + p.capacites.map((c) =>
    c.utilisations_max ? `${c.nom} (${c.utilisations}/${c.utilisations_max})` : c.nom).join(", "));
  lignes.push("Traits : " + p.traits.join(" "));
  lignes.push("Inventaire : " + p.inventaire.map((o) => o.nom + (o.quantite > 1 ? ` x${o.quantite}` : "")).join(", ")
    + ` · ${p.or} po`);
  if (p.conditions.length) lignes.push("Conditions : " + p.conditions.join(", "));
  if (p.pv === 0) {
    const m = p.mort;
    const etat = m.mort ? "MORT" : m.stable ? "stabilisé"
      : `inconscient, jets contre la mort ${m.succes} succès / ${m.echecs} échecs`;
    lignes.push(`ÉTAT : ${etat}`);
  }
  if (p.historique) lignes.push(`Historique : ${p.historique}`);
  if (p.apparence) lignes.push(`Apparence : ${p.apparence}`);
  return lignes.join("\n");
}
