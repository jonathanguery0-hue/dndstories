"""L'IA maître du jeu : construit les consignes, appelle le modèle et exécute ses outils."""

import json

from . import srd
from .moteur import Moteur
from .personnage import resume_texte
from .scenarios import SCENARIOS

MAX_ETAPES = 14          # appels d'outils maximum par tour de jeu
HISTORIQUE_MAX = 40      # messages gardés tels quels avant de résumer les plus anciens
A_RESUMER = 20           # nombre de messages condensés à chaque résumé


def _outil(nom: str, description: str, proprietes: dict, requis: list) -> dict:
    return {"type": "function", "function": {
        "name": nom, "description": description,
        "parameters": {"type": "object", "properties": proprietes, "required": requis},
    }}


_BOOL = {"type": "boolean"}
_STR = {"type": "string"}

OUTILS = [
    _outil("jet_de_test",
           "Fait lancer au joueur un test de compétence, de caractéristique ou un jet de sauvegarde. "
           "Utilise-le dès que l'issue d'une action est incertaine.",
           {"type": {"type": "string", "enum": ["competence", "caracteristique", "sauvegarde"]},
            "nom": {"type": "string", "description": "Nom de la compétence (ex. Perception, Discrétion) "
                    "ou caractéristique (FOR, DEX, CON, INT, SAG, CHA)"},
            "dd": {"type": "integer", "description": "Degré de difficulté : 5 très facile, 10 facile, "
                   "15 moyen, 20 difficile, 25 très difficile"},
            "avantage": _BOOL, "desavantage": _BOOL,
            "raison": {"type": "string", "description": "Ce que tente le personnage"}},
           ["type", "nom"]),
    _outil("lancer_des", "Lance des dés quelconques (ex. '2d6+1', '1d100'), pour du hasard narratif "
           "ou un effet non couvert par les autres outils.",
           {"formule": _STR, "raison": _STR}, ["formule"]),
    _outil("commencer_combat",
           "Démarre un combat : crée les ennemis et lance l'initiative. Utilise les noms du bestiaire "
           "comme 'modele' quand c'est possible, sinon précise ca, pv, attaque, degats.",
           {"ennemis": {"type": "array", "items": {"type": "object", "properties": {
               "nom": {"type": "string", "description": "Nom affiché (ex. 'Gobelin', 'Gruk le Borgne')"},
               "modele": {"type": "string", "description": "Créature du bestiaire servant de base"},
               "nombre": {"type": "integer"},
               "ca": {"type": "integer"}, "pv": {"type": "string", "description": "Nombre ou formule"},
               "attaque": {"type": "integer", "description": "Bonus au jet d'attaque"},
               "degats": {"type": "string", "description": "Formule de dégâts, ex. '1d6+2'"},
               "arme": {"type": "string"}, "xp": {"type": "integer"},
           }, "required": ["nom"]}},
            "surprise": {"type": "string", "description": "Qui est surpris, le cas échéant"}},
           ["ennemis"]),
    _outil("attaque_joueur", "Le joueur attaque un ennemi avec une arme de sa fiche (jet d'attaque + dégâts).",
           {"arme": _STR, "cible": {"type": "string", "description": "Identifiant de l'ennemi (ex. 'Gobelin 2')"},
            "avantage": _BOOL, "desavantage": _BOOL,
            "degats_bonus": {"type": "string", "description": "Dés de dégâts en plus, ex. '1d6' pour une "
                             "attaque sournoise de roublard"}},
           ["arme", "cible"]),
    _outil("lancer_sort", "Le joueur lance un sort qu'il connaît. Gère emplacements, jets d'attaque, "
           "sauvegardes des ennemis, dégâts et soins.",
           {"sort": _STR,
            "cibles": {"type": "array", "items": _STR,
                       "description": "Identifiants des ennemis visés, ou 'joueur' pour se soigner"},
            "niveau_emplacement": {"type": "integer", "description": "Pour lancer à un niveau supérieur"}},
           ["sort"]),
    _outil("attaque_ennemi", "Un ennemi attaque (le joueur par défaut). Les dégâts sont appliqués automatiquement.",
           {"ennemi": _STR, "cible": {"type": "string", "description": "'joueur' ou nom d'un PNJ allié"},
            "avantage": _BOOL, "desavantage": _BOOL},
           ["ennemi"]),
    _outil("degats_ennemi", "Inflige des dégâts à un ennemi hors attaque classique (piège, chute, objet lancé…).",
           {"ennemi": _STR, "formule": _STR, "raison": _STR}, ["ennemi", "formule"]),
    _outil("changer_etat_ennemi", "Change l'état d'un ennemi : enfui, rendu, vaincu ou actif.",
           {"ennemi": _STR, "etat": {"type": "string", "enum": ["actif", "enfui", "rendu", "vaincu"]}},
           ["ennemi", "etat"]),
    _outil("fin_combat", "Termine le combat et attribue l'XP des ennemis vaincus.",
           {"issue": {"type": "string", "enum": ["victoire", "fuite", "negociation", "defaite"]}}, ["issue"]),
    _outil("modifier_pv_joueur", "Inflige des dégâts ou soigne le joueur hors attaque d'ennemi "
           "(piège, chute, potion, repas…).",
           {"type": {"type": "string", "enum": ["degats", "soin"]},
            "formule": {"type": "string", "description": "Nombre ou formule, ex. '2d4+2'"}, "raison": _STR},
           ["type", "formule"]),
    _outil("jet_contre_la_mort", "Jet de sauvegarde contre la mort quand le joueur est à 0 PV, à son tour.",
           {}, []),
    _outil("utiliser_capacite", "Utilise une capacité de classe (Second souffle, Rage…).",
           {"nom": _STR}, ["nom"]),
    _outil("gerer_inventaire", "Ajoute ou retire un objet de l'inventaire (trouvé, acheté, donné, consommé).",
           {"action": {"type": "string", "enum": ["ajouter", "retirer"]}, "objet": _STR,
            "quantite": {"type": "integer"}}, ["action", "objet"]),
    _outil("modifier_or", "Ajoute (positif) ou retire (négatif) des pièces d'or.",
           {"montant": {"type": "integer"}, "raison": _STR}, ["montant"]),
    _outil("donner_xp", "Donne de l'expérience pour une étape franchie, une énigme résolue, un bon roleplay "
           "(l'XP des combats est donnée automatiquement par fin_combat).",
           {"montant": {"type": "integer"}, "raison": _STR}, ["montant"]),
    _outil("repos", "Le joueur se repose : 'court' (1 heure) ou 'long' (8 heures).",
           {"type": {"type": "string", "enum": ["court", "long"]}}, ["type"]),
    _outil("modifier_condition", "Ajoute ou retire une condition (empoisonné, effrayé, à terre, entravé…).",
           {"action": {"type": "string", "enum": ["ajouter", "retirer"]}, "condition": _STR},
           ["action", "condition"]),
    _outil("noter_journal", "Note un fait important à retenir pour la suite (PNJ rencontré, indice, quête, "
           "promesse, lieu). Le journal est visible par le joueur : pas de secrets dedans.",
           {"note": _STR}, ["note"]),
]

