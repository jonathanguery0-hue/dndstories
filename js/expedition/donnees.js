// Données du mode « Expéditions » : héros, compétences, talents, ennemis, reliques, objets et événements.
//
// Règles simplifiées inspirées de la 5e édition : d20 + modificateur + maîtrise contre la CA,
// critique sur 20 (dés de dégâts doublés), échec automatique sur 1, jets de sauvegarde contre un DD.

export const CARACS = ["FOR", "DEX", "CON", "INT", "SAG"];
export const NOMS_CARACS = { FOR: "Force", DEX: "Dextérité", CON: "Constitution", INT: "Intelligence", SAG: "Sagesse" };

export const NIVEAU_MAX = 10;
/** XP à gagner pour passer du niveau n au niveau n + 1. */
export const xpPourNiveau = (n) => 100 * n;

export const DIFFICULTES = {
  facile: { nom: "Facile", pv: 0.75, degats: 0.75, att: -1, or: 0.8, xp: 0.8, desc: "Pour découvrir le jeu tranquillement." },
  normal: { nom: "Normal", pv: 1, degats: 1, att: 0, or: 1, xp: 1, desc: "L'aventure telle qu'elle a été pensée." },
  difficile: { nom: "Difficile", pv: 1.3, degats: 1.2, att: 1, or: 1.4, xp: 1.5, desc: "Gobelins plus coriaces, butin plus riche." },
  cauchemar: { nom: "Cauchemar", pv: 1.9, degats: 1.6, att: 3, or: 1.8, xp: 2, desc: "Réservé aux héros aguerris. Débloqué après une victoire en Difficile." },
};

// ------------------------------------------------------------------ compétences
//
// type :
//   attaque      jet d'attaque avec l'arme (d20 + att) ; des_bonus s'ajoute aux dégâts
//   sort_attaque jet d'attaque magique (d20 + maîtrise + carac) ; des + carac
//   sort_auto    touche toujours ; des + carac
//   sort_zone    tous les ennemis font un jet de sauvegarde (DEX) ; moitié des dégâts si réussi
//   soin         soigne le héros : des + carac (+ niveau si niveau: true)
//   buff         effet sur le héros pendant `duree` tours
// cible : "ennemi" (une cible), "tous" (tous les ennemis), "soi"
// cout : points de magie (PM) ; par_combat : nombre d'utilisations par combat (sinon illimité)

