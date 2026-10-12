import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import * as des from "../js/des.js";
import * as mj from "../js/mj.js";
import { Moteur, nouvellePartie } from "../js/moteur.js";
import { ca, creerPersonnage, gagnerNiveau, vueFiche } from "../js/personnage.js";
import * as stockage from "../js/stockage.js";

const CARACS = { FOR: 15, DEX: 14, CON: 13, INT: 8, SAG: 12, CHA: 10 };

const guerrier = () => creerPersonnage({
  nom: "Brann", race: "Nain des collines", classe: "Guerrier", caracs: CARACS,
  competences: ["Athlétisme", "Perception"],
});

const magicien = () => creerPersonnage({
  nom: "Ilsa", race: "Haut-elfe", classe: "Magicien",
  caracs: { FOR: 8, DEX: 14, CON: 13, INT: 15, SAG: 12, CHA: 10 }, competences: ["Arcanes", "Histoire"],
});

beforeEach(() => des.definirGraine(42));

// ------------------------------------------------------------------ dés

test("formules de dés", () => {
  for (let i = 0; i < 200; i++) {
    const r = des.lancer("2d6+3");
    assert.ok(r.total >= 5 && r.total <= 15);
    const c = des.lancer("4d6kh3").total;
    assert.ok(c >= 3 && c <= 18);
  }
  assert.equal(des.lancer("7").total, 7);
  assert.ok(des.lancer("1d4-1").total <= 3);
  for (const mauvaise of ["", "abc", "2d", "1d6+x", "1000d6"]) {
    assert.throws(() => des.lancer(mauvaise));
  }
});

test("d20 avec avantage et désavantage", () => {
  for (let i = 0; i < 100; i++) {
    const a = des.d20(true);
    assert.equal(a.resultat, Math.max(...a.des));
    const b = des.d20(false, true);
    assert.equal(b.resultat, Math.min(...b.des));
  }
});

// ------------------------------------------------------------------ personnage

test("création d'un guerrier nain", () => {
  const p = guerrier();
  assert.equal(p.caracs.CON, 15);
  assert.equal(p.caracs.SAG, 13);
  assert.equal(p.pv_max, 10 + 2 + 1); // d10 + CON + ténacité naine
  assert.equal(ca(p), 16 + 2 + 1); // cotte de mailles + bouclier + Défense
  const athl = vueFiche(p).toutes_competences.find((c) => c.nom === "Athlétisme");
  assert.equal(athl.bonus, 4);
});

test("la création refuse les choix invalides", () => {
  assert.throws(() => creerPersonnage({ nom: "X", race: "Humain", classe: "Guerrier", caracs: CARACS, competences: ["Arcanes", "Perception"] }));
  assert.throws(() => creerPersonnage({ nom: "", race: "Humain", classe: "Guerrier", caracs: CARACS, competences: ["Athlétisme", "Perception"] }));
  assert.throws(() => creerPersonnage({ nom: "X", race: "Humain", classe: "Guerrier", caracs: { ...CARACS, FOR: 30 }, competences: ["Athlétisme", "Perception"] }));
});

test("bonus libres du demi-elfe", () => {
  const p = creerPersonnage({
    nom: "Lyra", race: "Demi-elfe", classe: "Magicien",
    caracs: { FOR: 8, DEX: 14, CON: 13, INT: 15, SAG: 12, CHA: 10 }, competences: ["Arcanes", "Histoire"],
  });
  assert.deepEqual(p.caracs, { FOR: 8, DEX: 15, CON: 13, INT: 16, SAG: 12, CHA: 12 });
});

test("montée de niveau", () => {
  const p = magicien();
  p.xp = 900;
  assert.deepEqual(gagnerNiveau(p), [2, 3]);
  assert.deepEqual(p.emplacements["2"], { max: 2, restants: 2 });
  assert.ok(vueFiche(p).sorts.some((s) => s.nom === "Rayon ardent"));
});

// ------------------------------------------------------------------ moteur

