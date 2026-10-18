// Moteur de jeu : état de la partie et actions de règles appelées par l'IA maître du jeu.
//
// L'IA ne modifie jamais la fiche directement : elle appelle ces fonctions (des « outils »),
// qui lancent les dés et appliquent les règles. Chaque action ajoute un événement visible
// dans le récit.

import * as des from "./des.js";
import * as srd from "./srd.js";
import { monstreSRD } from "./regles.js";
import {
  bonusAttaqueArme, bonusAttaqueSort, bonusCompetence, bonusDegatsArme, bonusSauvegarde, ca, ddSort,
  enRage, gagnerNiveau, mod, resistances, signe, sortsConnus,
} from "./personnage.js";

/** Action refusée par les règles ; le message est renvoyé à l'IA pour qu'elle corrige. */
export class ErreurAction extends Error {}

/**
 * Le joueur doit lancer lui-même un d20 : l'action est interrompue, le joueur lance le dé à l'écran,
 * puis l'action est rejouée depuis le début avec le résultat obtenu (voir executerAvecJets).
 */
export class BesoinDeJet extends Error {
  constructor(jet) {
    super("Jet de dé du joueur attendu");
    this.jet = jet;
  }
}

export function nouvelId() {
  const a = new Uint8Array(6);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function nouvellePartie(personnage, scenario) {
  const maintenant = Date.now() / 1000;
  return {
    id: nouvelId(),
    cree_le: maintenant,
    maj_le: maintenant,
    scenario,
    personnage,
    combat: null,
    journal: [],
    resume: "",
    messages: [],
    affichage: [],
  };
}

const minus = (s) => String(s ?? "").trim().toLowerCase();
const mortRemise = () => ({ succes: 0, echecs: 0, stable: false, mort: false });

/** Coup critique : double le nombre de dés (2d6+3 -> 4d6+3). */
export const doublerDes = (f) => multiplierDes(f, 2);
export const multiplierDes = (f, n) => f.replace(/(\d*)d(\d+)/g, (_, a, b) => `${Number(a || 1) * n}d${b}`);

function retirerRage(p) {
  p.conditions = p.conditions.filter((c) => !/\brage\b/i.test(c));
}

export function etatJoueur(p) {
  if (p.mort.mort) return "mort";
  if (p.pv === 0) return p.mort.stable ? "stabilisé" : "inconscient";
  return "conscient";
}

function roll(formule) {
  try {
    return des.lancer(formule);
  } catch (e) {
    throw new ErreurAction(e.message);
  }
}

export const OUTILS_AUTORISES = [
  "jet_de_test", "lancer_des", "commencer_combat", "attaque_joueur", "lancer_sort", "attaque_ennemi",
  "degats_ennemi", "changer_etat_ennemi", "fin_combat", "modifier_pv_joueur", "jet_contre_la_mort",
  "utiliser_capacite", "gerer_inventaire", "modifier_or", "donner_xp", "repos", "modifier_condition",
  "noter_journal",
];

export class Moteur {
  constructor(partie) {
    this.partie = partie;
    this.evenements = [];
    this.interactif = false; // vrai : les d20 du joueur sont lancés par le joueur lui-même
    this.seuilKarma = 0;     // dé karmique : après ce nombre d'échecs d'affilée, avantage (0 = désactivé)
    this.d20Imposes = [];    // résultats déjà lancés par le joueur, consommés dans l'ordre
  }

  get perso() { return this.partie.personnage; }

  evt(texte, type = "de") { this.evenements.push({ type, texte }); }

  // ---- utilitaires

  /**
   * d20 du joueur. En mode interactif, utilise les dés lancés à l'écran ; s'il en manque, demande
   * un lancer (BesoinDeJet). `jet` décrit le lancer pour l'affichage : libelle, bonus, seuil, nomSeuil.
   */
  d20Joueur(avantage = false, desavantage = false, jet = {}) {
    // Dé karmique : après plusieurs échecs d'affilée, la chance tourne (avantage jusqu'à la prochaine réussite).
    const karma = this.karmaActif() && !avantage;
    if (karma) {
      avantage = true;
      jet = { ...jet, karma: true, libelle: `✨ ${jet.libelle ?? "Jet"}` };
    }
    if (avantage && desavantage) avantage = desavantage = false;
    const tirer = (nombre, details) => {
      if (!this.interactif) return Array.from({ length: nombre }, () => des.d(20));
      if (this.d20Imposes.length < nombre) {
        throw new BesoinDeJet({ libelle: "Jet", bonus: 0, ...jet, ...details, avantage, desavantage, nombre });
      }
      return this.d20Imposes.splice(0, nombre);
    };
    const lances = tirer(avantage || desavantage ? 2 : 1, {});
    const r = {
      resultat: avantage ? Math.max(...lances) : desavantage ? Math.min(...lances) : lances[0],
      des: lances,
      karma: karma && !desavantage,
    };
    // Chanceux (halfelin) : un 1 naturel est relancé.
    if (this.perso.race === "Halfelin pied-léger" && r.resultat === 1) {
      const [nouveau] = tirer(1, { libelle: `Chanceux ! Relance du 1 — ${jet.libelle ?? "jet"}`, chanceux: true });
      r.des.push(nouveau);
      r.resultat = nouveau;
      r.chanceux = true;
    }
    return r;
  }

  static desTxt(r) {
    return `d20 [${r.des.join(", ")}]` + (r.chanceux ? " (Chanceux : 1 relancé)" : "")
      + (r.karma ? " (✨ karma : avantage après plusieurs échecs)" : "");
  }

  karmaActif() {
    return this.seuilKarma > 0 && (this.partie.karma_echecs ?? 0) >= this.seuilKarma;
  }

  /** Retient l'issue d'un jet du joueur pour le dé karmique. */
  noterIssue(reussi) {
    this.partie.karma_echecs = reussi ? 0 : Math.min((this.partie.karma_echecs ?? 0) + 1, 20);
  }

  ennemi(ref) {
    const combat = this.partie.combat;
    if (!combat) throw new ErreurAction("Aucun combat en cours. Utilisez commencer_combat d'abord.");
    const r = minus(ref);
    const exact = combat.ennemis.find((e) => e.id.toLowerCase() === r || e.nom.toLowerCase() === r);
    if (exact) return exact;
    const approx = combat.ennemis.find((e) => e.etat !== "vaincu" && r && e.nom.toLowerCase().startsWith(r));
    if (approx) return approx;
    throw new ErreurAction(`Ennemi « ${ref} » introuvable. Ennemis : ${combat.ennemis.map((e) => e.id).join(", ")}`);
  }

  blesserEnnemi(e, degats) {
    e.pv = Math.max(e.pv - degats, 0);
    if (e.etat === "endormi" && degats > 0) e.etat = "actif";
    if (e.pv === 0) {
      e.etat = "vaincu";
      return `${e.id} est vaincu !`;
    }
    return `${e.id} : ${e.pv}/${e.pv_max} PV`;
  }

  blesserJoueur(degats, critique = false) {
    const p = this.perso;
    const m = p.mort;
    if (m.mort) return `${p.nom} est déjà mort.`;
    if (p.pv === 0) {
      m.stable = false;
      m.echecs += critique ? 2 : 1;
      if (degats >= p.pv_max || m.echecs >= 3) {
        m.mort = true;
        return `${p.nom} succombe à ses blessures… (MORT)`;
      }
      return `${p.nom} est touché à terre : ${m.echecs} échec(s) contre la mort.`;
    }
    const reste = p.pv - degats;
    if (reste > 0) {
      p.pv = reste;
      return `${p.nom} : ${p.pv}/${p.pv_max} PV`;
    }
    if (-reste >= p.pv_max) {
      p.pv = 0;
      m.mort = true;
      return `${p.nom} est tué sur le coup ! (MORT)`;
    }
    if (p.race === "Demi-orc" && !p.endurance_utilisee) {
      p.endurance_utilisee = true;
      p.pv = 1;
      return `Endurance implacable ! ${p.nom} reste debout avec 1 PV.`;
    }
    p.pv = 0;
    p.mort = mortRemise();
    retirerRage(p);
    return `${p.nom} tombe à 0 PV et perd connaissance ! (jets contre la mort nécessaires)`;
  }

  /** Applique les résistances du joueur à des dégâts d'un type donné. */
  resister(degats, typeDegats) {
    const type = minus(typeDegats);
    if (type && resistances(this.perso).includes(type)) {
      return { degats: Math.floor(degats / 2), note: ` (résistance ${type} : dégâts divisés par 2)` };
    }
    return { degats, note: "" };
  }

  soignerJoueur(soin) {
    const p = this.perso;
    if (p.mort.mort) return `${p.nom} est mort, les soins ordinaires ne suffisent plus.`;
    const avant = p.pv;
    p.pv = Math.min(p.pv + soin, p.pv_max);
    if (avant === 0 && p.pv > 0) {
      p.mort = mortRemise();
      return `${p.nom} reprend connaissance : ${p.pv}/${p.pv_max} PV`;
    }
    return `${p.nom} : ${p.pv}/${p.pv_max} PV`;
  }

  gagnerXp(montant) {
    const p = this.perso;
    p.xp += montant;
    const niveaux = gagnerNiveau(p);
    for (const n of niveaux) this.evt(`🎉 ${p.nom} passe au niveau ${n} ! (PV max ${p.pv_max})`, "systeme");
    return { xp_total: p.xp, nouveaux_niveaux: niveaux };
  }

  verifierConscient() {
    const p = this.perso;
    if (p.mort.mort) throw new ErreurAction(`${p.nom} est mort.`);
    if (p.pv === 0) {
      throw new ErreurAction(`${p.nom} est inconscient (0 PV) et ne peut pas agir. `
        + "Utilisez jet_contre_la_mort à son tour.");
    }
  }

  // ---- actions (outils)

  jet_de_test({ type, nom, dd = null, avantage = false, desavantage = false, raison = "" }) {
    const p = this.perso;
    nom = String(nom ?? "").trim();
    let bonus;
    let libelle;
    if (type === "competence") {
      const comp = Object.keys(srd.COMPETENCES).find((c) => c.toLowerCase() === nom.toLowerCase());
      if (!comp) throw new ErreurAction(`Compétence inconnue : ${nom}. Choix : ${Object.keys(srd.COMPETENCES).join(", ")}`);
      bonus = bonusCompetence(p, comp);
      libelle = comp;
    } else if (type === "caracteristique" || type === "sauvegarde") {
      let carac = nom.toUpperCase().slice(0, 3);
      carac = { STR: "FOR", WIS: "SAG" }[carac] ?? carac;
      if (!srd.CARACS.includes(carac)) {
        throw new ErreurAction(`Caractéristique inconnue : ${nom}. Choix : ${srd.CARACS.join(", ")}`);
      }
      if (type === "sauvegarde") {
        bonus = bonusSauvegarde(p, carac);
        libelle = `Sauvegarde de ${srd.NOMS_CARACS[carac]}`;
      } else {
        bonus = mod(p.caracs[carac]);
        libelle = srd.NOMS_CARACS[carac];
      }
      if (carac === "FOR" && enRage(p)) avantage = true;
    } else {
      throw new ErreurAction("type doit être 'competence', 'caracteristique' ou 'sauvegarde'");
    }
    const r = this.d20Joueur(avantage, desavantage,
      { libelle: raison ? `${libelle} — ${raison}` : libelle, bonus, seuil: dd || null, nomSeuil: "DD" });
    const total = r.resultat + bonus;
    const res = { test: libelle, des: r.des, bonus, total };
    let txt = `${libelle} : ${Moteur.desTxt(r)} ${signe(bonus)} = ${total}`;
    if (avantage && !desavantage) txt += " (avantage)";
    else if (desavantage && !avantage) txt += " (désavantage)";
    if (dd) {
      res.dd = dd;
      res.reussite = total >= dd;
      this.noterIssue(res.reussite);
      txt += ` vs DD ${dd} → ${total >= dd ? "Réussite" : "Échec"}`;
    }
    if (r.resultat === 20 || r.resultat === 1) res.naturel = r.resultat;
    if (raison) txt += ` — ${raison}`;
    this.evt(txt);
    return res;
  }

  lancer_des({ formule, raison = "" }) {
    const r = roll(formule);
    this.evt(`${raison || "Jet"} : ${formule} → ${r.detail} = ${r.total}`);
    return r;
  }

  commencer_combat({ ennemis, surprise = "" }) {
    if (this.partie.combat) throw new ErreurAction("Un combat est déjà en cours. Terminez-le avec fin_combat.");
    if (!Array.isArray(ennemis) || !ennemis.length) throw new ErreurAction("Il faut au moins un ennemi.");
    const liste = [];
    const compteur = {};
    for (const groupe of ennemis) {
      const nomModele = groupe.modele || groupe.nom;
      const cleModele = Object.keys(srd.MONSTRES).find((k) => k.toLowerCase() === minus(nomModele));
      const nom = groupe.nom || nomModele || "Ennemi";
      const nombre = Math.max(1, Math.min(Number(groupe.nombre) || 1, 12));
      // Bestiaire du jeu d'abord, puis les 300+ monstres du SRD complet (noms anglais : « Owlbear »).
      const base = { ...(cleModele ? srd.MONSTRES[cleModele] : monstreSRD(nomModele) ?? {}) };
      delete base.nom;
      delete base.multiattaque;
      for (const cle of ["ca", "pv", "attaque", "degats", "type_degats", "arme", "sauvegarde", "dex", "xp"]) {
        if (groupe[cle] !== undefined && groupe[cle] !== null && groupe[cle] !== "") base[cle] = groupe[cle];
      }
      if (["ca", "pv", "attaque", "degats"].some((c) => base[c] === undefined)) {
        throw new ErreurAction(`« ${nomModele} » n'est ni dans le bestiaire ni dans le SRD : précisez ca, pv, attaque `
          + `et degats, ou utilisez le nom anglais d'un monstre du SRD (consulter_regles). `
          + `Bestiaire : ${Object.keys(srd.MONSTRES).join(", ")}`);
      }
      for (let i = 0; i < nombre; i++) {
        compteur[nom] = (compteur[nom] ?? 0) + 1;
        const pvBrut = typeof base.pv === "string" && /d/i.test(base.pv) ? roll(base.pv).total : Number(base.pv);
        const pv = Math.max(Number.isFinite(pvBrut) ? Math.round(pvBrut) : 1, 1);
        liste.push({
          nom, ca: Number(base.ca), pv, pv_max: pv, attaque: Number(base.attaque), degats: String(base.degats),
          arme: base.arme ?? "attaque", type_degats: minus(base.type_degats) || null, sauvegarde: Number(base.sauvegarde ?? 0), dex: Number(base.dex ?? 0),
          xp: Number(base.xp ?? 10), etat: "actif",
        });
      }
    }
    const numeros = {};
    for (const e of liste) {
      if (compteur[e.nom] === 1) e.id = e.nom;
      else {
        numeros[e.nom] = (numeros[e.nom] ?? 0) + 1;
        e.id = `${e.nom} ${numeros[e.nom]}`;
      }
    }
    const p = this.perso;
    const initJoueur = this.d20Joueur(false, false,
      { libelle: "Initiative — le combat commence !", bonus: mod(p.caracs.DEX) }).resultat + mod(p.caracs.DEX);
    const ordre = [{ nom: p.nom, init: initJoueur, joueur: true }];
    for (const e of liste) ordre.push({ nom: e.id, init: des.d(20) + e.dex, joueur: false });
    ordre.sort((a, b) => b.init - a.init || Number(b.joueur) - Number(a.joueur));
    this.partie.combat = { round: 1, ennemis: liste, ordre, surprise };
    this.evt("⚔️ Combat ! Initiative : " + ordre.map((o) => `${o.nom} ${o.init}`).join(", "), "systeme");
    return {
      ordre_initiative: ordre,
      ennemis: liste.map(({ id, ca: c, pv, attaque, degats, type_degats, arme }) => ({ id, ca: c, pv, attaque, degats, type_degats, arme })),
      surprise: surprise || null,
    };
  }

  attaque_joueur({ arme, cible, avantage = false, desavantage = false, degats_bonus = "" }) {
    this.verifierConscient();
    const p = this.perso;
    const n = minus(arme);
    let a = p.armes.find((x) => x.nom.toLowerCase() === n) ?? p.armes.find((x) => n && x.nom.toLowerCase().includes(n));
    if (!a) {
      if (["mains nues", "poing", "poings", "coup de poing"].includes(n)) a = { nom: "Mains nues", ...srd.ARMES["Mains nues"] };
      else throw new ErreurAction(`Arme « ${arme} » absente de la fiche. Armes : ${p.armes.map((x) => x.nom).join(", ")}`);
    }
    const e = this.ennemi(cible);
    if (e.etat === "vaincu") throw new ErreurAction(`${e.id} est déjà vaincu.`);
    if (e.etat === "endormi") avantage = true;
    const bonus = bonusAttaqueArme(p, a);
    const r = this.d20Joueur(avantage, desavantage,
      { libelle: `Attaque (${a.nom}) contre ${e.id}`, bonus, seuil: e.ca, nomSeuil: "CA", attaque: true });
    const total = r.resultat + bonus;
    const critique = r.resultat === 20;
    const touche = critique || (r.resultat !== 1 && total >= e.ca);
    this.noterIssue(touche);
    let txt = `Attaque (${a.nom}) contre ${e.id} : ${Moteur.desTxt(r)} ${signe(bonus)} = ${total} vs CA ${e.ca}`;
    const res = { arme: a.nom, cible: e.id, jet: total, ca_cible: e.ca, touche, critique };
    if (!touche) {
      this.evt(txt + " → Raté");
      return res;
    }
    let formule = a.degats;
    let bonusDeg = bonusDegatsArme(p, a);
    if (enRage(p) && !a.distance) bonusDeg += 2;
    if (degats_bonus) formule += "+" + String(degats_bonus).replace(/^\+/, "");
    if (critique) {
      formule = doublerDes(formule);
      if (p.race === "Demi-orc" && !a.distance) formule += "+" + a.degats;
    }
    const rd = roll(formule);
    const degats = Math.max(rd.total + bonusDeg, 1);
    const etat = this.blesserEnnemi(e, degats);
    txt += ` → ${critique ? "CRITIQUE ! " : "Touché ! "}Dégâts ${formule}${signe(bonusDeg)} : ${rd.detail} = ${degats} ${a.type}. ${etat}`;
    this.evt(txt);
    return { ...res, degats, pv_restants: e.pv, etat_cible: e.etat };
  }

  lancer_sort({ sort, cibles = [], niveau_emplacement = null }) {
    this.verifierConscient();
    const p = this.perso;
    const nom = sortsConnus(p).find((s) => s.toLowerCase() === minus(sort));
    if (!nom) {
      throw new ErreurAction(`${p.nom} ne connaît pas le sort « ${sort} ». Sorts : ${sortsConnus(p).join(", ") || "aucun"}`);
    }
    const s = srd.SORTS[nom];
    let niveau = s.niveau;
    if (niveau > 0) {
      niveau = Math.max(Number(niveau_emplacement) || niveau, niveau);
      const empl = p.emplacements[niveau];
      if (!empl) throw new ErreurAction(`Aucun emplacement de niveau ${niveau}.`);
      if (empl.restants <= 0) {
        const dispo = Object.entries(p.emplacements)
          .filter(([n, e]) => e.restants > 0 && Number(n) >= s.niveau).map(([n]) => n);
        throw new ErreurAction(`Plus d'emplacement de niveau ${niveau}. `
          + (dispo.length ? `Disponibles : niveau ${dispo.join(", ")}` : "Plus aucun emplacement : un repos long est nécessaire."));
      }
      empl.restants -= 1;
    }
    const sup = s.niveau > 0 ? niveau - s.niveau : 0;
    const multMineur = s.niveau === 0 ? 1 + (p.niveau >= 5) + (p.niveau >= 11) : 1;
    const formule = (cle) => {
      let f = multMineur > 1 ? multiplierDes(s[cle], multMineur) : s[cle];
      if (sup && s.par_niveau) f += "+" + multiplierDes(s.par_niveau, sup);
      return f;
    };
    const entete = `✨ ${p.nom} lance ${nom}` + (niveau ? ` (niveau ${niveau})` : "");
    const res = { sort: nom, niveau, description: s.description, resultats: [] };
    cibles = (Array.isArray(cibles) ? cibles : [cibles]).filter(Boolean).map(String);
    const modSort = mod(p.caracs[srd.CLASSES[p.classe].lanceur ?? "CHA"]);

    if (s.type === "special") {
      if (s.effet === "armure_du_mage") {
        p.armure_du_mage = true;
        res.nouvelle_ca = ca(p);
      }
      this.evt(`${entete} : ${s.description}`);
    } else if (s.type === "soin") {
      const f = formule("soin");
      const r = roll(f);
      const bonus = modSort + (p.classe === "Clerc" ? 2 + niveau : 0);
      const total = Math.max(r.total + bonus, 1);
      const lignes = [];
      for (const c of cibles.length ? cibles : ["joueur"]) {
        if (["joueur", "moi", p.nom.toLowerCase()].includes(c.toLowerCase())) {
          lignes.push(this.soignerJoueur(total));
          res.resultats.push({ cible: p.nom, soin: total, pv: p.pv });
        } else {
          lignes.push(`${c} récupère ${total} PV`);
          res.resultats.push({ cible: c, soin: total });
        }
      }
      this.evt(`${entete} : ${f}${signe(bonus)} → ${r.detail} = ${total} PV. ${lignes.join(" ; ")}`);
    } else if (s.type === "sommeil") {
      const r = roll(formule("degats"));
      let reserve = r.total;
      const endormis = [];
      if (this.partie.combat) {
        let candidats = this.partie.combat.ennemis.filter((e) => e.etat === "actif");
        if (cibles.length) {
          const ids = cibles.map((c) => this.ennemi(c).id);
          candidats = candidats.filter((e) => ids.includes(e.id));
        }
        for (const e of [...candidats].sort((a, b) => a.pv - b.pv)) {
          if (e.pv > reserve) break;
          reserve -= e.pv;
          e.etat = "endormi";
          endormis.push(e.id);
        }
      }
      res.resultats = { pv_endormis: r.total, endormis };
      this.evt(`${entete} : ${r.detail} = ${r.total} PV de créatures. Endormis : ${endormis.join(", ") || "personne"}`);
    } else {
      if (!cibles.length) throw new ErreurAction("Ce sort nécessite au moins une cible (id d'ennemi).");
      const lignes = [];
      if (s.type === "attaque") {
        const nb = (s.rayons ?? 1) + (s.rayons ? sup : 0);
        const bonus = bonusAttaqueSort(p);
        for (let i = 0; i < nb; i++) {
          const e = this.ennemi(cibles[i % cibles.length]);
          if (e.etat === "vaincu") {
            lignes.push(`${e.id} est déjà vaincu`);
            continue;
          }
          const r = this.d20Joueur(e.etat === "endormi", false,
            { libelle: `${nom} contre ${e.id}`, bonus, seuil: e.ca, nomSeuil: "CA", attaque: true });
          const total = r.resultat + bonus;
          const crit = r.resultat === 20;
          const debut = `${e.id} : ${Moteur.desTxt(r)} ${signe(bonus)} = ${total} vs CA ${e.ca} → `;
          const reussi = crit || (r.resultat !== 1 && total >= e.ca);
          this.noterIssue(reussi);
          if (reussi) {
            let f = formule("degats");
            if (crit) f = doublerDes(f);
            const rd = roll(f);
            const deg = Math.max(rd.total + (s.ajoute_mod ? modSort : 0), 1);
            const etat = this.blesserEnnemi(e, deg);
            lignes.push(`${debut}${crit ? "CRITIQUE ! " : "Touché ! "}${rd.detail} = ${deg} ${s.degats_type}. ${etat}`);
            res.resultats.push({ cible: e.id, touche: true, degats: deg, pv: e.pv, etat: e.etat });
          } else {
            lignes.push(`${debut}Raté`);
            res.resultats.push({ cible: e.id, touche: false });
          }
        }
      } else if (s.type === "auto") {
        const nb = s.projectiles + sup;
        for (let i = 0; i < nb; i++) {
          const e = this.ennemi(cibles[i % cibles.length]);
          if (e.etat === "vaincu") continue;
          const rd = roll(s.degats);
          const etat = this.blesserEnnemi(e, rd.total);
          lignes.push(`${e.id} : ${rd.detail} = ${rd.total} ${s.degats_type}. ${etat}`);
          res.resultats.push({ cible: e.id, degats: rd.total, pv: e.pv, etat: e.etat });
        }
      } else {
        const dd = ddSort(p);
        const rd = roll(formule("degats"));
        for (const c of cibles) {
          const e = this.ennemi(c);
          if (e.etat === "vaincu") continue;
          const sauv = des.d(20) + e.sauvegarde;
          const reussi = sauv >= dd;
          const deg = reussi ? (s.moitie ? Math.floor(rd.total / 2) : 0) : rd.total;
          const etat = deg ? this.blesserEnnemi(e, deg) : `${e.id} : ${e.pv}/${e.pv_max} PV`;
          lignes.push(`${e.id} sauvegarde ${sauv} vs DD ${dd} → ${reussi ? "réussie" : "ratée"}, ${deg} ${s.degats_type}. ${etat}`);
          res.resultats.push({ cible: e.id, sauvegarde_reussie: reussi, degats: deg, pv: e.pv, etat: e.etat });
        }
      }
      this.evt(`${entete} — ${lignes.join(" | ")}`);
    }
    if (niveau > 0) {
      res.emplacements_restants = Object.fromEntries(Object.entries(p.emplacements).map(([n, e]) => [n, e.restants]));
    }
    return res;
  }

  attaque_ennemi({ ennemi, cible = "joueur", avantage = false, desavantage = false, type_degats = "" }) {
    const e = this.ennemi(ennemi);
    if (e.etat === "vaincu") throw new ErreurAction(`${e.id} est vaincu et ne peut plus attaquer.`);
    if (e.etat === "endormi") throw new ErreurAction(`${e.id} est endormi magiquement et ne peut pas agir.`);
    const p = this.perso;
    const visJoueur = ["joueur", p.nom.toLowerCase()].includes(minus(cible) || "joueur");
    if (visJoueur && p.pv === 0) avantage = true;
    const r = des.d20(avantage, desavantage);
    const total = r.resultat + e.attaque;
    const critique = r.resultat === 20;
    const nomCible = visJoueur ? p.nom : cible;
    const caCible = visJoueur ? ca(p) : null;
    const touche = critique || (r.resultat !== 1 && (caCible === null || total >= caCible));
    let txt = `${e.id} attaque ${nomCible} (${e.arme}) : d20 [${r.des.join(", ")}] ${signe(e.attaque)} = ${total}`;
    if (caCible !== null) txt += ` vs CA ${caCible}`;
    const res = { attaquant: e.id, cible: nomCible, jet: total, touche, critique };
    if (!touche) {
      this.evt(txt + " → Raté");
      return res;
    }
    const rd = roll(critique ? doublerDes(e.degats) : e.degats);
    const typeDegats = minus(type_degats) || e.type_degats || "";
    let degats = Math.max(rd.total, 1);
    let note = "";
    if (visJoueur) ({ degats, note } = this.resister(degats, typeDegats));
    const calcul = note ? `${rd.detail} = ${Math.max(rd.total, 1)} → ${degats}` : `${rd.detail} = ${degats}`;
    txt += ` → ${critique ? "CRITIQUE ! " : "Touché ! "}${calcul} dégâts${typeDegats ? ` ${typeDegats}` : ""}${note}.`;
    res.degats = degats;
    res.type_degats = typeDegats || null;
    if (note) res.resistance = true;
    if (visJoueur) {
      txt += " " + this.blesserJoueur(degats, critique);
      res.pv_joueur = p.pv;
      res.etat_joueur = etatJoueur(p);
    } else {
      txt += " (à appliquer à ce personnage non-joueur)";
    }
    this.evt(txt);
    return res;
  }

  degats_ennemi({ ennemi, formule, raison = "" }) {
    const e = this.ennemi(ennemi);
    const rd = roll(String(formule));
    const etat = this.blesserEnnemi(e, Math.max(rd.total, 0));
    this.evt(`${raison || "Dégâts"} sur ${e.id} : ${rd.detail} = ${rd.total}. ${etat}`);
    return { cible: e.id, degats: rd.total, pv: e.pv, etat: e.etat };
  }

  changer_etat_ennemi({ ennemi, etat }) {
    const e = this.ennemi(ennemi);
    if (!["actif", "enfui", "rendu", "vaincu"].includes(etat)) {
      throw new ErreurAction("etat doit être actif, enfui, rendu ou vaincu");
    }
    e.etat = etat;
    this.evt(`${e.id} : ${etat}`, "systeme");
    return { ennemi: e.id, etat };
  }

  fin_combat({ issue = "victoire" } = {}) {
    const combat = this.partie.combat;
    if (!combat) throw new ErreurAction("Aucun combat en cours.");
    const xp = combat.ennemis
      .filter((e) => e.etat === "vaincu" || e.etat === "rendu" || (issue === "victoire" && e.etat === "endormi"))
      .reduce((s, e) => s + e.xp, 0);
    this.partie.combat = null;
    const p = this.perso;
    retirerRage(p);
    this.evt(`Fin du combat (${issue}). +${xp} XP`, "systeme");
    const res = { issue, xp_gagne: xp };
    return xp ? { ...res, ...this.gagnerXp(xp) } : res;
  }

  modifier_pv_joueur({ type, formule, raison = "", type_degats = "" }) {
    const rd = roll(String(formule));
    let montant = Math.max(rd.total, 0);
    let etat;
    let note = "";
    if (type === "soin") etat = this.soignerJoueur(montant);
    else if (type === "degats") {
      ({ degats: montant, note } = this.resister(montant, type_degats));
      etat = this.blesserJoueur(montant);
    } else throw new ErreurAction("type doit être 'degats' ou 'soin'");
    const libelle = raison || (type === "soin" ? "Soin" : "Dégâts");
    const unite = type === "soin" ? "PV soignés" : `dégâts${type_degats ? ` ${minus(type_degats)}` : ""}`;
    const calcul = note ? `${rd.detail} = ${rd.total} → ${montant}` : `${rd.detail} = ${montant}`;
    this.evt(`${libelle} : ${calcul} ${unite}${note}. ${etat}`);
    const p = this.perso;
    return { montant, pv: p.pv, pv_max: p.pv_max, etat_joueur: etatJoueur(p) };
  }

  jet_contre_la_mort() {
    const p = this.perso;
    const m = p.mort;
    if (p.pv > 0) throw new ErreurAction(`${p.nom} n'est pas à 0 PV.`);
    if (m.mort || m.stable) throw new ErreurAction(`${p.nom} est ${m.mort ? "mort" : "stabilisé"}.`);
    const r = this.d20Joueur(false, false,
      { libelle: `Jet contre la mort (${m.succes} ✓ / ${m.echecs} ✗)`, bonus: 0, seuil: 10, nomSeuil: "réussite à" });
    const v = r.resultat;
    this.noterIssue(v >= 10);
    let txt;
    if (v === 20) {
      p.pv = 1;
      p.mort = mortRemise();
      txt = "20 naturel ! Reprend connaissance avec 1 PV.";
    } else if (v === 1) {
      m.echecs += 2;
      txt = "1 naturel : deux échecs.";
    } else if (v >= 10) {
      m.succes += 1;
      txt = "Succès.";
    } else {
      m.echecs += 1;
      txt = "Échec.";
    }
    if (m.echecs >= 3) {
      m.mort = true;
      txt += ` ${p.nom} est MORT.`;
    } else if (m.succes >= 3) {
      m.stable = true;
      txt += ` ${p.nom} est stabilisé (inconscient, 0 PV).`;
    }
    this.evt(`Jet contre la mort : ${Moteur.desTxt(r)} → ${txt} (${p.mort.succes} succès / ${p.mort.echecs} échecs)`);
    return { de: v, succes: p.mort.succes, echecs: p.mort.echecs, etat_joueur: etatJoueur(p) };
  }

  utiliser_capacite({ nom }) {
    this.verifierConscient();
    const p = this.perso;
    const cap = p.capacites.find((c) => c.nom.toLowerCase() === minus(nom));
    if (!cap) throw new ErreurAction("Capacité inconnue. Capacités : " + p.capacites.map((c) => c.nom).join(", "));
    if (cap.utilisations_max == null) {
      return { capacite: cap.nom, description: cap.description, note: "Capacité passive ou sans limite d'utilisation." };
    }
    if (cap.utilisations <= 0) {
      throw new ErreurAction(`${cap.nom} n'a plus d'utilisation (recharge : repos ${cap.recharge}).`);
    }
    cap.utilisations -= 1;
    const res = { capacite: cap.nom, utilisations_restantes: cap.utilisations };
    if (cap.effet === "second_souffle") {
      const rd = roll(`1d10+${p.niveau}`);
      const etat = this.soignerJoueur(rd.total);
      this.evt(`Second souffle : ${rd.detail} = ${rd.total} PV. ${etat}`);
      res.soin = rd.total;
    } else if (cap.effet === "rage") {
      if (!enRage(p)) p.conditions.push("Rage");
      this.evt(`🔥 ${p.nom} entre en Rage !`);
    } else {
      this.evt(`${p.nom} utilise ${cap.nom}.`);
    }
    return res;
  }

  gerer_inventaire({ action, objet, quantite = 1 }) {
    const p = this.perso;
    quantite = Math.max(Math.trunc(Number(quantite)) || 1, 1);
    objet = String(objet ?? "").trim();
    if (!objet) throw new ErreurAction("Nom d'objet manquant.");
    const existant = p.inventaire.find((o) => o.nom.toLowerCase() === objet.toLowerCase());
    const qte = quantite > 1 ? ` x${quantite}` : "";
    if (action === "ajouter") {
      if (existant) existant.quantite += quantite;
      else p.inventaire.push({ nom: objet, quantite });
      const nomArme = Object.keys(srd.ARMES).find((k) => k.toLowerCase() === objet.toLowerCase());
      if (nomArme && !p.armes.some((a) => a.nom === nomArme)) p.armes.push({ nom: nomArme, ...srd.ARMES[nomArme] });
      this.evt(`🎒 Obtenu : ${objet}${qte}`, "systeme");
    } else if (action === "retirer") {
      if (!existant) {
        const arme = p.armes.find((a) => a.nom.toLowerCase() === objet.toLowerCase());
        if (!arme) throw new ErreurAction(`« ${objet} » n'est pas dans l'inventaire.`);
        p.armes = p.armes.filter((a) => a !== arme);
        this.evt(`🎒 Perdu : ${objet}`, "systeme");
        return { inventaire: p.inventaire };
      }
      existant.quantite -= quantite;
      if (existant.quantite <= 0) p.inventaire = p.inventaire.filter((o) => o !== existant);
      this.evt(`🎒 Retiré : ${objet}${qte}`, "systeme");
    } else {
      throw new ErreurAction("action doit être 'ajouter' ou 'retirer'");
    }
    return { inventaire: p.inventaire };
  }

  modifier_or({ montant, raison = "" }) {
    const p = this.perso;
    montant = Math.trunc(Number(montant));
    if (!Number.isFinite(montant)) throw new ErreurAction("montant invalide");
    if (p.or + montant < 0) throw new ErreurAction(`${p.nom} n'a que ${p.or} po.`);
    p.or += montant;
    this.evt(`💰 ${signe(montant)} po (${raison || "or"}) → ${p.or} po`, "systeme");
    return { or: p.or };
  }

  donner_xp({ montant, raison = "" }) {
    montant = Math.max(Math.trunc(Number(montant)) || 0, 0);
    this.evt(`⭐ +${montant} XP${raison ? ` (${raison})` : ""}`, "systeme");
    return this.gagnerXp(montant);
  }

  repos({ type }) {
    const p = this.perso;
    if (this.partie.combat) throw new ErreurAction("Impossible de se reposer pendant un combat.");
    if (p.mort.mort) throw new ErreurAction(`${p.nom} est mort.`);
    if (type === "court") {
      let soinTotal = 0;
      const dv = p.des_de_vie;
      const details = [];
      while (dv.restants > 0 && p.pv_max - p.pv >= Math.floor(dv.faces / 2) + 1) {
        dv.restants -= 1;
        const gain = Math.max(roll(`1d${dv.faces}`).total + mod(p.caracs.CON), 1);
        details.push(String(gain));
        soinTotal += gain;
        p.pv = Math.min(p.pv + gain, p.pv_max);
      }
      if (p.pv > 0) p.mort = mortRemise();
      for (const c of p.capacites) if (c.recharge === "court") c.utilisations = c.utilisations_max;
      const e1 = p.emplacements["1"];
      if (p.classe === "Magicien" && !p.restauration_utilisee && e1 && e1.restants < e1.max) {
        e1.restants += 1;
        p.restauration_utilisee = true;
        details.push("Restauration arcanique : +1 emplacement niv.1");
      }
      this.evt(`🏕️ Repos court : +${soinTotal} PV ${details.length ? `(${details.join(", ")}) ` : ""}→ ${p.pv}/${p.pv_max} PV`, "systeme");
    } else if (type === "long") {
      p.pv = p.pv_max;
      p.mort = mortRemise();
      const dv = p.des_de_vie;
      dv.restants = Math.min(dv.restants + Math.max(Math.floor(p.niveau / 2), 1), p.niveau);
      for (const e of Object.values(p.emplacements)) e.restants = e.max;
      for (const c of p.capacites) if (c.utilisations_max != null) c.utilisations = c.utilisations_max;
      p.endurance_utilisee = false;
      p.restauration_utilisee = false;
      retirerRage(p);
      this.evt(`🌙 Repos long : PV, sorts et capacités restaurés (${p.pv}/${p.pv_max} PV)`, "systeme");
    } else {
      throw new ErreurAction("type doit être 'court' ou 'long'");
    }
    return { pv: p.pv, pv_max: p.pv_max, emplacements: p.emplacements, des_de_vie_restants: p.des_de_vie.restants };
  }

  modifier_condition({ action, condition }) {
    const p = this.perso;
    condition = String(condition ?? "").trim();
    if (/\brage\b/i.test(condition)) {
      if (action === "ajouter" && !enRage(p)) {
        throw new ErreurAction("Pour entrer en Rage, utilise utiliser_capacite avec nom 'Rage' "
          + "(cela décompte une utilisation et active ses effets).");
      }
      if (action === "retirer") {
        retirerRage(p);
        this.evt("➖ La Rage prend fin.", "systeme");
        return { conditions: p.conditions };
      }
    }
    if (action === "ajouter") {
      if (condition && !p.conditions.includes(condition)) p.conditions.push(condition);
    } else if (action === "retirer") {
      p.conditions = p.conditions.filter((c) => c.toLowerCase() !== condition.toLowerCase());
    } else {
      throw new ErreurAction("action doit être 'ajouter' ou 'retirer'");
    }
    this.evt(`${action === "ajouter" ? "➕" : "➖"} Condition : ${condition}`, "systeme");
    return { conditions: p.conditions };
  }

  noter_journal({ note }) {
    note = String(note ?? "").trim();
    if (note) {
      this.partie.journal.push(note);
      this.partie.journal = this.partie.journal.slice(-60);
    }
    return { ok: true, nombre_notes: this.partie.journal.length };
  }

  // ---- répartiteur

  executer(nom, args) {
    if (!OUTILS_AUTORISES.includes(nom)) return { erreur: `Outil inconnu : ${nom}` };
    try {
      return this[nom](args && typeof args === "object" ? args : {});
    } catch (e) {
      if (e instanceof BesoinDeJet) throw e;
      if (e instanceof ErreurAction) return { erreur: e.message };
      return { erreur: `Arguments invalides pour ${nom} : ${e.message}` };
    }
  }

  /**
   * Exécute un outil ; si le joueur doit lancer un d20, attend son lancer (demanderJet) puis rejoue
   * l'action depuis l'état de départ avec les dés obtenus. Sans demanderJet, les dés sont automatiques.
   */
  async executerAvecJets(nom, args, demanderJet) {
    if (!demanderJet) return this.executer(nom, args);
    const depart = structuredClone(this.partie);
    const nbEvenements = this.evenements.length;
    const lances = [];
    this.interactif = true;
    try {
      for (;;) {
        this.d20Imposes = [...lances];
        try {
          return this.executer(nom, args);
        } catch (e) {
          if (!(e instanceof BesoinDeJet)) throw e;
          // On revient à l'état d'avant l'action, le temps que le joueur lance son dé.
          for (const cle of Object.keys(this.partie)) delete this.partie[cle];
          Object.assign(this.partie, structuredClone(depart));
          this.evenements.length = nbEvenements;
          lances.push(...await demanderJet(e.jet));
        }
      }
    } finally {
      this.interactif = false;
      this.d20Imposes = [];
    }
  }
}
