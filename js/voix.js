// Lecteur vocal : le maître du jeu lit ses réponses avec la synthèse vocale du navigateur (gratuite).

const CLE = "contes-dragons:voix";
const PREFERENCES_DEFAUT = { auto: false, voix: "", vitesse: 1 };

export const voixDisponible = () => typeof window !== "undefined" && "speechSynthesis" in window;

let enCours = null; // identifiant de ce qui est en train d'être lu
let surChangement = () => {};

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

/** Voix françaises installées, les plus naturelles d'abord. */
export function voixFrancaises() {
  if (!voixDisponible()) return [];
  const qualite = (v) => (/natural|neural|premium|enhanced|online/i.test(v.name) ? 2 : 0)
    + (/google|microsoft|amélie|amelie|thomas|audrey|aurélie|denise|henri/i.test(v.name) ? 1 : 0)
    + (/fr-FR/i.test(v.lang) ? 1 : 0);
  return speechSynthesis.getVoices()
    .filter((v) => /^fr/i.test(v.lang))
    .sort((a, b) => qualite(b) - qualite(a));
}

function choisirVoix(nom) {
  const voix = voixFrancaises();
  return voix.find((v) => v.name === nom) ?? voix[0] ?? null;
}

/** Texte prêt à être lu : sans Markdown, découpé en phrases courtes (Chrome coupe les lectures longues). */
export function preparerTexte(texte) {
  const propre = String(texte ?? "")
    .replace(/\*\*|__|[*_`#>]/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  const phrases = propre.match(/[^.!?…]+[.!?…]+["»”)]*\s*|[^.!?…]+$/g) ?? [];
  const morceaux = [];
  let courant = "";
  for (const p of phrases) {
    if ((courant + p).length > 220 && courant) {
      morceaux.push(courant.trim());
      courant = "";
    }
    courant += p;
  }
  if (courant.trim()) morceaux.push(courant.trim());
  return morceaux;
}

export function lire(texte, id = "lecture") {
  if (!voixDisponible()) return;
  arreter();
  const prefs = chargerPreferences();
  const voix = choisirVoix(prefs.voix);
  const morceaux = preparerTexte(texte);
  if (!morceaux.length) return;
  enCours = id;
  surChangement(enCours);
  morceaux.forEach((m, i) => {
    const u = new SpeechSynthesisUtterance(m);
    u.lang = voix?.lang ?? "fr-FR";
    if (voix) u.voice = voix;
    u.rate = Number(prefs.vitesse) || 1;
    if (i === morceaux.length - 1) {
      u.onend = () => { if (enCours === id) { enCours = null; surChangement(null); } };
    }
    u.onerror = () => { if (enCours === id) { enCours = null; surChangement(null); } };
    speechSynthesis.speak(u);
  });
}

export function arreter() {
  if (!voixDisponible()) return;
  enCours = null;
  speechSynthesis.cancel();
  surChangement(null);
}

export const lectureEnCours = () => enCours;

/** Appelé à chaque début ou fin de lecture, avec l'identifiant lu (ou null). */
export function quandLectureChange(fn) {
  surChangement = fn;
}

/**
 * Sur iPhone, la voix ne peut démarrer qu'après un geste de l'utilisateur :
 * on « déverrouille » la synthèse au clic sur « Agir », pour pouvoir lire la réponse ensuite.
 */
export function deverrouiller() {
  if (!voixDisponible() || speechSynthesis.speaking) return;
  const u = new SpeechSynthesisUtterance(" ");
  u.volume = 0;
  speechSynthesis.speak(u);
}
