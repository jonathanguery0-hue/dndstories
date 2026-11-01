// Le maître du jeu des Expéditions : une IA raconte chaque salle en quelques phrases.
//
// Il réutilise la connexion IA de Contes & Dragons (serveur du jeu ou clé du joueur, réglée dans ⚙️ sur
// l'accueil). Les règles restent dans le moteur : l'IA ne fait que raconter, sans chiffres ni récompenses.
// Sans IA (hors ligne, pas de clé, IA désactivée), des textes écrits à l'avance prennent le relais.

import { clientOpenAI, clientServeur } from "../mj.js";
import { SERVEUR_URL } from "../serveur.js";
import { chargerConfig, estConfigure } from "../stockage.js";

const DELAI_MAX = 15000; // au-delà, on garde le texte de secours
const MEMOIRE = 6; // derniers récits gardés pour que l'histoire reste cohérente

const CONSIGNES = `Tu es le maître du jeu d'un petit jeu de rôle de fantasy en pixel art : un héros explore le
repaire des gobelins de Grokk, salle après salle, jusqu'à la salle du trône.
Tu racontes en français, à la deuxième personne du singulier (« tu »), au présent.
Règles d'écriture :
- 1 à 3 phrases, 45 mots au maximum. Vivant, imagé, une pointe d'humour gobelin bienvenue.
- Jamais de chiffres, de règles, de dés, de PV ni de récompenses : le jeu s'en charge.
- N'invente pas d'objets que le héros recevrait, ne décide pas de l'issue d'une action.
- Pas de liste, pas de titre, pas de guillemets autour de ta réponse.
- Les gobelins parlent un français cassé et comique (« Toi pas passer ! »).`;

export function iaDisponible() {
  try {
    return estConfigure(chargerConfig());
  } catch {
    return false;
  }
}

function client() {
  const cfg = chargerConfig();
  if (!estConfigure(cfg)) return null;
  return cfg.mode === "serveur" ? clientServeur({ url: SERVEUR_URL, code: cfg.code }) : clientOpenAI(cfg);
}

const avecDelai = (promesse, ms) => Promise.race([
  promesse,
  new Promise((_, rejeter) => setTimeout(() => rejeter(new Error("délai dépassé")), ms)),
]);

/**
 * Crée un narrateur pour une expédition. raconter(type, contexte) renvoie toujours un texte :
 * celui de l'IA si elle répond à temps, sinon un texte de secours.
 */
export function creerNarrateur({ actif = true, memoire = [] } = {}) {
  const souvenirs = [...memoire];
  let erreurs = 0;
  let derniereErreur = "";

  async function raconter(type, contexte = {}) {
    const secours = texteSecours(type, contexte);
    if (!actif || erreurs >= 3) return { texte: secours, ia: false };
    const appeler = client();
    if (!appeler) return { texte: secours, ia: false };
    const messages = [
      { role: "system", content: CONSIGNES },
      ...(souvenirs.length ? [{ role: "system", content: `Ce qui s'est passé jusqu'ici :\n${souvenirs.join("\n")}` }] : []),
      { role: "user", content: consigneSituation(type, contexte) },
    ];
    try {
      const reponse = await avecDelai(appeler(messages, null, { cache: "expedition" }), DELAI_MAX);
      const texte = nettoyer(reponse?.content);
      if (!texte) return { texte: secours, ia: false };
      erreurs = 0;
      souvenirs.push(`- ${texte}`);
      while (souvenirs.length > MEMOIRE) souvenirs.shift();
      return { texte, ia: true };
    } catch (e) {
      erreurs += 1;
      derniereErreur = e?.message ?? String(e);
      return { texte: secours, ia: false, erreur: derniereErreur };
    }
  }

  return {
    raconter,
    get souvenirs() { return [...souvenirs]; },
    get derniereErreur() { return derniereErreur; },
    set actif(v) { actif = Boolean(v); },
  };
}

function nettoyer(texte) {
  return String(texte ?? "").replace(/^["«\s]+|["»\s]+$/g, "").replace(/\*\*/g, "").trim().slice(0, 500);
}

function consigneSituation(type, c) {
  const heros = c.heros ? `Le héros : ${c.heros}.` : "";
  switch (type) {
    case "depart":
      return `${heros} Il entre dans le repaire des gobelins (difficulté ${c.difficulte}). Plante le décor.`;
    case "combat":
      return `${heros} Salle ${c.etage}. Des ennemis surgissent : ${c.ennemis}. Décris leur apparition, menaçante ou comique.`;
    case "elite":
      return `${heros} Salle ${c.etage}. Un adversaire redoutable barre le passage : ${c.ennemis}. Décris-le avec tension.`;
    case "boss":
      return `${heros} La salle du trône. Grokk, le Roi gobelin, gras et couronné, se lève de son trône d'os avec sa massue. Il interpelle le héros.`;
    case "victoire_combat":
      return `${heros} Le héros vient de vaincre : ${c.ennemis}${c.blesse ? " (il est mal en point)" : ""}. Une phrase sur l'après-combat.`;
    case "evenement":
      return `${heros} Salle ${c.etage}. Situation : ${c.titre} — ${c.texte} Réécris cette situation à ta façon, sans proposer de choix.`;
    case "resultat":
      return `${heros} Il a choisi « ${c.choix} ». Issue décidée par le jeu : ${c.resultat}. Raconte cette issue.`;
    case "tresor":
      return `${heros} Il découvre une cachette au trésor des gobelins. Décris-la.`;
    case "marchand":
      return `${heros} Il rencontre Zibb, un marchand gobelin rusé et poli qui vend des potions dans une alcôve. Fais parler Zibb.`;
    case "repos":
      return `${heros} Il trouve un coin calme pour allumer un feu de camp. Décris ce moment de répit.`;
    case "fin":
      return `${heros} Fin de l'expédition : ${c.issue === "victoire" ? "il a vaincu Grokk" : c.issue === "defaite" ? `il est tombé au combat (salle ${c.etage})` : "il a battu en retraite"}. `
        + `Il a vaincu ${c.tues} ennemis. Écris la chronique de cette expédition en 2 ou 3 phrases, comme un barde.`;
    case "conseil":
      return `Tu es le vieux Maître Orin, ancien aventurier, au camp près du repaire. ${c.situation} Donne un conseil concret et bienveillant (2 phrases) pour la prochaine expédition, en tenant compte de ces éléments.`;
    default:
      return `${heros} ${c.texte ?? ""}`;
  }
}