CONSIGNES = """\
Tu es le maître du jeu (MJ) d'une partie de jeu de rôle de fantasy basée sur les règles de la 5e édition \
(SRD 5.1), pour un seul joueur. Tu écris en français, à la deuxième personne (« tu »).

TON RÔLE
- Raconte de façon vivante et immersive : sens, ambiance, PNJ avec leur propre voix et leurs motivations.
- Le joueur décide de TOUTES les actions et paroles de son personnage. Ne les invente jamais à sa place.
- Termine chaque réponse en laissant la main au joueur (situation claire, sans lister de choix numérotés \
sauf s'il est perdu).
- Réponses de 80 à 250 mots en général ; plus courtes pendant les combats.
- Sois juste mais pas complaisant : les actions ont des conséquences, l'échec est possible et intéressant.
- Si le joueur tente quelque chose d'impossible ou d'incohérent, explique-le dans le récit.
- Ne révèle jamais tes notes secrètes directement : fais-les découvrir par l'enquête et le jeu.

RÈGLES ET OUTILS — TRÈS IMPORTANT
- Tu ne lances JAMAIS de dés toi-même et n'inventes aucun résultat : utilise toujours les outils. \
Leurs résultats font foi, raconte-les fidèlement (réussite, échec, dégâts).
- Demande un jet (jet_de_test) seulement quand l'issue est incertaine et intéressante.
- Toute modification de la fiche (PV, objets, or, XP, conditions, sorts, capacités) passe par un outil.
- Si un outil renvoie une erreur, corrige l'appel ou adapte le récit.
- COMBAT : appelle commencer_combat, puis respecte l'ordre d'initiative. Au tour du joueur, attends son \
action (sauf s'il l'a déjà décrite). Ensuite fais agir chaque ennemi actif avec attaque_ennemi (ou une \
autre action logique : fuir, se rendre…), jusqu'au prochain tour du joueur. Les ennemis endormis ne \
jouent pas. Quand le combat est fini, appelle fin_combat.
- Le joueur ne peut utiliser que ses armes, sorts et capacités de sa fiche. Un sort exige un emplacement libre.
- À 0 PV le joueur est inconscient : à chacun de ses tours, appelle jet_contre_la_mort. S'il meurt, \
raconte une fin digne et propose de relire son épopée.
- Récompense l'exploration et les bonnes idées avec donner_xp (25 à 100 XP par étape importante au niveau 1-3).
- Utilise noter_journal pour retenir les PNJ, indices et quêtes importants.

BESTIAIRE DISPONIBLE (modèles pour commencer_combat) : {bestiaire}
"""