export const COMPETENCES = {
  // Guerrier
  coup_puissant: { nom: "Coup puissant", icone: "💥", type: "attaque", cible: "ennemi", cout: 2, des_bonus: "1d8",
    desc: "Une attaque de toutes tes forces : +1d8 dégâts." },
  second_souffle: { nom: "Second souffle", icone: "❤️‍🩹", type: "soin", cible: "soi", cout: 0, par_combat: 1, des: "1d10", niveau: true,
    desc: "Reprends ton souffle : soigne 1d10 + niveau PV. Une fois par combat." },
  tourbillon: { nom: "Tourbillon", icone: "🌀", type: "attaque", cible: "tous", cout: 3,
    desc: "Frappe tous les ennemis d'un coup (un jet d'attaque par ennemi)." },
  cri_de_guerre: { nom: "Cri de guerre", icone: "📯", type: "buff", cible: "soi", cout: 2, duree: 3,
    effet: { att: 2, degats: 2 }, desc: "+2 à l'attaque et aux dégâts pendant 3 tours." },
  // Mage
  projectile_magique: { nom: "Projectile magique", icone: "✨", type: "sort_auto", cible: "ennemi", cout: 1, des: "3d4", carac: "INT",
    desc: "Trois fléchettes de force qui touchent toujours : 3d4 + INT." },
  rayon_de_givre: { nom: "Rayon de givre", icone: "❄️", type: "sort_attaque", cible: "ennemi", cout: 2, des: "2d8", carac: "INT",
    statut: { id: "affaibli", duree: 2 }, desc: "2d8 + INT de froid ; la cible est affaiblie (−2 attaque et dégâts) 2 tours." },
  boule_de_feu: { nom: "Boule de feu", icone: "🔥", type: "sort_zone", cible: "tous", cout: 4, des: "3d6", carac: "INT",
    desc: "Explosion sur tous les ennemis : 3d6 + INT (moitié si sauvegarde DEX réussie)." },
  armure_de_mage: { nom: "Armure de mage", icone: "🔮", type: "buff", cible: "soi", cout: 1, duree: 5, effet: { ca: 3 },
    desc: "+3 CA pendant 5 tours." },
  // Roublard
  attaque_sournoise: { nom: "Attaque sournoise", icone: "🗡️", type: "attaque", cible: "ennemi", cout: 2, des_bonus: "2d6", avantage: true,
    desc: "Attaque avec avantage (deux d20, on garde le meilleur) et +2d6 dégâts." },
  lame_empoisonnee: { nom: "Lame empoisonnée", icone: "🧪", type: "attaque", cible: "ennemi", cout: 1,
    statut: { id: "poison", duree: 3, valeur: "1d4+1" }, desc: "Attaque qui empoisonne la cible : 1d4+1 dégâts par tour pendant 3 tours." },
  coup_bas: { nom: "Coup bas", icone: "👊", type: "attaque", cible: "ennemi", cout: 3, statut: { id: "etourdi", duree: 1 },
    desc: "Attaque qui étourdit la cible : elle perd son prochain tour." },
  evasion: { nom: "Évasion", icone: "💨", type: "buff", cible: "soi", cout: 2, duree: 2, effet: { ca: 5 },
    desc: "+5 CA pendant 2 tours." },
  // Clerc
  soins: { nom: "Soins", icone: "💖", type: "soin", cible: "soi", cout: 2, des: "2d8", carac: "SAG",
    desc: "Soigne 2d8 + SAG PV." },
  flamme_sacree: { nom: "Flamme sacrée", icone: "☀️", type: "sort_attaque", cible: "ennemi", cout: 1, des: "2d8", carac: "SAG",
    desc: "Une flamme divine : 2d8 + SAG de dégâts radiants." },
  benediction: { nom: "Bénédiction", icone: "🙏", type: "buff", cible: "soi", cout: 2, duree: 4, effet: { att: 2, ca: 1 },
    desc: "+2 à l'attaque et +1 CA pendant 4 tours." },
  esprits_gardiens: { nom: "Esprits gardiens", icone: "👼", type: "buff", cible: "soi", cout: 3, duree: 3, effet: { aura: "2d6" },
    desc: "Des esprits infligent 2d6 dégâts à chaque ennemi à la fin de tes 3 prochains tours." },
};

// ------------------------------------------------------------------ talents
//
// effets cumulables : pv, pm, ca, att, degats, crit (abaisse le seuil de critique), sorts (+dégâts des sorts),
// soins (+PV soignés), garde (+CA en défense), regen (PV regagnés en fin de combat), competence (débloque).

const talent = (id, nom, desc, effets, requis = null) => ({ id, nom, desc, effets, requis });

