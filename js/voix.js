// Lecteur vocal : le maître du jeu lit ses réponses.
// Deux moteurs : la voix de l'appareil (gratuite) ou une voix IA d'OpenAI (naturelle, payante à l'usage).

const CLE = "contes-dragons:voix";
const PREFERENCES_DEFAUT = { auto: false, moteur: "ia", voix: "", vitesse: 1, voixIA: "onyx" };
const SILENCE = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
const CACHE_MAX = 40;

const dansNavigateur = () => typeof window !== "undefined";
export const voixAppareilDisponible = () => dansNavigateur() && "speechSynthesis" in window;
export const voixDisponible = () => dansNavigateur() && (voixAppareilDisponible() || "Audio" in window);

let enCours = null;     // identifiant de ce qui est en train d'être lu
let surChangement = () => {};
let surErreur = () => {};
let sourceIA = null;    // (texte, voix) => Promise<Blob>
let lecteur = null;     // élément <audio> réutilisé (nécessaire sur iPhone)
const cache = new Map(); // texte déjà synthétisé → URL du son, pour ne pas payer deux fois

export function chargerPreferences() {
  try {
    return { ...PREFERENCES_DEFAUT, ...JSON.parse(localStorage.getItem(CLE) ?? "{}") };
  } catch {
    return { ...PREFERENCES_DEFAUT };
  }
}

export function enregistrerPreferences(modifs) {
  const prefs = { ...chargerPreferences(), ...modifs };
  try { localStorage.setItem(CLE, JSON.stringify(prefs)); } catch { /* préférence non retenue, sans gravité */ }
  return prefs;
}

/** Branche la voix IA : fonction (texte, voix) => Promise<Blob audio>. */
export function definirSourceIA(fn) { sourceIA = fn; }

/** Appelé quand la voix IA échoue (la voix de l'appareil prend alors le relais). */
export function quandErreur(fn) { surErreur = fn; }

/** Appelé à chaque début ou fin de lecture, avec l'identifiant lu (ou null). */
export function quandLectureChange(fn) { surChangement = fn; }

export const lectureEnCours = () => enCours;

/** Voix françaises installées sur l'appareil, les plus naturelles d'abord. */
export function voixFrancaises() {
  if (!voixAppareilDisponible()) return [];
  const qualite = (v) => (/natural|neural|premium|enhanced|online/i.test(v.name) ? 2 : 0)
    + (/google|microsoft|amélie|amelie|thomas|audrey|aurélie|denise|henri/i.test(v.name) ? 1 : 0)
    + (/fr-FR/i.test(v.lang) ? 1 : 0);
  return speechSynthesis.getVoices()
    .filter((v) => /^fr/i.test(v.lang))
    .sort((a, b) => qualite(b) - qualite(a));
}