def construire_systeme(partie: dict) -> str:
    sc = SCENARIOS.get(partie["scenario"], SCENARIOS["libre"])
    morceaux = [CONSIGNES.format(bestiaire=", ".join(
        f"{n} (CA {m['ca']}, {m['xp']} XP)" for n, m in srd.MONSTRES.items()))]
    morceaux.append(f"AVENTURE : {sc['titre']}\nNOTES SECRÈTES DU MJ :\n{sc['notes_mj']}")
    morceaux.append("FICHE DU PERSONNAGE (état actuel, fait foi) :\n" + resume_texte(partie["personnage"]))
    combat = partie.get("combat")
    if combat:
        lignes = [f"- {e['id']} : {e['pv']}/{e['pv_max']} PV, CA {e['ca']}, {e['etat']}" for e in combat["ennemis"]]
        ordre = " → ".join(o["nom"] for o in combat["ordre"])
        morceaux.append(f"COMBAT EN COURS. Ordre d'initiative : {ordre}\n" + "\n".join(lignes))
    if partie.get("journal"):
        morceaux.append("JOURNAL (faits établis) :\n" + "\n".join(f"- {n}" for n in partie["journal"]))
    if partie.get("resume"):
        morceaux.append("RÉSUMÉ DE L'HISTOIRE JUSQU'ICI :\n" + partie["resume"])
    return "\n\n".join(morceaux)


class ErreurIA(Exception):
    """Problème de communication avec le service d'IA, avec un message compréhensible."""


def _appeler(client, modele: str, messages: list, outils: list | None = None):
    params = {"model": modele, "messages": messages}
    if outils:
        params["tools"] = outils
    try:
        return client.chat.completions.create(**params)
    except Exception as exc:  # noqa: BLE001 — on traduit toutes les erreurs du SDK en message lisible
        raise ErreurIA(_message_erreur(exc, modele)) from exc


def _message_erreur(exc: Exception, modele: str) -> str:
    nom = type(exc).__name__
    texte = str(exc)
    if nom == "AuthenticationError":
        return "La clé API est refusée. Vérifie-la dans les Réglages (⚙️)."
    if nom == "NotFoundError" or "model_not_found" in texte:
        return f"Le modèle « {modele} » n'est pas disponible avec ce compte. Choisis-en un autre dans les Réglages."
    if nom == "RateLimitError":
        if "insufficient_quota" in texte:
            return "Le compte OpenAI n'a plus de crédit. Ajoute du crédit sur platform.openai.com (Billing)."
        return "Trop de requêtes d'un coup : attends quelques secondes et réessaie."
    if nom in ("APIConnectionError", "APITimeoutError"):
        return "Impossible de joindre le service d'IA. Vérifie ta connexion internet (ou ton serveur local)."
    return f"Erreur du service d'IA ({nom}) : {texte[:300]}"