export const HEROS = {
  guerrier: {
    id: "guerrier", nom: "Brann", titre: "Guerrier", couleur: "#c0533f",
    desc: "Robuste et simple à jouer : grosse armure, coups puissants.",
    caracs: { FOR: 16, DEX: 12, CON: 15, INT: 8, SAG: 10 }, principale: "FOR",
    pv: 30, pv_niveau: 7, pm: 3, ca: 16,
    arme: { nom: "Épée longue", des: "1d8" },
    competences: ["coup_puissant", "second_souffle"],
    branches: [
      { nom: "Rempart", talents: [
        talent("g_peau", "Peau de fer", "+1 CA", { ca: 1 }),
        talent("g_robuste", "Robustesse", "+10 PV max", { pv: 10 }, "g_peau"),
        talent("g_rempart", "Rempart", "Se défendre donne +3 CA de plus", { garde: 3 }, "g_robuste"),
      ] },
      { nom: "Assaut", talents: [
        talent("g_maitrise", "Maîtrise martiale", "+1 à l'attaque", { att: 1 }),
        talent("g_critique", "Critique amélioré", "Critique sur 19 ou 20", { crit: 1 }, "g_maitrise"),
        talent("g_tourbillon", "Tourbillon", "Nouvelle compétence : frappe tous les ennemis", { competence: "tourbillon" }, "g_critique"),
      ] },
      { nom: "Meneur", talents: [
        talent("g_souffle", "Souffle profond", "Tes soins rendent +4 PV", { soins: 4 }),
        talent("g_vigueur", "Vigueur", "+1 PM max", { pm: 1 }, "g_souffle"),
        talent("g_cri", "Cri de guerre", "Nouvelle compétence : +2 attaque et dégâts", { competence: "cri_de_guerre" }, "g_vigueur"),
      ] },
    ],
  },
  mage: {
    id: "mage", nom: "Ilsa", titre: "Mage", couleur: "#8a5cc4",
    desc: "Fragile mais redoutable : sorts puissants, gestion des PM.",
    caracs: { FOR: 8, DEX: 14, CON: 12, INT: 16, SAG: 12 }, principale: "INT",
    pv: 26, pv_niveau: 5, pm: 7, ca: 13,
    arme: { nom: "Bâton", des: "1d6", carac: "DEX" },
    competences: ["projectile_magique", "rayon_de_givre", "armure_de_mage"],
    branches: [
      { nom: "Évocation", talents: [
        talent("m_puissance", "Puissance arcanique", "+2 dégâts des sorts", { sorts: 2 }),
        talent("m_reserve", "Réserve de mana", "+2 PM max", { pm: 2 }, "m_puissance"),
        talent("m_boule", "Boule de feu", "Nouvelle compétence : explosion sur tous les ennemis", { competence: "boule_de_feu" }, "m_reserve"),
      ] },
      { nom: "Abjuration", talents: [
        talent("m_armure", "Bouclier arcanique", "+1 CA", { ca: 1 }),
        talent("m_robuste", "Endurance", "+8 PV max", { pv: 8 }, "m_armure"),
        talent("m_garde", "Bouclier réflexe", "Se défendre donne +3 CA de plus", { garde: 3 }, "m_robuste"),
      ] },
      { nom: "Savoir", talents: [
        talent("m_concentration", "Concentration", "+1 PM max", { pm: 1 }),
        talent("m_precision", "Précision", "+1 à l'attaque (armes et sorts)", { att: 1 }, "m_concentration"),
        talent("m_critique", "Sorts critiques", "Critique sur 19 ou 20", { crit: 1 }, "m_precision"),
      ] },
    ],
  },
  roublard: {
    id: "roublard", nom: "Vex", titre: "Roublard", couleur: "#5a9a6a",
    desc: "Rapide et rusé : avantage, poison et coups critiques.",
    caracs: { FOR: 10, DEX: 16, CON: 13, INT: 12, SAG: 10 }, principale: "DEX",
    pv: 26, pv_niveau: 6, pm: 4, ca: 14,
    arme: { nom: "Dagues", des: "1d6" },
    competences: ["attaque_sournoise", "lame_empoisonnee"],
    branches: [
      { nom: "Assassin", talents: [
        talent("r_critique", "Coups précis", "Critique sur 19 ou 20", { crit: 1 }),
        talent("r_lames", "Lames affûtées", "+2 dégâts", { degats: 2 }, "r_critique"),
        talent("r_coup_bas", "Coup bas", "Nouvelle compétence : étourdit la cible", { competence: "coup_bas" }, "r_lames"),
      ] },
      { nom: "Ombre", talents: [
        talent("r_agile", "Agilité", "+1 CA", { ca: 1 }),
        talent("r_evasion", "Évasion", "Nouvelle compétence : +5 CA pendant 2 tours", { competence: "evasion" }, "r_agile"),
        talent("r_survie", "Instinct de survie", "+10 PV max", { pv: 10 }, "r_evasion"),
      ] },
      { nom: "Filou", talents: [
        talent("r_vif", "Esprit vif", "+1 PM max", { pm: 1 }),
        talent("r_precision", "Précision", "+1 à l'attaque", { att: 1 }, "r_vif"),
        talent("r_pillard", "Pillard", "+30 % d'or ramassé", { or: 0.3 }, "r_precision"),
      ] },
    ],
  },
  clerc: {
    id: "clerc", nom: "Sœur Aube", titre: "Clerc", couleur: "#d4a64a",
    desc: "Soigneuse et solide : magie divine et armure lourde. Se débloque en battant le Roi gobelin.",
    caracs: { FOR: 14, DEX: 10, CON: 14, INT: 10, SAG: 16 }, principale: "SAG",
    pv: 26, pv_niveau: 6, pm: 5, ca: 16,
    arme: { nom: "Masse", des: "1d6", carac: "FOR" },
    competences: ["flamme_sacree", "soins"],
    deblocage: "Vaincre Grokk, le Roi gobelin",
    branches: [
      { nom: "Vie", talents: [
        talent("c_soins", "Disciple de la vie", "Tes soins rendent +4 PV", { soins: 4 }),
        talent("c_regen", "Grâce", "Regagne 4 PV après chaque combat", { regen: 4 }, "c_soins"),
        talent("c_robuste", "Foi inébranlable", "+10 PV max", { pv: 10 }, "c_regen"),
      ] },
      { nom: "Lumière", talents: [
        talent("c_radiance", "Radiance", "+2 dégâts des sorts", { sorts: 2 }),
        talent("c_benediction", "Bénédiction", "Nouvelle compétence : +2 attaque et +1 CA", { competence: "benediction" }, "c_radiance"),
        talent("c_esprits", "Esprits gardiens", "Nouvelle compétence : dégâts à tous les ennemis chaque tour", { competence: "esprits_gardiens" }, "c_benediction"),
      ] },
      { nom: "Guerre", talents: [
        talent("c_bouclier", "Bouclier sacré", "+1 CA", { ca: 1 }),
        talent("c_ferveur", "Ferveur", "+1 PM max", { pm: 1 }, "c_bouclier"),
        talent("c_frappe", "Frappe divine", "+2 dégâts avec l'arme", { degats: 2 }, "c_ferveur"),
      ] },
    ],
  },
};

