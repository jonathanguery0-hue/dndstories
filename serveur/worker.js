// Relais Contes & Dragons — Cloudflare Worker
//
// Garde la clé OpenAI de l'organisateur côté serveur : les joueurs n'ont besoin que d'un code d'accès.
// À copier tel quel dans l'éditeur de Cloudflare (voir serveur/README.md).
//
// Variables à définir dans Cloudflare (Settings → Variables and Secrets) :
//   OPENAI_API_KEY  (secret)  la clé OpenAI, « sk-… »
//   CODES_ACCES     (secret)  les joueurs et leurs codes : « jonathan:dragon-rouge-42,lea:lune-bleue-17 »
//   MODELE          (texte)   le modèle utilisé pour tout le monde, ex. « gpt-5-mini » (facultatif)
//   MODELE_VOIX     (texte)   le modèle de voix IA, ex. « gpt-4o-mini-tts » (facultatif)
//   ORIGINES        (texte)   adresses autorisées, ex. « https://jonathanguery0-hue.github.io » (facultatif)

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_VOIX_URL = "https://api.openai.com/v1/audio/speech";
const MODELE_DEFAUT = "gpt-5-mini";
const MODELE_VOIX_DEFAUT = "gpt-4o-mini-tts";
const MODELE_VOIX_SECOURS = "tts-1";
const VOIX = ["alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer", "verse"];
const CONSIGNES_VOIX = "Tu es le narrateur d'un jeu de rôle de fantasy. Parle en français de France, sans accent "
  + "étranger, sur un ton de conteur : posé, chaleureux et immersif, avec du suspense dans les moments tendus. "
  + "Fais vivre les dialogues des personnages sans exagérer.";
const TAILLE_MAX = 400_000; // caractères par requête : une partie normale en utilise bien moins

export default {
  async fetch(request, env) {
    const origine = request.headers.get("Origin") ?? "";
    const autorisees = listeOrigines(env.ORIGINES);
    const origineOk = !origine || !autorisees.length || autorisees.includes(origine);
    const cors = {
      "Access-Control-Allow-Origin": origineOk && origine ? origine : "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Code-Acces",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    };
    const json = (statut, donnees) => new Response(JSON.stringify(donnees), {
      status: statut, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
    });
    const erreur = (statut, message, code) => json(statut, { error: { message, ...(code ? { code } : {}) } });

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (!origineOk) return erreur(403, "Ce site n'est pas autorisé à utiliser ce serveur.");

    const chemin = new URL(request.url).pathname.replace(/\/+$/, "") || "/";
    if (chemin === "/") return json(200, { service: "Contes & Dragons", ok: true });

    const joueur = trouverJoueur(request.headers.get("X-Code-Acces"), env.CODES_ACCES);

    if (chemin === "/verifier" && request.method === "GET") {
      if (!joueur) return erreur(401, "Code d'accès invalide.", "code_invalide");
      return json(200, { ok: true, joueur, modele: env.MODELE || MODELE_DEFAUT });
    }

    if (chemin === "/v1/audio/speech" && request.method === "POST") {
      if (!joueur) return erreur(401, "Code d'accès invalide.", "code_invalide");
      if (!env.OPENAI_API_KEY) return erreur(500, "Le serveur n'a pas de clé OpenAI configurée.", "serveur_sans_cle");
      let corps;
      try {
        corps = JSON.parse(await request.text());
      } catch {
        return erreur(400, "Requête invalide.");
      }
      const texte = String(corps?.input ?? "").trim();
      if (!texte || texte.length > 4096) return erreur(400, "Texte à lire vide ou trop long.");
      const voix = VOIX.includes(corps.voice) ? corps.voice : "onyx";
      const modele = env.MODELE_VOIX || MODELE_VOIX_DEFAUT;
      const synthese = (envoi) => fetch(OPENAI_VOIX_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ voice: voix, input: texte, response_format: "mp3", ...envoi }),
      });
      let reponse;
      try {
        reponse = await synthese({ model: modele, instructions: CONSIGNES_VOIX });
        if (reponse.status === 404 || reponse.status === 400) reponse = await synthese({ model: MODELE_VOIX_SECOURS });
      } catch {
        return erreur(502, "OpenAI ne répond pas. Réessaie dans un instant.");
      }
      console.log(`joueur=${joueur} voix statut=${reponse.status} caracteres=${texte.length}`);
      if (reponse.status === 401) {
        return erreur(502, "La clé OpenAI du serveur est refusée : l'organisateur doit la vérifier.", "cle_serveur_refusee");
      }
      return new Response(reponse.body, {
        status: reponse.status,
        headers: { ...cors, "Content-Type": reponse.headers.get("Content-Type") ?? "audio/mpeg" },
      });
    }

    if (chemin !== "/v1/chat/completions" || request.method !== "POST") return erreur(404, "Adresse inconnue.");
    if (!joueur) return erreur(401, "Code d'accès invalide.", "code_invalide");
    if (!env.OPENAI_API_KEY) return erreur(500, "Le serveur n'a pas de clé OpenAI configurée.", "serveur_sans_cle");

    const texte = await request.text();
    if (texte.length > TAILLE_MAX) return erreur(413, "Requête trop volumineuse.");
    let corps;
    try {
      corps = JSON.parse(texte);
    } catch {
      return erreur(400, "Requête invalide.");
    }
    if (!Array.isArray(corps?.messages) || !corps.messages.length) return erreur(400, "Requête invalide.");

    // On ne transmet que ce qui est nécessaire : le modèle est imposé par le serveur pour maîtriser les coûts.
    const modele = env.MODELE || MODELE_DEFAUT;
    const envoi = { model: modele, messages: corps.messages, ...parametresEconomie(modele) };
    if (Array.isArray(corps.tools) && corps.tools.length) envoi.tools = corps.tools;

    let reponse;
    try {
      reponse = await fetch(OPENAI_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(envoi),
      });
    } catch {
      return erreur(502, "OpenAI ne répond pas. Réessaie dans un instant.");
    }
    console.log(`joueur=${joueur} statut=${reponse.status}`);

    if (reponse.status === 401) {
      return erreur(502, "La clé OpenAI du serveur est refusée : l'organisateur doit la vérifier.", "cle_serveur_refusee");
    }
    return new Response(await reponse.text(), {
      status: reponse.status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
    });
  },
};

// Limite le coût de chaque appel : peu de « réflexion » cachée (facturée) et une réponse plafonnée.
function parametresEconomie(modele) {
  if (/^(gpt-5|o\d)/.test(modele)) return { reasoning_effort: "low", max_completion_tokens: 6000 };
  return { max_completion_tokens: 1500 };
}

function listeOrigines(texte) {
  return String(texte ?? "").split(",").map((o) => o.trim().replace(/\/+$/, "")).filter(Boolean);
}

/** Renvoie le nom du joueur correspondant au code, ou null. Format : « nom:code,nom:code ». */
function trouverJoueur(code, liste) {
  code = String(code ?? "").trim();
  if (!code || !liste) return null;
  let trouve = null;
  for (const entree of String(liste).split(",")) {
    const i = entree.indexOf(":");
    const nom = i >= 0 ? entree.slice(0, i).trim() : "joueur";
    const attendu = (i >= 0 ? entree.slice(i + 1) : entree).trim();
    if (attendu && egal(attendu, code) && !trouve) trouve = nom || "joueur";
  }
  return trouve;
}

// Comparaison à durée constante (ne révèle pas la longueur du code commun).
function egal(a, b) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}