// ------------------------------------------------------------------ textes de secours

const choisir = (liste) => liste[Math.floor(Math.random() * liste.length)];

export function texteSecours(type, c = {}) {
  switch (type) {
    case "depart":
      return choisir([
        "L'entrée du repaire sent le chou pourri et la fumée. Quelque part dans le noir, un gobelin ricane. Ton aventure commence.",
        "Tu franchis l'arche taillée dans la roche. Des os grattés jonchent le sol et des tambours lointains résonnent : Grokk t'attend.",
        "Les torches gobelines crachotent une lumière verdâtre. Tu resserres ta prise sur ton arme et t'enfonces dans le repaire.",
      ]);
    case "combat":
      return choisir([
        `« Toi pas passer ! » ${c.ennemis} jaillissent de l'ombre en brandissant leurs armes rouillées.`,
        `Un cri strident déchire le silence : ${c.ennemis} te barrent la route, les yeux brillants de malice.`,
        `Tu glisses sur une pelure de champignon… et te retrouves nez à nez avec ${c.ennemis}.`,
      ]);
    case "elite":
      return choisir([
        `Le sol tremble. ${c.ennemis} s'avance, bien plus grand et bien plus méchant que les autres.`,
        `Une silhouette massive se découpe dans la lueur des torches : ${c.ennemis}. Ce combat ne sera pas une promenade.`,
      ]);
    case "boss":
      return "Grokk se lève de son trône d'os, sa couronne de travers. « Toi casser MON repaire ? Moi casser TOI ! » Sa massue s'abat sur le sol dans un fracas terrible.";
    case "victoire_combat":
      return choisir([
        "Le dernier ennemi s'écroule. Tu reprends ton souffle dans le silence retrouvé.",
        "La poussière retombe. Tu fouilles rapidement les poches des vaincus avant de repartir.",
        c.blesse ? "Tu as gagné… mais chaque pas te fait grimacer. La prudence s'impose." : "Victoire ! Les gobelins y réfléchiront à deux fois avant de te chercher des noises.",
      ]);
    case "evenement":
      return c.texte ?? "Quelque chose d'étrange se trouve dans cette salle.";
    case "resultat":
      return c.resultat ?? "";
    case "tresor":
      return choisir([
        "Derrière une tenture mitée, tu découvres la réserve secrète d'un gobelin : des pièces, et un objet qui brille étrangement.",
        "Un coffre éventré déborde de pièces volées. Les gobelins sont de piètres gardiens de trésor.",
      ]);
    case "marchand":
      return choisir([
        "« Bienvenue, bienvenue ! Zibb vendre bonnes potions, presque pas périmées ! » Un gobelin à monocle t'adresse un sourire édenté.",
        "Zibb le marchand gobelin époussette son étal. « Toi avoir or ? Zibb avoir tout ! Enfin… beaucoup. »",
      ]);
    case "repos":
      return choisir([
        "Tu trouves une alcôve à l'abri des patrouilles. Les flammes de ton petit feu chassent le froid et la peur.",
        "Un recoin calme, un feu qui crépite : le repaire semble presque paisible, l'espace d'un instant.",
      ]);
    case "fin":
      if (c.issue === "victoire") {
        return `Les bardes chanteront longtemps la chute de Grokk ! ${c.heros} ressort du repaire couvert de gloire, après avoir vaincu ${c.tues} ennemis.`;
      }
      if (c.issue === "defaite") {
        return `${c.heros} est tombé dans la salle ${c.etage}, mais des gobelins peureux l'ont traîné dehors pour ne pas avoir d'ennuis. La revanche attendra.`;
      }
      return `${c.heros} a préféré battre en retraite. Un héros vivant peut toujours revenir !`;
    case "conseil":
      return choisir([
        "« Se mettre en garde au bon moment vaut mieux qu'un coup de trop. Quand Grokk lève sa massue, protège-toi ! »",
        "« Garde toujours une potion pour la salle du trône. Et n'oublie pas tes talents : chaque niveau t'en donne un. »",
        "« La forge de Brunhilde fait des merveilles. Une bonne armure t'épargnera bien des bosses. »",
        "« Les chamans soignent leurs amis. Abats-les en premier, crois-en un vieux briscard. »",
        "« Les feux de camp sont précieux : dors si tu es blessé, entraîne-toi si tu es en forme. »",
        "« Les élites sont dangereuses, mais elles gardent toujours une relique. À toi de juger si le risque en vaut la peine. »",
      ]);
    default:
      return c.texte ?? "";
  }
}