export const ORDRE_HEROS = ["guerrier", "mage", "roublard", "clerc"];

// ------------------------------------------------------------------ forge (équipement permanent)

export const FORGE = {
  arme: { nom: "Arme", icone: "⚔️", niveaux: ["Ordinaire", "Aiguisée", "Runique", "Légendaire"], prix: [60, 150, 300],
    desc: (n) => `+${n} attaque et dégâts` },
  armure: { nom: "Armure", icone: "🛡️", niveaux: ["Ordinaire", "Renforcée", "Runique", "Légendaire"], prix: [70, 170, 320],
    desc: (n) => `+${n} CA` },
  talisman: { nom: "Talisman", icone: "📿", niveaux: ["Aucun", "Cuivre", "Argent", "Or"], prix: [50, 130, 260],
    desc: (n) => `+${5 * n} PV max${n >= 2 ? `, +${n - 1} PM max` : ""}` },
};

// ------------------------------------------------------------------ ennemis
//
// pv, ca, att (bonus au jet), degats (formule), dex (modificateur de sauvegarde), xp, or [min, max].
// ia : comportement particulier (voir moteur.js). taille : échelle du dessin.

export const ENNEMIS = {
  gobelin: { nom: "Gobelin", sprite: "gobelin", pv: 7, ca: 13, att: 4, degats: "1d6+1", dex: 2, xp: 12, or: [2, 6], cout: 1 },
  archer: { nom: "Archer gobelin", sprite: "archer", pv: 6, ca: 12, att: 4, degats: "1d6+1", dex: 2, xp: 12, or: [2, 6], cout: 1 },
  chaman: { nom: "Chaman gobelin", sprite: "chaman", pv: 9, ca: 11, att: 4, degats: "2d4", dex: 1, xp: 18, or: [4, 9], cout: 1.5, ia: "chaman" },
  loup: { nom: "Loup des cavernes", sprite: "loup", pv: 11, ca: 13, att: 4, degats: "2d4", dex: 2, xp: 16, or: [0, 2], cout: 1.5, ia: "loup" },
  gobelours: { nom: "Gobelours", sprite: "gobelours", pv: 22, ca: 14, att: 5, degats: "2d6+2", dex: 1, xp: 45, or: [10, 20], ia: "brute", taille: 1.25, elite: true },
  capitaine: { nom: "Capitaine hobgobelin", sprite: "capitaine", pv: 20, ca: 15, att: 5, degats: "1d8+2", dex: 1, xp: 45, or: [12, 22], ia: "capitaine", taille: 1.15, elite: true },
  roi: { nom: "Grokk, Roi gobelin", sprite: "roi", pv: 40, ca: 14, att: 5, degats: "1d10+2", dex: 1, xp: 120, or: [40, 60], ia: "roi", taille: 1.5, boss: true },
};

