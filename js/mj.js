// L'IA maître du jeu : construit les consignes, appelle le modèle et exécute ses outils.

import * as srd from "./srd.js";
import { Moteur } from "./moteur.js";
import { resumeTexte } from "./personnage.js";
import { SCENARIOS } from "./scenarios.js";

const MAX_ETAPES = 14;       // appels d'outils maximum par tour de jeu
const HISTORIQUE_MAX = 40;   // messages gardés tels quels avant de résumer les plus anciens
const A_RESUMER = 20;        // nombre de messages condensés à chaque résumé

function outil(name, description, properties, required) {
  return { type: "function", function: { name, description, parameters: { type: "object", properties, required } } };
}

const BOOL = { type: "boolean" };
const STR = { type: "string" };

export const OUTILS = [
  outil("jet_de_test",
    "Fait lancer au joueur un test de compétence, de caractéristique ou un jet de sauvegarde. "
    + "Utilise-le dès que l'issue d'une action est incertaine.",
    {
      type: { type: "string", enum: ["competence", "caracteristique", "sauvegarde"] },
      nom: { type: "string", description: "Nom de la compétence (ex. Perception, Discrétion) ou caractéristique (FOR, DEX, CON, INT, SAG, CHA)" },
      dd: { type: "integer", description: "Degré de difficulté : 5 très facile, 10 facile, 15 moyen, 20 difficile, 25 très difficile" },
      avantage: BOOL, desavantage: BOOL,
      raison: { type: "string", description: "Ce que tente le personnage" },
    }, ["type", "nom"]),
  outil("lancer_des", "Lance des dés quelconques (ex. '2d6+1', '1d100'), pour du hasard narratif ou un effet non couvert par les autres outils.",
    { formule: STR, raison: STR }, ["formule"]),
  outil("commencer_combat",
    "Démarre un combat : crée les ennemis et lance l'initiative. Utilise les noms du bestiaire comme 'modele' "
    + "quand c'est possible, sinon précise ca, pv, attaque, degats.",
    {
      ennemis: {
        type: "array",
        items: {
          type: "object",
          properties: {
            nom: { type: "string", description: "Nom affiché (ex. 'Gobelin', 'Gruk le Borgne')" },
            modele: { type: "string", description: "Créature du bestiaire servant de base" },
            nombre: { type: "integer" },
            ca: { type: "integer" },
            pv: { type: "string", description: "Nombre ou formule" },
            attaque: { type: "integer", description: "Bonus au jet d'attaque" },
            degats: { type: "string", description: "Formule de dégâts, ex. '1d6+2'" },
            arme: { type: "string" },
            xp: { type: "integer" },
          },
          required: ["nom"],
        },
      },
      surprise: { type: "string", description: "Qui est surpris, le cas échéant" },
    }, ["ennemis"]),
  outil("attaque_joueur", "Le joueur attaque un ennemi avec une arme de sa fiche (jet d'attaque + dégâts).",
    {
      arme: STR, cible: { type: "string", description: "Identifiant de l'ennemi (ex. 'Gobelin 2')" },
      avantage: BOOL, desavantage: BOOL,
      degats_bonus: { type: "string", description: "Dés de dégâts en plus, ex. '1d6' pour une attaque sournoise de roublard" },
    }, ["arme", "cible"]),
  outil("lancer_sort", "Le joueur lance un sort qu'il connaît. Gère emplacements, jets d'attaque, sauvegardes des ennemis, dégâts et soins.",
    {
      sort: STR,
      cibles: { type: "array", items: STR, description: "Identifiants des ennemis visés, ou 'joueur' pour se soigner" },
      niveau_emplacement: { type: "integer", description: "Pour lancer à un niveau supérieur" },
    }, ["sort"]),
  outil("attaque_ennemi", "Un ennemi attaque (le joueur par défaut). Les dégâts sont appliqués automatiquement.",
    { ennemi: STR, cible: { type: "string", description: "'joueur' ou nom d'un PNJ allié" }, avantage: BOOL, desavantage: BOOL },
    ["ennemi"]),
  outil("degats_ennemi", "Inflige des dégâts à un ennemi hors attaque classique (piège, chute, objet lancé…).",
    { ennemi: STR, formule: STR, raison: STR }, ["ennemi", "formule"]),
  outil("changer_etat_ennemi", "Change l'état d'un ennemi : enfui, rendu, vaincu ou actif.",
    { ennemi: STR, etat: { type: "string", enum: ["actif", "enfui", "rendu", "vaincu"] } }, ["ennemi", "etat"]),
  outil("fin_combat", "Termine le combat et attribue l'XP des ennemis vaincus.",
    { issue: { type: "string", enum: ["victoire", "fuite", "negociation", "defaite"] } }, ["issue"]),
  outil("modifier_pv_joueur", "Inflige des dégâts ou soigne le joueur hors attaque d'ennemi (piège, chute, potion, repas…).",
    {
      type: { type: "string", enum: ["degats", "soin"] },
      formule: { type: "string", description: "Nombre ou formule, ex. '2d4+2'" }, raison: STR,
    }, ["type", "formule"]),
  outil("jet_contre_la_mort", "Jet de sauvegarde contre la mort quand le joueur est à 0 PV, à son tour.", {}, []),
  outil("utiliser_capacite", "Utilise une capacité de classe (Second souffle, Rage…).", { nom: STR }, ["nom"]),
  outil("gerer_inventaire", "Ajoute ou retire un objet de l'inventaire (trouvé, acheté, donné, consommé).",
    { action: { type: "string", enum: ["ajouter", "retirer"] }, objet: STR, quantite: { type: "integer" } },
    ["action", "objet"]),
  outil("modifier_or", "Ajoute (positif) ou retire (négatif) des pièces d'or.", { montant: { type: "integer" }, raison: STR }, ["montant"]),
  outil("donner_xp", "Donne de l'expérience pour une étape franchie, une énigme résolue, un bon roleplay "
    + "(l'XP des combats est donnée automatiquement par fin_combat).",
    { montant: { type: "integer" }, raison: STR }, ["montant"]),
  outil("repos", "Le joueur se repose : 'court' (1 heure) ou 'long' (8 heures).",
    { type: { type: "string", enum: ["court", "long"] } }, ["type"]),
  outil("modifier_condition", "Ajoute ou retire une condition (empoisonné, effrayé, à terre, entravé…).",
    { action: { type: "string", enum: ["ajouter", "retirer"] }, condition: STR }, ["action", "condition"]),
  outil("noter_journal", "Note un fait important à retenir pour la suite (PNJ rencontré, indice, quête, promesse, lieu). "
    + "Le journal est visible par le joueur : pas de secrets dedans.",
    { note: STR }, ["note"]),
];

