# 🎮 Le serveur du jeu : tes amis jouent sans rien configurer

Ce petit serveur garde **ta** clé OpenAI en sécurité et fait parler l'IA pour tous les
joueurs. Une fois en place, tu partages simplement le lien du jeu : **aucune clé, aucun code** à
saisir. C'est ton compte OpenAI qui paie les parties (voir « Protéger ton porte-monnaie »).

---

## Mettre le jeu en ligne avec Vercel (recommandé, ~5 minutes)

Vercel héberge **à la fois** le jeu et le serveur qui garde ta clé. Tu te connectes avec ton compte
GitHub : pas de nouveau compte, pas de carte bancaire, rien à copier-coller.

1. Va sur **https://vercel.com/signup**, choisis **Hobby** (gratuit) puis **Continue with GitHub**,
   et accepte l'autorisation.
2. Va sur **https://vercel.com/new**. Dans la liste de tes dépôts, clique sur **Import** à côté de
   **dndstories**.
   *(S'il n'apparaît pas : clique sur « Adjust GitHub App Permissions » et autorise le dépôt `dndstories`.)*
3. Ne touche pas aux réglages de construction. Déplie **Environment Variables** et ajoute :
   - **Key** : `OPENAI_API_KEY`
   - **Value** : ta clé OpenAI (`sk-…`)

   puis clique sur **Add**.
4. Clique sur **Deploy**. Au bout d'une minute environ : 🎉 *Congratulations!*
5. Clique sur la vignette du site (ou **Continue to Dashboard → Visit**) : l'adresse ressemble à
   **`https://dndstories.vercel.app`**. **C'est ce lien que tu partages** : tes amis jouent sans rien
   configurer.

Chaque mise à jour du jeu sur GitHub est mise en ligne automatiquement sur Vercel.

> ℹ️ L'offre gratuite Hobby est prévue pour un usage personnel et non commercial : parfait pour jouer
> entre amis. Si tu commercialises le jeu un jour, il faudra passer à l'offre Pro.

### Changer un réglage plus tard

Dans Vercel : ton projet → **Settings → Environment Variables** (voir « Réglages facultatifs »
ci-dessous), puis **Deployments → ⋯ → Redeploy** pour appliquer.

## Protéger ton porte-monnaie 💸

Le serveur se protège déjà tout seul :

- Il ne répond qu'au **site du jeu** : un autre site ne peut pas l'utiliser.
- Chaque joueur est **limité** à 200 demandes à l'IA toutes les 10 minutes (un tour en fait souvent 2
  à 4 : ≈ 50 tours), et 300 demandes de voix IA : largement assez pour jouer, mais pas pour vider ton
  crédit avec un robot.
- Il **impose le modèle** : personne ne peut choisir un modèle plus cher.

Et la meilleure protection, de ton côté :

- Sur **platform.openai.com → Settings → Billing**, mets **un crédit prépayé** (par exemple 10 $) et
  **désactive la recharge automatique** (*auto recharge*). Quand le crédit est épuisé, l'IA s'arrête
  simplement : tu ne peux jamais payer plus que ce que tu as mis.
- Le coût de chaque partie s'affiche dans le jeu (accueil et onglet Journal) pour suivre la consommation.

## Réglages facultatifs

À ajouter dans les variables d'environnement seulement si tu en as besoin :

| Nom | Valeur | À quoi ça sert |
|---|---|---|
| `MODELE` | ex. `gpt-5-mini` | le modèle utilisé pour tout le monde (par défaut `gpt-5-mini`) |
| `MODELE_VOIX` | ex. `gpt-4o-mini-tts` | le modèle de la voix IA |
| `LIMITE` | ex. `300` | demandes à l'IA max par joueur toutes les 10 minutes (par défaut 200) |
| `LIMITE_VOIX` | ex. `400` | demandes de voix IA max par joueur toutes les 10 minutes (par défaut 300) |
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

## Autre possibilité : Cloudflare Workers

Si tu préfères Cloudflare (le jeu reste alors sur GitHub Pages) : crée un Worker sur
dash.cloudflare.com (**Workers & Pages → Create → Hello World**), remplace son code par le contenu de
[`serveur/worker.js`](worker.js), ajoute le secret `OPENAI_API_KEY` dans **Settings → Variables and
Secrets**, puis indique son adresse dans `js/serveur.js` (`ADRESSE_CONFIGUREE`).
