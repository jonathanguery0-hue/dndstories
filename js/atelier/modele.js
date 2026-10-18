// L'atelier de scénarios : structure d'un scénario (livret à mettre en page) et sa conversion en
// aventure jouable par l'IA maître du jeu. Ce module ne touche ni au navigateur ni au stockage.

export const FORMAT = "contes-dragons-scenario";
export const VERSION = 1;

/** Types de blocs d'une partie, dans l'ordre des boutons de l'éditeur. */
export const TYPES_BLOCS = {
  texte: { nom: "Texte", icone: "¶" },
  intertitre: { nom: "Intertitre", icone: "H" },
  lire: { nom: "À lire aux joueurs", icone: "📢" },
  mj: { nom: "Note au MJ", icone: "🗝️" },
  image: { nom: "Image", icone: "🖼️" },
  saut: { nom: "Saut de colonne", icone: "↪" },
};

export const CARACS = ["FOR", "DEX", "CON", "INT", "SAG", "CHA"];

let compteur = 0;
export const nouvelId = (prefixe = "x") => `${prefixe}${Date.now().toString(36)}${(compteur++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const nouveauBloc = (type = "texte") => ({ id: nouvelId("b"), type, texte: "", ...(type === "image" ? { image: null, legende: "", taille: "colonne" } : {}) });

export const nouvellePartieLivret = (titre = "Nouvelle partie") => ({ id: nouvelId("p"), titre, image: null, blocs: [nouveauBloc("texte")] });

export const nouveauPnj = (nom = "Nouveau PNJ") => ({
  id: nouvelId("n"), nom, type: "Humanoïde de taille M", alignement: "", image: null, description: "",
  ca: 12, ca_detail: "", pv: 10, pv_formule: "", vitesse: "9 m",
  caracs: { FOR: 10, DEX: 10, CON: 10, INT: 10, SAG: 10, CHA: 10 },
  competences: "", sens: "", langues: "", puissance: "", xp: 0,
  traits: [], actions: [],
  // Ce que le moteur du jeu utilise en combat (une attaque type par tour).
  combat: { attaque: 3, degats: "1d6+1", type_degats: "", attaques: 1 },
});

export const nouvelleAide = (titre = "Aide de jeu") => ({ id: nouvelId("a"), titre, texte: "", image: null, manuscrit: false, consigne: "" });

export function nouveauScenario(titre = "Mon one-shot") {
  return {
    format: FORMAT, version: VERSION, id: nouvelId("s"), cree_le: Date.now(), maj_le: Date.now(),
    titre, prefixe: "One Shot", accroche: "", niveau: 3, duree: "", marque: "", auteurs: "",
    couverture: null, logo: null, mention: "Compatible 5e", credits: "",
    mot_mj: {
      titre: "Chère MJ,", image: null, signature: "",
      texte: "Bienvenue dans cette aventure !\n\nN'hésitez pas à adapter les rencontres à votre table et à récompenser l'ingéniosité de vos joueurs. Et surtout, amusez-vous !",
      a_savoir: "",
    },
    sommaire_image: null,
    parties: [nouvellePartieLivret("Introduction")],
    pnj: [],
    aides: [],
    ia: { intro: "", consignes: "" },
    images: {},
  };
}

/** Complète un scénario importé (fichier d'une version précédente, champs manquants) et le vérifie. */
export function normaliser(brut) {
  if (!brut || typeof brut !== "object" || brut.format !== FORMAT) {
    throw new Error("Ce fichier n'est pas un scénario de l'atelier Contes & Dragons.");
  }
  const base = nouveauScenario(brut.titre);
  const s = { ...base, ...brut, mot_mj: { ...base.mot_mj, ...brut.mot_mj }, ia: { ...base.ia, ...brut.ia } };
  s.parties = (Array.isArray(brut.parties) ? brut.parties : []).map((p) => ({
    ...nouvellePartieLivret(), ...p,
    blocs: (Array.isArray(p.blocs) ? p.blocs : []).filter((b) => TYPES_BLOCS[b?.type]).map((b) => ({ ...nouveauBloc(b.type), ...b })),
  }));
  s.pnj = (Array.isArray(brut.pnj) ? brut.pnj : []).map((n) => {
    const v = nouveauPnj();
    return {
      ...v, ...n, caracs: { ...v.caracs, ...n.caracs }, combat: { ...v.combat, ...n.combat },
      traits: Array.isArray(n.traits) ? n.traits : [], actions: Array.isArray(n.actions) ? n.actions : [],
    };
  });
  s.aides = (Array.isArray(brut.aides) ? brut.aides : []).map((a) => ({ ...nouvelleAide(), ...a }));
  s.images = brut.images && typeof brut.images === "object" ? brut.images : {};
  s.niveau = Math.min(Math.max(Math.round(Number(brut.niveau) || 1), 1), 20);
  return s;
}

/** Retire la mise en forme légère (**gras**, *italique*, __souligné__, [[PNJ]], [[PNJ|texte]]) pour l'IA. */
export function texteBrut(texte) {
  return String(texte ?? "")
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, nom, affiche) => affiche ?? nom)
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .trim();
}

export const modificateur = (v) => Math.floor((Number(v) - 10) / 2);
export const signe = (n) => (n >= 0 ? `+${n}` : String(n));

/** Statistiques de combat d'un PNJ, au format attendu par le moteur du jeu (commencer_combat). */
export function statsCombat(pnj) {
  const c = pnj.combat ?? {};
  return {
    ca: Number(pnj.ca) || 10,
    pv: String(pnj.pv_formule || pnj.pv || 1),
    attaque: Number(c.attaque) || 0,
    degats: String(c.degats || "1d4"),
    type_degats: String(c.type_degats || "").toLowerCase() || null,
    attaques: Math.min(Math.max(Number(c.attaques) || 1, 1), 4),
    dex: modificateur(pnj.caracs?.DEX ?? 10),
    sauvegarde: modificateur(pnj.caracs?.DEX ?? 10),
    xp: Number(pnj.xp) || 10,
    arme: pnj.actions?.[0]?.nom || "attaque",
  };
}

function texteBloc(b) {
  const t = texteBrut(b.texte);
  switch (b.type) {
    case "intertitre": return t ? `\n### ${t}` : "";
    case "lire": return t ? `[À DÉCRIRE AUX JOUEURS, à adapter] ${t}` : "";
    case "mj": return t ? `[CONSEIL AU MJ] ${t}` : "";
    case "image": {
      const legende = texteBrut(b.legende);
      return legende ? `[Illustration : ${legende}]` : "";
    }
    case "saut": return "";
    default: return t;
  }
}