const CONSIGNES = `\
Tu es le maître du jeu (MJ) d'une partie de jeu de rôle de fantasy basée sur les règles de la 5e édition \
(SRD 5.1), pour un seul joueur. Tu écris en français, à la deuxième personne (« tu »).

TON RÔLE
- Raconte de façon vivante et immersive : sens, ambiance, PNJ avec leur propre voix et leurs motivations.
- Le joueur décide de TOUTES les actions et paroles de son personnage. Ne les invente jamais à sa place.
- Termine chaque réponse en laissant la main au joueur (situation claire, sans lister de choix numérotés \
sauf s'il est perdu).
- Réponses de 80 à 250 mots en général ; plus courtes pendant les combats.
- Sois juste mais pas complaisant : les actions ont des conséquences, l'échec est possible et intéressant.
- Si le joueur tente quelque chose d'impossible ou d'incohérent, explique-le dans le récit.
- Ne révèle jamais tes notes secrètes directement : fais-les découvrir par l'enquête et le jeu.

RÈGLES ET OUTILS — TRÈS IMPORTANT
- Tu ne lances JAMAIS de dés toi-même et n'inventes aucun résultat : utilise toujours les outils. \
Leurs résultats font foi, raconte-les fidèlement (réussite, échec, dégâts).
- Demande un jet (jet_de_test) seulement quand l'issue est incertaine et intéressante.
- Toute modification de la fiche (PV, objets, or, XP, conditions, sorts, capacités) passe par un outil.
- Si un outil renvoie une erreur, corrige l'appel ou adapte le récit.
- COMBAT : appelle commencer_combat, puis respecte l'ordre d'initiative. Au tour du joueur, attends son \
action (sauf s'il l'a déjà décrite). Ensuite fais agir chaque ennemi actif avec attaque_ennemi (ou une \
autre action logique : fuir, se rendre…), jusqu'au prochain tour du joueur. Les ennemis endormis ne \
jouent pas. Quand le combat est fini, appelle fin_combat.
- Le joueur ne peut utiliser que ses armes, sorts et capacités de sa fiche. Un sort exige un emplacement libre.
- À 0 PV le joueur est inconscient : à chacun de ses tours, appelle jet_contre_la_mort. S'il meurt, \
raconte une fin digne et propose de relire son épopée.
- Récompense l'exploration et les bonnes idées avec donner_xp (25 à 100 XP par étape importante au niveau 1-3).
- Utilise noter_journal pour retenir les PNJ, indices et quêtes importants.

BESTIAIRE DISPONIBLE (modèles pour commencer_combat) : `;

