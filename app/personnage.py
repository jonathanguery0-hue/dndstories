"""Création et calculs de la fiche de personnage."""

from . import srd


def mod(score: int) -> int:
    return (score - 10) // 2


def signe(n: int) -> str:
    return f"+{n}" if n >= 0 else str(n)


def maitrise(niveau: int) -> int:
    return 2 + (niveau - 1) // 4


def niveau_pour_xp(xp: int) -> int:
    niveau = 1
    for n, palier in srd.PALIERS_XP.items():
        if xp >= palier:
            niveau = n
    return niveau


def creer_personnage(nom: str, race: str, classe: str, caracs: dict, competences: list,
                     historique: str = "", apparence: str = "") -> dict:
    nom = (nom or "").strip()
    if not nom:
        raise ValueError("Le personnage doit avoir un nom.")
    if race not in srd.RACES:
        raise ValueError(f"Race inconnue : {race}")
    if classe not in srd.CLASSES:
        raise ValueError(f"Classe inconnue : {classe}")
    if set(caracs) != set(srd.CARACS):
        raise ValueError("Il faut une valeur pour chaque caractéristique.")
    for c, v in caracs.items():
        if not isinstance(v, int) or not 3 <= v <= 18:
            raise ValueError(f"Valeur invalide pour {c} : {v}")

    r = srd.RACES[race]
    k = srd.CLASSES[classe]

    finales = dict(caracs)
    for c, b in r["bonus"].items():
        finales[c] += b
    if r.get("bonus_libres"):
        autres = sorted((c for c in srd.CARACS if c not in r["bonus"]),
                        key=lambda c: finales[c], reverse=True)
        for c in autres[: r["bonus_libres"]]:
            finales[c] += 1
    finales = {c: min(v, 20) for c, v in finales.items()}

    competences = list(dict.fromkeys(competences))
    if len(competences) != k["nb_competences"] or any(c not in k["competences"] for c in competences):
        raise ValueError(f"Choisissez {k['nb_competences']} compétences parmi celles du {classe}.")
    for c in r.get("competences", []):
        if c not in competences:
            competences.append(c)

    armes = []
    for nom_arme in k["armes"]:
        armes.append({"nom": nom_arme, **srd.ARMES[nom_arme]})

    perso = {
        "nom": nom,
        "race": race,
        "classe": classe,
        "niveau": 1,
        "xp": 0,
        "historique": historique.strip(),
        "apparence": apparence.strip(),
        "caracs": finales,
        "competences": competences,
        "sauvegardes": list(k["sauvegardes"]),
        "vitesse": r["vitesse"],
        "armure": k["armure"],
        "bouclier": k["bouclier"],
        "armure_du_mage": False,
        "armes": armes,
        "inventaire": [{"nom": o, "quantite": 1} for o in k["inventaire"]],
        "or": k["or"],
        "traits": list(r["traits"]),
        "capacites": [dict(c, utilisations=c.get("utilisations_max")) for c in k["capacites"]],
        "des_de_vie": {"faces": k["de_vie"], "restants": 1},
        "conditions": [],
        "mort": {"succes": 0, "echecs": 0, "stable": False, "mort": False},
    }
    perso["pv_max"] = k["de_vie"] + mod(finales["CON"]) + r.get("pv_par_niveau", 0)
    perso["pv_max"] = max(perso["pv_max"], 1)
    perso["pv"] = perso["pv_max"]
    _maj_emplacements(perso)
    return perso


def _maj_emplacements(perso: dict) -> None:
    if "lanceur" not in srd.CLASSES[perso["classe"]]:
        perso["emplacements"] = {}
        return
    anciens = perso.get("emplacements", {})
    nouveaux = {}
    for niv, nb in srd.EMPLACEMENTS[perso["niveau"]].items():
        cle = str(niv)
        utilises = anciens.get(cle, {}).get("max", 0) - anciens.get(cle, {}).get("restants", 0)
        nouveaux[cle] = {"max": nb, "restants": max(nb - utilises, 0)}
    perso["emplacements"] = nouveaux