/** Texte prêt à être lu : sans Markdown, découpé en morceaux d'au plus `taille` caractères (phrases entières). */
export function preparerTexte(texte, taille = 220) {
  const propre = String(texte ?? "")
    .replace(/\*\*|__|[*_`#>]/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  const phrases = propre.match(/[^.!?…]+[.!?…]+["»”)]*\s*|[^.!?…]+$/g) ?? [];
  const morceaux = [];
  let courant = "";
  for (const p of phrases) {
    if ((courant + p).length > taille && courant) {
      morceaux.push(courant.trim());
      courant = "";
    }
    courant += p;
  }
  if (courant.trim()) morceaux.push(courant.trim());
  return morceaux;
}

/** Morceaux pour la voix IA : un premier court (la lecture démarre vite), puis des plus longs. */
export function decouperPourIA(texte) {
  const phrases = preparerTexte(texte, 1);
  const morceaux = [];
  let courant = "";
  for (const p of phrases) {
    const limite = morceaux.length === 0 ? 260 : 1200;
    if ((courant + " " + p).length > limite && courant) {
      morceaux.push(courant.trim());
      courant = "";
    }
    courant += ` ${p}`;
  }
  if (courant.trim()) morceaux.push(courant.trim());
  return morceaux;
}

function terminer(id) {
  if (enCours === id) {
    enCours = null;
    surChangement(null);
  }
}

export function lire(texte, id = "lecture") {
  if (!voixDisponible()) return;
  arreter();
  enCours = id;
  surChangement(id);
  const prefs = chargerPreferences();
  if (prefs.moteur === "ia" && sourceIA) lireIA(texte, id, prefs);
  else lireAppareil(preparerTexte(texte), id, prefs);
}

function lireAppareil(morceaux, id, prefs) {
  if (!voixAppareilDisponible() || !morceaux.length) {
    terminer(id);
    return;
  }
  const voix = voixFrancaises().find((v) => v.name === prefs.voix) ?? voixFrancaises()[0] ?? null;
  morceaux.forEach((m, i) => {
    const u = new SpeechSynthesisUtterance(m);
    u.lang = voix?.lang ?? "fr-FR";
    if (voix) u.voice = voix;
    u.rate = Number(prefs.vitesse) || 1;
    if (i === morceaux.length - 1) u.onend = () => terminer(id);
    u.onerror = () => terminer(id);
    speechSynthesis.speak(u);
  });
}

function obtenirSon(morceau, voixIA) {
  const cle = `${voixIA}|${morceau}`;
  if (!cache.has(cle)) {
    const promesse = sourceIA(morceau, voixIA).then((blob) => URL.createObjectURL(blob));
    promesse.catch(() => cache.delete(cle));
    cache.set(cle, promesse);
    if (cache.size > CACHE_MAX) {
      const [ancienne, url] = cache.entries().next().value;
      cache.delete(ancienne);
      url.then((u) => URL.revokeObjectURL(u)).catch(() => {});
    }
  }
  return cache.get(cle);
}

function jouer(url, vitesse) {
  return new Promise((resolve, reject) => {
    lecteur ??= new Audio();
    lecteur.onended = () => resolve();
    lecteur.onerror = () => reject(new Error("lecture audio impossible"));
    lecteur.src = url;
    lecteur.playbackRate = Number(vitesse) || 1;
    lecteur.play().catch(reject);
  });
}

async function lireIA(texte, id, prefs) {
  const morceaux = decouperPourIA(texte);
  for (let i = 0; i < morceaux.length; i++) {
    if (enCours !== id) return;
    let url;
    try {
      const son = obtenirSon(morceaux[i], prefs.voixIA);
      if (i + 1 < morceaux.length) obtenirSon(morceaux[i + 1], prefs.voixIA).catch(() => {}); // préchargement
      url = await son;
      if (enCours !== id) return;
      await jouer(url, prefs.vitesse);
    } catch (err) {
      if (enCours !== id) return;
      surErreur(err?.message || "Voix IA indisponible.");
      // La voix de l'appareil lit la suite pour ne pas couper l'histoire.
      lireAppareil(preparerTexte(morceaux.slice(i).join(" ")), id, prefs);
      return;
    }
  }
  terminer(id);
}

export function arreter() {
  enCours = null;
  if (voixAppareilDisponible()) speechSynthesis.cancel();
  if (lecteur) {
    lecteur.onended = null;
    lecteur.onerror = null;
    lecteur.pause();
  }
  surChangement(null);
}

/**
 * Sur iPhone, le son ne peut démarrer qu'après un geste de l'utilisateur :
 * on « déverrouille » la voix au clic sur « Agir », pour pouvoir lire la réponse ensuite.
 */
export function deverrouiller() {
  if (!dansNavigateur()) return;
  if (chargerPreferences().moteur === "ia" && "Audio" in window) {
    lecteur ??= new Audio();
    lecteur.src = SILENCE;
    lecteur.play().catch(() => {});
  } else if (voixAppareilDisponible() && !speechSynthesis.speaking) {
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    speechSynthesis.speak(u);
  }
}