// ------------------------------------------------------------------ reliques (valables pour une expédition)

export const RELIQUES = {
  dent_gobelin: { nom: "Dent de gobelin", icone: "🦷", desc: "+1 dégâts", effets: { degats: 1 } },
  cape_ombre: { nom: "Cape d'ombre", icone: "🧥", desc: "+1 CA", effets: { ca: 1 } },
  pierre_mana: { nom: "Pierre de mana", icone: "💎", desc: "+1 PM max", effets: { pm: 1 } },
  coeur_troll: { nom: "Cœur de troll", icone: "🫀", desc: "+8 PV max", effets: { pv: 8 } },
  anneau_vie: { nom: "Anneau de vie", icone: "💍", desc: "Regagne 4 PV après chaque combat", effets: { regen: 4 } },
  trefle: { nom: "Trèfle à quatre feuilles", icone: "🍀", desc: "Critique sur un seuil abaissé de 1", effets: { crit: 1 } },
  bourse: { nom: "Bourse gobeline", icone: "👝", desc: "+25 % d'or ramassé", effets: { or: 0.25 } },
  bottes: { nom: "Bottes de célérité", icone: "👢", desc: "Avantage à ta première attaque de chaque combat", effets: { premiere: 1 } },
  orbe: { nom: "Orbe ardent", icone: "🔴", desc: "+2 dégâts des sorts", effets: { sorts: 2 } },
  fiole: { nom: "Fiole sans fond", icone: "⚗️", desc: "Les potions soignent 50 % de plus", effets: { potions: 0.5 } },
  gantelet: { nom: "Gantelet du chef", icone: "🧤", desc: "+1 à l'attaque", effets: { att: 1 } },
  sang_troll: { nom: "Sang de troll", icone: "🩸", desc: "Regagne 1 PV au début de chacun de tes tours", effets: { regen_tour: 1 } },
};

// ------------------------------------------------------------------ objets consommables

export const OBJETS = {
  potion: { nom: "Potion de soins", icone: "🧪", desc: "Soigne 2d4 + 4 PV.", prix: 25, soin: "2d4+4" },
  grande_potion: { nom: "Grande potion", icone: "🍷", desc: "Soigne 4d4 + 6 PV.", prix: 45, soin: "4d4+6" },
  ether: { nom: "Éther", icone: "🔷", desc: "Rend 3 PM.", prix: 25, pm: 3 },
  bombe: { nom: "Bombe gobeline", icone: "💣", desc: "Inflige 2d6 + 2 dégâts à tous les ennemis.", prix: 35, zone: "2d6+2" },
};

