import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import * as des from "../js/des.js";
import * as mj from "../js/mj.js";
import { Moteur, nouvellePartie } from "../js/moteur.js";
import { ca, creerPersonnage, gagnerNiveau, mettreAJourPersonnage, mod, vueFiche } from "../js/personnage.js";
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

// ------------------------------------------------------------------ dés lancés par le joueur

test("le joueur lance lui-même ses d20", async () => {
  const partie = nouvellePartie(guerrier(), "libre");
  const m = new Moteur(partie);
  const demandes = [];
  const lancer = (valeurs) => async (jet) => { demandes.push(jet); return valeurs.splice(0, jet.nombre); };

  const test1 = await m.executerAvecJets("jet_de_test", { type: "competence", nom: "Perception", dd: 15, raison: "écouter à la porte" }, lancer([12]));
  assert.deepEqual(test1.des, [12]);
  assert.equal(test1.total, 12 + 3);
  assert.equal(demandes[0].libelle, "Perception — écouter à la porte");
  assert.equal(demandes[0].seuil, 15);
  assert.equal(demandes[0].bonus, 3);

  // Avantage : deux dés lancés ensemble, on garde le meilleur.
  const test2 = await m.executerAvecJets("jet_de_test", { type: "caracteristique", nom: "FOR", avantage: true }, lancer([4, 17]));
  assert.equal(demandes[1].nombre, 2);
  assert.equal(test2.total, 17 + mod(partie.personnage.caracs.FOR));

  // Initiative puis attaque : le 20 lancé par le joueur donne un coup critique.
  await m.executerAvecJets("commencer_combat", { ennemis: [{ nom: "Gobelin" }] }, lancer([10]));
  assert.match(demandes[2].libelle, /Initiative/);
  const attaque = await m.executerAvecJets("attaque_joueur", { arme: "Épée longue", cible: "Gobelin" }, lancer([20]));
  assert.ok(attaque.critique && attaque.touche);
  assert.equal(demandes[3].nomSeuil, "CA");
  // Un seul événement par action, malgré la pause pour lancer le dé.
  assert.equal(m.evenements.filter((e) => e.texte.startsWith("Attaque")).length, 1);
});

test("pause pour le dé : l'action n'est pas appliquée deux fois", async () => {
  const caracs = { FOR: 8, DEX: 14, CON: 13, INT: 15, SAG: 12, CHA: 10 };
  const p = creerPersonnage({ nom: "Ilsa", race: "Halfelin pied-léger", classe: "Magicien", caracs, competences: ["Arcanes", "Histoire"] });
  p.xp = 900; gagnerNiveau(p); // niveau 3 : Rayon ardent (3 rayons = 3 jets)
  const partie = nouvellePartie(p, "libre");
  const m = new Moteur(partie);
  m.commencer_combat({ ennemis: [{ nom: "Ogre" }] });
  const jets = [];
  const valeurs = [1, 15, 2, 19]; // le 1 est relancé grâce à « Chanceux » (halfelin)
  const res = await m.executerAvecJets("lancer_sort", { sort: "Rayon ardent", cibles: ["Ogre"] },
    async (jet) => { jets.push(jet); return valeurs.splice(0, jet.nombre); });
  assert.equal(jets.length, 4);
  assert.ok(jets[1].chanceux);
  assert.equal(res.resultats.length, 3);
  assert.equal(partie.personnage.emplacements["2"].restants, 1); // un seul emplacement dépensé
  assert.equal(m.evenements.filter((e) => e.texte.includes("Rayon ardent")).length, 1);
});

test("un tour de jeu attend les jets du joueur", async () => {
  const partie = nouvellePartie(guerrier(), "libre");
  const { appeler, requetes } = fauxClient([
    { content: null, tool_calls: [_appelTest("jet_de_test", { type: "competence", nom: "Athlétisme", dd: 12 })] },
    { content: "Tu escalades le mur." },
  ]);
  const jets = [];
  await mj.jouerTour(partie, "J'escalade.", appeler, null, { demanderJet: async (j) => { jets.push(j); return [18]; } });
  assert.equal(jets.length, 1);
  assert.equal(JSON.parse(requetes[1].messages.at(-1).content).des[0], 18);
});

function _appelTest(name, args) {
  return { id: "t", function: { name, arguments: JSON.stringify(args) } };
}