test("combat complet", () => {
  const partie = nouvellePartie(guerrier(), "brumesaule");
  const m = new Moteur(partie);
  const res = m.commencer_combat({ ennemis: [{ nom: "Gobelin", nombre: 2 }] });
  assert.deepEqual(res.ennemis.map((e) => e.id), ["Gobelin 1", "Gobelin 2"]);
  for (let i = 0; i < 30; i++) {
    const cible = partie.combat.ennemis.find((e) => e.etat === "actif");
    if (!cible) break;
    m.attaque_joueur({ arme: "Épée longue", cible: cible.id });
  }
  assert.ok(partie.combat.ennemis.every((e) => e.etat === "vaincu"));
  const fin = m.fin_combat({ issue: "victoire" });
  assert.equal(fin.xp_gagne, 100);
  assert.equal(partie.personnage.xp, 100);
  assert.equal(partie.combat, null);
  assert.ok(m.evenements.length > 0);
});

test("ennemi personnalisé et erreurs d'outils", () => {
  const partie = nouvellePartie(guerrier(), "libre");
  const m = new Moteur(partie);
  assert.ok(m.executer("commencer_combat", { ennemis: [{ nom: "Dragon" }] }).erreur);
  m.commencer_combat({ ennemis: [{ nom: "Sélène", ca: 12, pv: "27", attaque: 5, degats: "2d8" }] });
  assert.equal(partie.combat.ennemis[0].pv, 27);
  assert.ok(m.executer("attaque_joueur", { arme: "Hallebarde", cible: "Sélène" }).erreur);
  assert.ok(m.executer("attaque_joueur", { arme: "Épée longue", cible: "Personne" }).erreur);
  assert.ok(m.executer("repos", { type: "long" }).erreur); // pas de repos en combat
});

test("le joueur tombe à 0 PV face à un ogre", () => {
  const partie = nouvellePartie(magicien(), "libre");
  const m = new Moteur(partie);
  m.commencer_combat({ ennemis: [{ nom: "Ogre" }] });
  const p = partie.personnage;
  for (let i = 0; i < 100 && !p.mort.mort; i++) {
    if (p.pv === 0) {
      assert.ok(m.executer("attaque_joueur", { arme: "Dague", cible: "Ogre" }).erreur);
      if (!p.mort.stable) m.jet_contre_la_mort();
    }
    m.executer("attaque_ennemi", { ennemi: "Ogre" });
  }
  assert.equal(p.pv, 0);
});

test("sorts et emplacements", () => {
  const partie = nouvellePartie(magicien(), "libre");
  const m = new Moteur(partie);
  m.commencer_combat({ ennemis: [{ nom: "Kobold", nombre: 3 }] });
  const r = m.lancer_sort({ sort: "Projectile magique", cibles: ["Kobold 1"] });
  assert.equal(r.emplacements_restants["1"], 1);
  m.lancer_sort({ sort: "Sommeil" });
  assert.ok(m.executer("lancer_sort", { sort: "Mains brûlantes", cibles: ["Kobold 2"] }).erreur);
  assert.ok(m.executer("lancer_sort", { sort: "Boule de feu", cibles: ["Kobold 2"] }).erreur);
  const mineur = m.lancer_sort({ sort: "Trait de feu", cibles: ["Kobold 3"] });
  assert.ok(mineur.resultats.length);
  m.fin_combat({ issue: "victoire" });
  m.repos({ type: "long" });
  assert.equal(partie.personnage.emplacements["1"].restants, 2);
});

test("le clerc se soigne", () => {
  const p = creerPersonnage({
    nom: "Aube", race: "Humain", classe: "Clerc",
    caracs: { FOR: 13, DEX: 10, CON: 14, INT: 8, SAG: 15, CHA: 12 }, competences: ["Médecine", "Religion"],
  });
  const m = new Moteur(nouvellePartie(p, "libre"));
  m.modifier_pv_joueur({ type: "degats", formule: "5" });
  const r = m.lancer_sort({ sort: "Soins", cibles: ["joueur"] });
  assert.ok(r.resultats[0].soin >= 1 + 3 + 3); // 1d8 + SAG + Disciple de la Vie
  assert.equal(p.pv, p.pv_max);
});

