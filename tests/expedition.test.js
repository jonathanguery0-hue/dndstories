import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import * as des from "../js/des.js";
import { HEROS, NB_ETAGES, ORDRE_HEROS, xpPourNiveau } from "../js/expedition/donnees.js";
import * as M from "../js/expedition/moteur.js";
import { exporter, importer } from "../js/expedition/sauvegarde.js";
import { texteSecours } from "../js/expedition/narrateur.js";

beforeEach(() => des.definirGraine(7));

const profilComplet = () => {
  const p = M.creerProfil();
  p.debloques.push("clerc");
  return p;
};

/** Joue une expédition entière avec une stratégie simple. Renvoie la course terminée. */
function jouerExpedition(profil, heroId, difficulte = "normal") {
  const course = M.nouvelleCourse(profil, heroId, difficulte);
  for (let salles = 0; salles < 20 && !course.terminee; salles++) {
    const acces = M.sallesAccessibles(course);
    assert.ok(acces.length, "il doit toujours y avoir une salle accessible");
    M.entrerSalle(profil, course, acces[0]);
    for (let garde = 0; garde < 300; garde++) {
      const s = course.salle;
      if (s.type === "combat") {
        if (s.issue) break;
        const st = M.statsCourse(profil, course);
        const offensives = M.actionsDisponibles(profil, course).competences.filter((c) => c.possible && c.type !== "buff" && c.type !== "soin");
        let action = { type: "attaque" };
        if (course.pv < st.pvMax / 3 && course.objets.potion) action = { type: "objet", id: "potion" };
        else if (s.ennemis.some((e) => e.prepare && !e.mort)) action = { type: "defense" };
        else if (offensives.length) action = { type: "competence", id: offensives[0].id };
        M.jouerAction(profil, course, action);
      } else if (s.type === "evenement") {
        const ev = M.evenementCourant(course);
        const i = ev.choix.findIndex((c) => !c.cout || c.cout <= course.or);
        M.choisirEvenement(profil, course, i);
        if (course.salle.type !== "combat") break;
      } else if (s.type === "tresor") {
        M.prendreTresor(profil, course);
        break;
      } else if (s.type === "marchand") {
        M.quitterSalle(course);
        break;
      } else if (s.type === "repos") {
        M.reposer(profil, course, "dormir");
        break;
      }
    }
  }
  assert.ok(course.terminee, "l'expédition doit se terminer");
  return course;
}

// ------------------------------------------------------------------ profil et progression

test("un profil neuf : trois héros débloqués, niveau 1, pas d'or", () => {
  const p = M.creerProfil();
  assert.deepEqual(p.debloques, ["guerrier", "mage", "roublard"]);
  assert.equal(p.or, 0);
  for (const id of ORDRE_HEROS) assert.equal(p.heros[id].niveau, 1);
});

test("normaliserProfil répare un profil incomplet ou ancien", () => {
  const p = M.normaliserProfil({ or: 50, heros: { mage: { niveau: 3, talents: ["m_puissance", "inconnu"] } }, debloques: ["clerc", "pirate"] });
  assert.equal(p.or, 50);
  assert.equal(p.heros.mage.niveau, 3);
  assert.deepEqual(p.heros.mage.talents, ["m_puissance"]);
  assert.deepEqual(p.heros.guerrier.forge, { arme: 0, armure: 0, talisman: 0 });
  assert.ok(p.debloques.includes("clerc"));
  assert.ok(!p.debloques.includes("pirate"));
  assert.deepEqual(M.normaliserProfil(null).heros.guerrier.niveau, 1);
});

test("gagner de l'XP fait monter de niveau et donne des points de talent", () => {
  const p = M.creerProfil();
  assert.equal(M.gagnerXP(p, "guerrier", xpPourNiveau(1) + xpPourNiveau(2) + 10), 2);
  assert.equal(p.heros.guerrier.niveau, 3);
  assert.equal(p.heros.guerrier.xp, 10);
  assert.equal(M.pointsDisponibles(p.heros.guerrier), 2);
  M.gagnerXP(p, "guerrier", 1e6);
  assert.equal(p.heros.guerrier.niveau, 10);
  assert.equal(M.gagnerXP(p, "guerrier", 500), 0);
});