/**
 * Transforme le livret en aventure pour le jeu : les notes secrètes du MJ (tout le scénario, sans la
 * mise en page), l'introduction, et un bestiaire avec les PNJ et monstres du scénario.
 */
export function versScenarioJeu(scenario) {
  const s = scenario;
  const lignes = [];
  lignes.push(`SCÉNARIO « ${s.titre} » — écrit pour une table de jeu (personnages de niveau ${s.niveau}).`);
  lignes.push("ADAPTATION : le joueur est seul. Adapte les scènes prévues pour un groupe (les PNJ alliés peuvent "
    + "l'accompagner, les combats sont à réduire si besoin), garde l'esprit, les secrets et les rebondissements du scénario. "
    + "Les textes « à décrire aux joueurs » sont des modèles : reformule-les à la deuxième personne.");
  const savoir = texteBrut(s.mot_mj?.a_savoir);
  if (savoir) lignes.push(`À SAVOIR : ${savoir}`);
  for (const p of s.parties) {
    const corps = p.blocs.map(texteBloc).filter(Boolean).join("\n");
    if (corps || p.titre) lignes.push(`\n## ${texteBrut(p.titre)}\n${corps}`);
  }
  if (s.pnj.length) {
    lignes.push("\n## PNJ ET MONSTRES (statistiques déjà chargées : utilise leur nom exact comme « modele » dans commencer_combat)");
    for (const n of s.pnj) {
      const k = statsCombat(n);
      const details = [n.type, n.alignement].filter(Boolean).join(", ");
      const capacites = [...n.traits, ...n.actions].map((t) => `${t.nom} : ${texteBrut(t.texte)}`).join(" ; ");
      lignes.push(`- ${n.nom}${details ? ` (${details})` : ""}. ${texteBrut(n.description)} `
        + `CA ${k.ca}, PV ${k.pv}, attaque +${k.attaque} (${k.degats}${k.type_degats ? ` ${k.type_degats}` : ""})`
        + `${k.attaques > 1 ? ` ×${k.attaques}` : ""}.${capacites ? ` Capacités : ${capacites}` : ""}`);
    }
  }
  for (const a of s.aides) {
    const t = texteBrut(a.texte);
    if (t || a.consigne) lignes.push(`\n## AIDE DE JEU « ${texteBrut(a.titre)} »${a.consigne ? ` (${texteBrut(a.consigne)})` : ""}\n${t}`);
  }
  if (s.ia?.consignes) lignes.push(`\nCONSIGNES DES AUTEURS POUR L'IA : ${texteBrut(s.ia.consignes)}`);

  const bestiaire = {};
  for (const n of s.pnj) if (n.nom) bestiaire[n.nom.trim().toLowerCase()] = { nom: n.nom.trim(), ...statsCombat(n) };
  const premiereLecture = s.parties.flatMap((p) => p.blocs).find((b) => b.type === "lire" && b.texte.trim());
  const intro = texteBrut(s.ia?.intro)
    || `Commence la partie « ${s.titre} » : présente la situation de départ du scénario`
      + `${premiereLecture ? ` (inspire-toi de : « ${texteBrut(premiereLecture.texte).slice(0, 400)} »)` : ""}, puis laisse le joueur agir.`;
  return {
    id: `perso-${s.id}`,
    titre: s.titre,
    accroche: texteBrut(s.accroche) || "Un scénario de l'atelier.",
    niveau: `Niveau ${s.niveau}`,
    niveau_depart: [1, 3, 5].includes(s.niveau) ? s.niveau : null,
    intro,
    notes_mj: lignes.join("\n"),
    bestiaire,
    perso: true,
  };
}