def niveau_max_sort(perso: dict) -> int:
    return max((int(n) for n in perso.get("emplacements", {})), default=0)


def sorts_connus(perso: dict) -> list:
    """Les lanceurs connaissent tous les sorts de leur classe accessibles à leur niveau (simplification)."""
    if "lanceur" not in srd.CLASSES[perso["classe"]]:
        sorts = []
    else:
        nmax = niveau_max_sort(perso)
        sorts = [n for n, s in srd.SORTS.items()
                 if perso["classe"] in s["classes"] and s["niveau"] <= nmax]
    if perso["race"] == "Tieffelin" and "Thaumaturgie" not in sorts:
        sorts.append("Thaumaturgie")
    return sorts


def carac_sort(perso: dict) -> str:
    return srd.CLASSES[perso["classe"]].get("lanceur", "CHA")


def bonus_attaque_sort(perso: dict) -> int:
    return maitrise(perso["niveau"]) + mod(perso["caracs"][carac_sort(perso)])


def dd_sort(perso: dict) -> int:
    return 8 + bonus_attaque_sort(perso)


def ca(perso: dict) -> int:
    c = perso["caracs"]
    dex = mod(c["DEX"])
    if perso["armure"] == "Défense sans armure":
        valeur = 10 + dex + mod(c["CON"])
    else:
        base, ajoute_dex, plafond = srd.ARMURES[perso["armure"]]
        valeur = base
        if ajoute_dex:
            valeur += dex if plafond is None else min(dex, plafond)
        if perso["classe"] == "Guerrier" and perso["armure"] != "Aucune":
            valeur += 1  # Style de combat : Défense
    if perso.get("armure_du_mage") and perso["armure"] == "Aucune":
        valeur = max(valeur, 13 + dex)
    if perso["bouclier"]:
        valeur += 2
    return valeur


def bonus_competence(perso: dict, competence: str) -> int:
    carac = srd.COMPETENCES[competence]
    b = mod(perso["caracs"][carac])
    if competence in perso["competences"]:
        b += maitrise(perso["niveau"])
    return b


def bonus_sauvegarde(perso: dict, carac: str) -> int:
    b = mod(perso["caracs"][carac])
    if carac in perso["sauvegardes"]:
        b += maitrise(perso["niveau"])
    return b


def carac_arme(perso: dict, arme: dict) -> str:
    if arme["carac"] == "FINESSE":
        return "DEX" if perso["caracs"]["DEX"] >= perso["caracs"]["FOR"] else "FOR"
    return arme["carac"]


def bonus_attaque_arme(perso: dict, arme: dict) -> int:
    return mod(perso["caracs"][carac_arme(perso, arme)]) + maitrise(perso["niveau"])


def bonus_degats_arme(perso: dict, arme: dict) -> int:
    if arme["degats"] == "1":
        return mod(perso["caracs"]["FOR"])
    return mod(perso["caracs"][carac_arme(perso, arme)])


def gagner_niveau(perso: dict) -> list:
    """Applique les montées de niveau dues à l'XP. Renvoie la liste des nouveaux niveaux."""
    gagnes = []
    cible = niveau_pour_xp(perso["xp"])
    while perso["niveau"] < cible:
        perso["niveau"] += 1
        faces = perso["des_de_vie"]["faces"]
        gain = faces // 2 + 1 + mod(perso["caracs"]["CON"]) + srd.RACES[perso["race"]].get("pv_par_niveau", 0)
        gain = max(gain, 1)
        perso["pv_max"] += gain
        perso["pv"] += gain
        perso["des_de_vie"]["restants"] += 1
        _maj_emplacements(perso)
        for cap in perso["capacites"]:
            if cap["nom"] == "Rage":
                cap["utilisations_max"] = 2 if perso["niveau"] < 3 else 3 if perso["niveau"] < 6 else 4
        gagnes.append(perso["niveau"])
    return gagnes