test("les talents suivent l'ordre de la branche et coûtent un point", () => {
  const p = M.creerProfil();
  assert.match(M.blocageTalent(p, "guerrier", "g_peau"), /point/);
  p.heros.guerrier.niveau = 3;
  assert.match(M.blocageTalent(p, "guerrier", "g_robuste"), /précédent/);
  M.apprendreTalent(p, "guerrier", "g_peau");
  M.apprendreTalent(p, "guerrier", "g_robuste");
  assert.throws(() => M.apprendreTalent(p, "guerrier", "g_rempart"), /point/);
  const st = M.statsHeros(p, "guerrier");
  const base = M.statsHeros(M.creerProfil(), "guerrier");
  assert.equal(st.ca, base.ca + 1);
  M.oublierTalents(p, "guerrier");
  assert.equal(M.pointsDisponibles(p.heros.guerrier), 2);
});

test("un talent peut débloquer une nouvelle compétence", () => {
  const p = M.creerProfil();
  p.heros.mage.niveau = 4;
  for (const t of ["m_puissance", "m_reserve", "m_boule"]) M.apprendreTalent(p, "mage", t);
  assert.ok(M.statsHeros(p, "mage").competences.includes("boule_de_feu"));
});

test("statistiques : niveaux, forge et reliques", () => {
  const p = M.creerProfil();
  const n1 = M.statsHeros(p, "guerrier");
  assert.equal(n1.att, 2 + 3); // maîtrise + FOR
  p.heros.guerrier.niveau = 4;
  const n4 = M.statsHeros(p, "guerrier");
  assert.equal(n4.caracs.FOR, 18); // amélioration de caractéristique au niveau 4
  assert.ok(n4.pvMax > n1.pvMax);
  p.or = 1000;
  M.acheterForge(p, "guerrier", "arme");
  M.acheterForge(p, "guerrier", "talisman");
  const forge = M.statsHeros(p, "guerrier");
  assert.equal(forge.att, n4.att + 1);
  assert.equal(forge.pvMax, n4.pvMax + 5);
  assert.equal(M.statsHeros(p, "guerrier", ["cape_ombre"]).ca, forge.ca + 1);
});

test("la forge coûte de l'or et s'arrête au niveau maximum", () => {
  const p = M.creerProfil();
  assert.throws(() => M.acheterForge(p, "mage", "armure"), /or/);
  p.or = 10000;
  for (let i = 0; i < 3; i++) M.acheterForge(p, "mage", "armure");
  assert.equal(M.prixForge(p, "mage", "armure"), null);
  assert.throws(() => M.acheterForge(p, "mage", "armure"), /maximum/);
});

test("les provisions de l'apothicaire partent avec le héros", () => {
  const p = M.creerProfil();
  p.or = 500;
  M.acheterProvision(p, "ether");
  M.acheterProvision(p, "potion");
  M.acheterProvision(p, "potion");
  assert.throws(() => M.acheterProvision(p, "bombe"), /3 provisions/);
  const c = M.nouvelleCourse(p, "guerrier", "normal");
  assert.equal(c.objets.potion, 4); // 2 offertes + 2 achetées
  assert.equal(c.objets.ether, 1);
  assert.deepEqual(p.provisions, {});
});

// ------------------------------------------------------------------ carte