/**
 * Déduit l'attaque type d'un PNJ de ses actions (« +4 au toucher … 5 (1d6 + 2) dégâts perforants »,
 * « Attaques multiples … deux attaques »). Renvoie faux si aucune attaque n'est reconnue.
 */
export function remplirCombat(n) {
  const actions = [...n.actions, ...n.traits];
  const attaque = actions.find((a) => /au toucher/i.test(a.texte));
  if (!attaque) return false;
  const bonus = attaque.texte.match(/([+-]\s*\d+)\s*au toucher/i);
  const degats = attaque.texte.match(/\((\d+d\d+(?:\s*[+-]\s*\d+)?)\)\s*(?:dégâts?|points? de dégâts?)\s*([a-zéèêàç]+)?/i);
  if (bonus) n.combat.attaque = Number(bonus[1].replace(/\s+/g, ""));
  if (degats) {
    n.combat.degats = degats[1].replace(/\s+/g, "");
    if (degats[2]) n.combat.type_degats = degats[2].toLowerCase().replace(/s$/, "");
  }
  const multiples = actions.find((a) => /attaques? multiples/i.test(a.nom));
  const nombre = { deux: 2, trois: 3, quatre: 4 }[multiples?.texte.match(/\b(deux|trois|quatre)\b/i)?.[1]?.toLowerCase()];
  n.combat.attaques = multiples ? nombre ?? 2 : 1;
  return true;
}

/** Problèmes à corriger avant de publier ou de jouer (liste de phrases, vide si tout va bien). */
export function verifier(scenario) {
  const s = scenario;
  const alertes = [];
  if (!s.titre.trim()) alertes.push("Le scénario n'a pas de titre.");
  if (!s.parties.some((p) => p.blocs.some((b) => b.texte?.trim()))) alertes.push("Le scénario n'a encore aucun texte.");
  const noms = new Set(s.pnj.map((n) => n.nom.trim().toLowerCase()));
  for (const p of s.parties) {
    for (const b of p.blocs) {
      for (const m of String(b.texte ?? "").matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)) {
        if (!noms.has(m[1].trim().toLowerCase())) alertes.push(`« ${m[1]} » est cité dans « ${p.titre} » mais n'a pas de fiche PNJ.`);
      }
      if (b.type === "image" && b.image && !s.images[b.image]) alertes.push(`Une image de « ${p.titre} » est introuvable.`);
    }
  }
  for (const n of s.pnj) {
    if (!/^\d+d\d+([+-]\d+)?$|^\d+$/.test(String(n.combat?.degats ?? "").replace(/\s+/g, ""))) {
      alertes.push(`Les dégâts de « ${n.nom} » (« ${n.combat?.degats} ») ne sont pas une formule de dés valide (ex. 1d6+2).`);
    }
  }
  return [...new Set(alertes)];
}

/** Images réellement utilisées (pour alléger les fichiers exportés). */
export function imagesUtilisees(s) {
  const ids = new Set([s.couverture, s.logo, s.mot_mj?.image, s.sommaire_image]);
  for (const p of s.parties) { ids.add(p.image); for (const b of p.blocs) ids.add(b.image); }
  for (const n of s.pnj) ids.add(n.image);
  for (const a of s.aides) ids.add(a.image);
  ids.delete(null);
  ids.delete(undefined);
  return ids;
}

/** Copie prête à exporter : uniquement les images utilisées. */
export function pourExport(s) {
  const utiles = imagesUtilisees(s);
  return { ...s, images: Object.fromEntries(Object.entries(s.images).filter(([id]) => utiles.has(id))) };
}