test("le maître du jeu propose 2 ou 3 actions, retirées du récit", async () => {
  const partie = nouvellePartie(guerrier(), "libre");
  const { appeler, requetes } = fauxClient([
    { content: "La porte grince.\n\nQue fais-tu ?\nCHOIX: J'ouvre la porte | Je tends l'oreille | Je fais demi-tour" },
  ]);
  const res = await mj.jouerTour(partie, "J'avance.", appeler);
  assert.deepEqual(res.choix, ["J'ouvre la porte", "Je tends l'oreille", "Je fais demi-tour"]);
  assert.equal(partie.affichage.at(-1).texte, "La porte grince.\n\nQue fais-tu ?");
  assert.deepEqual(partie.affichage.at(-1).choix, res.choix);
  assert.doesNotMatch(partie.messages.at(-1).content, /CHOIX/); // l'historique reste léger
  assert.match(requetes[0].messages[0].content, /CHOIX: première action/);
  assert.deepEqual(mj.extraireChoix("Récit sans choix.").choix, []);
  assert.deepEqual(mj.extraireChoix("Récit\n**CHOIX :** 1. « J'attaque » | 2. Je fuis").choix, ["J'attaque", "Je fuis"]);
});

test("dé karmique : avantage après 2 échecs d'affilée, jusqu'à la prochaine réussite", async () => {
  const partie = nouvellePartie(guerrier(), "libre");
  const m = new Moteur(partie);
  m.seuilKarma = 2;
  const jets = [];
  const lancer = (valeurs) => async (jet) => { jets.push(jet); return valeurs.splice(0, jet.nombre); };
  const test = (valeurs) => m.executerAvecJets("jet_de_test", { type: "competence", nom: "Athlétisme", dd: 18 }, lancer(valeurs));
  await test([3]); // échec 1
  await test([5]); // échec 2
  assert.equal(partie.karma_echecs, 2);
  const r3 = await test([4, 9]); // karma : 2 dés, on garde 9 → encore un échec
  assert.equal(jets[2].nombre, 2);
  assert.ok(jets[2].karma && jets[2].avantage);
  assert.equal(r3.total, 9 + 4);
  assert.match(m.evenements.at(-1).texte, /karma/);
  const r4 = await test([2, 17]); // toujours le karma → 17 + 4 = 21, réussite
  assert.ok(r4.reussite);
  assert.equal(partie.karma_echecs, 0);
  await test([10]); // retour au hasard normal : un seul dé
  assert.equal(jets.at(-1).nombre, 1);
  // Désactivé : jamais d'avantage karmique.
  m.seuilKarma = 0;
  partie.karma_echecs = 5;
  await test([1]);
  assert.equal(jets.at(-1).nombre, 1);
});

test("aventure donjon : disponible et transmise au maître du jeu", async () => {
  const { SCENARIOS } = await import("../js/scenarios.js");
  assert.equal(SCENARIOS.donjon.titre, "Le Gouffre aux Mille Marches");
  const partie = nouvellePartie(guerrier(), "donjon");
  const consignes = mj.consignesFixes(partie);
  assert.match(consignes, /MODE DONJON/);
  assert.match(consignes, /GÉNÉRÉ PAR LE MOTEUR/);
  const { appeler, requetes } = fauxClient([{ content: "Le Gouffre s'ouvre devant toi.\nCHOIX: Je descends | Je regarde autour" }]);
  await mj.jouerTour(partie, "", appeler);
  assert.match(requetes[0].messages.at(-1).content, /Gouffre aux Mille Marches/);
});

test("la ligne CHOIX est retirée même écrite en fin de phrase ou plusieurs fois", () => {
  const { texte, choix } = mj.extraireChoix("C'est ton tour. CHOIX: J'attaque | Je fuis\n\nTa lame frappe.\nTu es seul. CHOIX: J'achève le gobelin | Je recule | Je crie");
  assert.equal(texte, "C'est ton tour.\n\nTa lame frappe.\nTu es seul.");
  assert.deepEqual(choix, ["J'achève le gobelin", "Je recule", "Je crie"]);
  assert.deepEqual(mj.extraireChoix("Tu as le choix : partir ou rester.").choix, []); // « choix » en minuscules : du récit
});

// ------------------------------------------------------------------ donjon généré

import { genererSection } from "../js/donjon.js";

/** Directions pour aller d'une salle à une autre (parcours en largeur). */
function chemin(plan, depart, arrivee) {
  const vu = new Map([[depart, []]]);
  const file = [depart];
  while (file.length) {
    const id = file.shift();
    if (id === arrivee) return vu.get(id);
    for (const [dir, voisin] of Object.entries(plan.salles[id].sorties)) {
      if (!vu.has(voisin)) { vu.set(voisin, [...vu.get(id), dir]); file.push(voisin); }
    }
  }
  return null;
}

