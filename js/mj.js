// L'IA maître du jeu : construit les consignes, appelle le modèle et exécute ses outils.

import * as srd from "./srd.js";
import { ErreurAction, Moteur } from "./moteur.js";
import { CATEGORIES, chargerRegles, rechercher } from "./regles.js";
import { resumeTexte } from "./personnage.js";
import { SCENARIOS } from "./scenarios.js";

const MAX_ETAPES = 10;       // appels d'outils maximum par tour de jeu
const HISTORIQUE_MAX = 24;   // messages gardés tels quels (12 échanges) avant de résumer les plus anciens
const A_RESUMER = 12;        // nombre de messages condensés à chaque résumé

// Prix indicatifs en dollars par million de jetons : [entrée, entrée en cache, sortie].
// Ce ne sont que des estimations pour afficher un ordre de grandeur (vérifier sur openai.com/api/pricing).
export const PRIX_MODELES = {
  "gpt-5-nano": [0.05, 0.005, 0.4],
  "gpt-5-mini": [0.25, 0.025, 2],
  "gpt-5": [1.25, 0.125, 10],
  "gpt-4.1-nano": [0.1, 0.025, 0.4],
  "gpt-4.1-mini": [0.4, 0.1, 1.6],
  "gpt-4o-mini": [0.15, 0.075, 0.6],
};

/**
 * Réglages qui limitent le coût de chaque appel : peu de « réflexion » cachée pour les modèles qui
 * raisonnent (elle est facturée comme du texte écrit) et une longueur de réponse plafonnée.
 */
export function parametresEconomie(modele) {
  const m = String(modele ?? "");
  if (/^(gpt-5|o\d)/.test(m)) return { reasoning_effort: effortMinimal(m), max_completion_tokens: 4000 };
  return { max_completion_tokens: 1200 };
}

/**
 * Le plus bas niveau de réflexion accepté : « minimal » pour gpt-5, gpt-5-mini et gpt-5-nano, « none »
 * pour gpt-5.1 et suivants, « low » sinon. Si OpenAI le refuse, requeteIA réessaie avec « low ».
 */
export function effortMinimal(modele) {
  if (/^gpt-5(-mini|-nano)?(-\d{4}-\d{2}-\d{2})?$/.test(modele)) return "minimal";
  if (/^gpt-5\.\d/.test(modele)) return "none";
  return "low";
}

/** Vrai si OpenAI refuse le niveau de réflexion demandé (on réessaie alors avec « low »). */
export const refusEffort = (statut, donnees) => statut === 400
  && /reasoning[._]effort/i.test(`${donnees?.error?.param ?? ""} ${donnees?.error?.message ?? ""}`);

/** Ajoute la consommation d'un appel au compteur de la partie. */
export function compterConsommation(partie, usage, modele) {
  if (!usage) return;
  const c = partie.consommation ??= { appels: 0, entree: 0, cache: 0, sortie: 0, cout: 0 };
  const cache = usage.prompt_tokens_details?.cached_tokens ?? 0;
  const entree = usage.prompt_tokens ?? 0;
  const sortie = usage.completion_tokens ?? 0;
  c.appels += 1;
  c.entree += entree;
  c.cache += cache;
  c.sortie += sortie;
  const prix = Object.entries(PRIX_MODELES).sort((a, b) => b[0].length - a[0].length)
    .find(([nom]) => String(modele ?? "").startsWith(nom))?.[1];
  if (prix) c.cout += ((entree - cache) * prix[0] + cache * prix[1] + sortie * prix[2]) / 1e6;
  else c.cout_inconnu = true;
}

function outil(name, description, properties, required) {
  return { type: "function", function: { name, description, parameters: { type: "object", properties, required } } };
}

