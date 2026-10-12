# ⚔️ Contes & Dragons

Un jeu de rôle **textuel**, directement **dans ton navigateur** : tu crées un héros de fantasy et une
**IA joue le maître du jeu**. Elle raconte l'histoire, fait parler les personnages et réagit à tout ce
que tu écris. Les règles viennent de la 5e édition open source (SRD 5.1).

### 👉 Jouer : **https://jonathanguery0-hue.github.io/dndstories/**

Rien à installer : ça marche sur ordinateur, tablette et téléphone.

📲 **L'installer comme une application** (icône sur l'écran d'accueil, plein écran) :
- **Android / Chrome / Edge** : bouton **« Installer l'application »** sur l'accueil du jeu (ou menu ⋮ → *Installer l'application*).
- **iPhone / iPad** : dans Safari, bouton **Partager** → **« Sur l'écran d'accueil »**.

- 🧙 **Création de personnage** : 9 races, 6 classes (Guerrier, Barbare, Roublard, Rôdeur, Clerc, Magicien), caractéristiques, compétences, historique.
- 📜 **Fiche toujours à jour** : PV, CA, attaques, sorts, inventaire, or, XP et niveaux.
- 🎲 **De vrais dés** : c'est le jeu qui lance les dés et applique les règles. L'IA ne peut ni tricher ni « oublier » tes PV.
- ⚔️ **Combats** : initiative, attaques, sorts, ennemis avec barres de vie, jets contre la mort.
- 🗺️ **Trois aventures** : *Les Ombres de Brumesaule* (enquête et nécromancie), *La Caravane de l'Aube* (voyage et complot), ou une **aventure libre** improvisée.
- 📖 **Le SRD 5.1 complet embarqué** : le MJ consulte les vraies règles, les 319 sorts, les 334 monstres et les objets magiques au lieu d'improviser, et peut faire combattre n'importe quel monstre du SRD.
- 🔊 **Lecteur vocal** : le maître du jeu lit ses réponses à voix haute (bouton **Voix**) avec une **voix IA naturelle** d'OpenAI (≈ 1,5 centime par minute écoutée) ou la voix gratuite de l'appareil.
- 💾 **Sauvegarde automatique** dans ton navigateur, avec export/import pour changer d'appareil.

---

## 🎟️ Code d'accès ou clé OpenAI

**Tu as été invité ?** Ouvre simplement le lien d'invitation reçu (il contient ton code), ou tape
ton code dans **⚙️ Réglages → Code d'accès**. C'est tout !

**Tu organises ?** Le serveur relais garde ta clé OpenAI et donne un code à chacun de tes amis :
suis le guide [`serveur/README.md`](serveur/README.md).

<details>
<summary>Jouer avec ta propre clé OpenAI</summary>

L'abonnement ChatGPT ne suffit pas, il faut une **clé API** :

1. Va sur **https://platform.openai.com** et connecte-toi.
2. Dans **Settings → Billing**, ajoute un peu de crédit (5 $ suffisent pour beaucoup de parties).
3. Dans **API keys**, clique sur *Create new secret key* et copie la clé (elle commence par `sk-`).
4. Dans le jeu, **⚙️ Réglages → Ma propre clé OpenAI**, colle la clé, puis **Enregistrer**.

🔒 La clé est enregistrée **uniquement dans ton navigateur** et n'est envoyée qu'à OpenAI. Le bouton
*Voir la liste* affiche les modèles disponibles ; un modèle « mini » coûte peu (quelques centimes
par session).
</details>

---

## 🎮 Comment jouer

- Écris ce que fait ton personnage, comme tu le dirais à un maître du jeu autour d'une table :
  *« Je m'approche du comptoir et je demande à l'aubergiste s'il a vu des étrangers. »*
- Quand l'issue est incertaine, le MJ fait lancer les dés. Les résultats s'affichent dans le récit (🎲).
- La fiche à droite (ou le bouton **📋 Fiche** sur téléphone) se met à jour toute seule.
- Clique sur **🔇 Voix** pour que le MJ lise chaque réponse à voix haute, ou sur 🔊 à côté d'un
  paragraphe pour l'écouter. Choix de la voix et de la vitesse dans ⚙️ Réglages.
- Le **Journal** garde les indices, personnages et quêtes importants.
- Les capacités limitées (Rage, Second souffle…) ont un bouton **Utiliser** dans la fiche : le jeu
  applique l'effet tout de suite (résistances, bonus…) et le MJ le raconte.
- Les **résistances** (Rage du barbare, nain contre le poison, tieffelin contre le feu…) sont
  appliquées automatiquement aux dégâts.
- En combat, décris ton action (*« J'attaque le gobelin le plus proche avec ma dague »*) ; le MJ fait
  ensuite agir les ennemis.

**Tes sauvegardes** restent dans le navigateur utilisé. Pour continuer sur un autre appareil (ou par
sécurité), clique sur 💾 à côté d'une partie pour la télécharger, puis sur **📂 Importer une
sauvegarde** sur l'autre appareil. Vider les données du navigateur efface les parties non exportées.

---

## 💸 Combien ça coûte ?

Le jeu est réglé pour que le coût reste faible et **ne grimpe pas** avec la longueur de la partie :

- **Mémoire limitée** : l'IA garde les 12 derniers échanges mot pour mot ; les plus anciens sont
  résumés (avec le journal des faits importants). Chaque tour coûte donc à peu près pareil, même
  après des heures de jeu.
- **Mise en cache** : les consignes du MJ et l'historique sont envoyés dans le même ordre à chaque
  tour ; OpenAI les reconnaît et les facture jusqu'à 90 % moins cher.
- **Réflexion limitée** : les modèles qui « réfléchissent » (gpt-5…) sont réglés au minimum utile,
  car cette réflexion cachée est facturée ; la longueur des réponses est plafonnée.
- **Suivi** : le coût estimé de chaque partie s'affiche sur l'accueil et dans l'onglet **Journal**.

Ordre de grandeur avec `gpt-5-mini` : **environ 0,1 à 0,5 centime par tour** de jeu, plus environ
1 centime par réponse écoutée avec la voix IA. Pour être tranquille, fixe une **limite de dépense
mensuelle** sur platform.openai.com → *Limits*.

## ❓ Problèmes fréquents

| Message | Solution |
|---|---|
| « Code d'accès refusé » | Vérifie le code dans ⚙️ (bouton *Vérifier*) ou redemande-le à l'organisateur. |
| « Le crédit OpenAI de l'organisateur est épuisé » | Préviens l'organisateur. |
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
  - `regles.js` : recherche dans le SRD complet (`regles/srd-5.1.json`, regénéré par `node outils/construire-srd.mjs`)
  - `stockage.js` : sauvegardes et réglages dans le navigateur
  - `voix.js` : lecteur vocal ; `tts.js` : voix IA d'OpenAI (via la clé du joueur ou le relais)
  - `serveur.js` : adresse du serveur relais ; le relais lui-même est dans `serveur/worker.js`
  - `app.js` : l'interface ; `sw.js` + `manifest.webmanifest` : installation comme application
- **Tester en local** : `python3 -m http.server` à la racine puis ouvrir http://localhost:8000
- **Tests automatiques** : `npm test` (Node.js 20 ou plus)

## 📄 Licences

Code sous licence **MIT** (voir `LICENSE`). Règles issues du **SRD 5.1** de Wizards of the Coast,
sous licence **Creative Commons BY 4.0** (voir `LICENCE-SRD.md`). Ce projet n'est pas affilié à
Wizards of the Coast.
