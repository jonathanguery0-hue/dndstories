// Branche le relais (serveur/worker.js) sur les fonctions Vercel.
// Vercel donne la clé OpenAI et les réglages via les variables d'environnement du projet.
import relais from "../serveur/worker.js";

const traiter = (request) => relais.fetch(request, process.env);

export const GET = traiter;
export const POST = traiter;
export const OPTIONS = traiter;
