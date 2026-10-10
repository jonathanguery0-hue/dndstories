"""Serveur web local : l'interface du jeu et l'API utilisée par la page."""

import threading
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import config, dice, moteur, srd
from .mj import ErreurIA, condenser_memoire, jouer_tour
from .personnage import creer_personnage, vue_fiche
from .scenarios import SCENARIOS

STATIQUE = Path(__file__).resolve().parent / "static"

app = FastAPI(title="Contes & Dragons")
app.mount("/static", StaticFiles(directory=STATIQUE), name="static")

_verrous: dict[str, threading.Lock] = {}
_verrous_global = threading.Lock()


def _verrou(partie_id: str) -> threading.Lock:
    with _verrous_global:
        return _verrous.setdefault(partie_id, threading.Lock())


def _client(cfg: dict):
    from openai import OpenAI
    if not config.est_configure(cfg):
        raise HTTPException(400, "Aucune clé API configurée. Ouvre les Réglages (⚙️) pour l'ajouter.")
    return OpenAI(api_key=cfg["api_key"] or "local", base_url=cfg["base_url"] or None, timeout=120)


def _vue(partie: dict) -> dict:
    sc = SCENARIOS.get(partie["scenario"], SCENARIOS["libre"])
    return {
        "id": partie["id"],
        "scenario": partie["scenario"],
        "titre": sc["titre"],
        "personnage": vue_fiche(partie["personnage"]),
        "combat": partie["combat"],
        "journal": partie["journal"],
        "affichage": partie["affichage"],
    }


def _charger(partie_id: str) -> dict:
    try:
        return moteur.charger(partie_id)
    except (FileNotFoundError, ValueError):
        raise HTTPException(404, "Partie introuvable.") from None


@app.get("/")
def accueil():
    return FileResponse(STATIQUE / "index.html")


@app.get("/api/regles")
def regles():
    return {
        "caracs": srd.CARACS,
        "noms_caracs": srd.NOMS_CARACS,
        "tableau_standard": srd.TABLEAU_STANDARD,
        "races": {n: {"bonus": r["bonus"], "bonus_libres": r.get("bonus_libres", 0), "vitesse": r["vitesse"],
                      "traits": r["traits"], "competences": r.get("competences", [])}
                  for n, r in srd.RACES.items()},
        "classes": {n: {"de_vie": c["de_vie"], "description": c["description"], "sauvegardes": c["sauvegardes"],
                        "nb_competences": c["nb_competences"], "competences": c["competences"],
                        "armes": c["armes"], "armure": c["armure"], "conseil": c["conseil"],
                        "lanceur": c.get("lanceur")}
                    for n, c in srd.CLASSES.items()},
        "competences": srd.COMPETENCES,
        "scenarios": {k: {"titre": s["titre"], "accroche": s["accroche"], "niveau": s["niveau"]}
                      for k, s in SCENARIOS.items()},
    }


@app.get("/api/config")
def lire_config():
    cfg = config.charger()
    return {"configure": config.est_configure(cfg), "modele": cfg["modele"], "base_url": cfg["base_url"],
            "cle": config.masquer(cfg["api_key"])}


class ConfigIn(BaseModel):
    api_key: str | None = None
    modele: str | None = None
    base_url: str | None = None


@app.post("/api/config")
def ecrire_config(donnees: ConfigIn):
    modifs = donnees.model_dump()
    if not modifs.get("api_key"):
        modifs.pop("api_key")  # champ laissé vide : on garde la clé actuelle
    config.enregistrer(modifs)
    return lire_config()


@app.get("/api/modeles")
def modeles():
    cfg = config.charger()
    client = _client(cfg)
    try:
        ids = sorted(m.id for m in client.models.list())
    except Exception as exc:  # noqa: BLE001
        from .mj import _message_erreur
        raise HTTPException(502, _message_erreur(exc, cfg["modele"])) from exc
    if not cfg["base_url"]:
        exclus = ("embedding", "whisper", "tts", "dall-e", "image", "audio", "realtime", "transcribe",
                  "moderation", "search", "davinci", "babbage", "sora", "computer")
        ids = [i for i in ids if i.startswith(("gpt", "o1", "o3", "o4", "chatgpt"))
               and not any(x in i for x in exclus)]
    return {"modeles": ids}


@app.post("/api/caracs/lancer")
def lancer_caracs():
    return {"valeurs": [dice.roll("4d6kh3")["total"] for _ in range(6)]}


class PersonnageIn(BaseModel):
    nom: str
    race: str
    classe: str
    caracs: dict[str, int]
    competences: list[str]
    historique: str = ""
    apparence: str = ""
    scenario: str = "brumesaule"


@app.post("/api/parties")
def creer_partie(donnees: PersonnageIn):
    if donnees.scenario not in SCENARIOS:
        raise HTTPException(400, "Aventure inconnue.")
    try:
        perso = creer_personnage(donnees.nom, donnees.race, donnees.classe, donnees.caracs,
                                 donnees.competences, donnees.historique, donnees.apparence)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    partie = moteur.nouvelle_partie(perso, donnees.scenario)
    moteur.sauvegarder(partie)
    return _vue(partie)


@app.get("/api/parties")
def parties():
    return {"parties": moteur.lister_parties()}


@app.get("/api/parties/{partie_id}")
def lire_partie(partie_id: str):
    return _vue(_charger(partie_id))


@app.delete("/api/parties/{partie_id}")
def supprimer_partie(partie_id: str):
    try:
        moteur.supprimer(partie_id)
    except ValueError:
        raise HTTPException(404, "Partie introuvable.") from None
    return {"ok": True}


class TourIn(BaseModel):
    texte: str = ""


@app.post("/api/parties/{partie_id}/tour")
def tour(partie_id: str, donnees: TourIn):
    texte = donnees.texte.strip()[:2000]
    verrou = _verrou(partie_id)
    if not verrou.acquire(blocking=False):
        raise HTTPException(409, "Le maître du jeu est déjà en train de répondre.")
    try:
        partie = _charger(partie_id)
        if not texte and partie["messages"]:
            raise HTTPException(400, "Écris ce que fait ton personnage.")
        cfg = config.charger()
        client = _client(cfg)
        try:
            resultat = jouer_tour(partie, texte, client, cfg["modele"])
        except ErreurIA as exc:
            # La partie n'est pas sauvegardée : rien n'est perdu, le joueur peut réessayer.
            raise HTTPException(502, str(exc)) from exc
        try:
            condenser_memoire(partie, client, cfg["modele"])
        except ErreurIA:
            pass  # on réessaiera au prochain tour
        moteur.sauvegarder(partie)
        return {**_vue(partie), "nouveaux": resultat["evenements"]}
    finally:
        verrou.release()
