# 🎮 Le serveur du jeu : tes amis jouent sans rien configurer

Ce petit serveur garde **ta** clé OpenAI en sécurité chez Cloudflare et fait parler l'IA pour tous les
joueurs. Une fois en place, tu partages simplement le lien du jeu : **aucune clé, aucun code** à
saisir. C'est ton compte OpenAI qui paie les parties (voir « Protéger ton porte-monnaie »).

Cloudflare Workers est **gratuit** jusqu'à 100 000 requêtes par jour, bien plus qu'il n'en faut.

---

## 1. Créer le serveur (une seule fois, ~10 minutes)

1. Crée un compte gratuit sur **https://dash.cloudflare.com/sign-up** et confirme ton e-mail.
2. Dans le menu de gauche, ouvre **Workers & Pages** (parfois rangé sous *Compute*).
3. Clique sur **Create** (ou *Create application*), puis **Start with Hello World!** / **Create Worker**.
4. Donne-lui le nom **`contes-dragons`**, puis clique sur **Deploy**.
5. Clique sur **Edit code**.
6. Dans l'éditeur, **efface tout**, puis colle **tout** le contenu du fichier
   [`serveur/worker.js`](worker.js) (sur GitHub : ouvre le fichier, bouton *Copy raw file* en haut à droite).
7. Clique sur **Deploy** (en haut à droite).

## 2. Ajouter ta clé OpenAI

Dans ton Worker : **Settings → Variables and Secrets → Add** :

| Type | Nom | Valeur |
|---|---|---|
| **Secret** | `OPENAI_API_KEY` | ta clé OpenAI (`sk-…`) |

Clique sur **Deploy** pour enregistrer. C'est tout ce qui est obligatoire !

## 3. Brancher le jeu sur ton serveur

Ton Worker a une adresse du type **`https://contes-dragons.TON-NOM.workers.dev`** (visible sur sa page).

- **Le plus simple :** envoie-la-moi et je l'ajoute au jeu.
- **Ou toi-même :** sur GitHub, ouvre le fichier `js/serveur.js`, clique sur le crayon ✏️, remplace
  `""` par ton adresse entre guillemets — `export const SERVEUR_URL = "https://contes-dragons.TON-NOM.workers.dev";` —
  puis **Commit changes**. Le site se met à jour en une minute.

Ensuite, partage simplement : **https://jonathanguery0-hue.github.io/dndstories/**

## 4. Protéger ton porte-monnaie 💸

Le serveur se protège déjà tout seul :

- Il ne répond qu'au **site du jeu** : un autre site ne peut pas l'utiliser.
- Chaque joueur est **limité** à 60 demandes toutes les 10 minutes (≈ 20 tours de jeu), largement
  assez pour jouer, mais pas pour vider ton crédit avec un robot.
- Il **impose le modèle** : personne ne peut choisir un modèle plus cher.

Et la meilleure protection, de ton côté :

- Sur **platform.openai.com → Settings → Billing**, mets **un crédit prépayé** (par exemple 10 $) et
  **désactive la recharge automatique** (*auto recharge*). Quand le crédit est épuisé, l'IA s'arrête
  simplement : tu ne peux jamais payer plus que ce que tu as mis.
- Le coût de chaque partie s'affiche dans le jeu (accueil et onglet Journal) pour suivre la consommation.

## Réglages facultatifs

À ajouter dans **Settings → Variables and Secrets** seulement si tu en as besoin :

| Nom | Valeur | À quoi ça sert |
|---|---|---|
| `MODELE` | ex. `gpt-5-mini` | le modèle utilisé pour tout le monde (par défaut `gpt-5-mini`) |
| `MODELE_VOIX` | ex. `gpt-4o-mini-tts` | le modèle de la voix IA |
| `LIMITE` | ex. `40` | demandes max par joueur toutes les 10 minutes (par défaut 60) |
| `CODES_ACCES` *(secret)* | `lea:lune-bleue-17,karim:forge-08` | **réserver** le jeu à des amis : un code devient obligatoire |
| `ACCES_LIBRE` | `oui` | avec des codes, garder quand même le jeu ouvert (les codes donnent une limite plus haute) |
| `ORIGINES` | `https://…` | autres sites autorisés (par défaut : le site GitHub Pages du jeu) |

Avec des codes, tu peux envoyer à chacun un lien qui le connecte directement :
`https://jonathanguery0-hue.github.io/dndstories/#code=lune-bleue-17`

## Pour les curieux

- Le serveur vérifie d'où vient la demande, applique la limite, puis la transmet à OpenAI avec ta clé.
- Adresses : `GET /verifier`, `POST /v1/chat/completions` (l'IA) et `POST /v1/audio/speech` (la voix IA).
- Il ne stocke rien : les parties restent dans le navigateur de chaque joueur. Les journaux du Worker
  (*Logs*) montrent le nombre de demandes, sans le contenu des parties.
