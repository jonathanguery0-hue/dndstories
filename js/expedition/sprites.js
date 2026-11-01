// Pixel art du mode « Expéditions » : sprites 16×16 décrits par des lettres (une lettre = une couleur),
// dessinés sur un canvas sans lissage. Les héros regardent à droite, les monstres à gauche.

export const PALETTE = {
  k: "#1a1420", // contour
  s: "#f0c8a0", S: "#c8966e", // peau
  g: "#7cbf4f", G: "#4a7f2e", // peau de gobelin
  e: "#ffe14d", // yeux
  r: "#c8402f", R: "#7b241c",
  b: "#3f74b5", B: "#24456e",
  p: "#8a5cc4", P: "#523376",
  m: "#c4ced8", M: "#7a8692", // métal
  w: "#f4f1e8", W: "#c9c2b0",
  y: "#ecc038", Y: "#a5791a", // or
  n: "#93603a", N: "#5c3a1f", // bois, cuir
  o: "#8c7a66", O: "#5a4a3c", // fourrure
  x: "#8f949c", X: "#4c5058", // gris
  v: "#3c8f5a", V: "#255c39", // vert sombre
  c: "#7fe6ff", // magie
  f: "#ff9a2a", F: "#e2481c", // feu
  h: "#5a3a26", // cheveux
  t: "#d9a066", // cheveux clairs
  u: "#9b1b30", // rouge sombre
};

