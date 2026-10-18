import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import worker from "../serveur/worker.js";
import { clientServeur, verifierCode } from "../js/mj.js";

const ENV = {
  OPENAI_API_KEY: "sk-secrete",
  CODES_ACCES: "jonathan:dragon-rouge-42, lea:lune-bleue-17",
  MODELE: "gpt-modele-impose",
  ORIGINES: "https://jonathanguery0-hue.github.io",
};
const ORIGINE = "https://jonathanguery0-hue.github.io";
const fetchOrigine = globalThis.fetch;
afterEach(() => { globalThis.fetch = fetchOrigine; });

function requete(chemin, { methode = "POST", code, corps, origine = ORIGINE } = {}) {
  const entetes = { "Content-Type": "application/json" };
  if (code) entetes["X-Code-Acces"] = code;
  if (origine) entetes.Origin = origine;
  return new Request(`https://relais.exemple.workers.dev${chemin}`, {
    method: methode, headers: entetes, body: corps ? JSON.stringify(corps) : undefined,
  });
}

test("relais : transmet à OpenAI avec la clé du serveur et le modèle imposé", async () => {
  let envoye;
  globalThis.fetch = async (url, options) => {
    envoye = { url, options };
    return new Response(JSON.stringify({ choices: [{ message: { content: "Bienvenue" } }] }), { status: 200 });
  };
  const r = await worker.fetch(requete("/v1/chat/completions", {
    code: "lune-bleue-17", corps: { model: "gpt-tres-cher", messages: [{ role: "user", content: "Salut" }], tools: [{ type: "function" }], temperature: 2 },
  }), ENV);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("Access-Control-Allow-Origin"), ORIGINE);
  assert.equal((await r.json()).choices[0].message.content, "Bienvenue");
  assert.equal(envoye.url, "https://api.openai.com/v1/chat/completions");
  assert.equal(envoye.options.headers.Authorization, "Bearer sk-secrete");
  const corps = JSON.parse(envoye.options.body);
  assert.equal(corps.model, "gpt-modele-impose");
  assert.equal(corps.temperature, undefined);
  assert.equal(corps.tools.length, 1);
});

test("relais : refuse les mauvais codes, les autres sites et les requêtes invalides", async () => {
  globalThis.fetch = async () => { throw new Error("OpenAI ne doit pas être appelé"); };
  const corps = { messages: [{ role: "user", content: "x" }] };
  assert.equal((await worker.fetch(requete("/v1/chat/completions", { corps }), ENV)).status, 401);
  assert.equal((await worker.fetch(requete("/v1/chat/completions", { code: "faux", corps }), ENV)).status, 401);
  assert.equal((await worker.fetch(requete("/v1/chat/completions", { code: "lea", corps }), ENV)).status, 401);
  assert.equal((await worker.fetch(requete("/v1/chat/completions", { code: "dragon-rouge-42", corps, origine: "https://pirate.example" }), ENV)).status, 403);
  assert.equal((await worker.fetch(requete("/v1/chat/completions", { code: "dragon-rouge-42", corps: { messages: [] } }), ENV)).status, 400);
  assert.equal((await worker.fetch(requete("/autre", { code: "dragon-rouge-42", corps }), ENV)).status, 404);
  const pref = await worker.fetch(requete("/v1/chat/completions", { methode: "OPTIONS" }), ENV);
  assert.equal(pref.status, 204);
  assert.match(pref.headers.get("Access-Control-Allow-Headers"), /X-Code-Acces/);
});

test("relais : vérification du code et clé du serveur refusée", async () => {
  const ok = await worker.fetch(requete("/verifier", { methode: "GET", code: "dragon-rouge-42" }), ENV);
  assert.deepEqual(await ok.json(), { ok: true, joueur: "jonathan", acces_libre: false, modele: "gpt-modele-impose" });
  globalThis.fetch = async () => new Response('{"error":{"message":"bad key"}}', { status: 401 });
  const r = await worker.fetch(requete("/v1/chat/completions", { code: "dragon-rouge-42", corps: { messages: [{ role: "user", content: "x" }] } }), ENV);
  assert.equal(r.status, 502);
  assert.match((await r.json()).error.message, /organisateur/);
});

test("le jeu passe par le relais avec le code d'accès", async () => {
  // Le « fetch » du jeu est branché directement sur le Worker.
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith("https://api.openai.com")) {
      return new Response(JSON.stringify({ choices: [{ message: { content: "Il était une fois…" } }] }), { status: 200 });
    }
    return worker.fetch(new Request(url, { ...options, headers: { ...options?.headers, Origin: ORIGINE } }), ENV);
  };
  const url = "https://relais.exemple.workers.dev";
  assert.equal((await verifierCode({ url, code: "lune-bleue-17" })).joueur, "lea");
  await assert.rejects(verifierCode({ url, code: "mauvais" }), /Code d'accès refusé/);
  const appeler = clientServeur({ url, code: "lune-bleue-17" });
  assert.equal((await appeler([{ role: "user", content: "Bonjour" }])).content, "Il était une fois…");
  await assert.rejects(clientServeur({ url, code: "x" })([{ role: "user", content: "Bonjour" }]), /Code d'accès refusé/);
});

test("relais ouvert : sans code depuis le site du jeu, refusé ailleurs, limité en cas d'abus", async () => {
  const ouvert = { OPENAI_API_KEY: "sk-secrete", LIMITE: "3" }; // ni codes ni ORIGINES : site GitHub Pages par défaut
  globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 });
  const corps = { messages: [{ role: "user", content: "x" }] };
  const depuis = (origine, ip) => {
    const r = requete("/v1/chat/completions", { corps, origine });
    r.headers.set("CF-Connecting-IP", ip);
    return r;
  };
  assert.equal((await worker.fetch(requete("/verifier", { methode: "GET" }), ouvert)).status, 200);
  for (let i = 0; i < 3; i++) assert.equal((await worker.fetch(depuis(ORIGINE, "1.1.1.1"), ouvert)).status, 200);
  const trop = await worker.fetch(depuis(ORIGINE, "1.1.1.1"), ouvert);
  assert.equal(trop.status, 429);
  assert.equal((await trop.json()).error.code, "limite_atteinte");
  assert.equal((await worker.fetch(depuis(ORIGINE, "2.2.2.2"), ouvert)).status, 200); // autre joueur : pas bloqué
  assert.equal((await worker.fetch(depuis("https://pirate.example", "3.3.3.3"), ouvert)).status, 403);
  assert.equal((await worker.fetch(depuis("", "4.4.4.4"), ouvert)).status, 401); // pas un navigateur sur le site
  // Avec des codes : obligatoires, sauf ACCES_LIBRE=oui.
  const prive = { ...ouvert, CODES_ACCES: "lea:lune-bleue-17" };
  const r = await worker.fetch(depuis(ORIGINE, "5.5.5.5"), prive);
  assert.equal(r.status, 401);
  assert.equal((await r.json()).error.code, "code_requis");
  assert.equal((await worker.fetch(depuis(ORIGINE, "6.6.6.6"), { ...prive, ACCES_LIBRE: "oui" })).status, 200);
  globalThis.fetch = fetchOrigine;
});
