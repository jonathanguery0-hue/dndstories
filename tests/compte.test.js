import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import worker, { normaliserNom } from "../serveur/worker.js";
import { profilVierge, resumeProfil } from "../js/expedition/compte.js";
import { creerProfil } from "../js/expedition/moteur.js";

const ORIGINE = "https://jonathanguery0-hue.github.io";
const ENV = { OPENAI_API_KEY: "sk-x", KV_REST_API_URL: "https://base.upstash.io", KV_REST_API_TOKEN: "jeton-base" };
const fetchOrigine = globalThis.fetch;
let base;

/** Fausse base Upstash Redis (API REST) en mémoire. */
function fausseBase() {
  const donnees = new Map();
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://base.upstash.io");
    assert.equal(options.headers.Authorization, "Bearer jeton-base");
    const [cmd, cle, ...args] = JSON.parse(options.body);
    let result = null;
    switch (cmd) {
      case "GET": result = donnees.get(cle) ?? null; break;
      case "SET":
        if (args.includes("NX") && donnees.has(cle)) result = null;
        else { donnees.set(cle, args[0]); result = "OK"; }
        break;
      case "DEL": result = donnees.delete(cle) ? 1 : 0; break;
      case "INCR": donnees.set(cle, String((Number(donnees.get(cle)) || 0) + 1)); result = Number(donnees.get(cle)); break;
      case "EXPIRE": result = 1; break;
      default: throw new Error(`commande inattendue ${cmd}`);
    }
    return new Response(JSON.stringify({ result }), { status: 200 });
  };
  return donnees;
}

beforeEach(() => { base = fausseBase(); });
afterEach(() => { globalThis.fetch = fetchOrigine; });

function requete(methode, { corps, jeton, ip = "1.2.3.4" } = {}) {
  const entetes = { "Content-Type": "application/json", Origin: ORIGINE, "X-Real-IP": ip };
  if (jeton) entetes.Authorization = `Bearer ${jeton}`;
  return new Request("https://jeu.vercel.app/api/compte", { method: methode, headers: entetes, body: corps ? JSON.stringify(corps) : undefined });
}
const appeler = async (methode, options, env = ENV) => {
  const r = await worker.fetch(requete(methode, options), env);
  return { statut: r.status, json: await r.json() };
};

test("comptes : inscription, connexion, sauvegarde puis lecture depuis un autre appareil", async () => {
  const insc = await appeler("POST", { corps: { action: "inscription", nom: "Jonathan", mot_de_passe: "gobelin42" } });
  assert.equal(insc.statut, 200);
  assert.equal(insc.json.nom, "jonathan");
  assert.match(insc.json.jeton, /^[0-9a-f]{64}$/);
  // Le mot de passe et le jeton ne sont jamais stockés en clair.
  const fiche = base.get("compte:jonathan");
  assert.ok(!fiche.includes("gobelin42"));
  assert.ok(![...base.keys()].some((k) => k.includes(insc.json.jeton)));

  const envoi = await appeler("PUT", { jeton: insc.json.jeton, corps: { donnees: { profil: { or: 12 } }, maj_le: 1000, version_base: null } });
  assert.equal(envoi.statut, 200);
  assert.equal(envoi.json.version, 1);

  const conn = await appeler("POST", { corps: { action: "connexion", nom: "JONATHAN", mot_de_passe: "gobelin42" } });
  assert.equal(conn.statut, 200);
  assert.notEqual(conn.json.jeton, insc.json.jeton);
  assert.deepEqual(conn.json.sauvegarde, { donnees: { profil: { or: 12 } }, maj_le: 1000, version: 1 });

  const lecture = await appeler("GET", { jeton: conn.json.jeton });
  assert.equal(lecture.json.sauvegarde.donnees.profil.or, 12);
});

test("comptes : une sauvegarde concurrente est signalée (conflit) avec la version du serveur", async () => {
  const { json: { jeton } } = await appeler("POST", { corps: { action: "inscription", nom: "lea", mot_de_passe: "secret-123" } });
  await appeler("PUT", { jeton, corps: { donnees: { a: 1 }, maj_le: 1, version_base: null } });
  await appeler("PUT", { jeton, corps: { donnees: { a: 2 }, maj_le: 2, version_base: 1 } });
  const conflit = await appeler("PUT", { jeton, corps: { donnees: { a: 3 }, maj_le: 3, version_base: 1 } });
  assert.equal(conflit.statut, 409);
  assert.equal(conflit.json.error.code, "conflit");
  assert.deepEqual(conflit.json.sauvegarde.donnees, { a: 2 });
  assert.equal(conflit.json.sauvegarde.version, 2);
});