export const SPRITES = {
  guerrier: [
    "................",
    "......kkkk......",
    ".....kmmmmk.....",
    "....kmmMMmmk..k.",
    "....kmkssskk.kmk",
    "....kkssksk..kmk",
    ".....kSsssk..kmk",
    "....krkkkkrk.kmk",
    "...krrmmmmrrkkmk",
    "..kbbkmmmMmkykyk",
    "..kbybkmMmmkssk.",
    "..kbyybkmmmkkk..",
    "..kbybkNyNNk....",
    "...kbk.kmkmk....",
    ".......kMkkMk...",
    "......kkk.kkk...",
  ],
  mage: [
    "...........kck..",
    "......kk..kcck..",
    ".....kppk..kck..",
    "....kpppPk..k...",
    "...kpppppPk.n...",
    "..kkkkkkkkkkn...",
    "....kssssk..n...",
    "....kskskk..n...",
    "....kwSSwk..n...",
    "...kpwwwwpkksk..",
    "..kppkwwkppkn...",
    "..kppPppyppkn...",
    "..kpppPppppkn...",
    "..kppPpppPpkn...",
    "..kkpppppkkkn...",
    "...kkkkkkk..N...",
  ],
  roublard: [
    "................",
    "......kkkk......",
    ".....kvvvvk.....",
    "....kvvVVvvk....",
    "....kvkkkkvk....",
    "....kVsesesk....",
    "....kVkSSSk.....",
    "...kvvkkkkvk....",
    "..kvvVnnnnVvk...",
    ".kmkvVvvvvVvkmk.",
    "kmkskVNyNNVkskmk",
    ".k.kkvvvvvvkkk..",
    "....kVvvvvVk....",
    "....kNk..kNk....",
    "....kNk..kNk....",
    "...kkkk..kkkk...",
  ],
  clerc: [
    "................",
    "......kkkk......",
    ".....kwwwwk.....",
    "....kwttttwk....",
    "....ktsssstk....",
    "....ktksksk.....",
    "....kwSsssk.....",
    "...kwwkkkkwk.kk.",
    "..kwwwwywwwwkmmk",
    "..kwkwyyywkwkmmk",
    "..kwkwwywwkkskk.",
    "..kssywwwwk.kn..",
    "...kwwwwwwwkkn..",
    "...kwWwwwWwk.n..",
    "...kwwwwwwwk....",
    "...kkkkkkkkk....",
  ],
  gobelin: [
    "................",
    "................",
    "................",
    "kk..........kk..",
    "kgk.kkkkkk.kgk..",
    "kggkggggggkggk..",
    ".kgggegggeggk...",
    "..kgkkgggkkgk...",
    "..kggGgkgGggk...",
    "...kgGwwGgk.....",
    "..kkkNnnNkkk....",
    ".kmkgkNNnkgk....",
    "kmk.kknnnkk.....",
    "km...kNNNk......",
    ".....kgk.kgk....",
    "....kkkk.kkkk...",
  ],
  archer: [
    "................",
    "...kk...........",
    "..knNk..........",
    ".knnnNk.........",
    "knkkkkNk....kk..",
    "kgk.kgggkk.kgk..",
    "kggkgegggegggk..",
    ".kgggkgggkgk....",
    "..kgggGgggk..k..",
    "...knnnnnk..knk.",
    "..kgknnnnkgknk..",
    "..kgkNNNNkgknk..",
    "...kknnnnkk.knk.",
    "....kNNNNk...k..",
    "....kgk.kgk.....",
    "...kkkk.kkkk....",
  ],
  chaman: [
    "..kwk...........",
    ".kwwwk..........",
    ".kkwkk...kkkk...",
    "..kNk...kwwwwk..",
    "..kNk..kwkwwkwk.",
    "..kNk..kwwwwwwk.",
    "kgkNkkgkwkkkwk..",
    "kggNggggkwwwkgk.",
    ".kgNgggpppppkk..",
    "..kNkpppPpppk...",
    "..kNppPpppPppk..",
    "..kNppppyppppk..",
    "..kNpPpppppPpk..",
    "..kNkpppppppk...",
    "..kN.kgk.kgk....",
    "..kk.kkk.kkk....",
  ],
  loup: [
    "................",
    "................",
    "................",
    "................",
    "..kk.kk.........",
    ".koOkOok........",
    "kooooook........",
    "keooooookkkkkk..",
    "kooooooooooooOk.",
    ".kwkoooooooooOOk",
    "..kkOoooooooOk.k",
    "...kOooOOooook..",
    "...kook.kOok....",
    "...kok...kok....",
    "...kok...kok....",
    "..kkk...kkk.....",
  ],
  gobelours: [
    "................",
    "....kkkkkk......",
    "...koooooOk.....",
    "..kooooooooOk...",
    "..koeooeooook...",
    "..kooooooooOk...",
    "..koOwwOwwOOk...",
    "..kkooooooookk..",
    ".koookoooookoOk.",
    "koooOkooooOkooOk",
    "kOooOkNnnNkkOOOk",
    ".kkkkooooooOkkk.",
    "....koooooOok...",
    "....kOokkOOok...",
    "...kOOk..kOOk...",
    "...kkkk..kkkk...",
  ],
  capitaine: [
    "................",
    "......kkk.......",
    ".....krrrk......",
    "....kMmmmMk.....",
    "....kmMmmMmk....",
    "...kfkfefffekk..",
    "....kffffffk....",
    "....kfkkkkfk....",
    "...kMmmrrmmMk...",
    "..kmkmmrrmmkmk..",
    ".kmmkMmmmmMkfk..",
    "kmmmkmyYYmmkk...",
    ".kmk.kNNNNk.....",
    "..k..kmkkmk.....",
    "....kMk..kMk....",
    "....kkk..kkk....",
  ],
  roi: [
    "....k.kk.k......",
    "...kykyykyk.....",
    "...kyyyyyyk.....",
    "..kgggggggk.....",
    "kkgegggegggkk...",
    "kgggggggggggk...",
    ".kgGwkwkwGgk....",
    "..kgggggggk.....",
    ".kuuyuuuuyuk.xk.",
    "kuukuuyyuukuxXk.",
    "kuukgguuuggkxk..",
    "kuukgkuuukgkkk..",
    ".kkk.kyYyk.nk...",
    "....kuuuuuk.....",
    "....kgk.kgk.....",
    "...kkkk.kkkk....",
  ],
};

