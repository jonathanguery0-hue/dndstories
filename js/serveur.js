// Adresse du serveur du jeu, qui garde la clé OpenAI de l'organisateur.
//
// - Sur Vercel (adresse en *.vercel.app), le jeu et le serveur sont au même endroit : rien à régler.
// - Ailleurs (GitHub Pages…), indiquer ici l'adresse du serveur, par exemple
//   "https://contes-dragons.vercel.app/api" ; laisser vide pour que chaque joueur utilise sa propre clé.
const ADRESSE_CONFIGUREE = "";

const surVercel = typeof location !== "undefined" && location.hostname.endsWith(".vercel.app");

export const SERVEUR_URL = ADRESSE_CONFIGUREE || (surVercel ? `${location.origin}/api` : "");