const BOOL = { type: "boolean" };
const TYPE_DEGATS = { type: "string", enum: srd.TYPES_DEGATS, description: "Type de dégâts (les résistances du joueur en dépendent)" };
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
            type_degats: TYPE_DEGATS,
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
  outil("tour_des_ennemis", "Fait attaquer le joueur par tous les ennemis actifs, dans l'ordre d'initiative. "
    + "À utiliser une fois par round après l'action du joueur, plutôt que attaque_ennemi pour chacun.",
    {
      avantage: BOOL, desavantage: { type: "boolean", description: "Ex. le joueur esquive (action Esquiver)" },
      sauf: { type: "array", items: STR, description: "Ennemis qui font autre chose (fuir, parler, soigner…)" },
    }, []),
  outil("attaque_ennemi", "Un ennemi attaque (le joueur par défaut). Les dégâts sont appliqués automatiquement.",
    {
      ennemi: STR, cible: { type: "string", description: "'joueur' ou nom d'un PNJ allié" }, avantage: BOOL, desavantage: BOOL,
      type_degats: { ...TYPE_DEGATS, description: "Seulement si différent du type habituel de l'ennemi (ex. sort)" },
    },
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
      type_degats: TYPE_DEGATS,
    }, ["type", "formule"]),
  outil("jet_contre_la_mort", "Jet de sauvegarde contre la mort quand le joueur est à 0 PV, à son tour.", {}, []),
  outil("utiliser_capacite", "Utilise une capacité de classe (Second souffle, Rage…). OBLIGATOIRE dès que le joueur "
    + "déclare utiliser une capacité : c'est ce qui active ses effets dans le moteur.", { nom: STR }, ["nom"]),
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
  outil("consulter_regles",
    "Consulte le SRD 5.1 complet (en anglais) : règles, conditions, sorts, monstres, objets magiques, équipement, "
    + "capacités de classe, traits raciaux. À utiliser en cas de doute plutôt que d'inventer une règle.",
    {
      recherche: { type: "string", description: "Terme à chercher, de préférence en anglais (ex. 'Grappled', 'Fireball', 'Owlbear', 'Opportunity Attacks')" },
      categorie: { type: "string", enum: CATEGORIES, description: "Pour restreindre la recherche (facultatif)" },
    }, ["recherche"]),
  outil("boire_potion", "Le personnage boit une potion de soins de son inventaire (soins appliqués automatiquement).",
    { objet: { type: "string", description: "Nom de la potion, par défaut « Potion de soins »" } }, []),
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
- Termine chaque réponse en laissant la main au joueur (situation claire). Ne liste pas de choix dans le \
récit lui-même : ils vont dans la ligne CHOIX ci-dessous.
- TOUTE réponse finale se termine par une dernière ligne, seule sur sa ligne et écrite une seule fois \
(jamais dans un message qui appelle des outils), exactement de ce format :
CHOIX: première action | deuxième action | troisième action
avec 2 ou 3 actions courtes (8 mots maximum), écrites à la première personne comme si le joueur parlait \
(« J'interroge l'aubergiste », « Je fouille la cave »), variées (prudente, audacieuse, sociale…) et \
cohérentes avec la situation et la fiche (en combat : des actions de combat concrètes avec ses armes, sorts \
ou capacités). Ce ne sont que des suggestions : le joueur peut toujours écrire autre chose.
- Sois concis : 60 à 160 mots en général, 30 à 90 mots par round de combat (l'essentiel, sans répéter \
les chiffres déjà affichés à l'écran).
- Sois juste mais pas complaisant : les actions ont des conséquences, l'échec est possible et intéressant.
- Si le joueur tente quelque chose d'impossible ou d'incohérent, explique-le dans le récit.
- Ne révèle jamais tes notes secrètes directement : fais-les découvrir par l'enquête et le jeu.