test("la carte : tout est relié, marchand au milieu, feu de camp avant le boss", () => {
  for (let i = 0; i < 300; i++) {
    const carte = M.genererCarte();
    assert.equal(carte.etages.length, NB_ETAGES);
    assert.ok(carte.etages[0].every((s) => s.type === "combat"));
    assert.ok(carte.etages[3].some((s) => s.type === "marchand"));
    assert.ok(carte.etages[NB_ETAGES - 1].some((s) => s.type === "repos"));
    assert.ok(carte.etages[NB_ETAGES - 1].every((s) => s.suivants.includes("boss")));
    for (let e = 1; e < NB_ETAGES; e++) {
      for (const s of carte.etages[e]) {
        assert.ok(carte.etages[e - 1].some((p) => p.suivants.includes(s.id)), `la salle ${s.id} doit être accessible`);
      }
    }
    for (const s of carte.etages.flat()) assert.ok(s.suivants.length >= 1);
    const types = carte.etages.flat().map((s) => s.type);
    assert.ok(types.filter((t) => t === "marchand").length <= 2);
  }
});

test("on ne peut entrer que dans une salle accessible", () => {
  const p = M.creerProfil();
  const c = M.nouvelleCourse(p, "guerrier", "normal");
  assert.throws(() => M.entrerSalle(p, c, "boss"), /accessible/);
  M.entrerSalle(p, c, "0-0");
  assert.deepEqual(M.sallesAccessibles(c), []); // il faut d'abord finir le combat
});

// ------------------------------------------------------------------ combat

test("un critique double les dés de dégâts, pas le bonus", () => {
  for (let i = 0; i < 200; i++) {
    const r = M.lancerDegats("1d6+3", true);
    assert.ok(r >= 5 && r <= 15);
  }
});

test("se défendre augmente la CA pendant le tour et rend un PM", () => {
  const p = M.creerProfil();
  const c = M.nouvelleCourse(p, "guerrier", "normal");
  M.entrerSalle(p, c, "0-0");
  c.pm = 0;
  const st = M.statsCourse(p, c);
  const evs = M.jouerAction(p, c, { type: "defense" });
  const jets = evs.filter((e) => e.type === "jet" && e.cible === "heros");
  assert.ok(jets.length >= 1);
  for (const j of jets) assert.equal(j.ca, st.ca + st.garde);
  assert.equal(c.pm, 2); // +1 (défense) +1 (fin du round)
});

test("une potion soigne et disparaît du sac", () => {
  const p = M.creerProfil();
  const c = M.nouvelleCourse(p, "guerrier", "normal");
  M.entrerSalle(p, c, "0-0");
  c.pv = 5;
  const evs = M.jouerAction(p, c, { type: "objet", id: "potion" });
  assert.ok(evs.some((e) => e.type === "soin" && e.montant >= 6));
  assert.equal(c.objets.potion, 1);
});

test("les compétences dépensent des PM et respectent leurs limites", () => {
  const p = M.creerProfil();
  const c = M.nouvelleCourse(p, "guerrier", "normal");
  M.entrerSalle(p, c, "0-0");
  c.pm = 1;
  assert.throws(() => M.jouerAction(p, c, { type: "competence", id: "coup_puissant" }), /PM/);
  c.pv = 3;
  M.jouerAction(p, c, { type: "competence", id: "second_souffle" });
  if (!c.salle.issue) {
    assert.throws(() => M.jouerAction(p, c, { type: "competence", id: "second_souffle" }), /Déjà/);
    const dispo = M.actionsDisponibles(p, c).competences.find((x) => x.id === "second_souffle");
    assert.equal(dispo.possible, false);
  }
});

test("une victoire donne de l'or, de l'XP et rend 20 % des PV", () => {
  const p = M.creerProfil();
  const c = M.nouvelleCourse(p, "guerrier", "normal");
  M.entrerSalle(p, c, "0-0");
  for (const e of c.salle.ennemis) { e.pv = 1; e.ca = 1; }
  c.pv = 10;
  for (let i = 0; i < 30 && !c.salle.issue; i++) {
    c.pv = Math.max(c.pv, 10);
    M.jouerAction(p, c, { type: "attaque" });
  }
  assert.equal(c.salle.issue, "victoire");
  assert.ok(c.salle.butin.xp > 0);
  assert.ok(c.or > 0 || c.salle.butin.or === 0);
  assert.ok(c.pv > 10, "le souffle après la bataille rend des PV");
  assert.ok(c.salle.fini);
  assert.ok(M.sallesAccessibles(c).length >= 1);
});