test("donjon : chaque section de 5 étages est complète et cohérente", () => {
  for (let graine = 1; graine <= 20; graine++) {
    des.definirGraine(graine);
    const section = genererSection(1, 2);
    assert.equal(section.etages.length, 5);
    section.etages.forEach((plan, k) => {
      const salles = Object.values(plan.salles);
      const types = salles.map((x) => x.type);
      assert.equal(types.filter((t) => t === "entree").length, 1);
      assert.equal(types.filter((t) => t === (k === 4 ? "boss" : "escalier")).length, 1, `étage ${plan.numero}`);
      assert.ok(types.filter((t) => t === "combat").length >= 2);
      assert.equal(types.includes("sanctuaire"), k === 1 || k === 3);
      for (const x of salles) {
        assert.ok(chemin(plan, plan.entree, x.id), `salle ${x.id} accessible`);
        for (const [dir, id] of Object.entries(x.sorties)) {
          const retour = { nord: "sud", sud: "nord", est: "ouest", ouest: "est" }[dir];
          assert.equal(plan.salles[id].sorties[retour], x.id, "les portes vont dans les deux sens");
        }
        if (["combat", "boss"].includes(x.type)) assert.ok(x.ennemis.length >= 1);
      }
      const boss = salles.find((x) => x.type === "boss");
      if (boss) assert.ok(boss.ennemis[0].xp > 0 && boss.tresor.objets.length === 2);
    });
  }
});

test("donjon : explorer, combattre, fouiller, se reposer et descendre", async () => {
  des.definirGraine(7);
  const partie = nouvellePartie(guerrier(), "donjon");
  const m = new Moteur(partie);
  partie.personnage.pv_max = partie.personnage.pv = 999; // héros increvable pour le test
  assert.match(mj.resumeDonjon(partie), /pas encore généré/);
  const debut = m.explorer({});
  assert.equal(debut.etage, 1);
  assert.equal(debut.salle.type, "entree");
  // Le moteur recopie l'état quand il attend un jet de dé : on relit toujours le plan depuis la partie.
  const etage1 = () => partie.donjon.etages[1];
  const plan = etage1();
  assert.ok(mj.outilsPour(partie).some((o) => o.function.name === "explorer"));

  // Aller jusqu'à une salle de combat : le combat prévu démarre tout seul.
  const idCombat = Object.values(plan.salles).find((x) => x.type === "combat").id;
  const route = chemin(plan, partie.donjon.position, idCombat);
  for (const dir of route) {
    const r = await m.executerAvecJets("explorer", { direction: dir }, async (jet) => Array(jet.nombre).fill(15));
    if (partie.combat) {
      // Une autre salle de combat sur le chemin : on la nettoie d'abord.
      for (const e of partie.combat.ennemis) m.changer_etat_ennemi({ ennemi: e.id, etat: "vaincu" });
      m.fin_combat({ issue: "victoire" });
      assert.ok(r.combat);
    }
  }
  assert.equal(partie.donjon.position, idCombat);
  const combat = etage1().salles[idCombat];
  assert.ok(combat.nettoyee);
  assert.match(m.executer("explorer", { direction: "haut" }).erreur, /nord, sud, est ou ouest/);
  assert.match(m.executer("repos", { type: "long" }).erreur, /sanctuaire/);
  assert.ok(m.repos({ type: "court" }));

  // Revenir dans une salle nettoyée ne relance pas le combat.
  const retour = Object.entries(combat.sorties)[0];
  m.explorer({ direction: retour[0] });
  const revenir = { nord: "sud", sud: "nord", est: "ouest", ouest: "est" }[retour[0]];
  const r2 = m.explorer({ direction: revenir });
  assert.equal(r2.combat, undefined);

  // L'escalier mène à l'étage 2 ; on ne peut pas descendre ailleurs.
  assert.ok(m.executer("descendre", {}).erreur);
  const escalier = Object.values(etage1().salles).find((x) => x.type === "escalier");
  for (const dir of chemin(etage1(), partie.donjon.position, escalier.id)) {
    await m.executerAvecJets("explorer", { direction: dir }, async (jet) => Array(jet.nombre).fill(15));
    if (partie.combat) {
      for (const e of partie.combat.ennemis) m.changer_etat_ennemi({ ennemi: e.id, etat: "vaincu" });
      m.fin_combat({ issue: "victoire" });
    }
  }
  const bas = m.descendre();
  assert.equal(bas.etage, 2);
  assert.equal(partie.donjon.record, 2);
  assert.match(mj.resumeDonjon(partie), /étage 2/);
});