RÈGLES ET OUTILS — TRÈS IMPORTANT
- Tu ne lances JAMAIS de dés toi-même et n'inventes aucun résultat : utilise toujours les outils. \
Leurs résultats font foi, raconte-les fidèlement (réussite, échec, dégâts).
- Demande un jet (jet_de_test) seulement quand l'issue est incertaine et intéressante.
- Toute modification de la fiche (PV, objets, or, XP, conditions, sorts, capacités) passe par un outil.
- Quand le joueur utilise une capacité (Rage, Second souffle…), appelle utiliser_capacite AVANT de raconter. \
Si son message indique que le moteur l'a déjà appliquée, ne la rappelle pas.
- Les EFFETS ACTIFS de la fiche (Rage, résistances, bonus) sont appliqués automatiquement par le moteur : \
ne divise pas toi-même les dégâts, mais précise toujours le type de dégâts (type_degats) des attaques et \
pièges, et mentionne l'effet dans le récit quand il joue (« ta rage encaisse le coup »).
- Si un outil renvoie une erreur, corrige l'appel ou adapte le récit.
- COMBAT : appelle commencer_combat. Chaque round : l'action du joueur, puis UN SEUL appel à \
tour_des_ennemis pour tous les ennemis (dans le même message que l'action du joueur, c'est plus rapide ; \
utilise « sauf » pour ceux qui fuient ou font autre chose, attaque_ennemi seulement pour un allié PNJ visé). \
Si les ennemis ont l'initiative au premier round, appelle tour_des_ennemis avant de rendre la main. \
Si le moteur indique qu'il a déjà fait jouer les ennemis ou terminé le combat, ne le refais pas. \
Quand le combat est fini, appelle fin_combat.
- Le joueur ne peut utiliser que ses armes, sorts et capacités de sa fiche. Un sort exige un emplacement libre.
- Attaque supplémentaire (niveau 5) : quand le joueur attaque, appelle attaque_joueur une fois par coup \
(deux appels), éventuellement sur deux cibles. Attaque sournoise du roublard : 1d6 par tranche de 2 \
niveaux (arrondi au supérieur), via degats_bonus.
- À 0 PV le joueur est inconscient : à chacun de ses tours, appelle jet_contre_la_mort. S'il meurt, \
raconte une fin digne et propose de relire son épopée.
- Ne cite pas dans le récit les PV, la CA ni les bonus des ennemis : ils sont déjà affichés à l'écran. \
Décris plutôt leur état (« le loup boite, le flanc en sang »).
- JEU EN SOLO : quand le personnage tombe à 0 PV, les ennemis ne s'acharnent pas sur son corps (sauf \
morts-vivants ou créatures particulièrement cruelles) : ils le croient mort, fouillent, se disputent ou \
s'éloignent ; ce sont ses jets contre la mort qui décident de son sort.
- Récompense l'exploration et les bonnes idées avec donner_xp (25 à 100 XP par étape importante au niveau 1-3, davantage ensuite).
- Utilise noter_journal pour retenir les PNJ, indices et quêtes importants.
- Tu as le SRD 5.1 complet sous la main avec consulter_regles (texte en anglais, que tu traduis pour le \
joueur). Consulte-le dès que tu as un doute sur une règle, une condition, un sort, une capacité, un objet \
magique ou les statistiques d'un monstre, au lieu d'improviser. Inutile pour ce qui est déjà sur la fiche.
- Pour un combat, tu peux utiliser comme « modele » n'importe quel monstre du SRD par son nom anglais \
(ex. « Owlbear », « Bandit Captain ») : ses statistiques sont chargées automatiquement. S'il a une \
Multiattack, appelle attaque_ennemi pour chacune de ses attaques.

BESTIAIRE DISPONIBLE (modèles pour commencer_combat) : `;

/**
 * Partie fixe des consignes (identique à chaque tour) : placée en tête, OpenAI la met en cache
 * et la facture beaucoup moins cher (jusqu'à -90 %) à partir du deuxième tour.
 */
/** Aventure de la partie : intégrée au jeu, ou écrite dans l'atelier (copiée dans la sauvegarde). */
export const scenarioDe = (partie) => partie.scenario_perso ?? SCENARIOS[partie.scenario] ?? SCENARIOS.libre;

export function consignesFixes(partie) {
  const sc = scenarioDe(partie);
  return [
    CONSIGNES + Object.entries(srd.MONSTRES).map(([n, m]) => `${n} (CA ${m.ca}, ${m.xp} XP)`).join(", "),
    `AVENTURE : ${sc.titre}\nNOTES SECRÈTES DU MJ :\n${sc.notes_mj}`,
  ].join("\n\n");
}

/** Partie qui change à chaque tour (fiche, combat, journal, résumé) : placée juste avant l'action du joueur. */
const OUTILS_DONJON = [
  outil("explorer",
    "MODE DONJON : déplace le personnage par une sortie de la salle actuelle. Le moteur applique ce que la salle "
    + "contient (combat prévu lancé automatiquement, piège avec jet de sauvegarde) et renvoie sa description. "
    + "Sans direction (premier appel), place le personnage sur le palier de l'étage.",
    { direction: { type: "string", enum: ["nord", "sud", "est", "ouest"] } }, []),
  outil("fouiller", "MODE DONJON : fouille la salle actuelle (trésor : or et objets ajoutés automatiquement).", {}, []),
  outil("descendre", "MODE DONJON : prend l'escalier de la salle actuelle vers l'étage suivant (après le boss au 5e étage d'une section).", {}, []),
];

/** Outils proposés à l'IA pour cette partie (le mode donjon a son outil de progression). */
export const outilsPour = (partie) => (partie.scenario === "donjon" ? [...OUTILS, ...OUTILS_DONJON] : OUTILS);

export function etatActuel(partie) {
  const morceaux = ["FICHE DU PERSONNAGE (état actuel, fait foi) :\n" + resumeTexte(partie.personnage)];
  const combat = partie.combat;
  if (combat) {
    const lignes = combat.ennemis.map((e) => `- ${e.id} : ${e.pv}/${e.pv_max} PV, CA ${e.ca}, ${e.etat}`);
    morceaux.push(`COMBAT EN COURS. Ordre d'initiative : ${combat.ordre.map((o) => o.nom).join(" → ")}\n${lignes.join("\n")}`);
  }
  if (partie.journal.length) morceaux.push("JOURNAL (faits établis) :\n" + partie.journal.map((n) => `- ${n}`).join("\n"));
  if (partie.resume) morceaux.push("RÉSUMÉ DE L'HISTOIRE JUSQU'ICI :\n" + partie.resume);
  if (partie.scenario === "donjon") morceaux.push(resumeDonjon(partie));
  return morceaux.join("\n\n");
}