export function construireSysteme(partie) {
  const sc = SCENARIOS[partie.scenario] ?? SCENARIOS.libre;
  const morceaux = [
    CONSIGNES + Object.entries(srd.MONSTRES).map(([n, m]) => `${n} (CA ${m.ca}, ${m.xp} XP)`).join(", "),
    `AVENTURE : ${sc.titre}\nNOTES SECRÈTES DU MJ :\n${sc.notes_mj}`,
    "FICHE DU PERSONNAGE (état actuel, fait foi) :\n" + resumeTexte(partie.personnage),
  ];
  const combat = partie.combat;
  if (combat) {
    const lignes = combat.ennemis.map((e) => `- ${e.id} : ${e.pv}/${e.pv_max} PV, CA ${e.ca}, ${e.etat}`);
    morceaux.push(`COMBAT EN COURS. Ordre d'initiative : ${combat.ordre.map((o) => o.nom).join(" → ")}\n${lignes.join("\n")}`);
  }
  if (partie.journal.length) morceaux.push("JOURNAL (faits établis) :\n" + partie.journal.map((n) => `- ${n}`).join("\n"));
  if (partie.resume) morceaux.push("RÉSUMÉ DE L'HISTOIRE JUSQU'ICI :\n" + partie.resume);
  return morceaux.join("\n\n");
}

/** Problème de communication avec le service d'IA, avec un message compréhensible. */
export class ErreurIA extends Error {}

/**
 * Crée la fonction qui interroge un service compatible OpenAI (Chat Completions).
 * Renvoie une fonction (messages, outils) => message de l'assistant.
 */
export function clientOpenAI({ cle, modele, adresse }) {
  const base = (adresse || "https://api.openai.com/v1").replace(/\/+$/, "");
  return async (messages, outils) => {
    const corps = { model: modele, messages };
    if (outils) corps.tools = outils;
    let reponse;
    try {
      reponse = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(cle ? { Authorization: `Bearer ${cle}` } : {}) },
        body: JSON.stringify(corps),
      });
    } catch {
      throw new ErreurIA("Impossible de joindre le service d'IA. Vérifie ta connexion internet (ou ton serveur local).");
    }
    let donnees = null;
    try { donnees = await reponse.json(); } catch { /* corps vide */ }
    if (!reponse.ok) throw new ErreurIA(messageErreur(reponse.status, donnees, modele));
    const msg = donnees?.choices?.[0]?.message;
    if (!msg) throw new ErreurIA("Réponse inattendue du service d'IA.");
    return msg;
  };
}

export async function listerModeles({ cle, adresse }) {
  const base = (adresse || "https://api.openai.com/v1").replace(/\/+$/, "");
  let reponse;
  try {
    reponse = await fetch(`${base}/models`, { headers: cle ? { Authorization: `Bearer ${cle}` } : {} });
  } catch {
    throw new ErreurIA("Impossible de joindre le service d'IA. Vérifie ta connexion internet.");
  }
  let donnees = null;
  try { donnees = await reponse.json(); } catch { /* corps vide */ }
  if (!reponse.ok) throw new ErreurIA(messageErreur(reponse.status, donnees, ""));
  let ids = (donnees?.data ?? []).map((m) => m.id).sort();
  if (!adresse) {
    const exclus = ["embedding", "whisper", "tts", "dall-e", "image", "audio", "realtime", "transcribe",
      "moderation", "search", "davinci", "babbage", "sora", "computer"];
    ids = ids.filter((i) => /^(gpt|o1|o3|o4|chatgpt)/.test(i) && !exclus.some((x) => i.includes(x)));
  }
  return ids;
}