test("Grokk prévient avant son coup de massue et appelle des gardes à mi-vie", () => {
  const p = M.creerProfil();
  p.heros.guerrier.niveau = 10;
  const c = M.nouvelleCourse(p, "guerrier", "normal");
  c.position = "6-0";
  c.carte.etages[6][0].suivants = ["boss"];
  c.salle = { fini: true };
  M.entrerSalle(p, c, "boss");
  const roi = c.salle.ennemis[0];
  assert.equal(roi.type, "roi");
  let alerte = false;
  let renforts = false;
  for (let i = 0; i < 40 && !c.salle.issue; i++) {
    c.pv = 999; // le héros tient bon pour observer le boss
    const evs = M.jouerAction(p, c, { type: roi.prepare ? "defense" : "attaque", cible: roi.id });
    alerte ||= evs.some((e) => e.type === "alerte");
    renforts ||= evs.some((e) => e.type === "renforts");
  }
  assert.ok(alerte, "le boss doit annoncer son coup");
  assert.ok(renforts, "le boss doit appeler des renforts");
});

// ------------------------------------------------------------------ autres salles

test("un événement ne tue jamais le héros", () => {
  const p = M.creerProfil();
  for (let i = 0; i < 100; i++) {
    const c = M.nouvelleCourse(p, "mage", "difficile");
    c.carte.etages[0][0].type = "evenement";
    c.pv = 1;
    M.entrerSalle(p, c, "0-0");
    const ev = M.evenementCourant(c);
    const i2 = ev.choix.findIndex((x) => x.test && !x.cout);
    M.choisirEvenement(p, c, i2 < 0 ? 0 : i2);
    if (c.salle.type !== "combat") assert.ok(c.pv >= 1);
  }
});

test("marchand : acheter coûte de l'or ; trésor : or et relique", () => {
  const p = M.creerProfil();
  const c = M.nouvelleCourse(p, "roublard", "normal");
  c.carte.etages[0][0].type = "marchand";
  M.entrerSalle(p, c, "0-0");
  assert.throws(() => M.acheter(p, c, 0), /or/);
  c.or = 100;
  M.acheter(p, c, 0);
  assert.equal(c.or, 75);
  assert.equal(c.objets.potion, 3);
  M.quitterSalle(c);
  const c2 = M.nouvelleCourse(p, "roublard", "normal");
  c2.carte.etages[0][0].type = "tresor";
  M.entrerSalle(p, c2, "0-0");
  const effets = M.prendreTresor(p, c2);
  assert.ok(c2.or > 0);
  assert.equal(c2.reliques.length, 1);
  assert.ok(effets.length >= 2);
  assert.throws(() => M.prendreTresor(p, c2));
});

test("une relique de PV augmente aussi les PV actuels", () => {
  const p = M.creerProfil();
  const c = M.nouvelleCourse(p, "guerrier", "normal");
  const avant = c.pv;
  M.ajouterRelique(p, c, "coeur_troll");
  assert.equal(c.pv, avant + 8);
  assert.equal(M.ajouterRelique(p, c, "coeur_troll"), false);
});

// ------------------------------------------------------------------ expéditions complètes et bilan

test("des expéditions complètes se terminent sans erreur pour chaque héros et difficulté", () => {
  for (const heros of ORDRE_HEROS) {
    for (const diff of ["facile", "normal", "difficile"]) {
      for (let i = 0; i < 8; i++) {
        const p = profilComplet();
        const c = jouerExpedition(p, heros, diff);
        assert.ok(["victoire", "defaite"].includes(c.issue));
        const bilan = M.terminerCourse(p, c);
        assert.equal(p.stats.expeditions, 1);
        assert.ok(bilan.xp >= 0);
      }
    }
  }
});