test("inventaire, or et XP", () => {
  const partie = nouvellePartie(guerrier(), "libre");
  const m = new Moteur(partie);
  m.gerer_inventaire({ action: "ajouter", objet: "Potion de soins", quantite: 2 });
  m.gerer_inventaire({ action: "retirer", objet: "Potion de soins" });
  assert.ok(partie.personnage.inventaire.some((o) => o.nom === "Potion de soins" && o.quantite === 1));
  assert.ok(m.executer("modifier_or", { montant: -1000 }).erreur);
  m.gerer_inventaire({ action: "ajouter", objet: "Rapière" });
  assert.ok(partie.personnage.armes.some((a) => a.nom === "Rapière"));
  assert.deepEqual(m.donner_xp({ montant: 300 }).nouveaux_niveaux, [2]);
  assert.ok(m.executer("outil_inexistant", {}).erreur);
  assert.ok(m.executer("jet_de_test", { type: "competence", nom: "Cuisine" }).erreur);
  assert.ok("reussite" in m.executer("jet_de_test", { type: "competence", nom: "perception", dd: 10 }));
});

// ------------------------------------------------------------------ IA maître du jeu (client simulé)

const appel = (name, args, id = "a0") => ({ id, function: { name, arguments: JSON.stringify(args) } });

function fauxClient(reponses) {
  const requetes = [];
  const appeler = async (messages, outils) => {
    requetes.push({ messages: structuredClone(messages), outils });
    return reponses.shift();
  };
  return { appeler, requetes };
}

test("un tour avec des outils", async () => {
  const partie = nouvellePartie(guerrier(), "brumesaule");
  const { appeler, requetes } = fauxClient([
    { content: null, tool_calls: [appel("jet_de_test", { type: "competence", nom: "Perception", dd: 12 })] },
    {
      content: null,
      tool_calls: [appel("gerer_inventaire", { action: "ajouter", objet: "Clé rouillée" }),
        appel("noter_journal", { note: "Margot tient l'auberge" }, "a1")],
    },
    { content: "Tu remarques une **clé rouillée** sous le comptoir. Que fais-tu ?" },
  ]);
  const res = await mj.jouerTour(partie, "Je fouille la salle.", appeler);
  assert.match(res.narration, /clé rouillée/);
  assert.equal(res.evenements.length, 2);
  assert.deepEqual(partie.journal, ["Margot tient l'auberge"]);
  assert.deepEqual(partie.messages.map((m) => m.role), ["user", "assistant"]);
  assert.deepEqual(partie.affichage.map((a) => a.type), ["joueur", "de", "systeme", "mj"]);
  const systeme = requetes[0].messages.filter((m) => m.role === "system").map((m) => m.content).join("\n");
  assert.match(systeme, /Brann/);
  assert.match(systeme, /Brumesaule/);
  assert.equal(requetes[1].messages.at(-1).role, "tool");
});

test("arguments d'outil invalides renvoyés à l'IA", async () => {
  const partie = nouvellePartie(guerrier(), "libre");
  const { appeler, requetes } = fauxClient([
    { content: null, tool_calls: [{ id: "x", function: { name: "lancer_des", arguments: "{pas du json" } }] },
    { content: "D'accord." },
  ]);
  await mj.jouerTour(partie, "Test", appeler);
  assert.match(requetes[1].messages.at(-1).content, /invalides/);
});

test("messages d'erreur lisibles", () => {
  assert.match(mj.messageErreur(401, {}, "m"), /clé API/);
  assert.match(mj.messageErreur(429, { error: { code: "insufficient_quota" } }, "m"), /crédit/);
  assert.match(mj.messageErreur(404, { error: { code: "model_not_found" } }, "gpt-x"), /gpt-x/);
});

test("client OpenAI : requête envoyée et erreurs", async () => {
  const anciens = globalThis.fetch;
  let recue;
  globalThis.fetch = async (url, options) => {
    recue = { url, options };
    return new Response(JSON.stringify({ choices: [{ message: { content: "Bonjour" } }] }), { status: 200 });
  };
  try {
    const appeler = mj.clientOpenAI({ cle: "sk-test", modele: "gpt-test", adresse: "" });
    const msg = await appeler([{ role: "user", content: "Salut" }], mj.OUTILS);
    assert.equal(msg.content, "Bonjour");
    assert.equal(recue.url, "https://api.openai.com/v1/chat/completions");
    assert.equal(recue.options.headers.Authorization, "Bearer sk-test");
    const corps = JSON.parse(recue.options.body);
    assert.equal(corps.model, "gpt-test");
    assert.equal(corps.tools.length, mj.OUTILS.length);

    globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: "bad" } }), { status: 401 });
    await assert.rejects(appeler([]), /clé API/);
    globalThis.fetch = async () => { throw new TypeError("Failed to fetch"); };
    await assert.rejects(appeler([]), /connexion/);
  } finally {
    globalThis.fetch = anciens;
  }
});