export function messageErreur(statut, donnees, modele) {
  const err = donnees?.error ?? {};
  const code = err.code ?? "";
  const texte = err.message ?? "";
  if (statut === 401) return "La clé API est refusée. Vérifie-la dans les Réglages (⚙️).";
  if (code === "model_not_found" || (statut === 404 && modele)) {
    return `Le modèle « ${modele} » n'est pas disponible avec ce compte. Choisis-en un autre dans les Réglages.`;
  }
  if (statut === 429) {
    if (code === "insufficient_quota" || /quota/i.test(texte)) {
      return "Le compte OpenAI n'a plus de crédit. Ajoute du crédit sur platform.openai.com (Billing).";
    }
    return "Trop de requêtes d'un coup : attends quelques secondes et réessaie.";
  }
  return `Erreur du service d'IA (${statut}) : ${String(texte).slice(0, 300) || "erreur inconnue"}`;
}

function messageAssistant(msg) {
  const d = { role: "assistant", content: msg.content ?? "" };
  if (msg.tool_calls?.length) {
    d.tool_calls = msg.tool_calls.map((tc) => ({
      id: tc.id, type: "function", function: { name: tc.function.name, arguments: tc.function.arguments },
    }));
  }
  return d;
}

/**
 * Joue un tour : envoie l'action du joueur, exécute les outils, renvoie la narration.
 * Modifie `partie` directement : l'appelant travaille sur une copie et ne la garde qu'en cas de succès.
 * Un texteJoueur vide sert au tout premier tour (introduction de l'aventure).
 */
export async function jouerTour(partie, texteJoueur, appeler) {
  const sc = SCENARIOS[partie.scenario] ?? SCENARIOS.libre;
  const messageJoueur = texteJoueur || `[Début de la partie] ${sc.intro}`;
  const moteur = new Moteur(partie);
  const messages = [
    { role: "system", content: construireSysteme(partie) },
    ...partie.messages,
    { role: "user", content: messageJoueur },
  ];
  const narration = [];
  let termine = false;
  for (let etape = 0; etape < MAX_ETAPES; etape++) {
    const msg = await appeler(messages, OUTILS);
    if (msg.content && msg.content.trim()) narration.push(msg.content.trim());
    if (!msg.tool_calls?.length) {
      termine = true;
      break;
    }
    messages.push(messageAssistant(msg));
    for (const tc of msg.tool_calls) {
      let resultat;
      let args;
      try {
        args = JSON.parse(tc.function.arguments || "{}");
      } catch {
        args = null;
      }
      if (!args || typeof args !== "object" || Array.isArray(args)) resultat = { erreur: "Arguments JSON invalides." };
      else resultat = moteur.executer(tc.function.name, args);
      messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(resultat) });
    }
  }
  if (!termine) narration.push("(Le maître du jeu marque une pause… Que fais-tu ?)");

  const texteMj = narration.join("\n\n") || "(Le maître du jeu reste silencieux… Reformule ton action.)";
  partie.messages.push({ role: "user", content: messageJoueur }, { role: "assistant", content: texteMj });
  if (texteJoueur) partie.affichage.push({ type: "joueur", texte: texteJoueur });
  partie.affichage.push(...moteur.evenements, { type: "mj", texte: texteMj });
  return { narration: texteMj, evenements: moteur.evenements };
}

/** Résume les plus anciens échanges pour que la conversation ne devienne pas trop longue. */
export async function condenserMemoire(partie, appeler) {
  if (partie.messages.length <= HISTORIQUE_MAX) return false;
  const anciens = partie.messages.slice(0, A_RESUMER);
  const transcription = anciens.map((m) => `${m.role === "user" ? "JOUEUR" : "MJ"} : ${m.content}`).join("\n\n");
  const consigne = "Tu aides un maître du jeu à garder la mémoire d'une partie de jeu de rôle. Mets à jour le "
    + "résumé ci-dessous avec les nouveaux échanges. Garde les faits importants : lieux visités, PNJ "
    + "rencontrés et leur attitude, indices, objets, quêtes en cours, choix du joueur et leurs "
    + "conséquences. Écris en français, 300 mots maximum, au passé.";
  const contenu = `RÉSUMÉ ACTUEL :\n${partie.resume || "(aucun)"}\n\nNOUVEAUX ÉCHANGES :\n${transcription}`;
  const msg = await appeler([{ role: "system", content: consigne }, { role: "user", content: contenu }]);
  const resume = (msg.content ?? "").trim();
  if (!resume) return false;
  partie.resume = resume;
  partie.messages = partie.messages.slice(A_RESUMER);
  return true;
}
