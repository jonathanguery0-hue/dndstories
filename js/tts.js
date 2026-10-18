// Voix IA d'OpenAI (synthèse vocale naturelle), avec la clé du joueur ou via le serveur relais.

export const MODELE_VOIX = "gpt-4o-mini-tts";
export const MODELE_VOIX_SECOURS = "tts-1"; // si le compte n'a pas accès au modèle principal

export const VOIX_IA = {
  onyx: "Onyx — grave et posée",
  ash: "Ash — chaleureuse",
  ballad: "Ballad — douce, conteuse",
  sage: "Sage — calme",
  coral: "Coral — vive et claire",
  verse: "Verse — expressive",
  echo: "Echo — neutre",
  fable: "Fable — théâtrale",
  nova: "Nova — énergique",
  shimmer: "Shimmer — légère",
  alloy: "Alloy — équilibrée",
};

export const CONSIGNES_VOIX = "Tu es le narrateur d'un jeu de rôle de fantasy. Parle en français de France, "
  + "sans accent étranger, sur un ton de conteur : posé, chaleureux et immersif, avec du suspense dans les "
  + "moments tendus. Fais vivre les dialogues des personnages sans exagérer.";

/** Erreur de synthèse vocale, avec un message compréhensible. */
export class ErreurVoix extends Error {}

const LONGUEUR_MAX = 4000; // limite de l'API : 4 096 caractères par requête

async function demander(url, entetes, corps) {
  let reponse;
  try {
    reponse = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json", ...entetes }, body: JSON.stringify(corps),
    });
  } catch {
    throw new ErreurVoix("Voix IA injoignable : vérifie ta connexion internet.");
  }
  if (reponse.ok) return { blob: await reponse.blob() };
  let donnees = null;
  try { donnees = await reponse.json(); } catch { /* corps vide */ }
  return { statut: reponse.status, erreur: donnees?.error ?? {} };
}

function messageErreur(statut, erreur) {
  if (["code_invalide", "code_requis"].includes(erreur.code) || (statut === 401 && erreur.code !== "cle_serveur_refusee")) {
    return "Voix IA refusée : vérifie ta clé ou ton code d'accès dans les Réglages.";
  }
  if (erreur.code === "limite_atteinte") return "Voix IA en pause quelques minutes (trop de demandes) : la voix de l'appareil prend le relais.";
  if (statut === 429) return "Voix IA : crédit épuisé ou trop de demandes. La voix de l'appareil prend le relais.";
  return `Voix IA indisponible (${statut}) : ${String(erreur.message ?? "").slice(0, 200)}`;
}

const modeleIndisponible = (statut, erreur) => statut === 404 || erreur.code === "model_not_found"
  || (statut === 400 && /model/i.test(erreur.message ?? ""));

/** Synthèse avec la clé OpenAI du joueur. Renvoie un Blob audio (mp3). */
export async function syntheseOpenAI({ cle, adresse }, texte, voix) {
  const base = (adresse || "https://api.openai.com/v1").replace(/\/+$/, "");
  const entetes = cle ? { Authorization: `Bearer ${cle}` } : {};
  const input = String(texte).slice(0, LONGUEUR_MAX);
  let r = await demander(`${base}/audio/speech`, entetes,
    { model: MODELE_VOIX, voice: voix, input, instructions: CONSIGNES_VOIX, response_format: "mp3" });
  if (r.blob) return r.blob;
  if (modeleIndisponible(r.statut, r.erreur)) {
    r = await demander(`${base}/audio/speech`, entetes, { model: MODELE_VOIX_SECOURS, voice: voix, input, response_format: "mp3" });
    if (r.blob) return r.blob;
  }
  throw new ErreurVoix(messageErreur(r.statut, r.erreur));
}

/** Synthèse via le serveur relais de l'organisateur (code d'accès). */
export async function syntheseServeur({ url, code }, texte, voix) {
  const r = await demander(`${url.replace(/\/+$/, "")}/v1/audio/speech`, code ? { "X-Code-Acces": code } : {},
    { voice: voix, input: String(texte).slice(0, LONGUEUR_MAX) });
  if (r.blob) return r.blob;
  throw new ErreurVoix(messageErreur(r.statut, r.erreur));
}
