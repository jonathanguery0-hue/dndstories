// Lancers de dés : formules du type « 2d6+3 », « 1d20 », « 4d6kh3 ».

function aleatoireCrypto() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 2 ** 32;
}

let aleatoire = aleatoireCrypto;

/** Rend les lancers reproductibles (utilisé par les tests). */
export function definirGraine(graine) {
  let t = graine >>> 0;
  aleatoire = () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 2 ** 32;
  };
}

export function d(faces) {
  return Math.floor(aleatoire() * faces) + 1;
}

/**
 * Lance une formule et renvoie {formule, total, detail}.
 * Exemple : lancer("2d6+3") -> {formule: "2d6+3", total: 10, detail: "[4, 3] + 3"}
 */
export function lancer(formule) {
  const texte = String(formule ?? "").replace(/\s+/g, "").toLowerCase();
  if (!texte) throw new Error("Formule de dés vide");
  const terme = /([+-]?)(?:(\d*)d(\d+)(kh\d+|kl\d+)?|(\d+))/y;
  let position = 0;
  let total = 0;
  const morceaux = [];
  while (position < texte.length) {
    terme.lastIndex = position;
    const m = terme.exec(texte);
    if (!m || m[0] === "") throw new Error(`Formule de dés invalide : « ${formule} »`);
    position = terme.lastIndex;
    const signe = m[1] === "-" ? -1 : 1;
    let valeur;
    if (m[3]) {
      const nombre = Number(m[2] || 1);
      const faces = Number(m[3]);
      if (nombre < 1 || nombre > 100 || faces < 2 || faces > 1000) {
        throw new Error(`Formule de dés hors limites : « ${formule} »`);
      }
      const des = Array.from({ length: nombre }, () => d(faces));
      let gardes = des;
      if (m[4]) {
        const n = Number(m[4].slice(2));
        const tries = [...des].sort((a, b) => (m[4].startsWith("kh") ? b - a : a - b));
        gardes = tries.slice(0, n);
      }
      valeur = gardes.reduce((a, b) => a + b, 0);
      morceaux.push(`${signe < 0 ? "-" : "+"} [${des.join(", ")}]`);
    } else {
      valeur = Number(m[5]);
      morceaux.push(`${signe < 0 ? "-" : "+"} ${valeur}`);
    }
    total += signe * valeur;
  }
  let detail = morceaux.join(" ");
  if (detail.startsWith("+ ")) detail = detail.slice(2);
  return { formule: String(formule), total, detail };
}

/** Jet de d20 avec avantage / désavantage. Renvoie {resultat, des}. */
export function d20(avantage = false, desavantage = false) {
  if (avantage && desavantage) avantage = desavantage = false;
  if (avantage || desavantage) {
    const des = [d(20), d(20)];
    return { resultat: avantage ? Math.max(...des) : Math.min(...des), des };
  }
  const des = [d(20)];
  return { resultat: des[0], des };
}
