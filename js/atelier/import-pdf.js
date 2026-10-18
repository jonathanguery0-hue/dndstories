// Import d'un scénario mis en page (PDF) dans l'atelier : pdf.js lit le texte et les images de chaque
// page dans le navigateur, puis l'IA range chaque page dans la structure de l'atelier (couverture, mot au MJ,
// parties en blocs, fiches PNJ, aides de jeu). Les auteurs relisent ensuite le résultat dans l'éditeur.

import * as modele from "./modele.js";

const PDFJS = "https://unpkg.com/pdfjs-dist@4.4.168/build/pdf.min.mjs";
const PDFJS_WORKER = "https://unpkg.com/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs";

// ------------------------------------------------------------------ lecture du PDF (navigateur)

let pdfjs = null;
async function chargerPdfJs() {
  if (pdfjs) return pdfjs;
  try {
    pdfjs = await import(PDFJS);
  } catch {
    throw new Error("Impossible de charger le lecteur de PDF (connexion internet nécessaire).");
  }
  // Un worker d'une autre origine doit passer par un petit module local (blob) qui l'importe.
  try {
    const amorce = URL.createObjectURL(new Blob([`import "${PDFJS_WORKER}";`], { type: "text/javascript" }));
    pdfjs.GlobalWorkerOptions.workerPort = new Worker(amorce, { type: "module" });
  } catch {
    pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  }
  return pdfjs;
}

/** Image d'un objet pdf.js (ImageBitmap ou pixels bruts) vers une image WebP légère. */
function versDataUrl(img, max = 1400) {
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(img.width * k));
  c.height = Math.max(1, Math.round(img.height * k));
  const ctx = c.getContext("2d");
  if (img.bitmap || img instanceof HTMLCanvasElement) {
    ctx.drawImage(img.bitmap ?? img, 0, 0, c.width, c.height);
  } else if (img.data) {
    const brut = document.createElement("canvas");
    brut.width = img.width;
    brut.height = img.height;
    const donnees = new ImageData(img.width, img.height);
    const n = img.width * img.height;
    const parPixel = img.data.length / n;
    for (let i = 0; i < n; i++) {
      if (parPixel >= 4) donnees.data.set(img.data.subarray(i * 4, i * 4 + 4), i * 4);
      else if (parPixel === 3) { donnees.data.set(img.data.subarray(i * 3, i * 3 + 3), i * 4); donnees.data[i * 4 + 3] = 255; }
      else { const g = img.data[i]; donnees.data.set([g, g, g, 255], i * 4); }
    }
    brut.getContext("2d").putImageData(donnees, 0, 0);
    ctx.drawImage(brut, 0, 0, c.width, c.height);
  } else {
    return null;
  }
  const webp = c.toDataURL("image/webp", 0.82);
  return webp.startsWith("data:image/webp") ? webp : c.toDataURL("image/png");
}

/**
 * Ordre de lecture d'une page en colonnes : la colonne de gauche de haut en bas, puis celle de droite
 * (pdf.js rend le texte dans l'ordre du fichier, où les colonnes sont souvent mélangées).
 */
export function ordreDeLecture(items, largeur) {
  const milieu = largeur / 2;
  const pleins = items.filter((it) => it.str?.trim());
  const aDroite = (it) => (it.transform?.[4] ?? 0) >= milieu - 2;
  const droite = pleins.filter(aDroite).length;
  // Une seule colonne (couverture, page d'aide…) : de haut en bas.
  const deuxColonnes = droite > 3 && pleins.length - droite > 3;
  const cle = (it) => [deuxColonnes && aDroite(it) ? 1 : 0, -Math.round((it.transform?.[5] ?? 0) / 2), it.transform?.[4] ?? 0];
  return items.filter((it) => it.str).map((it) => ({ it, k: cle(it) }))
    .sort((a, b) => a.k[0] - b.k[0] || a.k[1] - b.k[1] || a.k[2] - b.k[2]).map((e) => e.it);
}

/**
 * Recolle les morceaux de texte de pdf.js : espace quand deux morceaux d'une même ligne sont séparés,
 * retour à la ligne quand la ligne change, ligne vide quand l'écart vertical est grand (nouveau paragraphe).
 */