test("donjon : un piège demande un jet au joueur sans changer le plan", async () => {
  des.definirGraine(11);
  const partie = nouvellePartie(guerrier(), "donjon");
  const m = new Moteur(partie);
  m.explorer({});
  // On force un piège juste à côté du palier.
  const plan = partie.donjon.etages[1];
  const [dir, id] = Object.entries(plan.salles[plan.entree].sorties)[0];
  Object.assign(plan.salles[id], { type: "piege", ennemis: undefined, piege: { nom: "Rune de feu", sauvegarde: "DEX", dd: 30, degats: "6", type_degats: "feu", declenche: false } });
  delete plan.salles[id].ennemis;
  const avant = JSON.stringify(plan.salles[id].sorties);
  const jets = [];
  const r = await m.executerAvecJets("explorer", { direction: dir }, async (jet) => { jets.push(jet); return [5]; });
  assert.equal(jets.length, 1);
  assert.equal(r.piege.degats.montant, 6);
  assert.equal(JSON.stringify(partie.donjon.etages[1].salles[id].sorties), avant);
  assert.ok(partie.donjon.etages[1].salles[id].piege.declenche);
});

test("donjon : une partie de l'ancien système reprend sur le palier de son étage", () => {
  const partie = nouvellePartie(guerrier(), "donjon");
  partie.donjon = { etage: 5, salle: 2, record: 5 };
  const m = new Moteur(partie);
  const r = m.explorer({});
  assert.equal(r.etage, 5);
  assert.ok(Object.values(partie.donjon.etages[5].salles).some((x) => x.type === "boss"));
  assert.ok(new Moteur(nouvellePartie(guerrier(), "brumesaule")).executer("explorer", {}).erreur);
});

test("donjon : fouiller une salle au trésor ajoute l'or et les objets une seule fois", () => {
  des.definirGraine(3);
  const partie = nouvellePartie(guerrier(), "donjon");
  const m = new Moteur(partie);
  m.explorer({});
  const plan = partie.donjon.etages[1];
  plan.salles[plan.entree].tresor = { or: 42, objets: ["Potion de soins"], pris: false };
  const orAvant = partie.personnage.or;
  const r = m.fouiller();
  assert.ok(r.trouve);
  assert.equal(partie.personnage.or, orAvant + 42);
  assert.ok(partie.personnage.inventaire.some((o) => o.nom === "Potion de soins"));
  assert.equal(m.fouiller().trouve, false);
});

test("potions : le héros du donjon en reçoit 2, en boit une et ne peut pas boire ce qu'il n'a pas", () => {
  const partie = nouvellePartie(magicien(), "donjon");
  const m = new Moteur(partie);
  m.explorer({});
  const stock = () => partie.personnage.inventaire.find((o) => o.nom === "Potion de soins")?.quantite ?? 0;
  assert.equal(stock(), 2);
  partie.personnage.pv = 1;
  const r = m.executer("boire_potion", {});
  assert.ok(r.soin >= 4 && r.soin <= 10);
  assert.equal(partie.personnage.pv, Math.min(partie.personnage.pv_max, 1 + r.soin));
  assert.equal(stock(), 1);
  m.boire_potion({});
  assert.equal(stock(), 0);
  assert.match(m.executer("boire_potion", {}).erreur, /aucune/);
  // Pas de potions offertes deux fois quand le donjon existe déjà.
  m.donjon();
  assert.equal(stock(), 0);
});

test("donjon : niveau 1, pas de loups dans les premiers étages", () => {
  for (let graine = 1; graine <= 20; graine++) {
    des.definirGraine(graine);
    const section = genererSection(1, 1);
    for (const etage of section.etages.slice(0, 2)) {
      for (const salle of Object.values(etage.salles)) {
        for (const e of salle.ennemis ?? []) assert.notEqual(e.modele ?? e.nom, "Loup", `graine ${graine}, étage ${etage.numero}`);
      }
    }
  }
});

test("la fiche garde les choix de création pour rejouer après une mort", () => {
  const p = magicien();
  assert.equal(p.creation.classe, "Magicien");
  const bis = creerPersonnage(p.creation);
  assert.equal(bis.nom, p.nom);
  assert.equal(bis.pv_max, p.pv_max);
  assert.equal(bis.niveau, 1);
});

