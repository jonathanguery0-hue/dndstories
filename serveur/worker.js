// Relais Contes & Dragons — fonctionne sur Vercel (dossier api/, voir serveur/README.md) ou Cloudflare Workers.
//
// Garde la clé OpenAI de l'organisateur côté serveur : les joueurs n'ont rien à saisir.
// À copier tel quel dans l'éditeur de Cloudflare (voir serveur/README.md).
//
// Accès : ouvert à tous les joueurs qui viennent du site du jeu (aucune clé, aucun code), avec une
// limite de demandes par joueur. Si CODES_ACCES est défini, un code devient obligatoire (sauf si
// ACCES_LIBRE vaut « oui » : le code est alors facultatif et donne simplement une limite plus haute).
//
// Variables à définir dans Cloudflare (Settings → Variables and Secrets) :
//   OPENAI_API_KEY  (secret)  la clé OpenAI, « sk-… »                                  — OBLIGATOIRE
//   MODELE          (texte)   le modèle utilisé pour tout le monde, ex. « gpt-5-mini »  — facultatif
//   MODELE_VOIX     (texte)   le modèle de voix IA, ex. « gpt-4o-mini-tts »             — facultatif
//   ORIGINES        (texte)   sites autorisés (par défaut : le site GitHub Pages du jeu) — facultatif
//   LIMITE          (texte)   demandes à l'IA max par joueur toutes les 10 min (défaut 200) — facultatif
//   LIMITE_VOIX     (texte)   demandes de voix IA max par joueur toutes les 10 min (déf. 300) — facultatif
//   CODES_ACCES     (secret)  « prenom:code,prenom:code » pour réserver le jeu à des amis — facultatif
//   ACCES_LIBRE     (texte)   « oui » pour garder le jeu ouvert même avec des codes      — facultatif
//
// Comptes joueurs (Le Repaire de Grokk : retrouver sa progression sur tous ses appareils) : il faut une
// base Upstash Redis. Sur Vercel : Storage → Upstash for Redis, les variables sont ajoutées toutes seules.
//   KV_REST_API_URL + KV_REST_API_TOKEN   (ou UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN)  — facultatif

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
const ORIGINE_PAR_DEFAUT = "https://jonathanguery0-hue.github.io";
const FENETRE = 10 * 60 * 1000; // la limite de demandes se compte sur 10 minutes
// Un tour de jeu fait souvent plusieurs demandes (une par action du moteur : attaque, riposte des
// ennemis, récit…) : 200 demandes ≈ 50 tours en 10 minutes, bien plus qu'un joueur humain, mais un
// robot qui tournerait en boucle est arrêté vite. La voix IA (2 à 4 demandes par réponse) a son propre compteur.
const LIMITE_DEFAUT = 200;
const LIMITE_VOIX_DEFAUT = 300;

// Compteurs de demandes par joueur (en mémoire : une protection contre les abus, pas une comptabilité).
const compteurs = new Map();

/** Compte la demande ; renvoie 0 si elle est permise, sinon le nombre de secondes à attendre. */
function attenteAvantDemande(cle, limite, maintenant = Date.now()) {
  let c = compteurs.get(cle);
  if (!c || maintenant - c.debut > FENETRE) {
    c = { debut: maintenant, n: 0 };
    compteurs.set(cle, c);
  }
  c.n += 1;
  if (compteurs.size > 5000) {
    for (const [k, v] of compteurs) if (maintenant - v.debut > FENETRE) compteurs.delete(k);
  }
  return c.n <= limite ? 0 : Math.ceil((FENETRE - (maintenant - c.debut)) / 1000);
}