/** Où en est le personnage dans le donjon généré (seules les salles déjà vues sont décrites). */
export function resumeDonjon(partie) {
  const d = partie.donjon;
  if (!d?.etages) {
    return "DONJON : le plan n'est pas encore généré. Appelle explorer (sans direction) pour placer le personnage"
      + (d?.etage ? ` sur le palier de l'étage ${d.etage}.` : " sur le palier du premier étage.");
  }
  const etage = Number(d.position.split("-")[0]);
  const plan = d.etages[etage];
  const salle = plan.salles[d.position];
  const visitees = Object.values(plan.salles).filter((x) => x.visitee).length;
  const sorties = Object.entries(salle.sorties).map(([dir, id]) => {
    const v = plan.salles[id];
    return `${dir} → ${v.visitee ? `${v.nom}${v.nettoyee || !v.ennemis ? "" : " (ennemis)"}` : "inconnue"}`;
  }).join(", ");
  const etat = salle.ennemis && !salle.nettoyee ? "ennemis présents" : "sûre";
  const escalierVu = Object.values(plan.salles).some((x) => x.visitee && ["escalier", "boss"].includes(x.type));
  return `DONJON (plan généré par le moteur, fait foi) : étage ${etage} — ${plan.theme} (${plan.ambiance}). `
    + `Salle actuelle : ${salle.nom} [${salle.type}, ${etat}]. Sorties : ${sorties || "aucune"}. `
    + `${visitees}/${Object.keys(plan.salles).length} salles explorées à cet étage ; escalier ${escalierVu ? "trouvé" : "pas encore trouvé"}. `
    + `Record : étage ${d.record}.${etage % 5 === 0 ? " Le boss de la section rôde à cet étage." : ""}`;
}

export function construireSysteme(partie) {
  return `${consignesFixes(partie)}\n\n${etatActuel(partie)}`;
}

/** Problème de communication avec le service d'IA, avec un message compréhensible. */
export class ErreurIA extends Error {}

async function requeteIA(url, entetes, corps, traduireErreur) {
  let reponse;
  try {
    reponse = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...entetes },
      body: JSON.stringify(corps),
    });
  } catch {
    throw new ErreurIA("Impossible de joindre le service d'IA. Vérifie ta connexion internet.");
  }
  let donnees = null;
  try { donnees = await reponse.json(); } catch { /* corps vide */ }
  if (refusEffort(reponse.status, donnees) && corps.reasoning_effort && corps.reasoning_effort !== "low") {
    return requeteIA(url, entetes, { ...corps, reasoning_effort: "low" }, traduireErreur);
  }
  if (!reponse.ok) throw new ErreurIA(traduireErreur(reponse.status, donnees));
  const msg = donnees?.choices?.[0]?.message;
  if (!msg) throw new ErreurIA("Réponse inattendue du service d'IA.");
  return { ...msg, usage: donnees.usage, modele: donnees.model };
}