export function recollerTexte(items) {
  let sortie = "";
  let prec = null;
  for (const it of items) {
    const str = it.str ?? "";
    if (!str && !it.hasEOL) continue;
    const [, , , d, x, y] = it.transform ?? [1, 0, 0, 1, 0, 0];
    const taille = Math.abs(d) || 10;
    if (prec && str) {
      const ecartY = Math.abs(y - prec.y);
      if (ecartY > taille * 1.9) sortie += sortie.endsWith("\n") ? "\n" : "\n\n";
      else if (ecartY > taille * 0.5) { if (!sortie.endsWith("\n")) sortie += "\n"; }
      else if (x - prec.fin > taille * 0.12 && !/\s$/.test(sortie) && !/^\s/.test(str)) sortie += " ";
    }
    sortie += str;
    if (it.hasEOL && !sortie.endsWith("\n")) sortie += "\n";
    if (str) prec = { y, fin: x + (it.width ?? 0) };
  }
  return sortie.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

const position = (boite, l, h) => {
  const cx = (boite.x0 + boite.x1) / 2 / l;
  const cy = (boite.y0 + boite.y1) / 2 / h;
  const large = (boite.x1 - boite.x0) / l > 0.6;
  const colonne = large ? "pleine largeur" : cx < 0.42 ? "colonne gauche" : cx > 0.58 ? "colonne droite" : "centre";
  const hauteur = cy < 0.34 ? "haut de page" : cy > 0.66 ? "bas de page" : "milieu de page";
  return `${colonne}, ${hauteur}`;
};

/**
 * Lit le PDF : texte de chaque page (dans l'ordre du document) et images utiles (les fonds de page répétés et
 * les petites décorations sont écartés). Renvoie { pages: [{ numero, texte, images: [{ id, description }] }],
 * images: { id: dataURL }, capturer(numero) }.
 */
export async function lirePdf(fichier, progression = () => {}) {
  const lib = await chargerPdfJs();
  const doc = await lib.getDocument({ data: new Uint8Array(await fichier.arrayBuffer()) }).promise;
  const brutes = [];
  for (let n = 1; n <= doc.numPages; n++) {
    progression(`Lecture de la page ${n}/${doc.numPages}…`);
    const page = await doc.getPage(n);
    const vue = page.getViewport({ scale: 1 });
    const contenu = await page.getTextContent();
    const texte = recollerTexte(ordreDeLecture(contenu.items, vue.width));
    const ops = await page.getOperatorList();
    const pile = [];
    let ctm = [1, 0, 0, 1, 0, 0];
    const trouvees = [];
    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i];
      if (fn === lib.OPS.save) pile.push(ctm);
      else if (fn === lib.OPS.restore) ctm = pile.pop() ?? ctm;
      else if (fn === lib.OPS.transform) ctm = lib.Util.transform(ctm, ops.argsArray[i]);
      else if (fn === lib.OPS.paintImageXObject) {
        const coins = [[0, 0], [1, 0], [0, 1], [1, 1]].map((p) => lib.Util.applyTransform(lib.Util.applyTransform(p, ctm), vue.transform));
        const xs = coins.map((p) => p[0]);
        const ys = coins.map((p) => p[1]);
        trouvees.push({ nom: ops.argsArray[i][0], boite: { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) } });
      }
    }
    const images = [];
    for (const t of trouvees) {
      const source = t.nom.startsWith("g_") ? page.commonObjs : page.objs;
      const img = await new Promise((ok) => { try { source.get(t.nom, ok); } catch { ok(null); } });
      if (img) images.push({ ...t, img });
    }
    brutes.push({ numero: n, page, vue, texte, images });
  }
  // Fond de page : même taille d'image sur la plupart des pages et couvrant presque toute la page.
  const frequence = new Map();
  for (const p of brutes) for (const im of p.images) {
    const cle = `${im.img.width}x${im.img.height}`;
    frequence.set(cle, (frequence.get(cle) ?? 0) + 1);
  }
  const images = {};
  const pages = [];
  for (const p of brutes) {
    progression(`Extraction des images de la page ${p.numero}/${brutes.length}…`);
    const liste = [];
    let k = 0;
    for (const im of p.images) {
      const couvre = (im.boite.x1 - im.boite.x0) * (im.boite.y1 - im.boite.y0) > 0.75 * p.vue.width * p.vue.height;
      const repetee = frequence.get(`${im.img.width}x${im.img.height}`) >= Math.max(3, brutes.length * 0.5);
      const minuscule = Math.max(im.img.width, im.img.height) < 90 || (im.boite.x1 - im.boite.x0) < 25;
      if ((couvre && repetee) || minuscule) continue;
      const url = versDataUrl(im.img);
      if (!url) continue;
      const id = `pdf-p${p.numero}-i${++k}`;
      images[id] = url;
      liste.push({ id, description: `${im.img.width}×${im.img.height} px, ${position(im.boite, p.vue.width, p.vue.height)}` });
    }
    pages.push({ numero: p.numero, texte: p.texte, images: liste });
  }
  /** Photo d'une page entière (pour une grille, un plan ou un dessin vectoriel sans image extractible). */
  async function capturer(numero) {
    const p = brutes[numero - 1];
    const vue = p.page.getViewport({ scale: 1.6 });
    const c = document.createElement("canvas");
    c.width = Math.round(vue.width);
    c.height = Math.round(vue.height);
    await p.page.render({ canvasContext: c.getContext("2d"), viewport: vue }).promise;
    return versDataUrl(c, 1400);
  }
  return { pages, images, capturer, total: doc.numPages };
}