test("la mémoire est condensée", async () => {
  const partie = nouvellePartie(guerrier(), "libre");
  partie.messages = Array.from({ length: 42 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: `m${i}` }));
  const { appeler } = fauxClient([{ content: "Résumé de l'histoire." }]);
  assert.ok(await mj.condenserMemoire(partie, appeler));
  assert.equal(partie.resume, "Résumé de l'histoire.");
  assert.equal(partie.messages.length, 30);
});

// ------------------------------------------------------------------ stockage navigateur

test("sauvegarde, liste, import et réglages", () => {
  // Comme dans un navigateur, les entrées sont des propriétés propres (listées par Object.keys).
  class FauxStockage {
    getItem(k) { return Object.hasOwn(this, k) ? this[k] : null; }
    setItem(k, v) { this[k] = String(v); }
    removeItem(k) { delete this[k]; }
  }
  globalThis.localStorage = new FauxStockage();
  try {
    assert.equal(stockage.estConfigure(stockage.chargerConfig()), false);
    stockage.enregistrerConfig({ cle: "sk-abcdefghijkl" });
    assert.equal(stockage.chargerConfig().modele, "gpt-5-mini");
    assert.equal(stockage.masquer("sk-abcdefghijkl"), "sk-…ijkl");

    const partie = nouvellePartie(guerrier(), "brumesaule");
    stockage.sauvegarder(partie);
    assert.equal(stockage.charger(partie.id).personnage.nom, "Brann");
    assert.equal(stockage.listerParties()[0].id, partie.id);
    assert.equal(stockage.charger("../config"), null);
    assert.ok(stockage.validerImport(JSON.parse(JSON.stringify(partie))));
    assert.throws(() => stockage.validerImport({ id: "x" }), /sauvegarde/);
    stockage.supprimer(partie.id);
    assert.equal(stockage.listerParties().length, 0);
  } finally {
    delete globalThis.localStorage;
  }
});

// ------------------------------------------------------------------ rage et résistances

const barbare = () => creerPersonnage({
  nom: "Grosha", race: "Demi-orc", classe: "Barbare",
  caracs: { FOR: 15, DEX: 13, CON: 14, INT: 8, SAG: 12, CHA: 10 }, competences: ["Athlétisme", "Survie"],
});

test("la rage divise par deux les dégâts tranchants, pas les dégâts de feu", () => {
  const partie = nouvellePartie(barbare(), "libre");
  const m = new Moteur(partie);
  const p = partie.personnage;
  p.pv_max = p.pv = 500; // pour encaisser sans tomber
  m.utiliser_capacite({ nom: "Rage" });
  assert.ok(vueFiche(p).resistances.includes("tranchant"));
  m.commencer_combat({ ennemis: [{ nom: "Orc" }, { nom: "Mage", ca: 10, pv: 10, attaque: 20, degats: "10", type_degats: "feu" }] });
  let touche = null;
  for (let i = 0; i < 50 && !touche; i++) {
    const r = m.attaque_ennemi({ ennemi: "Orc" });
    if (r.touche) touche = r;
  }
  assert.equal(touche.type_degats, "tranchant");
  assert.ok(touche.resistance);
  const avant = p.pv;
  const feu = m.attaque_ennemi({ ennemi: "Mage" });
  if (!feu.critique) assert.equal(avant - p.pv, 10);
  assert.ok(!feu.resistance);
  // Un piège tranchant hors attaque est aussi réduit.
  const piege = m.modifier_pv_joueur({ type: "degats", formule: "10", type_degats: "tranchant" });
  assert.equal(piege.montant, 5);
  // La rage prend fin avec le combat.
  m.fin_combat({ issue: "fuite" });
  assert.equal(vueFiche(p).resistances.length, 0);
});

