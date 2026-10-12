// Construit regles/srd-5.1.json : le SRD 5.1 complet, découpé en fiches consultables par l'IA.
//
// Usage : node outils/construire-srd.mjs [dossier-sources]
//   Sans argument, les fichiers sont téléchargés depuis le dépôt 5e-bits/5e-database
//   (SRD 5.1 en anglais, au format JSON). Avec un dossier, ils y sont lus.

import fs from "node:fs";
import path from "node:path";

const SOURCE = "https://raw.githubusercontent.com/5e-bits/5e-database/main/src/2014/en";
const SORTIE = new URL("../regles/srd-5.1.json", import.meta.url);

const FICHIERS = [
  "Rule-Sections", "Conditions", "Spells", "Monsters", "Equipment", "Magic-Items", "Features", "Traits",
  "Races", "Subraces", "Classes", "Subclasses", "Backgrounds", "Feats", "Skills", "Weapon-Properties",
  "Damage-Types", "Languages",
];

export const TYPES_FR = {
  acid: "acide", bludgeoning: "contondant", cold: "froid", fire: "feu", force: "force", lightning: "foudre",
  necrotic: "nécrotique", piercing: "perforant", poison: "poison", psychic: "psychique", radiant: "radiant",
  slashing: "tranchant", thunder: "tonnerre",
};

async function charger(dossier, nom) {
  const fichier = `5e-SRD-${nom}.json`;
  if (dossier) return JSON.parse(fs.readFileSync(path.join(dossier, fichier), "utf8"));
  const reponse = await fetch(`${SOURCE}/${fichier}`);
  if (!reponse.ok) throw new Error(`${fichier} : ${reponse.status}`);
  return reponse.json();
}

const texte = (v) => (Array.isArray(v) ? v.join("\n") : String(v ?? "")).trim();
const mod = (score) => Math.floor((score - 10) / 2);
const signe = (n) => (n >= 0 ? `+${n}` : `${n}`);
const nomsDe = (liste) => (liste ?? []).map((x) => x.name ?? x).join(", ");
const prix = (c) => (c ? `${c.quantity} ${c.unit}` : "");