// ------------------------------------------------------------------ rangement par l'IA (une page à la fois)

export const CONSIGNE_IMPORT = `Tu convertis un scénario de jeu de rôle mis en page (PDF) vers la structure d'un éditeur de scénarios.
On te donne UNE page : son texte brut (dans l'ordre du document, colonnes éventuellement mélangées) et la liste
de ses images. Réponds UNIQUEMENT par un objet JSON valide, sans texte autour.

Champs (tous facultatifs sauf "type_page") :
- "type_page" : "couverture" | "mot_mj" | "sommaire" | "contenu" | "pnj" | "aide" | "licence" | "autre"
- "couverture" : { "prefixe", "titre", "accroche", "niveau" (nombre), "mention", "marque", "image", "logo" }
- "mot_mj" : { "titre", "texte", "signature", "a_savoir", "image" } (lettre d'accueil des auteurs au MJ)
- "sommaire_image" : identifiant d'image de la page de sommaire
- "nouvelle_partie" : { "titre", "image" } si la page COMMENCE une nouvelle partie ou un chapitre (« Introduction »,
  « Partie 1 : … »). Le titre du scénario en haut de la première page de contenu n'est pas une partie.
- "blocs" : liste dans l'ordre de lecture ; chaque bloc { "type", "texte", "image", "legende" } avec type :
  "texte" (paragraphes de l'aventure), "intertitre" (titre de section), "lire" (texte à lire à voix haute aux
  joueurs : encadré de description ou de dialogue), "mj" (encadré de conseil, rappel de règle ou exemple pour le MJ),
  "image" (une image de la liste, placée là où elle apparaît ; "image" = son identifiant).
- "pnj" : liste de fiches { "nom", "type", "alignement", "description", "ca", "ca_detail", "pv", "pv_formule",
  "vitesse", "caracs": { "FOR", "DEX", "CON", "INT", "SAG", "CHA" } (valeurs, pas modificateurs), "competences",
  "sens", "langues", "puissance", "xp", "traits": [{ "nom", "texte" }], "actions": [{ "nom", "texte" }], "image" }
- "aide" : { "titre", "texte", "consigne", "manuscrit" (vrai pour une note ou lettre manuscrite), "image",
  "capture_page" (vrai si l'aide est un dessin, une grille ou un plan qui n'est pas dans la liste d'images) }

Règles :
- Recopie le texte des auteurs FIDÈLEMENT, mot pour mot : ne corrige rien, ne résume rien, n'invente rien.
- Recolle les mots coupés en fin de ligne et les lignes d'un même paragraphe ; sépare les paragraphes par une
  ligne vide ; listes numérotées en « 1. », puces en « - ».
- Ignore les numéros de page et les textes de licence (page "licence" : rien d'autre).
- N'utilise que les identifiants d'images fournis ; ignore les images purement décoratives.`;

