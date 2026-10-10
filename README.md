# ⚔️ Contes & Dragons

Un jeu de rôle **textuel**, directement **dans ton navigateur** : tu crées un héros de fantasy et une
**IA joue le maître du jeu**. Elle raconte l'histoire, fait parler les personnages et réagit à tout ce
que tu écris. Les règles viennent de la 5e édition open source (SRD 5.1).

### 👉 Jouer : **https://jonathanguery0-hue.github.io/dndstories/**

Rien à installer : ça marche sur ordinateur, tablette et téléphone.

- 🧙 **Création de personnage** : 9 races, 6 classes (Guerrier, Barbare, Roublard, Rôdeur, Clerc, Magicien), caractéristiques, compétences, historique.
- 📜 **Fiche toujours à jour** : PV, CA, attaques, sorts, inventaire, or, XP et niveaux.
- 🎲 **De vrais dés** : c'est le jeu qui lance les dés et applique les règles. L'IA ne peut ni tricher ni « oublier » tes PV.
- ⚔️ **Combats** : initiative, attaques, sorts, ennemis avec barres de vie, jets contre la mort.
- 🗺️ **Trois aventures** : *Les Ombres de Brumesaule* (enquête et nécromancie), *La Caravane de l'Aube* (voyage et complot), ou une **aventure libre** improvisée.
- 💾 **Sauvegarde automatique** dans ton navigateur, avec export/import pour changer d'appareil.

---

## 🔑 Ta clé OpenAI (une seule fois)

L'IA maître du jeu utilise l'API d'OpenAI. Attention : l'abonnement ChatGPT ne suffit pas, il faut
une **clé API**.

1. Va sur **https://platform.openai.com** et connecte-toi.
2. Dans **Settings → Billing**, ajoute un peu de crédit (5 $ suffisent pour beaucoup de parties).
3. Dans **API keys**, clique sur *Create new secret key* et copie la clé (elle commence par `sk-`).
4. Dans le jeu, clique sur **⚙️** en haut à droite, colle la clé, puis **Enregistrer**.

🔒 La clé est enregistrée **uniquement dans ton navigateur** et n'est envoyée qu'à OpenAI. Ne la
saisis pas sur un ordinateur public. Conseil : sur platform.openai.com, tu peux fixer une limite de
dépense mensuelle (*Limits*).

**Choisir le modèle d'IA** : dans les Réglages, le bouton *Voir la liste* affiche les modèles
disponibles sur ton compte. Un modèle « mini » coûte peu (quelques centimes par session) ; un modèle
plus grand raconte mieux mais coûte plus cher.

---

## 🎮 Comment jouer

- Écris ce que fait ton personnage, comme tu le dirais à un maître du jeu autour d'une table :
  *« Je m'approche du comptoir et je demande à l'aubergiste s'il a vu des étrangers. »*
- Quand l'issue est incertaine, le MJ fait lancer les dés. Les résultats s'affichent dans le récit (🎲).
- La fiche à droite (ou le bouton **📋 Fiche** sur téléphone) se met à jour toute seule.
- Le **Journal** garde les indices, personnages et quêtes importants.
- En combat, décris ton action (*« J'attaque le gobelin le plus proche avec ma dague »*) ; le MJ fait
  ensuite agir les ennemis.

**Tes sauvegardes** restent dans le navigateur utilisé. Pour continuer sur un autre appareil (ou par
sécurité), clique sur 💾 à côté d'une partie pour la télécharger, puis sur **📂 Importer une
sauvegarde** sur l'autre appareil. Vider les données du navigateur efface les parties non exportées.

---

## ❓ Problèmes fréquents

| Message | Solution |
|---|---|
| « La clé API est refusée » | Vérifie la clé dans ⚙️ (copie-colle sans espace). |
| « Le compte OpenAI n'a plus de crédit » | Ajoute du crédit dans *Billing* sur platform.openai.com. |
| « Le modèle … n'est pas disponible » | Dans ⚙️, clique sur *Voir la liste* et choisis un autre modèle. |
| « Le navigateur n'a plus de place » | Exporte puis supprime d'anciennes parties. |
| Mes parties ont disparu | Elles sont liées au navigateur : utilise le même, hors navigation privée. |

---

## 🔧 Pour les curieux

- **100 % statique** : HTML, CSS et JavaScript sans dépendance ni compilation, hébergé sur GitHub Pages.
- **Modèle local gratuit** : tout serveur compatible OpenAI fonctionne. Avec [Ollama](https://ollama.com),
  indique `http://localhost:11434/v1` comme *adresse du serveur* dans les réglages avancés (et
  autorise l'origine du site avec `OLLAMA_ORIGINS`). Choisis un modèle qui gère l'appel d'outils.
- **Architecture** (`js/`) :
  - `moteur.js` : les règles (dés, combat, sorts, PV, repos), exposées à l'IA comme des « outils »
  - `mj.js` : les consignes du maître du jeu et la boucle de dialogue avec l'IA
  - `personnage.js`, `srd.js`, `des.js` : la fiche, les données de règles et les dés
  - `scenarios.js` : les aventures (ajoute la tienne !)
  - `stockage.js` : sauvegardes et réglages dans le navigateur
  - `app.js` : l'interface
- **Tester en local** : `python3 -m http.server` à la racine puis ouvrir http://localhost:8000
- **Tests automatiques** : `npm test` (Node.js 20 ou plus)

## 📄 Licences

Code sous licence **MIT** (voir `LICENSE`). Règles issues du **SRD 5.1** de Wizards of the Coast,
sous licence **Creative Commons BY 4.0** (voir `LICENCE-SRD.md`). Ce projet n'est pas affilié à
Wizards of the Coast.
