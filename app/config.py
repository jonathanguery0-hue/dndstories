"""Réglages locaux (clé API, modèle) enregistrés dans config.json, jamais envoyés sur GitHub."""

import json
import os
from pathlib import Path

FICHIER = Path(__file__).resolve().parent.parent / "config.json"

DEFAUTS = {
    "api_key": "",
    "modele": "gpt-5-mini",
    # Adresse d'un serveur compatible OpenAI (laisser vide pour OpenAI).
    # Exemple pour un modèle local avec Ollama : http://localhost:11434/v1
    "base_url": "",
}


def charger() -> dict:
    cfg = dict(DEFAUTS)
    if FICHIER.exists():
        try:
            cfg.update(json.loads(FICHIER.read_text(encoding="utf-8")))
        except (OSError, ValueError):
            pass
    if not cfg["api_key"] and os.environ.get("OPENAI_API_KEY"):
        cfg["api_key"] = os.environ["OPENAI_API_KEY"]
    return cfg


def enregistrer(modifs: dict) -> dict:
    cfg = charger()
    for cle in DEFAUTS:
        if cle in modifs and modifs[cle] is not None:
            cfg[cle] = str(modifs[cle]).strip()
    FICHIER.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")
    return cfg


def est_configure(cfg: dict) -> bool:
    # Un serveur local (Ollama…) n'a pas besoin de vraie clé.
    return bool(cfg.get("api_key") or cfg.get("base_url"))


def masquer(cle: str) -> str:
    if not cle:
        return ""
    return cle[:3] + "…" + cle[-4:] if len(cle) > 10 else "…"