// ------------------------------------------------------------------ niveau de départ

const rodeur = (niveau) => creerPersonnage({
  nom: "Sylas", race: "Humain", classe: "Rôdeur", caracs: { FOR: 12, DEX: 15, CON: 13, INT: 8, SAG: 14, CHA: 10 },
  competences: ["Survie", "Perception", "Discrétion"], niveau,
});

test("héros de niveau 5 : PV, capacités, amélioration et équipement en plus", () => {
  const p = creerPersonnage({
    nom: "Brann", race: "Nain des collines", classe: "Guerrier", caracs: CARACS,
    competences: ["Athlétisme", "Perception"], niveau: 5,
  });
  const base = guerrier();
  assert.equal(p.niveau, 5);
  assert.equal(p.xp, 6500);
  assert.equal(p.pv, p.pv_max);
  assert.ok(p.pv_max > base.pv_max * 3);
  for (const nom of ["Fougue", "Champion : critique amélioré", "Attaque supplémentaire"]) {
    assert.ok(p.capacites.some((c) => c.nom === nom), nom);
  }
  assert.equal(p.caracs.FOR, base.caracs.FOR + 2); // amélioration du niveau 4
  assert.equal(p.capacites.find((c) => c.nom === "Fougue").utilisations, 1);
  assert.equal(p.inventaire.find((o) => o.nom === "Potion de soins").quantite, 2);
  assert.equal(p.creation.niveau, 5);
  assert.equal(creerPersonnage(p.creation).niveau, 5); // rejouer garde le niveau
  assert.throws(() => creerPersonnage({ ...p.creation, niveau: 4 }), /Niveau de départ invalide/);
});

test("le magicien de niveau 5 lance Boule de feu sur plusieurs ennemis", () => {
  const p = creerPersonnage({
    nom: "Ilsa", race: "Haut-elfe", classe: "Magicien",
    caracs: { FOR: 8, DEX: 14, CON: 13, INT: 15, SAG: 12, CHA: 10 }, competences: ["Arcanes", "Histoire"], niveau: 5,
  });
  assert.equal(p.emplacements[3].max, 2);
  const partie = nouvellePartie(p, "donjon");
  const m = new Moteur(partie);
  m.commencer_combat({ ennemis: [{ nom: "Gobelin", nombre: 3 }] });
  const r = m.lancer_sort({ sort: "Boule de feu", cibles: ["Gobelin 1", "Gobelin 2", "Gobelin 3"] });
  assert.equal(r.resultats.length, 3);
  assert.equal(partie.personnage.emplacements[3].restants, 1);
});

test("rôdeur : demi-lanceur de sorts dès le niveau 2, archerie", () => {
  const p1 = rodeur(1);
  assert.deepEqual(p1.emplacements, {});
  const p5 = rodeur(5);
  assert.deepEqual(Object.fromEntries(Object.entries(p5.emplacements).map(([n, e]) => [n, e.max])), { 1: 4, 2: 2 });
  const m = new Moteur(nouvellePartie(p5, "donjon"));
  assert.ok(m.lancer_sort({ sort: "Marque du chasseur" }));
  const arc = p5.armes.find((a) => a.distance);
  const sans = { ...p5, capacites: [] };
  assert.equal(vueFiche(p5).attaques.find((a) => a.nom === arc.nom).bonus - vueFiche(sans).attaques.find((a) => a.nom === arc.nom).bonus, 2);
});

test("le champion fait un critique sur 19 ; une montée de niveau annonce les nouvelles capacités", async () => {
  const p = guerrier();
  const partie = nouvellePartie(p, "brumesaule");
  const m = new Moteur(partie);
  const r = m.gagnerXp(900);
  assert.deepEqual(r.nouveaux_niveaux, [2, 3]);
  assert.deepEqual(r.nouvelles_capacites, ["Fougue", "Champion : critique amélioré"]);
  m.commencer_combat({ ennemis: [{ nom: "Ogre" }] });
  m.interactif = true;
  const a = await m.executerAvecJets("attaque_joueur", { arme: "Épée longue", cible: "Ogre" }, async (jet) => Array(jet.nombre).fill(19));
  assert.equal(a.critique, true);
});

test("une ancienne fiche de niveau 3 récupère ses capacités de classe", () => {
  const p = guerrier();
  p.niveau = 3;
  assert.equal(mettreAJourPersonnage(p), true);
  assert.ok(p.capacites.some((c) => c.nom === "Fougue"));
  assert.equal(mettreAJourPersonnage(p), false);
});