test("comptes : refus des mauvais identifiants, des doublons et des sessions inconnues", async () => {
  await appeler("POST", { corps: { action: "inscription", nom: "brann", mot_de_passe: "hache-de-guerre" } });
  assert.equal((await appeler("POST", { corps: { action: "inscription", nom: "Brann", mot_de_passe: "autre-mdp" } })).json.error.code, "nom_pris");
  assert.equal((await appeler("POST", { corps: { action: "connexion", nom: "brann", mot_de_passe: "mauvais" } })).statut, 401);
  assert.equal((await appeler("POST", { corps: { action: "connexion", nom: "inconnu", mot_de_passe: "peu-importe" } })).json.error.code, "identifiants_invalides");
  assert.equal((await appeler("POST", { corps: { action: "inscription", nom: "x", mot_de_passe: "123456" } })).json.error.code, "nom_invalide");
  assert.equal((await appeler("POST", { corps: { action: "inscription", nom: "valide", mot_de_passe: "123" } })).json.error.code, "mdp_court");
  assert.equal((await appeler("GET", { jeton: "a".repeat(64) })).statut, 401);
  assert.equal((await appeler("GET", {})).json.error.code, "non_connecte");
  assert.equal((await appeler("PUT", { jeton: "zz", corps: { donnees: {} } })).statut, 401);
});

test("comptes : trop de mots de passe faux bloquent le compte un moment", async () => {
  await appeler("POST", { corps: { action: "inscription", nom: "vex", mot_de_passe: "dagues-dagues" } });
  for (let i = 0; i < 10; i++) {
    await appeler("POST", { corps: { action: "connexion", nom: "vex", mot_de_passe: `faux-${i}` }, ip: `9.9.9.${i}` });
  }
  const bloque = await appeler("POST", { corps: { action: "connexion", nom: "vex", mot_de_passe: "dagues-dagues" }, ip: "8.8.8.8" });
  assert.equal(bloque.statut, 429);
  assert.equal(bloque.json.error.code, "trop_essais");
});

test("comptes : déconnexion et serveur sans base de données", async () => {
  const { json: { jeton } } = await appeler("POST", { corps: { action: "inscription", nom: "aube", mot_de_passe: "lumiere-divine" } });
  assert.equal((await appeler("POST", { jeton, corps: { action: "deconnexion" } })).statut, 200);
  assert.equal((await appeler("GET", { jeton })).statut, 401);
  const sansBase = await appeler("GET", { jeton }, { OPENAI_API_KEY: "sk-x" });
  assert.equal(sansBase.statut, 503);
  assert.equal(sansBase.json.error.code, "sans_stockage");
});

test("comptes : avec des codes d'accès, il faut un code pour créer un compte", async () => {
  const env = { ...ENV, CODES_ACCES: "jonathan:dragon-rouge" };
  const refus = await appeler("POST", { corps: { action: "inscription", nom: "intrus", mot_de_passe: "123456789" } }, env);
  assert.equal(refus.json.error.code, "code_requis");
});

test("comptes : noms acceptés et refusés", () => {
  assert.equal(normaliserNom("  Jonathan "), "jonathan");
  assert.equal(normaliserNom("sœur"), null);
  assert.equal(normaliserNom("élodie_42"), "élodie_42");
  assert.equal(normaliserNom("ab"), null);
  assert.equal(normaliserNom("a b c"), null);
  assert.equal(normaliserNom("x".repeat(25)), null);
});

test("comptes : profil vierge et résumé", () => {
  const p = creerProfil();
  assert.ok(profilVierge(p));
  p.or = 5;
  assert.ok(!profilVierge(p));
  assert.match(resumeProfil(p), /5 or/);
});

test("relais : les en-têtes CORS autorisent les comptes", async () => {
  const r = await worker.fetch(requete("OPTIONS"), ENV);
  assert.match(r.headers.get("Access-Control-Allow-Headers"), /Authorization/);
  assert.match(r.headers.get("Access-Control-Allow-Methods"), /PUT/);
});