export default {
  async fetch(request, env) {
    const origine = request.headers.get("Origin") ?? "";
    const adresse = new URL(request.url);
    // Le site lui-même (Vercel héberge le jeu et le serveur à la même adresse) est toujours autorisé.
    const autorisees = [adresse.origin, ...(env.ORIGINES ? listeOrigines(env.ORIGINES) : [ORIGINE_PAR_DEFAUT])];
    const origineOk = !origine || autorisees.includes(origine);
    const referent = request.headers.get("Referer") ?? "";
    // Requête venant d'une page du site du jeu (un navigateur envoie l'origine, ou au moins la page d'appel).
    const depuisLeSite = Boolean(origine) || request.headers.get("Sec-Fetch-Site") === "same-origin"
      || autorisees.some((o) => referent.startsWith(`${o}/`));
    const cors = {
      "Access-Control-Allow-Origin": origineOk && origine ? origine : "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Code-Acces, Authorization",
      "Access-Control-Expose-Headers": "X-Acces",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    };
    const json = (statut, donnees) => new Response(JSON.stringify(donnees), {
      status: statut, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
    });
    const erreur = (statut, message, code) => json(statut, { error: { message, ...(code ? { code } : {}) } });

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (!origineOk) return erreur(403, "Ce site n'est pas autorisé à utiliser ce serveur.");

    const chemin = adresse.pathname.replace(/^\/api(?=\/|$)/, "").replace(/\/+$/, "") || "/";
    if (chemin === "/") return json(200, { service: "Contes & Dragons", ok: true });

    const code = (request.headers.get("X-Code-Acces") ?? "").trim();
    const ami = trouverJoueur(code, env.CODES_ACCES);
    const accesLibre = !env.CODES_ACCES || env.ACCES_LIBRE === "oui";
    // Sans code, il faut venir du site du jeu (un navigateur envoie toujours l'origine de la page).
    const joueur = ami ?? (accesLibre && depuisLeSite && !code ? "anonyme" : null);
    const refus = () => (code
      ? erreur(401, "Code d'accès invalide.", "code_invalide")
      : erreur(401, "Ce jeu demande un code d'accès.", "code_requis"));

    if (chemin === "/verifier" && request.method === "GET") {
      if (!joueur) return refus();
      return json(200, { ok: true, joueur, acces_libre: accesLibre, modele: env.MODELE || MODELE_DEFAUT });
    }

    if (chemin === "/compte") {
      const ip = request.headers.get("CF-Connecting-IP") ?? request.headers.get("X-Real-IP")
        ?? request.headers.get("X-Forwarded-For")?.split(",")[0].trim() ?? "inconnue";
      return gererCompte(request, env, { json, erreur, joueur, ip });
    }

    if (joueur && (chemin === "/v1/chat/completions" || chemin === "/v1/audio/speech")) {
      const voix = chemin === "/v1/audio/speech";
      const limite = voix ? Number(env.LIMITE_VOIX) || LIMITE_VOIX_DEFAUT : Number(env.LIMITE) || LIMITE_DEFAUT;
      const ip = request.headers.get("CF-Connecting-IP") ?? request.headers.get("X-Real-IP")
        ?? request.headers.get("X-Forwarded-For")?.split(",")[0].trim() ?? "inconnue";
      const cle = `${ami ? `ami:${ami}` : `ip:${ip}`}${voix ? ":voix" : ""}`;
      const attente = attenteAvantDemande(cle, ami ? limite * 2 : limite);
      if (attente) {
        console.log(`limite atteinte ${cle}`);
        const minutes = Math.max(1, Math.ceil(attente / 60));
        return erreur(429, `Doucement, aventurier ! Trop de demandes en peu de temps (protection anti-abus) : `
          + `reprends ta partie dans ${minutes} minute${minutes > 1 ? "s" : ""}.`, "limite_atteinte");
      }
    }

    if (chemin === "/v1/audio/speech" && request.method === "POST") {
      if (!joueur) return refus();
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
    if (!joueur) return refus();
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
    // Une clé de cache par partie : OpenAI retrouve plus souvent les consignes déjà en cache (moins cher).
    const cleCache = String(corps.cle_cache ?? "").replace(/[^\w-]/g, "").slice(0, 60);
    if (cleCache) envoi.prompt_cache_key = `cd-${cleCache}`;

    const appelOpenAI = (corpsEnvoi) => fetch(OPENAI_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(corpsEnvoi),
    });
    let reponse;
    try {
      reponse = await appelOpenAI(envoi);
      // Modèle qui n'accepte pas le niveau de réflexion le plus bas : on réessaie avec « low ».
      if (reponse.status === 400 && envoi.reasoning_effort && envoi.reasoning_effort !== "low") {
        const texteErreur = await reponse.clone().text();
        if (/reasoning[._]effort/i.test(texteErreur)) reponse = await appelOpenAI({ ...envoi, reasoning_effort: "low" });
      }
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
// « minimal » pour gpt-5, gpt-5-mini et gpt-5-nano, « none » pour gpt-5.1 et suivants, « low » sinon.
function parametresEconomie(modele) {
  if (!/^(gpt-5|o\d)/.test(modele)) return { max_completion_tokens: 1200 };
  const effort = /^gpt-5(-mini|-nano)?(-\d{4}-\d{2}-\d{2})?$/.test(modele) ? "minimal"
    : /^gpt-5\.\d/.test(modele) ? "none" : "low";
  return { reasoning_effort: effort, max_completion_tokens: 4000 };
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

// ================================================================== comptes joueurs
//
// POST /compte { action: "inscription" | "connexion", nom, mot_de_passe }  → { jeton, nom, sauvegarde }
// POST /compte { action: "deconnexion" }                                   (avec Authorization: Bearer jeton)
// GET  /compte                                                             → { nom, sauvegarde }
// PUT  /compte { donnees, maj_le, version_base }                           → { version } ou 409 { sauvegarde }
//
// Mots de passe : PBKDF2-SHA256 (100 000 tours) avec un sel par compte. Jetons de connexion : 32 octets
// aléatoires, seule leur empreinte SHA-256 est enregistrée, valables 180 jours.

const ITERATIONS = 100_000;
const DUREE_JETON = 180 * 24 * 3600;
const TAILLE_MAX_SAUVEGARDE = 300_000;
const ESSAIS_MAX = 10; // mots de passe faux par compte toutes les 15 minutes
const LIMITE_COMPTES = 30; // inscriptions ou connexions par adresse IP toutes les 10 minutes

function stockageRedis(env) {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const jeton = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !jeton) return null;
  return async (...commande) => {
    const r = await fetch(String(url).replace(/\/+$/, ""), {
      method: "POST",
      headers: { Authorization: `Bearer ${jeton}`, "Content-Type": "application/json" },
      body: JSON.stringify(commande.map(String)),
    });
    let d = null;
    try { d = await r.json(); } catch { /* corps vide */ }
    if (!r.ok || d?.error) throw new Error(`stockage : ${d?.error ?? r.status}`);
    return d.result;
  };
}

const hex = (octets) => [...octets].map((o) => o.toString(16).padStart(2, "0")).join("");
const depuisHex = (texte) => new Uint8Array(String(texte).match(/../g).map((h) => parseInt(h, 16)));
const aleatoireHex = (n) => hex(crypto.getRandomValues(new Uint8Array(n)));
const empreinte = async (texte) => hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texte))));

