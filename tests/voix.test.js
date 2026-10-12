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