/** Découpe une section de règles Markdown en sous-sections « ### » pour des fiches plus ciblées. */
function decouperSection(section) {
  const morceaux = section.desc.split(/\n(?=### )/);
  if (morceaux.length === 1) return [{ t: section.name, x: section.desc.trim() }];
  return morceaux.map((m, i) => {
    const titre = i === 0 ? section.name : `${section.name} — ${m.match(/^### (.+)/)?.[1] ?? ""}`;
    return { t: titre, x: m.trim() };
  });
}

function ficheMonstre(m) {
  const ca = m.armor_class?.map((a) => `${a.value}${a.type && a.type !== "dex" ? ` (${a.type})` : ""}`).join(", ");
  const vitesse = Object.entries(m.speed ?? {}).map(([k, v]) => (k === "walk" ? v : `${k} ${v}`)).join(", ");
  const caracs = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"]
    .map((c) => `${c.slice(0, 3).toUpperCase()} ${m[c]} (${signe(mod(m[c]))})`).join(" ");
  const lignes = [
    `${m.name} — ${m.size} ${m.type}${m.subtype ? ` (${m.subtype})` : ""}, ${m.alignment}`,
    `AC ${ca} · HP ${m.hit_points} (${m.hit_points_roll ?? m.hit_dice}) · Speed ${vitesse}`,
    caracs,
  ];
  const maitrises = (m.proficiencies ?? []).map((p) => `${p.proficiency.name.replace(/^(Saving Throw|Skill): /, "")} ${signe(p.value)}`);
  if (maitrises.length) lignes.push(`Proficiencies: ${maitrises.join(", ")}`);
  if (m.damage_vulnerabilities?.length) lignes.push(`Vulnerabilities: ${m.damage_vulnerabilities.join(", ")}`);
  if (m.damage_resistances?.length) lignes.push(`Resistances: ${m.damage_resistances.join(", ")}`);
  if (m.damage_immunities?.length) lignes.push(`Damage immunities: ${m.damage_immunities.join(", ")}`);
  if (m.condition_immunities?.length) lignes.push(`Condition immunities: ${nomsDe(m.condition_immunities)}`);
  const sens = Object.entries(m.senses ?? {}).map(([k, v]) => `${k.replace(/_/g, " ")} ${v}`).join(", ");
  if (sens) lignes.push(`Senses: ${sens}`);
  if (m.languages) lignes.push(`Languages: ${m.languages}`);
  lignes.push(`Challenge ${m.challenge_rating} (${m.xp} XP)`);
  const bloc = (titre, liste) => {
    if (liste?.length) lignes.push(`${titre}:`, ...liste.map((a) => `- ${a.name}. ${a.desc}`));
  };
  bloc("Traits", m.special_abilities);
  bloc("Actions", m.actions);
  bloc("Reactions", m.reactions);
  bloc("Legendary actions", m.legendary_actions);
  return lignes.join("\n");
}

/** Statistiques utilisables directement par le moteur de combat. */
function statsMonstre(m) {
  const attaque = (m.actions ?? []).find((a) => a.attack_bonus !== undefined && a.damage?.[0]?.damage_dice);
  if (!attaque) return null;
  const degat = attaque.damage[0];
  return {
    nom: m.name,
    ca: m.armor_class?.[0]?.value ?? 10,
    pv: (m.hit_points_roll ?? m.hit_dice ?? String(m.hit_points)).replace(/\s+/g, ""),
    attaque: attaque.attack_bonus,
    degats: degat.damage_dice.replace(/\s+/g, ""),
    type_degats: TYPES_FR[degat.damage_type?.index] ?? null,
    arme: attaque.name,
    dex: mod(m.dexterity),
    sauvegarde: mod(m.dexterity),
    xp: m.xp ?? 10,
    multiattaque: (m.actions ?? []).some((a) => a.name === "Multiattack"),
  };
}

function ficheSort(s) {
  const niveau = s.level === 0 ? `${s.school.name} cantrip` : `level ${s.level} ${s.school.name.toLowerCase()}`;
  const lignes = [
    `${s.name} — ${niveau}${s.ritual ? " (ritual)" : ""}`,
    `Casting time: ${s.casting_time} · Range: ${s.range} · Components: ${s.components.join(", ")}`
      + `${s.material ? ` (${s.material})` : ""} · Duration: ${s.concentration ? "Concentration, " : ""}${s.duration}`,
    `Classes: ${nomsDe(s.classes)}`,
    texte(s.desc),
  ];
  if (s.higher_level?.length) lignes.push(`At higher levels: ${texte(s.higher_level)}`);
  return lignes.join("\n");
}

function ficheEquipement(e) {
  const cat = e.equipment_category?.name;
  const morceaux = [`${e.name} — ${cat}`];
  if (e.weapon_category) {
    morceaux[0] += ` (${e.category_range})`;
    if (e.damage) morceaux.push(`Damage: ${e.damage.damage_dice} ${e.damage.damage_type.name.toLowerCase()}`);
    if (e.two_handed_damage) morceaux.push(`Two-handed: ${e.two_handed_damage.damage_dice}`);
    if (e.range?.long) morceaux.push(`Range: ${e.range.normal}/${e.range.long} ft`);
    if (e.properties?.length) morceaux.push(`Properties: ${nomsDe(e.properties)}`);
  }
  if (e.armor_category) {
    const ac = e.armor_class;
    morceaux[0] += ` (${e.armor_category})`;
    morceaux.push(`AC: ${ac.base}${ac.dex_bonus ? ` + Dex${ac.max_bonus ? ` (max ${ac.max_bonus})` : ""}` : ""}`);
    if (e.str_minimum) morceaux.push(`Strength ${e.str_minimum} required`);
    if (e.stealth_disadvantage) morceaux.push("Stealth disadvantage");
  }
  if (e.cost) morceaux.push(`Cost: ${prix(e.cost)}`);
  if (e.weight) morceaux.push(`Weight: ${e.weight} lb`);
  const desc = texte(e.desc);
  return morceaux.join(" · ") + (desc ? `\n${desc}` : "");
}

function ficheClasse(c) {
  const lignes = [
    `${c.name} — hit die d${c.hit_die}`,
    `Saving throws: ${nomsDe(c.saving_throws)}`,
    `Proficiencies: ${nomsDe(c.proficiencies)}`,
  ];
  for (const choix of c.proficiency_choices ?? []) if (choix.desc) lignes.push(choix.desc);
  if (c.spellcasting) {
    lignes.push(`Spellcasting ability: ${c.spellcasting.spellcasting_ability?.name}`);
    for (const info of c.spellcasting.info ?? []) lignes.push(`${info.name}: ${texte(info.desc)}`);
  }
  return lignes.join("\n");
}

function ficheRace(r) {
  const bonus = (r.ability_bonuses ?? []).map((b) => `${b.ability_score.name} +${b.bonus}`).join(", ");
  return [
    `${r.name} — speed ${r.speed} ft, size ${r.size}${bonus ? `, ${bonus}` : ""}`,
    r.age, r.alignment, r.size_description, r.language_desc,
    r.traits?.length ? `Traits: ${nomsDe(r.traits)}` : "",
    r.subraces?.length ? `Subraces: ${nomsDe(r.subraces)}` : "",
  ].filter(Boolean).join("\n");
}

export async function construire(dossier) {
  const d = {};
  for (const f of FICHIERS) d[f] = await charger(dossier, f);

  const entrees = [];
  const ajouter = (c, t, x) => { if (t && x) entrees.push({ c, t, x }); };

  for (const s of d["Rule-Sections"]) for (const m of decouperSection(s)) ajouter("regle", m.t, m.x);
  for (const c of d.Conditions) ajouter("condition", c.name, `${c.name}\n${texte(c.desc)}`);
  for (const s of d.Spells) ajouter("sort", s.name, ficheSort(s));
  for (const m of d.Monsters) ajouter("monstre", m.name, ficheMonstre(m));
  for (const o of d["Magic-Items"]) ajouter("objet-magique", o.name, `${o.name} — ${o.rarity?.name ?? ""}\n${texte(o.desc)}`);
  for (const e of d.Equipment) ajouter("equipement", e.name, ficheEquipement(e));
  for (const f of d.Features) {
    const qui = `${f.class?.name ?? ""}${f.subclass ? ` (${f.subclass.name})` : ""} level ${f.level}`;
    ajouter("capacite", f.name, `${f.name} — ${qui}\n${texte(f.desc)}`);
  }
  for (const t of d.Traits) {
    ajouter("trait", t.name, `${t.name} — ${[nomsDe(t.races), nomsDe(t.subraces)].filter(Boolean).join(", ")}\n${texte(t.desc)}`);
  }
  for (const r of d.Races) ajouter("race", r.name, ficheRace(r));
  for (const r of d.Subraces) ajouter("race", r.name, `${r.name} — subrace of ${r.race?.name}\n${texte(r.desc)}`);
  for (const c of d.Classes) ajouter("classe", c.name, ficheClasse(c));
  for (const s of d.Subclasses) ajouter("classe", `${s.class.name}: ${s.name}`, `${s.name} — ${s.class.name} ${s.subclass_flavor}\n${texte(s.desc)}`);
  for (const b of d.Backgrounds) {
    const feature = b.feature ? `\nFeature: ${b.feature.name}. ${texte(b.feature.desc)}` : "";
    ajouter("historique", b.name, `${b.name} — background. Skills: ${nomsDe(b.starting_proficiencies)}${feature}`);
  }
  for (const f of d.Feats) ajouter("don", f.name, `${f.name} — feat\n${texte(f.desc)}`);
  for (const s of d.Skills) ajouter("competence", s.name, `${s.name} (${s.ability_score.name})\n${texte(s.desc)}`);
  for (const p of d["Weapon-Properties"]) ajouter("regle", `Weapon property: ${p.name}`, `${p.name}\n${texte(p.desc)}`);
  for (const t of d["Damage-Types"]) ajouter("regle", `Damage type: ${t.name}`, `${t.name}\n${texte(t.desc)}`);
  for (const l of d.Languages) ajouter("regle", `Language: ${l.name}`, `${l.name} — ${l.type}. Typical speakers: ${(l.typical_speakers ?? []).join(", ")}. Script: ${l.script ?? "-"}`);

  const monstres = {};
  for (const m of d.Monsters) {
    const s = statsMonstre(m);
    if (s) monstres[m.name.toLowerCase()] = s;
  }

  return {
    titre: "System Reference Document 5.1",
    licence: "This work includes material taken from the System Reference Document 5.1 (\"SRD 5.1\") by "
      + "Wizards of the Coast LLC, licensed under the Creative Commons Attribution 4.0 International License "
      + "(https://creativecommons.org/licenses/by/4.0/legalcode). Data structured by the 5e-bits/5e-database project.",
    langue: "en",
    entrees,
    monstres,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const resultat = await construire(process.argv[2]);
  fs.mkdirSync(new URL("../regles/", import.meta.url), { recursive: true });
  fs.writeFileSync(SORTIE, JSON.stringify(resultat));
  const parCategorie = {};
  for (const e of resultat.entrees) parCategorie[e.c] = (parCategorie[e.c] ?? 0) + 1;
  console.log(`${resultat.entrees.length} fiches`, parCategorie, `${Object.keys(resultat.monstres).length} monstres jouables`);
  console.log(`→ ${SORTIE.pathname} (${Math.round(fs.statSync(SORTIE).size / 1024)} Ko)`);
}