test("le bilan : victoire = tout l'or et le clerc ; défaite = moitié de l'or ; une seule fois", () => {
  const p = M.creerProfil();
  const c = M.nouvelleCourse(p, "guerrier", "difficile");
  c.or = 101;
  const b = M.terminerCourse(p, c, "victoire");
  assert.equal(b.or_garde, 101);
  assert.ok(p.debloques.includes("clerc"));
  assert.ok(p.difficultes.includes("cauchemar"));
  M.terminerCourse(p, c, "victoire");
  assert.equal(p.or, 101, "le bilan ne s'applique qu'une fois");
  const c2 = M.nouvelleCourse(p, "clerc", "normal");
  c2.or = 51;
  assert.equal(M.terminerCourse(p, c2, "defaite").or_garde, 25);
  assert.equal(p.or, 126);
  assert.equal(p.stats.morts, 1);
});

test("on ne peut pas jouer un héros verrouillé ou une difficulté verrouillée", () => {
  const p = M.creerProfil();
  assert.throws(() => M.nouvelleCourse(p, "clerc", "normal"), /débloqué/);
  assert.throws(() => M.nouvelleCourse(p, "guerrier", "cauchemar"), /débloquée/);
});

// ------------------------------------------------------------------ sauvegarde et narrateur

test("export puis import d'une sauvegarde", () => {
  const p = M.creerProfil();
  p.or = 42;
  const c = M.nouvelleCourse(p, "mage", "normal");
  const r = importer(exporter(p, c));
  assert.equal(r.profil.or, 42);
  assert.equal(r.course.heros, "mage");
  assert.throws(() => importer("pas du json"), /valide/);
  assert.throws(() => importer(JSON.stringify({ jeu: "autre" })), /Expéditions/);
});

test("le narrateur a toujours un texte de secours", () => {
  for (const type of ["depart", "combat", "elite", "boss", "victoire_combat", "tresor", "marchand", "repos", "conseil"]) {
    assert.ok(texteSecours(type, { ennemis: "deux Gobelins", heros: "Brann" }).length > 10, type);
  }
  assert.match(texteSecours("fin", { issue: "victoire", heros: "Brann", tues: 9 }), /Grokk/);
  assert.match(texteSecours("evenement", { texte: "Un coffre." }), /coffre/);
});

test("chaque héros a des données complètes", () => {
  for (const id of ORDRE_HEROS) {
    const h = HEROS[id];
    assert.equal(h.branches.length, 3);
    for (const b of h.branches) assert.equal(b.talents.length, 3);
    const st = M.statsHeros(M.creerProfil(), id);
    assert.ok(st.pvMax > 15 && st.ca >= 12 && st.competences.length >= 2);
  }
});

test("jetDegats : détail lisible, et un critique relance les dés sans doubler le bonus", () => {
  const j = M.jetDegats(["1d6+1"], 2);
  assert.match(j.detail, /^1d6 \[\d\] \+ 1 \+ 2$/);
  for (let i = 0; i < 300; i++) {
    const c = M.jetDegats(["1d6+1"], 0, true).total;
    assert.ok(c >= 3 && c <= 13, `critique hors limites : ${c}`);
    const a = M.jetDegats(["3d4"]).total;
    assert.ok(a >= 3 && a <= 12);
  }
  assert.match(M.jetDegats(["1d6"], -1).detail, /− 1$/);
});

test("équilibrage : projectile magique coûte 2 PM et ne peut plus être enchaîné sans fin", () => {
  const p = M.creerProfil();
  const c = M.nouvelleCourse(p, "mage", "normal");
  M.entrerSalle(p, c, "0-0");
  c.pm = 1;
  assert.throws(() => M.jouerAction(p, c, { type: "competence", id: "projectile_magique" }), /PM/);
});