def vue_fiche(perso: dict) -> dict:
    """Fiche complète avec toutes les valeurs calculées, pour l'interface."""
    p = perso
    return {
        **p,
        "ca": ca(p),
        "maitrise": maitrise(p["niveau"]),
        "xp_prochain": srd.PALIERS_XP.get(p["niveau"] + 1),
        "mods": {c: mod(v) for c, v in p["caracs"].items()},
        "toutes_competences": [
            {"nom": n, "carac": c, "bonus": bonus_competence(p, n), "maitrise": n in p["competences"]}
            for n, c in srd.COMPETENCES.items()
        ],
        "toutes_sauvegardes": [
            {"carac": c, "bonus": bonus_sauvegarde(p, c), "maitrise": c in p["sauvegardes"]}
            for c in srd.CARACS
        ],
        "attaques": [
            {"nom": a["nom"], "bonus": bonus_attaque_arme(p, a),
             "degats": a["degats"] if a["degats"] == "1" and bonus_degats_arme(p, a) == 0
             else f"{a['degats']}{signe(bonus_degats_arme(p, a))}",
             "type": a["type"], "distance": a.get("distance", False)}
            for a in p["armes"]
        ],
        "sorts": [
            {"nom": n, **srd.SORTS[n]} for n in sorts_connus(p)
        ],
        "sort_attaque": bonus_attaque_sort(p) if "lanceur" in srd.CLASSES[p["classe"]] else None,
        "sort_dd": dd_sort(p) if "lanceur" in srd.CLASSES[p["classe"]] else None,
    }


def resume_texte(perso: dict) -> str:
    """Résumé compact de la fiche, envoyé à l'IA à chaque tour."""
    p = perso
    v = vue_fiche(p)
    caracs = ", ".join(f"{c} {p['caracs'][c]} ({signe(v['mods'][c])})" for c in srd.CARACS)
    lignes = [
        f"{p['nom']} — {p['race']} {p['classe']} niveau {p['niveau']} (XP {p['xp']})",
        f"PV {p['pv']}/{p['pv_max']} · CA {v['ca']} · Vitesse {p['vitesse']} m · Maîtrise +{v['maitrise']}",
        f"Caractéristiques : {caracs}",
        "Compétences maîtrisées : " + (", ".join(p["competences"]) or "aucune"),
        "Attaques : " + "; ".join(f"{a['nom']} {signe(a['bonus'])} ({a['degats']} {a['type']})"
                                  for a in v["attaques"]),
    ]
    if v["sorts"]:
        empl = ", ".join(f"niv.{n} {e['restants']}/{e['max']}" for n, e in p["emplacements"].items())
        lignes.append(f"Sorts (attaque {signe(v['sort_attaque'])}, DD {v['sort_dd']}) : "
                      + ", ".join(f"{s['nom']} (niv.{s['niveau']})" for s in v["sorts"]))
        lignes.append(f"Emplacements de sorts : {empl}")
    caps = []
    for c in p["capacites"]:
        txt = c["nom"]
        if c.get("utilisations_max"):
            txt += f" ({c['utilisations']}/{c['utilisations_max']})"
        caps.append(txt)
    lignes.append("Capacités : " + ", ".join(caps))
    lignes.append("Traits : " + " ".join(p["traits"]))
    lignes.append("Inventaire : " + ", ".join(
        o["nom"] + (f" x{o['quantite']}" if o["quantite"] > 1 else "") for o in p["inventaire"])
        + f" · {p['or']} po")
    if p["conditions"]:
        lignes.append("Conditions : " + ", ".join(p["conditions"]))
    if p["pv"] == 0:
        m = p["mort"]
        etat = "MORT" if m["mort"] else "stabilisé" if m["stable"] else \
            f"inconscient, jets contre la mort {m['succes']} succès / {m['echecs']} échecs"
        lignes.append(f"ÉTAT : {etat}")
    if p["historique"]:
        lignes.append(f"Historique : {p['historique']}")
    if p["apparence"]:
        lignes.append(f"Apparence : {p['apparence']}")
    return "\n".join(lignes)