// ------------------------------------------------------------------ événements
//
// Chaque choix : test { carac, dd } facultatif, puis succes / echec (ou resultat sans test).
// Effets : or, pv (négatif = dégâts, "max" = soin complet), pv_pct, objet, relique ("hasard"), xp, combat.

export const EVENEMENTS = [
  {
    id: "coffre", titre: "Un coffre suspect", icone: "🧰",
    texte: "Un coffre cerclé de fer trône au milieu de la salle. Un fil presque invisible court jusqu'à la serrure.",
    choix: [
      { texte: "Désamorcer le piège", test: { carac: "DEX", dd: 12 },
        succes: { texte: "Le fil cède sans un bruit. Le coffre regorge de pièces !", or: 40 },
        echec: { texte: "Clac ! Une aiguille te pique la main avant que le couvercle s'ouvre.", pv: -6, or: 20 } },
      { texte: "Forcer le couvercle", test: { carac: "FOR", dd: 13 },
        succes: { texte: "Le couvercle vole en éclats avant que le piège ne se déclenche.", or: 35 },
        echec: { texte: "Le piège crache un nuage de fumée âcre. Tu tousses, les yeux en larmes.", pv: -8, or: 15 } },
      { texte: "Laisser le coffre", resultat: { texte: "Mieux vaut ne pas tenter le diable." } },
    ],
  },
  {
    id: "gobelin_blesse", titre: "Un gobelin blessé", icone: "🩹",
    texte: "Un petit gobelin, une flèche dans la jambe, lève ses mains griffues : « Pitié ! Moi connaître passages secrets ! »",
    choix: [
      { texte: "L'épargner et le soigner", resultat: { texte: "Reconnaissant, il te glisse une fiole volée avant de détaler.", objet: "potion" } },
      { texte: "L'interroger", test: { carac: "SAG", dd: 11 },
        succes: { texte: "Il t'indique la cachette où son clan garde son butin.", or: 45 },
        echec: { texte: "Il en profite pour te mordre la main et filer dans un trou.", pv: -3 } },
      { texte: "Lui demander où dort le roi", test: { carac: "INT", dd: 12 },
        succes: { texte: "Il te décrit les habitudes de Grokk. Tu en retiens une leçon précieuse.", xp: 25 },
        echec: { texte: "Son charabia ne t'apprend rien du tout." } },
    ],
  },
  {
    id: "fontaine", titre: "La fontaine scintillante", icone: "⛲",
    texte: "Une eau argentée jaillit d'une vieille fontaine de pierre. Des pièces brillent au fond du bassin.",
    choix: [
      { texte: "Boire l'eau", test: { carac: "CON", dd: 10 },
        succes: { texte: "Une chaleur bienfaisante t'envahit. Tes blessures se referment.", pv: "max" },
        echec: { texte: "L'eau est croupie ! Ton estomac se tord.", pv: -5 } },
      { texte: "Ramasser les pièces", test: { carac: "SAG", dd: 12 },
        succes: { texte: "Tu repêches les pièces sans réveiller l'esprit de la fontaine.", or: 30 },
        echec: { texte: "Une main d'eau glacée te gifle et te repousse.", pv: -4, or: 10 } },
      { texte: "Remplir une fiole", resultat: { texte: "Tu remplis une fiole d'eau argentée pour plus tard.", objet: "potion" } },
    ],
  },
  {
    id: "autel", titre: "L'autel oublié", icone: "🕯️",
    texte: "Un autel couvert de runes palpite d'une lueur rouge. Une relique repose dessus, enveloppée de ronces.",
    choix: [
      { texte: "Offrir ton sang", resultat: { texte: "Les ronces boivent ton sang puis s'écartent. La relique est à toi.", pv_pct: -0.2, relique: "hasard" } },
      { texte: "Déchiffrer les runes", test: { carac: "INT", dd: 13 },
        succes: { texte: "Tu prononces le mot juste : les ronces se fanent d'elles-mêmes.", relique: "hasard" },
        echec: { texte: "Les runes s'embrasent et te brûlent les doigts.", pv: -7 } },
      { texte: "Partir", resultat: { texte: "Certaines choses ne doivent pas être touchées." } },
    ],
  },
  {
    id: "pont", titre: "Le pont de corde", icone: "🌉",
    texte: "Un pont branlant enjambe un gouffre. De l'autre côté, un sac oublié par des pillards.",
    choix: [
      { texte: "Traverser en courant", test: { carac: "DEX", dd: 12 },
        succes: { texte: "Tu bondis de planche en planche et récupères le sac.", or: 35, objet: "ether" },
        echec: { texte: "Une planche cède ! Tu te rattrapes de justesse, couvert d'égratignures.", pv: -8 } },
      { texte: "Avancer prudemment", test: { carac: "SAG", dd: 9 },
        succes: { texte: "Pas à pas, tu atteins le sac sans encombre.", or: 25 },
        echec: { texte: "Le pont tangue tant que tu dois faire demi-tour.", pv: -2 } },
      { texte: "Faire le tour", resultat: { texte: "Le détour est long, mais tu arrives entier." } },
    ],
  },
  {
    id: "des", titre: "La partie de dés", icone: "🎲",
    texte: "Trois gobelins jouent aux osselets autour d'un feu. « Toi jouer ? Mise vingt pièces ! »",
    choix: [
      { texte: "Jouer honnêtement (20 or)", cout: 20, test: { carac: "SAG", dd: 11 },
        succes: { texte: "Double six ! Les gobelins grognent en te tendant tes gains.", or: 45 },
        echec: { texte: "Tu perds ta mise sous les ricanements." } },
      { texte: "Tricher", test: { carac: "DEX", dd: 14 },
        succes: { texte: "Un dé pipé glissé dans ta manche, et la cagnotte est à toi.", or: 50 },
        echec: { texte: "« TRICHEUR ! » Les gobelins sortent leurs couteaux.", combat: ["gobelin", "gobelin"] } },
      { texte: "Les attaquer", resultat: { texte: "Tu renverses le feu d'un coup de pied : à l'attaque !", combat: ["gobelin", "gobelin", "archer"], bonus_or: 30 } },
    ],
  },
  {
    id: "forge_naine", titre: "La forge abandonnée", icone: "⚒️",
    texte: "Une forge naine encore tiède. Une enclume, des outils, et une pierre à aiguiser runique.",
    choix: [
      { texte: "Aiguiser ton arme", test: { carac: "FOR", dd: 11 },
        succes: { texte: "Ton arme n'a jamais été aussi tranchante.", relique: "dent_gobelin" },
        echec: { texte: "La pierre se brise. Tu t'entailles le pouce.", pv: -3 } },
      { texte: "Fouiller les étagères", resultat: { texte: "Tu trouves une bombe gobeline oubliée dans un seau.", objet: "bombe" } },
      { texte: "Te reposer près du feu", resultat: { texte: "La chaleur de la forge te redonne des forces.", pv_pct: 0.25 } },
    ],
  },
];

// ------------------------------------------------------------------ carte de l'expédition

export const TYPES_SALLES = {
  combat: { nom: "Combat", icone: "⚔️" },
  elite: { nom: "Élite", icone: "💀" },
  evenement: { nom: "Événement", icone: "❓" },
  tresor: { nom: "Trésor", icone: "💰" },
  marchand: { nom: "Marchand", icone: "🛒" },
  repos: { nom: "Feu de camp", icone: "🔥" },
  boss: { nom: "Roi gobelin", icone: "👑" },
};

export const NB_ETAGES = 7; // salles avant le boss (environ 10 à 15 minutes de jeu)