/** Dessine un sprite. echelle = taille d'un pixel ; miroir = retourné horizontalement. */
export function dessinerSprite(ctx, nom, x, y, echelle, { miroir = false, teinte = null } = {}) {
  const lignes = SPRITES[nom];
  if (!lignes) return;
  for (let j = 0; j < lignes.length; j++) {
    const ligne = lignes[j];
    for (let i = 0; i < ligne.length; i++) {
      const lettre = ligne[i];
      if (lettre === ".") continue;
      const couleur = teinte ?? PALETTE[lettre];
      if (!couleur) continue;
      ctx.fillStyle = couleur;
      const colonne = miroir ? ligne.length - 1 - i : i;
      ctx.fillRect(Math.round(x + colonne * echelle), Math.round(y + j * echelle), Math.ceil(echelle), Math.ceil(echelle));
    }
  }
}

/** Crée un petit canvas contenant le sprite (pour les cartes de héros, la boutique…). */
export function spriteCanvas(nom, echelle = 4, options = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = 16 * echelle;
  canvas.height = 16 * echelle;
  canvas.className = "sprite";
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  dessinerSprite(ctx, nom, 0, 0, echelle, options);
  return canvas;
}

// ------------------------------------------------------------------ décors

function bruit(i, j) {
  const x = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Décor de donjon : mur de pierres, sol dallé, torches qui vacillent (t = temps en ms). */
export function dessinerDonjon(ctx, l, h, t = 0, { teinte = "#2b2433", boss = false } = {}) {
  const p = Math.max(4, Math.round(h / 60)); // taille d'un « pixel » du décor
  const sol = Math.round(h * 0.62);
  ctx.fillStyle = teinte;
  ctx.fillRect(0, 0, l, sol);
  // Pierres du mur
  const bl = p * 8;
  const bh = p * 4;
  for (let j = 0; j * bh < sol; j++) {
    const decal = (j % 2) * (bl / 2);
    for (let i = -1; i * bl < l + bl; i++) {
      const x = i * bl + decal;
      const y = j * bh;
      const n = bruit(i, j);
      ctx.fillStyle = n > 0.7 ? "#3a3145" : n > 0.35 ? "#342c3e" : "#2f2838";
      ctx.fillRect(x + p / 2, y + p / 2, bl - p, bh - p);
      if (n > 0.9) { ctx.fillStyle = "#4a7f2e"; ctx.fillRect(x + p * 2, y + bh - p * 1.5, p * 2, p); } // mousse
    }
  }
  // Ombre au pied du mur
  ctx.fillStyle = "rgba(0,0,0,.35)";
  ctx.fillRect(0, sol - p * 2, l, p * 2);
  // Sol
  ctx.fillStyle = boss ? "#3b2a22" : "#2a2420";
  ctx.fillRect(0, sol, l, h - sol);
  for (let j = 0; sol + j * p * 3 < h; j++) {
    for (let i = 0; i * p * 6 < l; i++) {
      const n = bruit(i + 50, j + 50);
      ctx.fillStyle = n > 0.5 ? "#332b26" : "#2e2723";
      ctx.fillRect(i * p * 6 + (j % 2) * p * 3, sol + j * p * 3, p * 6 - p / 2, p * 3 - p / 2);
    }
  }
  // Bannières rouges pour la salle du trône
  if (boss) {
    for (const bx of [0.3, 0.7]) {
      const x = Math.round(l * bx);
      ctx.fillStyle = "#7b241c";
      ctx.fillRect(x - p * 3, p * 4, p * 6, p * 18);
      ctx.fillStyle = "#c8402f";
      ctx.fillRect(x - p * 2, p * 5, p * 4, p * 16);
      ctx.fillStyle = "#ecc038";
      ctx.fillRect(x - p, p * 10, p * 2, p * 3);
    }
  }
  // Torches
  for (const tx of [0.12, 0.5, 0.88]) {
    const x = Math.round(l * tx);
    const y = Math.round(sol * 0.35);
    const vacille = Math.sin(t / 120 + tx * 10) * 0.5 + 0.5;
    const halo = ctx.createRadialGradient(x, y, 0, x, y, p * (14 + vacille * 3));
    halo.addColorStop(0, "rgba(255,160,60,.28)");
    halo.addColorStop(1, "rgba(255,160,60,0)");
    ctx.fillStyle = halo;
    ctx.fillRect(x - p * 20, y - p * 20, p * 40, p * 40);
    ctx.fillStyle = "#5c3a1f";
    ctx.fillRect(x - p / 2, y, p, p * 4);
    ctx.fillStyle = "#ff9a2a";
    ctx.fillRect(x - p, y - p * 2, p * 2, p * 2);
    ctx.fillStyle = vacille > 0.5 ? "#ffe14d" : "#e2481c";
    ctx.fillRect(x - p / 2, y - p * (3 + Math.round(vacille)), p, p * 2);
  }
}

/** Décor du camp : ciel de nuit, étoiles, collines, feu de camp. */
export function dessinerCamp(ctx, l, h, t = 0) {
  const p = Math.max(3, Math.round(h / 70));
  const ciel = ctx.createLinearGradient(0, 0, 0, h);
  ciel.addColorStop(0, "#0e1026");
  ciel.addColorStop(1, "#2a2244");
  ctx.fillStyle = ciel;
  ctx.fillRect(0, 0, l, h);
  for (let i = 0; i < 70; i++) {
    const x = bruit(i, 1) * l;
    const y = bruit(i, 2) * h * 0.55;
    const scint = Math.sin(t / 400 + i) > 0.6;
    ctx.fillStyle = scint ? "#ffffff" : "#9aa4d8";
    ctx.fillRect(Math.round(x), Math.round(y), p / (scint ? 1 : 2), p / (scint ? 1 : 2));
  }
  // Lune
  ctx.fillStyle = "#f1e6cc";
  ctx.fillRect(Math.round(l * 0.8), p * 4, p * 6, p * 6);
  ctx.fillStyle = "#d8cba8";
  ctx.fillRect(Math.round(l * 0.8) + p * 3, p * 6, p * 2, p * 2);
  // Collines et montagne du repaire
  const colline = (base, amp, couleur, graine) => {
    ctx.fillStyle = couleur;
    for (let x = 0; x < l; x += p) {
      const y = base - Math.abs(Math.sin(x / (l / 3) + graine)) * amp - bruit(x, graine) * p;
      ctx.fillRect(x, Math.round(y / p) * p, p, h);
    }
  };
  colline(h * 0.6, h * 0.22, "#1d1a33", 1);
  colline(h * 0.72, h * 0.1, "#18222a", 4);
  ctx.fillStyle = "#1c2a1f";
  ctx.fillRect(0, Math.round(h * 0.8), l, h);
  // Feu de camp
  const fx = Math.round(l / 2);
  const fy = Math.round(h * 0.86);
  const v = Math.sin(t / 90) * 0.5 + 0.5;
  const halo = ctx.createRadialGradient(fx, fy, 0, fx, fy, p * 30);
  halo.addColorStop(0, "rgba(255,150,50,.35)");
  halo.addColorStop(1, "rgba(255,150,50,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, l, h);
  ctx.fillStyle = "#5c3a1f";
  ctx.fillRect(fx - p * 4, fy, p * 8, p);
  ctx.fillRect(fx - p * 3, fy - p, p * 6, p);
  ctx.fillStyle = "#e2481c";
  ctx.fillRect(fx - p * 2, fy - p * 4, p * 4, p * 3);
  ctx.fillStyle = "#ff9a2a";
  ctx.fillRect(fx - p, fy - p * (5 + Math.round(v)), p * 2, p * 4);
  ctx.fillStyle = "#ffe14d";
  ctx.fillRect(fx - p / 2, fy - p * (4 + Math.round(v)), p, p * 2);
}
