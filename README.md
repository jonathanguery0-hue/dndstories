# ⚔️ Contes & Dragons

Un jeu de rôle **textuel** dans ton navigateur : tu crées un héros de fantasy et une **IA joue le
maître du jeu**. Elle raconte l'histoire, fait parler les personnages et réagit à tout ce que tu
écris. Les règles viennent de la 5e édition open source (SRD 5.1).

- 🧙 **Création de personnage** : 9 races, 6 classes (Guerrier, Barbare, Roublard, Rôdeur, Clerc, Magicien), caractéristiques, compétences, historique.
- 📜 **Fiche toujours à jour** : PV, CA, attaques, sorts, inventaire, or, XP et niveaux.
- 🎲 **De vrais dés** : c'est le programme qui lance les dés et applique les règles. L'IA ne peut ni tricher ni « oublier » tes PV.
- ⚔️ **Combats** : initiative, attaques, sorts, ennemis avec barres de vie, jets contre la mort.
- 🗺️ **Trois aventures** : *Les Ombres de Brumesaule* (enquête et nécromancie), *La Caravane de l'Aube* (voyage et complot), ou une **aventure libre** improvisée.
- 💾 **Sauvegarde automatique** après chaque action. Tu peux avoir plusieurs parties.

---

## 🚀 Installation (aucune connaissance en programmation nécessaire)

### 1. Installer Python (une seule fois)

Télécharge Python sur **https://www.python.org/downloads/** et installe-le.

> ⚠️ **Sous Windows** : sur le premier écran de l'installation, coche bien la case
> **« Add python.exe to PATH »** avant de cliquer sur *Install Now*.

### 2. Télécharger le jeu

Sur la page GitHub du projet, clique sur le bouton vert **`<> Code`**, puis sur **`Download ZIP`**.
Décompresse le fichier ZIP où tu veux (par exemple sur ton Bureau).

### 3. Lancer le jeu

Ouvre le dossier décompressé et **double-clique** sur :

| Système | Fichier |
|---|---|
| Windows | `lancer.bat` |
| macOS | `lancer.command` (la 1ʳᵉ fois : clic droit → *Ouvrir*) |
| Linux | `lancer.sh` |

La première fois, l'installation prend environ une minute. Ensuite le jeu **s'ouvre tout seul dans
ton navigateur**. Laisse la fenêtre noire ouverte pendant que tu joues ; ferme-la pour arrêter le jeu.

### 4. Ajouter ta clé OpenAI (une seule fois)

L'IA maître du jeu utilise l'API d'OpenAI. Attention : l'abonnement ChatGPT ne suffit pas, il faut
une **clé API**.

1. Va sur **https://platform.openai.com** et connecte-toi.
2. Dans **Settings → Billing**, ajoute un peu de crédit (5 $ suffisent pour beaucoup de parties).
3. Dans **API keys**, clique sur *Create new secret key* et copie la clé (elle commence par `sk-`).
4. Dans le jeu, clique sur **⚙️** en haut à droite, colle la clé, puis **Enregistrer**.

Ta clé reste sur ton ordinateur (dans le fichier `config.json`) et n'est jamais publiée sur GitHub.

**Choisir le modèle d'IA** : dans les Réglages, le bouton *Voir la liste* affiche les modèles
disponibles sur ton compte. Un modèle « mini » coûte peu (quelques centimes par session) ; un modèle
plus grand raconte mieux mais coûte plus cher.

---

## 🎮 Comment jouer

- Écris ce que fait ton personnage, comme tu le dirais à un maître du jeu autour d'une table :
  *« Je m'approche du comptoir et je demande à l'aubergiste s'il a vu des étrangers. »*
- Tu peux parler à la première personne, faire des dialogues, tenter n'importe quoi.
- Quand l'issue est incertaine, le MJ fait lancer les dés. Les résultats s'affichent dans le récit (🎲).
- La fiche à droite (ou le bouton **📋 Fiche** sur téléphone) se met à jour toute seule.
- Le **Journal** garde les indices, personnages et quêtes importants.
- En combat, décris ton action (*« J'attaque le gobelin le plus proche avec ma hache »*) ; le MJ
  fait ensuite agir les ennemis.

---

## ❓ Problèmes fréquents

| Message | Solution |
|---|---|
| « Python n'est pas installé » | Installe Python (étape 1). Sous Windows, réinstalle-le en cochant **Add python.exe to PATH**. |
| « La clé API est refusée » | Vérifie la clé dans ⚙️ (copie-colle sans espace). |
| « Le compte OpenAI n'a plus de crédit » | Ajoute du crédit dans *Billing* sur platform.openai.com. |
| « Le modèle … n'est pas disponible » | Dans ⚙️, clique sur *Voir la liste* et choisis un autre modèle. |
| Le navigateur ne s'ouvre pas | Ouvre-le toi-même à l'adresse affichée dans la fenêtre noire (ex. `http://127.0.0.1:8000`). |

---

## 🔧 Pour les curieux

- **Modèle local gratuit** : n'importe quel serveur compatible OpenAI fonctionne. Avec
  [Ollama](https://ollama.com), indique `http://localhost:11434/v1` comme *adresse du serveur* dans
  les réglages avancés et le nom du modèle (ex. `llama3.1`). Choisis un modèle qui gère l'appel
  d'outils (« tools »).
- **Architecture** :
  - `app/moteur.py` : les règles (dés, combat, sorts, PV, repos), exposées à l'IA comme des « outils »
  - `app/mj.py` : les consignes du maître du jeu et la boucle de dialogue avec l'IA
  - `app/personnage.py` et `app/srd.py` : la fiche et les données de règles
  - `app/scenarios.py` : les aventures (ajoute la tienne !)
  - `app/static/` : l'interface web
- **Tests** : `.venv/bin/python -m pip install pytest httpx` puis `.venv/bin/python -m pytest`

## 📄 Licences

Code sous licence **MIT** (voir `LICENSE`). Règles issues du **SRD 5.1** de Wizards of the Coast,
sous licence **Creative Commons BY 4.0** (voir `LICENCE-SRD.md`). Ce projet n'est pas affilié à
Wizards of the Coast.