test("la rage ne s'active que par la capacité", () => {
  const partie = nouvellePartie(barbare(), "libre");
  const m = new Moteur(partie);
  assert.match(m.executer("modifier_condition", { action: "ajouter", condition: "En rage" }).erreur, /utiliser_capacite/);
  m.utiliser_capacite({ nom: "rage" });
  assert.equal(partie.personnage.capacites.find((c) => c.nom === "Rage").utilisations, 1);
  m.modifier_condition({ action: "retirer", condition: "rage" });
  assert.equal(partie.personnage.conditions.length, 0);
});

test("résistance raciale du nain au poison", () => {
  const partie = nouvellePartie(guerrier(), "libre");
  const m = new Moteur(partie);
  assert.equal(m.modifier_pv_joueur({ type: "degats", formule: "6", type_degats: "poison" }).montant, 3);
  assert.equal(m.modifier_pv_joueur({ type: "degats", formule: "6", type_degats: "feu" }).montant, 6);
});

test("les effets actifs sont expliqués à l'IA", () => {
  const partie = nouvellePartie(barbare(), "libre");
  new Moteur(partie).utiliser_capacite({ nom: "Rage" });
  const systeme = mj.construireSysteme(partie);
  assert.match(systeme, /RAGE ACTIVE/);
  assert.match(systeme, /contondant, perforant, tranchant/);
});

test("une capacité cliquée est appliquée par le moteur avant l'IA", async () => {
  const partie = nouvellePartie(barbare(), "libre");
  const { appeler, requetes } = fauxClient([{ content: "Une fureur rouge t'envahit !" }]);
  await mj.jouerTour(partie, "J'utilise ma capacité « Rage » !", appeler,
    { outil: "utiliser_capacite", args: { nom: "Rage" } });
  assert.ok(partie.personnage.conditions.includes("Rage"));
  assert.match(requetes[0].messages.at(-1).content, /déjà appliqué/);
  assert.deepEqual(partie.affichage.map((a) => a.type), ["joueur", "de", "mj"]);
  // Plus d'utilisation : refusé sans appeler l'IA.
  partie.personnage.capacites.find((c) => c.nom === "Rage").utilisations = 0;
  await assert.rejects(mj.jouerTour(partie, "Rage !", appeler, { outil: "utiliser_capacite", args: { nom: "Rage" } }), /plus d'utilisation/);
  assert.equal(requetes.length, 1);
});

test("coût maîtrisé : consignes fixes en tête, état à la fin, consommation comptée", async () => {
  const partie = nouvellePartie(guerrier(), "brumesaule");
  partie.messages = [{ role: "user", content: "Bonjour" }, { role: "assistant", content: "Salut" }];
  const usage = { prompt_tokens: 10000, completion_tokens: 500, prompt_tokens_details: { cached_tokens: 8000 } };
  const { appeler, requetes } = fauxClient([{ content: "D'accord.", usage, modele: "gpt-5-mini-2025-08-07" }]);
  await mj.jouerTour(partie, "J'écoute.", appeler);
  const msgs = requetes[0].messages;
  assert.equal(msgs[0].content, mj.consignesFixes(partie)); // identique d'un tour à l'autre → mis en cache
  assert.doesNotMatch(msgs[0].content, /Brann/);
  assert.match(msgs.at(-2).content, /FICHE DU PERSONNAGE/);
  assert.equal(msgs.at(-1).content, "J'écoute.");
  assert.deepEqual({ ...partie.consommation, cout: undefined }, { appels: 1, entree: 10000, cache: 8000, sortie: 500, cout: undefined });
  // 2 000 × 0,25 + 8 000 × 0,025 + 500 × 2 (dollars par million de jetons)
  assert.ok(Math.abs(partie.consommation.cout - 0.0017) < 1e-9);
  assert.deepEqual(mj.parametresEconomie("gpt-5-mini"), { reasoning_effort: "low", max_completion_tokens: 6000 });
  assert.deepEqual(mj.parametresEconomie("gpt-4o-mini"), { max_completion_tokens: 1500 });
});