export function messagePage(page, total) {
  const images = page.images.length ? page.images.map((i) => `- ${i.id} (${i.description})`).join("\n") : "(aucune)";
  return `PAGE ${page.numero}/${total}
IMAGES :
${images}
TEXTE :
${page.texte || "(aucun texte)"}`;
}

/** Extrait l'objet JSON d'une réponse (avec ou sans bloc de code). */
export function lireJson(reponse) {
  const t = String(reponse ?? "");
  const debut = t.indexOf("{");
  const fin = t.lastIndexOf("}");
  if (debut < 0 || fin <= debut) throw new Error("Réponse sans JSON");
  return JSON.parse(t.slice(debut, fin + 1));
}

async function rangerPage(appeler, page, total) {
  const messages = [{ role: "system", content: CONSIGNE_IMPORT }, { role: "user", content: messagePage(page, total) }];
  for (let essai = 0; essai < 2; essai++) {
    const msg = await appeler(messages, null, { cache: "import-pdf" }); // une erreur de l'IA (crédit, réseau) arrête l'import
    try {
      return lireJson(msg.content);
    } catch {
      // Réponse mal formée : un second essai.
    }
  }
  // Repli : le texte de la page est gardé tel quel, à ranger à la main.
  return { type_page: "contenu", blocs: page.texte ? [{ type: "mj", texte: `[À RANGER — page ${page.numero}, lue sans mise en forme]` }, { type: "texte", texte: page.texte }] : [], erreur: true };
}

/**
 * Lit le PDF puis le fait ranger par l'IA, quelques pages en parallèle. `progression(texte)` informe l'interface.
 * Renvoie le scénario de l'atelier, prêt à relire.
 */
export async function importerPdf(fichier, appeler, progression = () => {}) {
  const lu = await lirePdf(fichier, progression);
  const resultats = new Array(lu.pages.length);
  let faites = 0;
  let suivante = 0;
  const travailleur = async () => {
    while (suivante < lu.pages.length) {
      const i = suivante++;
      resultats[i] = await rangerPage(appeler, lu.pages[i], lu.total);
      progression(`Mise en forme par l'IA : ${++faites}/${lu.pages.length} pages…`);
    }
  };
  await Promise.all([travailleur(), travailleur(), travailleur()]);
  const s = assembler(resultats, lu.images, fichier.name.replace(/\.pdf$/i, ""));
  for (const [i, r] of resultats.entries()) {
    if (r?.type_page === "aide" && r.aide?.capture_page && !r.aide.image) {
      progression(`Capture de l'aide de jeu (page ${i + 1})…`);
      const id = modele.nouvelId("img");
      s.images[id] = await lu.capturer(i + 1);
      const aide = s.aides.find((a) => a.page === i + 1);
      if (aide) aide.image = id;
    }
  }
  for (const a of s.aides) delete a.page;
  s.images = modele.pourExport(s).images;
  return { scenario: s, pagesEnErreur: resultats.filter((r) => r?.erreur).length };
}

// ------------------------------------------------------------------ assemblage (sans navigateur, testable)