def _message_assistant(msg) -> dict:
    d = {"role": "assistant", "content": msg.content or ""}
    if msg.tool_calls:
        d["tool_calls"] = [{"id": tc.id, "type": "function",
                            "function": {"name": tc.function.name, "arguments": tc.function.arguments}}
                           for tc in msg.tool_calls]
    return d


def jouer_tour(partie: dict, texte_joueur: str, client, modele: str) -> dict:
    """Joue un tour : envoie l'action du joueur, exécute les outils, renvoie la narration.

    Le texte_joueur vide sert au tout premier tour (introduction de l'aventure).
    """
    sc = SCENARIOS.get(partie["scenario"], SCENARIOS["libre"])
    if texte_joueur:
        message_joueur = texte_joueur
    else:
        message_joueur = f"[Début de la partie] {sc['intro']}"
    moteur = Moteur(partie)
    messages = [{"role": "system", "content": construire_systeme(partie)},
                *partie["messages"],
                {"role": "user", "content": message_joueur}]
    narration = []
    for _ in range(MAX_ETAPES):
        reponse = _appeler(client, modele, messages, OUTILS)
        msg = reponse.choices[0].message
        if msg.content and msg.content.strip():
            narration.append(msg.content.strip())
        if not msg.tool_calls:
            break
        messages.append(_message_assistant(msg))
        for tc in msg.tool_calls:
            try:
                args = json.loads(tc.function.arguments or "{}")
                if not isinstance(args, dict):
                    raise ValueError
            except ValueError:
                resultat = {"erreur": "Arguments JSON invalides."}
            else:
                resultat = moteur.executer(tc.function.name, args)
            messages.append({"role": "tool", "tool_call_id": tc.id,
                             "content": json.dumps(resultat, ensure_ascii=False)})
    else:
        narration.append("(Le maître du jeu marque une pause… Que fais-tu ?)")

    texte_mj = "\n\n".join(narration) or "(Le maître du jeu reste silencieux… Reformule ton action.)"
    partie["messages"].append({"role": "user", "content": message_joueur})
    partie["messages"].append({"role": "assistant", "content": texte_mj})
    if texte_joueur:
        partie["affichage"].append({"type": "joueur", "texte": texte_joueur})
    partie["affichage"].extend(moteur.evenements)
    partie["affichage"].append({"type": "mj", "texte": texte_mj})
    return {"narration": texte_mj, "evenements": moteur.evenements}


def condenser_memoire(partie: dict, client, modele: str) -> bool:
    """Résume les plus anciens échanges pour que la conversation ne devienne pas trop longue."""
    if len(partie["messages"]) <= HISTORIQUE_MAX:
        return False
    anciens = partie["messages"][:A_RESUMER]
    transcription = "\n\n".join(
        f"{'JOUEUR' if m['role'] == 'user' else 'MJ'} : {m['content']}" for m in anciens)
    consigne = ("Tu aides un maître du jeu à garder la mémoire d'une partie de jeu de rôle. Mets à jour le "
                "résumé ci-dessous avec les nouveaux échanges. Garde les faits importants : lieux visités, PNJ "
                "rencontrés et leur attitude, indices, objets, quêtes en cours, choix du joueur et leurs "
                "conséquences. Écris en français, 300 mots maximum, au passé.")
    contenu = f"RÉSUMÉ ACTUEL :\n{partie.get('resume') or '(aucun)'}\n\nNOUVEAUX ÉCHANGES :\n{transcription}"
    reponse = _appeler(client, modele, [{"role": "system", "content": consigne},
                                        {"role": "user", "content": contenu}])
    resume = (reponse.choices[0].message.content or "").strip()
    if resume:
        partie["resume"] = resume
        partie["messages"] = partie["messages"][A_RESUMER:]
        return True
    return False
