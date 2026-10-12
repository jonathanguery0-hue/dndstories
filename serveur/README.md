# 🎟️ Le serveur relais (pour jouer sans clé)

Ce petit serveur garde **ta** clé OpenAI en sécurité chez Cloudflare. Tes amis n'ont besoin que
d'un **code d'accès** (ou d'un lien d'invitation) : ils ne voient jamais la clé, et c'est ton
compte OpenAI qui paie leurs parties.

Cloudflare Workers est **gratuit** jusqu'à 100 000 requêtes par jour, bien plus qu'il n'en faut.

---

## 1. Créer le serveur (une seule fois, ~10 minutes)

1. Crée un compte gratuit sur **https://dash.cloudflare.com/sign-up** et confirme ton e-mail.
2. Dans le menu de gauche, ouvre **Workers & Pages** (parfois rangé sous *Compute*).
3. Clique sur **Create** (ou *Create application*), puis **Start with Hello World!** / **Create Worker**.
4. Donne-lui le nom **`contes-dragons`**, puis clique sur **Deploy**.
5. Clique sur **Edit code** (ou *Continue to project* puis *Edit code*).
6. Dans l'éditeur, **efface tout** le code, puis colle **tout** le contenu du fichier
   [`serveur/worker.js`](worker.js) (sur GitHub : ouvre le fichier, bouton *Copy raw file*).
7. Clique sur **Deploy** (en haut à droite).

## 2. Ajouter la clé et les codes

Dans ton Worker, va dans **Settings → Variables and Secrets**, puis **Add** pour chaque ligne :

| Type | Nom | Valeur |
|---|---|---|
| **Secret** | `OPENAI_API_KEY` | ta clé OpenAI (`sk-…`) |
| **Secret** | `CODES_ACCES` | les joueurs et leurs codes, séparés par des virgules (voir ci-dessous) |
| Text | `MODELE` | `gpt-5-mini` (le modèle utilisé pour tout le monde) |
| Text | `ORIGINES` | `https://jonathanguery0-hue.github.io` |

Clique sur **Deploy** pour enregistrer.

**Les codes d'accès** s'écrivent `prénom:code`, par exemple :

```
jonathan:dragon-rouge-42,lea:lune-bleue-17,karim:forge-ardente-08
```

- Choisis des codes **difficiles à deviner** (trois mots et un nombre, par exemple).
- Pour **retirer** l'accès à quelqu'un, enlève son code de la liste.
- Pour **ajouter** un ami, ajoute `prénom:code` à la fin.
- Le prénom apparaît dans les journaux du Worker (*Logs*), pour savoir qui joue.

## 3. Me donner l'adresse

Ton Worker a une adresse du type **`https://contes-dragons.TON-NOM.workers.dev`** (visible sur sa
page). Envoie-la-moi : je la mets dans le jeu (fichier `js/serveur.js`), et le jeu demandera alors
un code au lieu d'une clé.

## 4. Inviter tes amis

Envoie à chacun **son** lien d'invitation :

```
https://jonathanguery0-hue.github.io/dndstories/#code=lune-bleue-17
```

En l'ouvrant, le code est enregistré automatiquement : il n'y a plus qu'à jouer. (Ils peuvent aussi
le taper dans ⚙️ Réglages.)

## 5. Protéger ton porte-monnaie 💸

- Sur **platform.openai.com → Settings → Limits**, fixe une **limite de dépense mensuelle**
  (par exemple 10 $). Au-delà, l'IA s'arrête simplement de répondre jusqu'au mois suivant.
- Le serveur **impose le modèle** (`MODELE`) : personne ne peut choisir un modèle plus cher.
- Un code ne sert qu'à ce jeu : même divulgué, il ne donne pas accès à ta clé. Change-le si besoin.

## Pour les curieux

- Le serveur ne fait qu'une chose : vérifier le code, puis transmettre la requête à OpenAI avec ta clé.
- Adresses : `GET /verifier` (teste un code, en-tête `X-Code-Acces`) et `POST /v1/chat/completions`.
- Il ne stocke rien : les parties restent dans le navigateur de chaque joueur.