const TYPES_IMPORT = new Set(["texte", "intertitre", "lire", "mj", "image"]);
const nombre = (v, defaut) => {
  const n = parseInt(String(v ?? "").replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(n) ? n : defaut;
};

/** Assemble les pages rangées par l'IA en un scénario de l'atelier. */
export function assembler(resultats, imagesPdf, nomFichier = "Scénario importé") {
  const s = modele.nouveauScenario(nomFichier);
  s.parties = [];
  s.mot_mj.texte = "";
  const image = (id) => {
    if (!id || !imagesPdf[id]) return null;
    s.images[id] = imagesPdf[id];
    return id;
  };
  let partie = null;
  const partieCourante = (titre) => {
    if (!partie) { partie = modele.nouvellePartieLivret(titre ?? "Introduction"); partie.blocs = []; s.parties.push(partie); }
    return partie;
  };
  resultats.forEach((r, index) => {
    if (!r || typeof r !== "object") return;
    const c = r.couverture;
    if (c) {
      if (c.titre) s.titre = String(c.titre).trim();
      if (c.prefixe !== undefined) s.prefixe = String(c.prefixe ?? "");
      if (c.accroche) s.accroche = String(c.accroche);
      if (c.niveau) s.niveau = Math.min(Math.max(nombre(c.niveau, 1), 1), 20);
      if (c.mention) s.mention = String(c.mention);
      if (c.marque) s.marque = String(c.marque);
      s.couverture = image(c.image) ?? s.couverture;
      s.logo = image(c.logo) ?? s.logo;
    }
    const m = r.mot_mj;
    if (m) {
      for (const k of ["titre", "texte", "signature", "a_savoir"]) if (m[k]) s.mot_mj[k] = String(m[k]);
      s.mot_mj.image = image(m.image) ?? s.mot_mj.image;
    }
    if (r.sommaire_image) s.sommaire_image = image(r.sommaire_image) ?? s.sommaire_image;
    if (r.nouvelle_partie?.titre) {
      partie = modele.nouvellePartieLivret(String(r.nouvelle_partie.titre));
      partie.blocs = [];
      partie.image = image(r.nouvelle_partie.image);
      s.parties.push(partie);
    }
    for (const b of Array.isArray(r.blocs) ? r.blocs : []) {
      if (!TYPES_IMPORT.has(b?.type)) continue;
      const bloc = modele.nouveauBloc(b.type);
      if (b.type === "image") {
        bloc.image = image(b.image);
        if (!bloc.image) continue;
        bloc.legende = String(b.legende ?? "");
        bloc.taille = /pleine largeur/.test(String(b.taille ?? "")) ? "page" : "colonne";
      } else {
        bloc.texte = String(b.texte ?? "").trim();
        if (!bloc.texte) continue;
      }
      partieCourante().blocs.push(bloc);
    }
    for (const n of Array.isArray(r.pnj) ? r.pnj : []) {
      if (!n?.nom) continue;
      const fiche = modele.nouveauPnj(String(n.nom).trim());
      for (const k of ["type", "alignement", "description", "ca_detail", "pv_formule", "vitesse", "competences", "sens", "langues", "puissance"]) {
        if (n[k] !== undefined && n[k] !== null) fiche[k] = String(n[k]);
      }
      fiche.ca = nombre(n.ca, fiche.ca);
      fiche.pv = nombre(n.pv, fiche.pv);
      fiche.xp = nombre(n.xp, 0);
      for (const k of modele.CARACS) fiche.caracs[k] = nombre(n.caracs?.[k], 10);
      const lignes = (l) => (Array.isArray(l) ? l : []).filter((t) => t?.nom || t?.texte).map((t) => ({ nom: String(t.nom ?? ""), texte: String(t.texte ?? "") }));
      fiche.traits = lignes(n.traits);
      fiche.actions = lignes(n.actions);
      fiche.image = image(n.image);
      modele.remplirCombat(fiche);
      s.pnj.push(fiche);
    }
    if (r.aide && (r.aide.texte || r.aide.image || r.aide.capture_page || r.aide.titre)) {
      const a = modele.nouvelleAide(String(r.aide.titre ?? ""));
      a.texte = String(r.aide.texte ?? "");
      a.consigne = String(r.aide.consigne ?? "");
      a.manuscrit = Boolean(r.aide.manuscrit);
      a.image = image(r.aide.image);
      a.page = index + 1;
      s.aides.push(a);
    }
  });
  if (!s.parties.length) s.parties.push(modele.nouvellePartieLivret("Introduction"));
  if (!s.mot_mj.texte) s.mot_mj = modele.nouveauScenario().mot_mj;
  // Les noms des PNJ deviennent des renvois vers leur fiche (comme les noms soulignés des livrets).
  const noms = s.pnj.map((n) => n.nom).filter((n) => n.length > 2).sort((a, b) => b.length - a.length);
  if (noms.length) {
    const motif = new RegExp(`(?<![\\[\\w])(${noms.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?![\\w\\]])`, "g");
    // Comme dans les livrets : seule la première mention dans chaque partie est soulignée.
    for (const p of s.parties) {
      const vus = new Set();
      for (const b of p.blocs) {
        if (b.type !== "texte") continue;
        b.texte = b.texte.replace(motif, (nom) => (vus.has(nom) ? nom : (vus.add(nom), `[[${nom}]]`)));
      }
    }
  }
  return s;
}