/**
 * Crée la fonction qui interroge un service compatible OpenAI (Chat Completions) avec la clé du joueur.
 * Renvoie une fonction (messages, outils) => message de l'assistant.
 */
export function clientOpenAI({ cle, modele, adresse }) {
  const base = (adresse || "https://api.openai.com/v1").replace(/\/+$/, "");
  const officiel = base.startsWith("https://api.openai.com");
  return (messages, outils, { cache = "" } = {}) => requeteIA(
    `${base}/chat/completions`,
    cle ? { Authorization: `Bearer ${cle}` } : {},
    {
      model: modele, messages, ...(outils ? { tools: outils } : {}), ...parametresEconomie(modele),
      // Même clé pour tous les appels d'une partie : OpenAI retrouve plus souvent le début déjà en cache.
      ...(officiel && cache ? { prompt_cache_key: `cd-${cache}`.slice(0, 64) } : {}),
    },
    (statut, donnees) => messageErreur(statut, donnees, modele),
  );
}

/** Même chose en passant par le serveur relais de l'organisateur, avec un code d'accès. */
export function clientServeur({ url, code }) {
  const base = url.replace(/\/+$/, "");
  return (messages, outils, { cache = "" } = {}) => requeteIA(
    `${base}/v1/chat/completions`,
    code ? { "X-Code-Acces": code } : {},
    { messages, ...(outils ? { tools: outils } : {}), ...(cache ? { cle_cache: cache } : {}) },
    messageErreurServeur,
  );
}

/** Vérifie un code d'accès auprès du serveur relais. Renvoie { joueur, modele }. */
export async function verifierCode({ url, code }) {
  let reponse;
  try {
    reponse = await fetch(`${url.replace(/\/+$/, "")}/verifier`, { headers: code ? { "X-Code-Acces": code } : {} });
  } catch {
    throw new ErreurIA("Impossible de joindre le serveur du jeu. Vérifie ta connexion internet.");
  }
  let donnees = null;
  try { donnees = await reponse.json(); } catch { /* corps vide */ }
  if (!reponse.ok) throw new ErreurIA(messageErreurServeur(reponse.status, donnees));
  return donnees;
}

export function messageErreurServeur(statut, donnees) {
  const err = donnees?.error ?? {};
  if (err.code === "code_requis") {
    return "Ce jeu est réservé : entre le code d'accès qu'on t'a donné dans les Réglages (⚙️).";
  }
  if (err.code === "code_invalide" || statut === 401) {
    return "Code d'accès refusé. Vérifie-le dans les Réglages (⚙️) ou redemande-le à l'organisateur.";
  }
  if (err.code === "limite_atteinte") return err.message;
  if (statut === 429) {
    if (err.code === "insufficient_quota" || /quota/i.test(err.message ?? "")) {
      return "Le crédit OpenAI de l'organisateur est épuisé : préviens-le pour qu'il en rajoute.";
    }
    return "Trop de requêtes d'un coup : attends quelques secondes et réessaie.";
  }
  if (err.message) return `Serveur du jeu : ${String(err.message).slice(0, 300)}`;
  return `Erreur du serveur du jeu (${statut}).`;
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
export async function jouerTour(partie, texteJoueur, appeler, actionDirecte = null, { demanderJet = null, seuilKarma = 0 } = {}) {
  await chargerRegles(); // SRD local : sans lui (hors connexion), le jeu continue normalement
  const sc = scenarioDe(partie);
  let messageJoueur = texteJoueur || `[Début de la partie] ${sc.intro}`;
  const moteur = new Moteur(partie);
  moteur.seuilKarma = seuilKarma;
  const enCombatAvant = Boolean(partie.combat);
  if (actionDirecte) {
    // Action cliquée dans la fiche : le moteur l'applique tout de suite, l'IA n'a plus qu'à la raconter.
    const resultat = await moteur.executerAvecJets(actionDirecte.outil, actionDirecte.args, demanderJet);
    if (resultat.erreur) throw new ErreurAction(resultat.erreur);
    messageJoueur += `\n[Le moteur a déjà appliqué ${actionDirecte.outil} : ${JSON.stringify(resultat)}. `
      + "Ne rappelle pas cet outil pour cette action ; raconte-la puis poursuis la scène.]";
  }
  const suite = partie.combat && ACTIONS_DE_ROUND.includes(actionDirecte?.outil) ? await finirLeRound(moteur, demanderJet) : null;
  if (suite) {
    messageJoueur += `\n[${suite.texte} : ${JSON.stringify(suite.resultat)}. Ne le refais pas : raconte tout le round en une fois.]`;
  }
  const messages = [
    { role: "system", content: consignesFixes(partie) },
    ...partie.messages,
    { role: "system", content: etatActuel(partie) },
    { role: "user", content: messageJoueur },
  ];
  const narration = [];
  let termine = false;
  for (let etape = 0; etape < MAX_ETAPES; etape++) {
    const msg = await appeler(messages, outilsPour(partie), { cache: partie.id });
    compterConsommation(partie, msg.usage, msg.modele);
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
      else if (tc.function.name === "consulter_regles") {
        resultat = rechercher(args.recherche, args.categorie);
        const titres = resultat.resultats?.map((r) => r.titre).join(", ");
        moteur.evt(`📖 Règles consultées : « ${args.recherche} »${titres ? ` → ${titres}` : ""}`, "regle");
      } else resultat = await moteur.executerAvecJets(tc.function.name, args, demanderJet);
      messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(resultat) });
    }
  }
  if (!termine) narration.push("(Le maître du jeu marque une pause… Que fais-tu ?)");

  // Chaque action du joueur pendant un combat correspond à un round.
  if (enCombatAvant && partie.combat && texteJoueur) partie.combat.round += 1;
  const brut = narration.join("\n\n") || "(Le maître du jeu reste silencieux… Reformule ton action.)";
  const { texte: texteMj, choix } = extraireChoix(brut);
  partie.messages.push({ role: "user", content: messageJoueur }, { role: "assistant", content: texteMj });
  if (texteJoueur) partie.affichage.push({ type: "joueur", texte: texteJoueur });
  partie.affichage.push(...moteur.evenements, { type: "mj", texte: texteMj, ...(choix.length ? { choix } : {}) });
  return { narration: texteMj, choix, evenements: moteur.evenements };
}

