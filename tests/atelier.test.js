import assert from "node:assert/strict";
import { test } from "node:test";

import * as des from "../js/des.js";
import * as mj from "../js/mj.js";
import * as modele from "../js/atelier/modele.js";
import { enLigne, livret, paragraphes } from "../js/atelier/rendu.js";
import { Moteur, nouvellePartie } from "../js/moteur.js";
import { creerPersonnage } from "../js/personnage.js";

function exemple() {
  const s = modele.nouveauScenario("Le casse");
  s.niveau = 3;
  s.accroche = "Jusqu'où irez-vous ?";
  const gobelin = { ...modele.nouveauPnj("Grik le Fourbe"), ca: 14, pv: 9, pv_formule: "2d6+2", xp: 50 };
  gobelin.actions = [
    { nom: "Attaques multiples", texte: "Grik effectue deux attaques." },
    { nom: "Cimeterre", texte: "Attaque au corps à corps avec une arme : +4 au toucher, allonge 1,50 m. Touché : 5 (1d6 + 2) dégâts tranchants." },
  ];
  s.pnj.push(gobelin);
  s.parties[0].blocs = [
    { ...modele.nouveauBloc("texte"), texte: "**Grik** attend dans l'ombre : [[Grik le Fourbe]] ment toujours." },
    { ...modele.nouveauBloc("lire"), texte: "Une odeur de vase monte du ponton." },
    { ...modele.nouveauBloc("mj"), texte: "Grik connaît le passage secret." },
    { ...modele.nouveauBloc("texte"), texte: "Le chef [[Orak|du clan]] arrive." },
  ];
  return s;
}

test("atelier : mise en forme légère et listes", () => {
  const s = exemple();
  const html = enLigne("**gras** *ital* __sous__ [[Grik le Fourbe|le gobelin]] <script>", s);
  assert.match(html, /<strong>gras<\/strong> <em>ital<\/em> <u>sous<\/u> <a class="renvoi" href="#pnj-[\w-]+">le gobelin<\/a> &lt;script&gt;/);
  assert.match(paragraphes("- un\n- deux\n\n1. a\n2. b\n\nfin", s), /^<ul><li>un<\/li><li>deux<\/li><\/ul><ol><li>a<\/li><li>b<\/li><\/ol><p>fin<\/p>$/);
  assert.equal(modele.texteBrut("**a** [[Grik|le gobelin]] __b__"), "a le gobelin b");
});

test("atelier : le livret contient couverture, encadrés, fiches et licence SRD", () => {
  const html = livret(exemple());
  for (const motif of [/class="page couverture"/, /Jusqu&#39;où irez-vous/, /class="encadre lire"/, /class="encadre mj"/,
    /class="fiche-pnj"/, /Grik le Fourbe/, /System Reference Document 5\.1/, /Creative Commons/]) {
    assert.match(html, motif);
  }
  assert.doesNotMatch(html, /Dungeons|D&amp;D/);
});

test("atelier : conversion en aventure jouable, avec le bestiaire du scénario", () => {
  const s = exemple();
  const jeu = modele.versScenarioJeu(s);
  assert.equal(jeu.id, `perso-${s.id}`);
  assert.equal(jeu.niveau_depart, 3);
  assert.match(jeu.notes_mj, /le joueur est seul/);
  assert.match(jeu.notes_mj, /\[À DÉCRIRE AUX JOUEURS, à adapter\] Une odeur de vase/);
  assert.match(jeu.notes_mj, /\[CONSEIL AU MJ\] Grik connaît/);
  assert.doesNotMatch(jeu.notes_mj, /\*\*|\[\[/);
  assert.match(jeu.intro, /Une odeur de vase/);
  assert.equal(jeu.bestiaire["grik le fourbe"].ca, 14);

  // Le moteur trouve le PNJ du scénario par son nom, avec ses statistiques de combat.
  const n = s.pnj[0];
  n.combat = { attaque: 0, degats: "", type_degats: "", attaques: 1 };
  assert.ok(modele.verifier(s).some((a) => /dégâts de « Grik le Fourbe »/.test(a)));
  assert.ok(modele.verifier(s).some((a) => /« Orak » est cité/.test(a)));
  // « Remplir depuis les actions » est fait dans l'éditeur ; ici on règle à la main.
  n.combat = { attaque: 4, degats: "1d6+2", type_degats: "tranchant", attaques: 2 };
  const partie = nouvellePartie(creerPersonnage({
    nom: "Brann", race: "Humain", classe: "Guerrier", caracs: { FOR: 15, DEX: 14, CON: 13, INT: 8, SAG: 12, CHA: 10 },
    competences: ["Athlétisme", "Perception"],
  }), jeu.id);
  partie.scenario_perso = modele.versScenarioJeu(s);
  des.definirGraine(5);
  const m = new Moteur(partie);
  const r = m.commencer_combat({ ennemis: [{ nom: "Grik le Fourbe" }] });
  assert.equal(r.ennemis[0].ca, 14);
  assert.equal(partie.combat.ennemis[0].attaques, 2);
  assert.equal(mj.scenarioDe(partie).titre, "Le casse");
  assert.match(mj.consignesFixes(partie), /SCÉNARIO « Le casse »/);
});

test("atelier : import d'un fichier, champs manquants complétés, mauvais fichiers refusés", () => {
  const s = exemple();
  const fichier = JSON.parse(JSON.stringify(modele.pourExport(s)));
  delete fichier.mot_mj.signature;
  delete fichier.pnj[0].combat;
  const relu = modele.normaliser(fichier);
  assert.equal(relu.mot_mj.signature, "");
  assert.equal(relu.pnj[0].combat.attaques, 1);
  assert.throws(() => modele.normaliser({ titre: "x" }), /n'est pas un scénario/);
  // Seules les images utilisées partent dans le fichier exporté.
  s.images = { a: "data:image/png;base64,AAAA", b: "data:image/png;base64,BBBB" };
  s.couverture = "a";
  assert.deepEqual(Object.keys(modele.pourExport(s).images), ["a"]);
});
