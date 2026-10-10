"""Lancers de dés : formules du type « 2d6+3 », « 1d20 », « 4d6kh3 »."""

import random
import re

_TERME = re.compile(r"([+-]?)\s*(?:(\d*)d(\d+)(kh\d+|kl\d+)?|(\d+))", re.IGNORECASE)

_rng = random.SystemRandom()


def set_seed(seed: int) -> None:
    """Rend les lancers reproductibles (utilisé par les tests)."""
    global _rng
    _rng = random.Random(seed)


def d(faces: int) -> int:
    return _rng.randint(1, faces)


def roll(formule: str) -> dict:
    """Lance une formule et renvoie {formule, total, detail}.

    Exemple : roll("2d6+3") -> {"formule": "2d6+3", "total": 10, "detail": "[4, 3] + 3"}
    """
    texte = formule.replace(" ", "").lower()
    if not texte:
        raise ValueError("Formule de dés vide")
    position = 0
    total = 0
    morceaux = []
    for m in _TERME.finditer(texte):
        if m.start() != position:
            raise ValueError(f"Formule de dés invalide : {formule!r}")
        position = m.end()
        signe = -1 if m.group(1) == "-" else 1
        if m.group(3):
            nombre = int(m.group(2) or 1)
            faces = int(m.group(3))
            if not (1 <= nombre <= 100) or not (2 <= faces <= 1000):
                raise ValueError(f"Formule de dés hors limites : {formule!r}")
            des = [d(faces) for _ in range(nombre)]
            gardes = des
            option = m.group(4)
            if option:
                n = int(option[2:])
                tries = sorted(des, reverse=option.startswith("kh"))
                gardes = tries[:n]
            valeur = sum(gardes)
            morceaux.append(("-" if signe < 0 else "+") + " " + str(des))
        else:
            valeur = int(m.group(5))
            morceaux.append(("-" if signe < 0 else "+") + " " + str(valeur))
        total += signe * valeur
    if position != len(texte):
        raise ValueError(f"Formule de dés invalide : {formule!r}")
    detail = " ".join(morceaux)
    if detail.startswith("+ "):
        detail = detail[2:]
    return {"formule": formule, "total": total, "detail": detail}


def d20(avantage: bool = False, desavantage: bool = False) -> dict:
    """Jet de d20 avec avantage / désavantage. Renvoie {resultat, des}."""
    if avantage and desavantage:
        avantage = desavantage = False
    if avantage or desavantage:
        des = [d(20), d(20)]
        resultat = max(des) if avantage else min(des)
    else:
        des = [d(20)]
        resultat = des[0]
    return {"resultat": resultat, "des": des}
