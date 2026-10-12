import assert from "node:assert/strict";
import { test } from "node:test";

import { preparerTexte, voixDisponible } from "../js/voix.js";

test("le texte lu est nettoyé et découpé en phrases courtes", () => {
  const morceaux = preparerTexte("Tu entres dans **l'auberge**. *Il fait chaud !*\n\n- Margot sourit.\nQue fais-tu ?");
  assert.equal(morceaux.join(" "), "Tu entres dans l'auberge. Il fait chaud ! Margot sourit. Que fais-tu ?");
  const long = Array.from({ length: 20 }, (_, i) => `Phrase numéro ${i} assez longue pour remplir.`).join(" ");
  const decoupe = preparerTexte(long);
  assert.ok(decoupe.length > 2);
  assert.ok(decoupe.every((m) => m.length <= 260));
  assert.equal(decoupe.join(" "), long);
  assert.deepEqual(preparerTexte(""), []);
});

test("sans navigateur, la voix est simplement indisponible", () => {
  assert.equal(voixDisponible(), false);
});

import worker from "../serveur/worker.js";
import { decouperPourIA } from "../js/voix.js";
import { CONSIGNES_VOIX, MODELE_VOIX, syntheseOpenAI, syntheseServeur } from "../js/tts.js";

const fetchOrigine = globalThis.fetch;

test("la voix IA démarre vite : premier morceau court, puis des morceaux plus longs", () => {
  const texte = Array.from({ length: 30 }, (_, i) => `Voici la phrase numéro ${i} du récit.`).join(" ");
  const morceaux = decouperPourIA(texte);
  assert.ok(morceaux[0].length <= 260);
  assert.ok(morceaux.slice(1).every((m) => m.length <= 1200));
  assert.equal(morceaux.join(" "), texte);
});

test("voix IA avec la clé du joueur, et modèle de secours", async () => {
  const appels = [];
  globalThis.fetch = async (url, options) => {
    const corps = JSON.parse(options.body);
    appels.push({ url, corps, auth: options.headers.Authorization });
    if (corps.model === MODELE_VOIX) return new Response('{"error":{"code":"model_not_found","message":"nope"}}', { status: 404 });
    return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "Content-Type": "audio/mpeg" } });
  };
  try {
    const son = await syntheseOpenAI({ cle: "sk-x", adresse: "" }, "Bonjour aventurier.", "onyx");
    assert.equal(son.size, 3);
    assert.equal(appels[0].url, "https://api.openai.com/v1/audio/speech");
    assert.equal(appels[0].auth, "Bearer sk-x");
    assert.equal(appels[0].corps.instructions, CONSIGNES_VOIX);
    assert.equal(appels[1].corps.model, "tts-1");
    globalThis.fetch = async () => new Response('{"error":{"message":"bad"}}', { status: 401 });
    await assert.rejects(syntheseOpenAI({ cle: "sk-x" }, "x", "onyx"), /refusée/);
  } finally {
    globalThis.fetch = fetchOrigine;
  }
});

test("voix IA via le serveur relais avec un code d'accès", async () => {
  const ENV = { OPENAI_API_KEY: "sk-secrete", CODES_ACCES: "lea:lune-bleue-17" };
  let versOpenAI;
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith("https://api.openai.com")) {
      versOpenAI = { url, corps: JSON.parse(options.body), auth: options.headers.Authorization };
      return new Response(new Uint8Array([9, 9]), { status: 200, headers: { "Content-Type": "audio/mpeg" } });
    }
    return worker.fetch(new Request(url, options), ENV);
  };
  try {
    const url = "https://relais.exemple.workers.dev";
    const son = await syntheseServeur({ url, code: "lune-bleue-17" }, "Il était une fois…", "voix-pirate");
    assert.equal(son.size, 2);
    assert.equal(versOpenAI.url, "https://api.openai.com/v1/audio/speech");
    assert.equal(versOpenAI.auth, "Bearer sk-secrete");
    assert.equal(versOpenAI.corps.voice, "onyx"); // voix inconnue remplacée
    assert.equal(versOpenAI.corps.model, "gpt-4o-mini-tts");
    await assert.rejects(syntheseServeur({ url, code: "faux" }, "x", "onyx"), /refusée/);
  } finally {
    globalThis.fetch = fetchOrigine;
  }
});