async function hacherMotDePasse(motDePasse, sel, iterations = ITERATIONS) {
  const cle = await crypto.subtle.importKey("raw", new TextEncoder().encode(motDePasse), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: depuisHex(sel), iterations }, cle, 256);
  return hex(new Uint8Array(bits));
}

/** Nom de compte normalisé (minuscules), ou null s'il n'est pas valable. */
export function normaliserNom(nom) {
  const n = String(nom ?? "").trim().normalize("NFC").toLowerCase();
  return /^[a-z0-9àâäéèêëîïôöùûüç_-]{3,24}$/.test(n) ? n : null;
}

async function gererCompte(request, env, { json, erreur, joueur, ip }) {
  const redis = stockageRedis(env);
  if (!redis) {
    return erreur(503, "Les comptes ne sont pas encore activés sur ce serveur (il faut une base Upstash Redis).", "sans_stockage");
  }
  const jetonRecu = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const nomDuJeton = async () => {
    if (!/^[0-9a-f]{64}$/.test(jetonRecu)) return null;
    return redis("GET", `jeton:${await empreinte(jetonRecu)}`);
  };
  const lireSauvegarde = async (nom) => {
    const brut = await redis("GET", `sauvegarde:${nom}`);
    try { return brut ? JSON.parse(brut) : null; } catch { return null; }
  };

  try {
    if (request.method === "GET") {
      const nom = await nomDuJeton();
      if (!nom) return erreur(401, "Session expirée : reconnecte-toi.", "non_connecte");
      return json(200, { nom, sauvegarde: await lireSauvegarde(nom) });
    }

    let corps;
    try {
      const texte = await request.text();
      if (texte.length > TAILLE_MAX_SAUVEGARDE + 2000) return erreur(413, "Sauvegarde trop volumineuse.", "trop_gros");
      corps = JSON.parse(texte || "{}");
    } catch {
      return erreur(400, "Requête invalide.");
    }

    if (request.method === "PUT") {
      const nom = await nomDuJeton();
      if (!nom) return erreur(401, "Session expirée : reconnecte-toi.", "non_connecte");
      if (!corps?.donnees || typeof corps.donnees !== "object") return erreur(400, "Sauvegarde invalide.");
      const actuelle = await lireSauvegarde(nom);
      // Une autre machine a enregistré entre-temps : on renvoie sa version, le jeu choisit la plus récente.
      if (actuelle && Number(corps.version_base ?? -1) !== actuelle.version) {
        return json(409, { error: { message: "Une sauvegarde plus récente existe.", code: "conflit" }, sauvegarde: actuelle });
      }
      const nouvelle = { donnees: corps.donnees, maj_le: Number(corps.maj_le) || Date.now(), version: (actuelle?.version ?? 0) + 1 };
      const texte = JSON.stringify(nouvelle);
      if (texte.length > TAILLE_MAX_SAUVEGARDE) return erreur(413, "Sauvegarde trop volumineuse.", "trop_gros");
      await redis("SET", `sauvegarde:${nom}`, texte);
      return json(200, { ok: true, version: nouvelle.version, maj_le: nouvelle.maj_le });
    }

    if (request.method !== "POST") return erreur(405, "Méthode non prise en charge.");

    if (corps.action === "deconnexion") {
      if (/^[0-9a-f]{64}$/.test(jetonRecu)) await redis("DEL", `jeton:${await empreinte(jetonRecu)}`);
      return json(200, { ok: true });
    }

    if (corps.action !== "inscription" && corps.action !== "connexion") return erreur(400, "Action inconnue.");
    if (attenteAvantDemande(`compte:${ip}`, LIMITE_COMPTES)) {
      return erreur(429, "Trop d'essais depuis cet appareil : réessaie dans quelques minutes.", "trop_essais");
    }
    const nom = normaliserNom(corps.nom);
    const motDePasse = String(corps.mot_de_passe ?? "");
    if (!nom) return erreur(400, "Nom de compte : 3 à 24 lettres, chiffres, - ou _.", "nom_invalide");
    if (motDePasse.length < 6 || motDePasse.length > 128) return erreur(400, "Le mot de passe doit faire au moins 6 caractères.", "mdp_court");

    if (corps.action === "inscription") {
      // Si l'organisateur réserve le jeu à des codes d'accès, il faut un code pour créer un compte.
      if (!joueur) return erreur(401, "Ce jeu demande un code d'accès pour créer un compte.", "code_requis");
      const sel = aleatoireHex(16);
      const fiche = { nom: String(corps.nom).trim().slice(0, 24), sel, hash: await hacherMotDePasse(motDePasse, sel), iterations: ITERATIONS, cree_le: Date.now() };
      const cree = await redis("SET", `compte:${nom}`, JSON.stringify(fiche), "NX");
      if (cree !== "OK") return erreur(409, "Ce nom de compte est déjà pris.", "nom_pris");
      console.log(`compte créé ${nom}`);
      return json(200, { jeton: await ouvrirSession(redis, nom), nom, sauvegarde: null });
    }

    // Connexion
    const essais = Number(await redis("GET", `echecs:${nom}`)) || 0;
    if (essais >= ESSAIS_MAX) return erreur(429, "Trop de mots de passe faux : réessaie dans 15 minutes.", "trop_essais");
    const brut = await redis("GET", `compte:${nom}`);
    let fiche = null;
    try { fiche = brut ? JSON.parse(brut) : null; } catch { /* fiche abîmée */ }
    const calcule = await hacherMotDePasse(motDePasse, fiche?.sel ?? "00".repeat(16), fiche?.iterations ?? ITERATIONS);
    if (!fiche || !egal(calcule, fiche.hash)) {
      await redis("INCR", `echecs:${nom}`);
      await redis("EXPIRE", `echecs:${nom}`, 900);
      return erreur(401, "Nom de compte ou mot de passe incorrect.", "identifiants_invalides");
    }
    await redis("DEL", `echecs:${nom}`);
    return json(200, { jeton: await ouvrirSession(redis, nom), nom, sauvegarde: await lireSauvegarde(nom) });
  } catch (e) {
    console.log(`compte : erreur ${e?.message ?? e}`);
    return erreur(502, "La base de données des comptes ne répond pas. Réessaie dans un instant.", "stockage_indisponible");
  }
}

async function ouvrirSession(redis, nom) {
  const jeton = aleatoireHex(32);
  await redis("SET", `jeton:${await empreinte(jeton)}`, nom, "EX", DUREE_JETON);
  return jeton;
}
