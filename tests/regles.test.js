import assert from "node:assert/strict";
import fs from "node:fs";
import { before, test } from "node:test";

import * as mj from "../js/mj.js";
import { Moteur, nouvellePartie } from "../js/moteur.js";
import { creerPersonnage } from "../js/personnage.js";
import { definirCorpus, monstreSRD, rechercher } from "../js/regles.js";

before(() => definirCorpus(JSON.parse(fs.readFileSync(new URL("../regles/srd-5.1.json", import.meta.url)))));

const perso = () => creerPersonnage({
  nom: "Grosha", race: "Demi-orc", classe: "Barbare",
  caracs: { FOR: 15, DEX: 13, CON: 14, INT: 8, SAG: 12, CHA: 10 }, competences: ["Athlétisme", "Survie"],
});

test("le SRD complet est présent", () => {
  const srd = JSON.parse(fs.readFileSync(new URL("../regles/srd-5.1.json", import.meta.url)));
  const compte = (c) => srd.entrees.filter((e) => e.c === c).length;
  assert.equal(compte("sort"), 319);
  assert.equal(compte("monstre"), 334);
  assert.equal(compte("condition"), 15);
  assert.ok(compte("objet-magique") > 300);
  assert.match(srd.licence, /Creative Commons Attribution 4\.0/);
});

test("recherche en anglais et en français", () => {
  assert.equal(rechercher("Grappled").resultats[0].titre, "Grappled");
  assert.equal(rechercher("boule de feu").resultats[0].titre, "Fireball");
  assert.equal(rechercher("agrippé").resultats[0].titre, "Grappled");
  assert.equal(rechercher("rage", "capacite").resultats[0].titre, "Rage");
  assert.equal(rechercher("Owlbear", "monstre").resultats[0].categorie, "monstre");
  assert.match(rechercher("Fireball").resultats[0].texte, /8d6 fire damage/);
  assert.ok(rechercher("").erreur);
  assert.equal(rechercher("zzzqqq").resultats.length, 0);
});

test("combat contre un monstre du SRD", () => {
  assert.equal(monstreSRD("owlbear").ca, 13);
  const partie = nouvellePartie(perso(), "libre");
  const m = new Moteur(partie);
  const res = m.commencer_combat({ ennemis: [{ nom: "Hibours", modele: "Owlbear" }, { nom: "Bandit Captain", nombre: 1 }] });
  const [hibours, capitaine] = partie.combat.ennemis;
  assert.equal(hibours.id, "Hibours");
  assert.equal(hibours.ca, 13);
  assert.equal(hibours.xp, 700);
  assert.equal(hibours.type_degats, "perforant");
  assert.ok(hibours.pv >= 28 && hibours.pv <= 91); // 7d10+21
  assert.equal(capitaine.ca, 15);
  assert.equal(res.ennemis.length, 2);
  assert.ok(m.executer("commencer_combat", { ennemis: [{ nom: "Tarasque de poche" }] }).erreur);
});

test("l'IA consulte les règles pendant un tour", async () => {
  const partie = nouvellePartie(perso(), "libre");
  const reponses = [
    { content: null, tool_calls: [{ id: "r", function: { name: "consulter_regles", arguments: JSON.stringify({ recherche: "Grappled" }) } }] },
    { content: "Le tentacule t'agrippe : ta vitesse tombe à 0." },
  ];
  const requetes = [];
  const appeler = async (messages) => { requetes.push(structuredClone(messages)); return reponses.shift(); };
  await mj.jouerTour(partie, "Que se passe-t-il si je suis agrippé ?", appeler);
  const resultat = JSON.parse(requetes[1].at(-1).content);
  assert.equal(resultat.resultats[0].titre, "Grappled");
  assert.match(resultat.resultats[0].texte, /speed becomes 0/);
  assert.equal(partie.affichage.find((a) => a.type === "regle").texte, "📖 Règles consultées : « Grappled » → Grappled, Kraken, Making an Attack — Melee Attacks");
  assert.ok(mj.OUTILS.some((o) => o.function.name === "consulter_regles"));
});