// Actions de combat cliquées qui occupent le tour du joueur : le moteur enchaîne alors le tour des
// ennemis (ou la fin du combat) sans repasser par l'IA, qui n'a plus qu'à raconter le round.
const ACTIONS_DE_ROUND = ["attaque_joueur", "lancer_sort", "boire_potion"];

async function finirLeRound(moteur, demanderJet) {
  const combat = moteur.partie.combat;
  if (!combat.ennemis.some((e) => e.etat === "actif" || e.etat === "endormi")) {
    return { texte: "Plus aucun ennemi debout : le moteur a terminé le combat (fin_combat)", resultat: moteur.fin_combat({ issue: "victoire" }) };
  }
  const resultat = await moteur.executerAvecJets("tour_des_ennemis", {}, demanderJet);
  return { texte: "Puis le moteur a fait jouer les ennemis (tour_des_ennemis)", resultat };
}

/**
 * Sépare le récit des actions proposées « CHOIX: a | b | c ». L'IA peut l'écrire en fin de ligne,
 * en gras, ou plusieurs fois dans une même réponse : toutes les occurrences sont retirées du récit,
 * et la dernière donne les choix.
 */
export function extraireChoix(texte) {
  const motif = /[*_]*\bCHOIX\b[*_\s]*:[*_\s]*([^\n]*)/g;
  const source = String(texte ?? "");
  let dernier = null;
  for (const m of source.matchAll(motif)) dernier = m[1];
  if (dernier === null) return { texte: source.trim(), choix: [] };
  const choix = dernier.split("|")
    .map((c) => c.replace(/^[\s*_"«»“”\d.)-]+|[\s*_"«»“”]+$/g, "").trim())
    .filter((c) => c && c.length <= 120)
    .slice(0, 3);
  const nettoye = source.replace(motif, "").split("\n").map((l) => l.trimEnd()).join("\n")
    .replace(/\n{3,}/g, "\n\n").trim();
  return { texte: nettoye, choix };
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
  compterConsommation(partie, msg.usage, msg.modele);
  const resume = (msg.content ?? "").trim();
  if (!resume) return false;
  partie.resume = resume;
  partie.messages = partie.messages.slice(A_RESUMER);
  return true;
}
