"""Moteur de jeu : état de la partie et actions de règles appelées par l'IA maître du jeu.

L'IA ne modifie jamais la fiche directement : elle appelle ces fonctions (des « outils »),
qui lancent les dés et appliquent les règles. Chaque action ajoute un événement visible
dans le journal des dés de l'interface.
"""

import json
import re
import time
import uuid
from pathlib import Path

from . import dice, srd
from .personnage import (bonus_attaque_arme, bonus_attaque_sort, bonus_competence, bonus_degats_arme,
                         bonus_sauvegarde, ca, dd_sort, gagner_niveau, mod, signe, sorts_connus)

DOSSIER_SAUVEGARDES = Path(__file__).resolve().parent.parent / "sauvegardes"


class ErreurAction(Exception):
    """Action refusée par les règles ; le message est renvoyé à l'IA pour qu'elle corrige."""


# --------------------------------------------------------------------------- partie

def nouvelle_partie(personnage: dict, scenario: str) -> dict:
    return {
        "id": uuid.uuid4().hex[:12],
        "cree_le": time.time(),
        "maj_le": time.time(),
        "scenario": scenario,
        "personnage": personnage,
        "combat": None,
        "journal": [],
        "resume": "",
        "messages": [],
        "affichage": [],
    }


def _chemin(partie_id: str) -> Path:
    if not re.fullmatch(r"[0-9a-f]{12}", partie_id or ""):
        raise ValueError("Identifiant de partie invalide")
    return DOSSIER_SAUVEGARDES / f"{partie_id}.json"


def sauvegarder(partie: dict) -> None:
    DOSSIER_SAUVEGARDES.mkdir(exist_ok=True)
    partie["maj_le"] = time.time()
    chemin = _chemin(partie["id"])
    tmp = chemin.with_suffix(".tmp")
    tmp.write_text(json.dumps(partie, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(chemin)


def charger(partie_id: str) -> dict:
    chemin = _chemin(partie_id)
    if not chemin.exists():
        raise FileNotFoundError(partie_id)
    return json.loads(chemin.read_text(encoding="utf-8"))


def supprimer(partie_id: str) -> None:
    chemin = _chemin(partie_id)
    if chemin.exists():
        chemin.unlink()


def lister_parties() -> list:
    if not DOSSIER_SAUVEGARDES.exists():
        return []
    parties = []
    for f in DOSSIER_SAUVEGARDES.glob("*.json"):
        try:
            p = json.loads(f.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        perso = p["personnage"]
        parties.append({
            "id": p["id"], "maj_le": p["maj_le"], "scenario": p["scenario"],
            "nom": perso["nom"], "race": perso["race"], "classe": perso["classe"],
            "niveau": perso["niveau"],
        })
    return sorted(parties, key=lambda x: x["maj_le"], reverse=True)


# --------------------------------------------------------------------------- outils

class Moteur:
    """Exécute les actions de règles sur une partie et collecte les événements à afficher."""

    def __init__(self, partie: dict):
        self.partie = partie
        self.evenements: list[dict] = []

    @property
    def perso(self) -> dict:
        return self.partie["personnage"]

    def _evt(self, texte: str, genre: str = "de") -> None:
        self.evenements.append({"type": genre, "texte": texte})

    # ---- utilitaires

    def _d20_joueur(self, avantage=False, desavantage=False) -> dict:
        r = dice.d20(avantage, desavantage)
        # Chanceux (halfelin) : un 1 naturel est relancé.
        if self.perso["race"] == "Halfelin pied-léger" and r["resultat"] == 1:
            nouveau = dice.d(20)
            r["des"].append(nouveau)
            r["resultat"] = nouveau
            r["chanceux"] = True
        return r

    @staticmethod
    def _des_txt(r: dict) -> str:
        txt = "d20 " + str(r["des"])
        if r.get("chanceux"):
            txt += " (Chanceux : 1 relancé)"
        return txt

    def _ennemi(self, ref: str) -> dict:
        combat = self.partie["combat"]
        if not combat:
            raise ErreurAction("Aucun combat en cours. Utilisez commencer_combat d'abord.")
        ref_n = (ref or "").strip().lower()
        for e in combat["ennemis"]:
            if e["id"].lower() == ref_n or e["nom"].lower() == ref_n:
                return e
        for e in combat["ennemis"]:
            if e["etat"] != "vaincu" and e["nom"].lower().startswith(ref_n):
                return e
        noms = ", ".join(e["id"] for e in combat["ennemis"])
        raise ErreurAction(f"Ennemi « {ref} » introuvable. Ennemis : {noms}")

    def _blesser_ennemi(self, e: dict, degats: int) -> str:
        e["pv"] = max(e["pv"] - degats, 0)
        if e["etat"] == "endormi" and degats > 0:
            e["etat"] = "actif"
        if e["pv"] == 0:
            e["etat"] = "vaincu"
            return f"{e['id']} est vaincu !"
        return f"{e['id']} : {e['pv']}/{e['pv_max']} PV"

    def _blesser_joueur(self, degats: int, critique: bool = False) -> str:
        p = self.perso
        m = p["mort"]
        if m["mort"]:
            return f"{p['nom']} est déjà mort."
        if p["pv"] == 0:
            m["stable"] = False
            m["echecs"] += 2 if critique else 1
            if degats >= p["pv_max"] or m["echecs"] >= 3:
                m["mort"] = True
                return f"{p['nom']} succombe à ses blessures… (MORT)"
            return f"{p['nom']} est touché à terre : {m['echecs']} échec(s) contre la mort."
        reste = p["pv"] - degats
        if reste > 0:
            p["pv"] = reste
            return f"{p['nom']} : {p['pv']}/{p['pv_max']} PV"
        if -reste >= p["pv_max"]:
            p["pv"] = 0
            m["mort"] = True
            return f"{p['nom']} est tué sur le coup ! (MORT)"
        if p["race"] == "Demi-orc" and not p.get("endurance_utilisee"):
            p["endurance_utilisee"] = True
            p["pv"] = 1
            return f"Endurance implacable ! {p['nom']} reste debout avec 1 PV."
        p["pv"] = 0
        p["mort"] = {"succes": 0, "echecs": 0, "stable": False, "mort": False}
        if "Rage" in p["conditions"]:
            p["conditions"].remove("Rage")
        return f"{p['nom']} tombe à 0 PV et perd connaissance ! (jets contre la mort nécessaires)"

    def _soigner_joueur(self, soin: int) -> str:
        p = self.perso
        if p["mort"]["mort"]:
            return f"{p['nom']} est mort, les soins ordinaires ne suffisent plus."
        avant = p["pv"]
        p["pv"] = min(p["pv"] + soin, p["pv_max"])
        if avant == 0 and p["pv"] > 0:
            p["mort"] = {"succes": 0, "echecs": 0, "stable": False, "mort": False}
            return f"{p['nom']} reprend connaissance : {p['pv']}/{p['pv_max']} PV"
        return f"{p['nom']} : {p['pv']}/{p['pv_max']} PV"

    def _xp(self, montant: int) -> dict:
        p = self.perso
        p["xp"] += montant
        niveaux = gagner_niveau(p)
        for n in niveaux:
            self._evt(f"🎉 {p['nom']} passe au niveau {n} ! (PV max {p['pv_max']})", "systeme")
        return {"xp_total": p["xp"], "nouveaux_niveaux": niveaux}

    def _verifier_conscient(self):
        p = self.perso
        if p["mort"]["mort"]:
            raise ErreurAction(f"{p['nom']} est mort.")
        if p["pv"] == 0:
            raise ErreurAction(f"{p['nom']} est inconscient (0 PV) et ne peut pas agir. "
                               "Utilisez jet_contre_la_mort à son tour.")

    # ---- actions

    def jet_de_test(self, type: str, nom: str, dd: int | None = None, avantage: bool = False,
                    desavantage: bool = False, raison: str = "") -> dict:
        p = self.perso
        nom = (nom or "").strip()
        if type == "competence":
            comp = next((c for c in srd.COMPETENCES if c.lower() == nom.lower()), None)
            if not comp:
                raise ErreurAction(f"Compétence inconnue : {nom}. Choix : {', '.join(srd.COMPETENCES)}")
            bonus = bonus_competence(p, comp)
            libelle = comp
        elif type in ("caracteristique", "sauvegarde"):
            carac = nom.upper()[:3]
            carac = {"STR": "FOR", "WIS": "SAG"}.get(carac, carac)
            if carac not in srd.CARACS:
                raise ErreurAction(f"Caractéristique inconnue : {nom}. Choix : {', '.join(srd.CARACS)}")
            if type == "sauvegarde":
                bonus = bonus_sauvegarde(p, carac)
                libelle = f"Sauvegarde de {srd.NOMS_CARACS[carac]}"
            else:
                bonus = mod(p["caracs"][carac])
                libelle = srd.NOMS_CARACS[carac]
            if carac == "FOR" and "Rage" in p["conditions"]:
                avantage = True
        else:
            raise ErreurAction("type doit être 'competence', 'caracteristique' ou 'sauvegarde'")
        r = self._d20_joueur(avantage, desavantage)
        total = r["resultat"] + bonus
        res = {"test": libelle, "des": r["des"], "bonus": bonus, "total": total}
        txt = f"{libelle} : {self._des_txt(r)} {signe(bonus)} = {total}"
        if avantage and not desavantage:
            txt += " (avantage)"
        elif desavantage and not avantage:
            txt += " (désavantage)"
        if dd:
            res["dd"] = dd
            res["reussite"] = total >= dd
            txt += f" vs DD {dd} → {'Réussite' if total >= dd else 'Échec'}"
        if r["resultat"] == 20:
            res["naturel"] = 20
        elif r["resultat"] == 1:
            res["naturel"] = 1
        if raison:
            txt += f" — {raison}"
        self._evt(txt)
        return res

    def lancer_des(self, formule: str, raison: str = "") -> dict:
        try:
            r = dice.roll(formule)
        except ValueError as exc:
            raise ErreurAction(str(exc)) from exc
        self._evt(f"{raison or 'Jet'} : {formule} → {r['detail']} = {r['total']}")
        return r

    def commencer_combat(self, ennemis: list, surprise: str = "") -> dict:
        if self.partie["combat"]:
            raise ErreurAction("Un combat est déjà en cours. Terminez-le avec fin_combat.")
        if not ennemis:
            raise ErreurAction("Il faut au moins un ennemi.")
        liste = []
        compteur: dict[str, int] = {}
        for groupe in ennemis:
            modele_nom = groupe.get("modele") or groupe.get("nom")
            modele = next((v for k, v in srd.MONSTRES.items() if k.lower() == (modele_nom or "").lower()), None)
            nom = groupe.get("nom") or modele_nom or "Ennemi"
            nombre = max(1, min(int(groupe.get("nombre", 1) or 1), 12))
            base = dict(modele or {})
            for cle in ("ca", "pv", "attaque", "degats", "arme", "sauvegarde", "dex", "xp"):
                if groupe.get(cle) not in (None, ""):
                    base[cle] = groupe[cle]
            if "ca" not in base or "pv" not in base or "attaque" not in base or "degats" not in base:
                raise ErreurAction(
                    f"« {nom} » n'est pas dans le bestiaire : précisez ca, pv, attaque et degats. "
                    f"Bestiaire : {', '.join(srd.MONSTRES)}")
            for _ in range(nombre):
                compteur[nom] = compteur.get(nom, 0) + 1
                pv = base["pv"]
                pv = dice.roll(pv)["total"] if isinstance(pv, str) else int(pv)
                pv = max(pv, 1)
                liste.append({
                    "nom": nom, "ca": int(base["ca"]), "pv": pv, "pv_max": pv,
                    "attaque": int(base["attaque"]), "degats": str(base["degats"]),
                    "arme": base.get("arme", "attaque"), "sauvegarde": int(base.get("sauvegarde", 0)),
                    "dex": int(base.get("dex", 0)), "xp": int(base.get("xp", 10)), "etat": "actif",
                })
        for e in liste:
            e["id"] = e["nom"] if compteur[e["nom"]] == 1 else None
        numeros: dict[str, int] = {}
        for e in liste:
            if e["id"] is None:
                numeros[e["nom"]] = numeros.get(e["nom"], 0) + 1
                e["id"] = f"{e['nom']} {numeros[e['nom']]}"
        # Initiative
        p = self.perso
        r = self._d20_joueur(avantage=False, desavantage=False)
        init_joueur = r["resultat"] + mod(p["caracs"]["DEX"])
        ordre = [{"nom": p["nom"], "init": init_joueur, "joueur": True}]
        for e in liste:
            ordre.append({"nom": e["id"], "init": dice.d(20) + e["dex"], "joueur": False})
        ordre.sort(key=lambda x: (x["init"], x["joueur"]), reverse=True)
        self.partie["combat"] = {"round": 1, "ennemis": liste, "ordre": ordre, "surprise": surprise}
        self._evt("⚔️ Combat ! Initiative : " + ", ".join(f"{o['nom']} {o['init']}" for o in ordre), "systeme")
        return {
            "ordre_initiative": ordre,
            "ennemis": [{k: e[k] for k in ("id", "ca", "pv", "attaque", "degats", "arme")} for e in liste],
            "surprise": surprise or None,
        }

    def attaque_joueur(self, arme: str, cible: str, avantage: bool = False, desavantage: bool = False,
                       degats_bonus: str = "") -> dict:
        self._verifier_conscient()
        p = self.perso
        a = next((x for x in p["armes"] if x["nom"].lower() == (arme or "").lower()), None)
        if not a:
            a = next((x for x in p["armes"] if (arme or "").lower() in x["nom"].lower()), None)
        if not a:
            if (arme or "").lower() in ("mains nues", "poing", "poings", "coup de poing"):
                a = {"nom": "Mains nues", **srd.ARMES["Mains nues"]}
            else:
                raise ErreurAction(f"Arme « {arme} » absente de la fiche. Armes : "
                                   + ", ".join(x["nom"] for x in p["armes"]))
        e = self._ennemi(cible)
        if e["etat"] == "vaincu":
            raise ErreurAction(f"{e['id']} est déjà vaincu.")
        if e["etat"] == "endormi":
            avantage = True
        bonus = bonus_attaque_arme(p, a)
        r = self._d20_joueur(avantage, desavantage)
        total = r["resultat"] + bonus
        critique = r["resultat"] == 20
        touche = critique or (r["resultat"] != 1 and total >= e["ca"])
        txt = f"Attaque ({a['nom']}) contre {e['id']} : {self._des_txt(r)} {signe(bonus)} = {total} vs CA {e['ca']}"
        res = {"arme": a["nom"], "cible": e["id"], "jet": total, "ca_cible": e["ca"], "touche": touche,
               "critique": critique}
        if not touche:
            txt += " → Raté"
            self._evt(txt)
            return res
        des_formule = a["degats"]
        bonus_deg = bonus_degats_arme(p, a)
        if "Rage" in p["conditions"] and not a.get("distance"):
            bonus_deg += 2
        if degats_bonus:
            des_formule += "+" + degats_bonus.lstrip("+")
        if critique:
            des_formule = _doubler_des(des_formule)
            if p["race"] == "Demi-orc" and not a.get("distance"):
                des_formule += "+" + a["degats"]
        try:
            rd = dice.roll(des_formule)
        except ValueError as exc:
            raise ErreurAction(str(exc)) from exc
        degats = max(rd["total"] + bonus_deg, 1)
        etat = self._blesser_ennemi(e, degats)
        txt += f" → {'CRITIQUE ! ' if critique else 'Touché ! '}Dégâts {des_formule}{signe(bonus_deg)} : " \
               f"{rd['detail']} = {degats} {a['type']}. {etat}"
        self._evt(txt)
        res.update({"degats": degats, "pv_restants": e["pv"], "etat_cible": e["etat"]})
        return res

    def lancer_sort(self, sort: str, cibles: list | None = None, niveau_emplacement: int | None = None) -> dict:
        self._verifier_conscient()
        p = self.perso
        nom = next((s for s in sorts_connus(p) if s.lower() == (sort or "").lower()), None)
        if not nom:
            raise ErreurAction(f"{p['nom']} ne connaît pas le sort « {sort} ». Sorts : "
                               + (", ".join(sorts_connus(p)) or "aucun"))
        s = srd.SORTS[nom]
        niveau = s["niveau"]
        if niveau > 0:
            niveau = max(int(niveau_emplacement or niveau), niveau)
            empl = p["emplacements"].get(str(niveau))
            if not empl:
                raise ErreurAction(f"Aucun emplacement de niveau {niveau}.")
            if empl["restants"] <= 0:
                dispo = [n for n, e in p["emplacements"].items() if e["restants"] > 0 and int(n) >= s["niveau"]]
                raise ErreurAction(f"Plus d'emplacement de niveau {niveau}. "
                                   + (f"Disponibles : niveau {', '.join(dispo)}" if dispo else
                                      "Plus aucun emplacement : un repos long est nécessaire."))
            empl["restants"] -= 1
        sup = niveau - s["niveau"] if s["niveau"] > 0 else 0
        mineur_mult = 1 + (p["niveau"] >= 5) + (p["niveau"] >= 11) if s["niveau"] == 0 else 1

        def formule(base_cle):
            base = s[base_cle]
            f = _multiplier_des(base, mineur_mult) if mineur_mult > 1 else base
            if sup and s.get("par_niveau"):
                f += "+" + _multiplier_des(s["par_niveau"], sup)
            return f

        entete = f"✨ {p['nom']} lance {nom}" + (f" (niveau {niveau})" if niveau else "")
        res = {"sort": nom, "niveau": niveau, "description": s["description"], "resultats": []}
        cibles = [c for c in (cibles or []) if c]
        t = s["type"]
        mod_sort = mod(p["caracs"][srd.CLASSES[p["classe"]].get("lanceur", "CHA")])

        if t == "special":
            if s.get("effet") == "armure_du_mage":
                p["armure_du_mage"] = True
                res["nouvelle_ca"] = ca(p)
            self._evt(f"{entete} : {s['description']}")
        elif t == "soin":
            f = formule("soin")
            r = dice.roll(f)
            bonus = mod_sort + (2 + niveau if p["classe"] == "Clerc" else 0)
            total = max(r["total"] + bonus, 1)
            lignes = []
            for c in cibles or ["joueur"]:
                if c.lower() in ("joueur", "moi", p["nom"].lower()):
                    lignes.append(self._soigner_joueur(total))
                    res["resultats"].append({"cible": p["nom"], "soin": total, "pv": p["pv"]})
                else:
                    lignes.append(f"{c} récupère {total} PV")
                    res["resultats"].append({"cible": c, "soin": total})
            self._evt(f"{entete} : {f}{signe(bonus)} → {r['detail']} = {total} PV. " + " ; ".join(lignes))
        elif t == "sommeil":
            r = dice.roll(formule("degats"))
            reserve = r["total"]
            endormis = []
            if self.partie["combat"]:
                candidats = [e for e in self.partie["combat"]["ennemis"] if e["etat"] == "actif"]
                if cibles:
                    ids = [self._ennemi(c)["id"] for c in cibles]
                    candidats = [e for e in candidats if e["id"] in ids]
                for e in sorted(candidats, key=lambda x: x["pv"]):
                    if e["pv"] <= reserve:
                        reserve -= e["pv"]
                        e["etat"] = "endormi"
                        endormis.append(e["id"])
                    else:
                        break
            res["resultats"] = {"pv_endormis": r["total"], "endormis": endormis}
            self._evt(f"{entete} : {r['detail']} = {r['total']} PV de créatures. Endormis : "
                      + (", ".join(endormis) or "personne"))
        elif t in ("attaque", "auto", "sauvegarde"):
            if not cibles:
                raise ErreurAction("Ce sort nécessite au moins une cible (id d'ennemi).")
            lignes = []
            if t == "attaque":
                nb = s.get("rayons", 1) + (sup if s.get("rayons") else 0)
                bonus = bonus_attaque_sort(p)
                for i in range(nb):
                    e = self._ennemi(cibles[i % len(cibles)])
                    if e["etat"] == "vaincu":
                        lignes.append(f"{e['id']} est déjà vaincu")
                        continue
                    r = self._d20_joueur(avantage=e["etat"] == "endormi")
                    total = r["resultat"] + bonus
                    crit = r["resultat"] == 20
                    if crit or (r["resultat"] != 1 and total >= e["ca"]):
                        f = formule("degats")
                        if crit:
                            f = _doubler_des(f)
                        rd = dice.roll(f)
                        deg = rd["total"] + (mod_sort if s.get("ajoute_mod") else 0)
                        etat = self._blesser_ennemi(e, max(deg, 1))
                        lignes.append(f"{e['id']} : {self._des_txt(r)} {signe(bonus)} = {total} vs CA {e['ca']} → "
                                      f"{'CRITIQUE ! ' if crit else 'Touché ! '}{rd['detail']} = {deg} "
                                      f"{s['degats_type']}. {etat}")
                        res["resultats"].append({"cible": e["id"], "touche": True, "degats": deg, "pv": e["pv"],
                                                 "etat": e["etat"]})
                    else:
                        lignes.append(f"{e['id']} : {self._des_txt(r)} {signe(bonus)} = {total} vs CA {e['ca']} → Raté")
                        res["resultats"].append({"cible": e["id"], "touche": False})
            elif t == "auto":
                nb = s["projectiles"] + sup
                for i in range(nb):
                    e = self._ennemi(cibles[i % len(cibles)])
                    if e["etat"] == "vaincu":
                        continue
                    rd = dice.roll(s["degats"])
                    etat = self._blesser_ennemi(e, rd["total"])
                    lignes.append(f"{e['id']} : {rd['detail']} = {rd['total']} {s['degats_type']}. {etat}")
                    res["resultats"].append({"cible": e["id"], "degats": rd["total"], "pv": e["pv"],
                                             "etat": e["etat"]})
            else:
                dd = dd_sort(p)
                f = formule("degats")
                rd = dice.roll(f)
                for c in cibles:
                    e = self._ennemi(c)
                    if e["etat"] == "vaincu":
                        continue
                    sauv = dice.d(20) + e["sauvegarde"]
                    reussi = sauv >= dd
                    deg = rd["total"] // 2 if reussi and s.get("moitie") else 0 if reussi else rd["total"]
                    etat = self._blesser_ennemi(e, deg) if deg else f"{e['id']} : {e['pv']}/{e['pv_max']} PV"
                    lignes.append(f"{e['id']} sauvegarde {sauv} vs DD {dd} → "
                                  f"{'réussie' if reussi else 'ratée'}, {deg} {s['degats_type']}. {etat}")
                    res["resultats"].append({"cible": e["id"], "sauvegarde_reussie": reussi, "degats": deg,
                                             "pv": e["pv"], "etat": e["etat"]})
            self._evt(f"{entete} — " + " | ".join(lignes))
        if niveau > 0:
            res["emplacements_restants"] = {n: e["restants"] for n, e in p["emplacements"].items()}
        return res

    def attaque_ennemi(self, ennemi: str, cible: str = "joueur", avantage: bool = False,
                       desavantage: bool = False) -> dict:
        e = self._ennemi(ennemi)
        if e["etat"] == "vaincu":
            raise ErreurAction(f"{e['id']} est vaincu et ne peut plus attaquer.")
        if e["etat"] == "endormi":
            raise ErreurAction(f"{e['id']} est endormi magiquement et ne peut pas agir.")
        p = self.perso
        vise_joueur = (cible or "joueur").lower() in ("joueur", p["nom"].lower())
        if vise_joueur and p["pv"] == 0:
            avantage = True
        r = dice.d20(avantage, desavantage)
        total = r["resultat"] + e["attaque"]
        critique = r["resultat"] == 20
        nom_cible = p["nom"] if vise_joueur else cible
        ca_cible = ca(p) if vise_joueur else None
        if vise_joueur:
            touche = critique or (r["resultat"] != 1 and total >= ca_cible)
        else:
            touche = critique or r["resultat"] != 1
        txt = f"{e['id']} attaque {nom_cible} ({e['arme']}) : d20 {r['des']} {signe(e['attaque'])} = {total}"
        if ca_cible is not None:
            txt += f" vs CA {ca_cible}"
        res = {"attaquant": e["id"], "cible": nom_cible, "jet": total, "touche": touche, "critique": critique}
        if not touche:
            self._evt(txt + " → Raté")
            return res
        formule = _doubler_des(e["degats"]) if critique else e["degats"]
        rd = dice.roll(formule)
        degats = max(rd["total"], 1)
        note = ""
        if vise_joueur and "Rage" in p["conditions"]:
            degats = degats // 2
            note = " (réduits de moitié par la Rage)"
        txt += f" → {'CRITIQUE ! ' if critique else 'Touché ! '}{rd['detail']} = {degats} dégâts{note}."
        res["degats"] = degats
        if vise_joueur:
            txt += " " + self._blesser_joueur(degats, critique)
            res.update({"pv_joueur": p["pv"], "etat_joueur": _etat_joueur(p)})
        else:
            txt += " (à appliquer à ce personnage non-joueur)"
        self._evt(txt)
        return res

    def degats_ennemi(self, ennemi: str, formule: str, raison: str = "") -> dict:
        e = self._ennemi(ennemi)
        try:
            rd = dice.roll(str(formule))
        except ValueError as exc:
            raise ErreurAction(str(exc)) from exc
        etat = self._blesser_ennemi(e, max(rd["total"], 0))
        self._evt(f"{raison or 'Dégâts'} sur {e['id']} : {rd['detail']} = {rd['total']}. {etat}")
        return {"cible": e["id"], "degats": rd["total"], "pv": e["pv"], "etat": e["etat"]}

    def changer_etat_ennemi(self, ennemi: str, etat: str) -> dict:
        e = self._ennemi(ennemi)
        if etat not in ("actif", "enfui", "rendu", "vaincu"):
            raise ErreurAction("etat doit être actif, enfui, rendu ou vaincu")
        e["etat"] = etat
        self._evt(f"{e['id']} : {etat}", "systeme")
        return {"ennemi": e["id"], "etat": etat}

    def fin_combat(self, issue: str = "victoire") -> dict:
        combat = self.partie["combat"]
        if not combat:
            raise ErreurAction("Aucun combat en cours.")
        xp = sum(e["xp"] for e in combat["ennemis"]
                 if e["etat"] in ("vaincu", "rendu") or (issue == "victoire" and e["etat"] == "endormi"))
        self.partie["combat"] = None
        p = self.perso
        if "Rage" in p["conditions"]:
            p["conditions"].remove("Rage")
        self._evt(f"Fin du combat ({issue}). +{xp} XP", "systeme")
        res = {"issue": issue, "xp_gagne": xp}
        if xp:
            res.update(self._xp(xp))
        return res

    def modifier_pv_joueur(self, type: str, formule: str, raison: str = "") -> dict:
        try:
            rd = dice.roll(str(formule))
        except ValueError as exc:
            raise ErreurAction(str(exc)) from exc
        montant = max(rd["total"], 0)
        if type == "soin":
            etat = self._soigner_joueur(montant)
        elif type == "degats":
            etat = self._blesser_joueur(montant)
        else:
            raise ErreurAction("type doit être 'degats' ou 'soin'")
        self._evt(f"{raison or type.capitalize()} : {rd['detail']} = {montant} "
                  f"{'PV soignés' if type == 'soin' else 'dégâts'}. {etat}")
        return {"montant": montant, "pv": self.perso["pv"], "pv_max": self.perso["pv_max"],
                "etat_joueur": _etat_joueur(self.perso)}

    def jet_contre_la_mort(self) -> dict:
        p = self.perso
        m = p["mort"]
        if p["pv"] > 0:
            raise ErreurAction(f"{p['nom']} n'est pas à 0 PV.")
        if m["mort"] or m["stable"]:
            raise ErreurAction(f"{p['nom']} est {'mort' if m['mort'] else 'stabilisé'}.")
        r = self._d20_joueur()
        v = r["resultat"]
        if v == 20:
            p["pv"] = 1
            p["mort"] = {"succes": 0, "echecs": 0, "stable": False, "mort": False}
            txt = "20 naturel ! Reprend connaissance avec 1 PV."
        elif v == 1:
            m["echecs"] += 2
            txt = "1 naturel : deux échecs."
        elif v >= 10:
            m["succes"] += 1
            txt = "Succès."
        else:
            m["echecs"] += 1
            txt = "Échec."
        if m["echecs"] >= 3:
            m["mort"] = True
            txt += f" {p['nom']} est MORT."
        elif m["succes"] >= 3:
            m["stable"] = True
            txt += f" {p['nom']} est stabilisé (inconscient, 0 PV)."
        self._evt(f"Jet contre la mort : {self._des_txt(r)} → {txt} ({m['succes']} succès / {m['echecs']} échecs)")
        return {"de": v, "succes": m["succes"], "echecs": m["echecs"], "etat_joueur": _etat_joueur(p)}

    def utiliser_capacite(self, nom: str) -> dict:
        self._verifier_conscient()
        p = self.perso
        cap = next((c for c in p["capacites"] if c["nom"].lower() == (nom or "").lower()), None)
        if not cap:
            raise ErreurAction("Capacité inconnue. Capacités : " + ", ".join(c["nom"] for c in p["capacites"]))
        if cap.get("utilisations_max") is None:
            return {"capacite": cap["nom"], "description": cap["description"],
                    "note": "Capacité passive ou sans limite d'utilisation."}
        if cap["utilisations"] <= 0:
            raise ErreurAction(f"{cap['nom']} n'a plus d'utilisation (recharge : repos {cap['recharge']}).")
        cap["utilisations"] -= 1
        res = {"capacite": cap["nom"], "utilisations_restantes": cap["utilisations"]}
        if cap.get("effet") == "second_souffle":
            rd = dice.roll(f"1d10+{p['niveau']}")
            etat = self._soigner_joueur(rd["total"])
            self._evt(f"Second souffle : {rd['detail']} = {rd['total']} PV. {etat}")
            res["soin"] = rd["total"]
        elif cap.get("effet") == "rage":
            if "Rage" not in p["conditions"]:
                p["conditions"].append("Rage")
            self._evt(f"🔥 {p['nom']} entre en Rage !")
        else:
            self._evt(f"{p['nom']} utilise {cap['nom']}.")
        return res

    def gerer_inventaire(self, action: str, objet: str, quantite: int = 1) -> dict:
        p = self.perso
        quantite = max(int(quantite or 1), 1)
        objet = (objet or "").strip()
        if not objet:
            raise ErreurAction("Nom d'objet manquant.")
        existant = next((o for o in p["inventaire"] if o["nom"].lower() == objet.lower()), None)
        if action == "ajouter":
            if existant:
                existant["quantite"] += quantite
            else:
                p["inventaire"].append({"nom": objet, "quantite": quantite})
            arme = next((v for k, v in srd.ARMES.items() if k.lower() == objet.lower()), None)
            if arme and not any(a["nom"].lower() == objet.lower() for a in p["armes"]):
                nom_arme = next(k for k in srd.ARMES if k.lower() == objet.lower())
                p["armes"].append({"nom": nom_arme, **arme})
            self._evt(f"🎒 Obtenu : {objet}" + (f" x{quantite}" if quantite > 1 else ""), "systeme")
        elif action == "retirer":
            if not existant:
                arme = next((a for a in p["armes"] if a["nom"].lower() == objet.lower()), None)
                if arme:
                    p["armes"].remove(arme)
                    self._evt(f"🎒 Perdu : {objet}", "systeme")
                    return {"inventaire": p["inventaire"]}
                raise ErreurAction(f"« {objet} » n'est pas dans l'inventaire.")
            existant["quantite"] -= quantite
            if existant["quantite"] <= 0:
                p["inventaire"].remove(existant)
            self._evt(f"🎒 Retiré : {objet}" + (f" x{quantite}" if quantite > 1 else ""), "systeme")
        else:
            raise ErreurAction("action doit être 'ajouter' ou 'retirer'")
        return {"inventaire": p["inventaire"]}

    def modifier_or(self, montant: int, raison: str = "") -> dict:
        p = self.perso
        montant = int(montant)
        if p["or"] + montant < 0:
            raise ErreurAction(f"{p['nom']} n'a que {p['or']} po.")
        p["or"] += montant
        self._evt(f"💰 {signe(montant)} po ({raison or 'or'}) → {p['or']} po", "systeme")
        return {"or": p["or"]}

    def donner_xp(self, montant: int, raison: str = "") -> dict:
        montant = max(int(montant), 0)
        self._evt(f"⭐ +{montant} XP" + (f" ({raison})" if raison else ""), "systeme")
        return self._xp(montant)

    def repos(self, type: str) -> dict:
        p = self.perso
        if self.partie["combat"]:
            raise ErreurAction("Impossible de se reposer pendant un combat.")
        if p["mort"]["mort"]:
            raise ErreurAction(f"{p['nom']} est mort.")
        if type == "court":
            soin_total = 0
            dv = p["des_de_vie"]
            details = []
            while dv["restants"] > 0 and p["pv_max"] - p["pv"] >= dv["faces"] // 2 + 1:
                dv["restants"] -= 1
                rd = dice.roll(f"1d{dv['faces']}")
                gain = max(rd["total"] + mod(p["caracs"]["CON"]), 1)
                details.append(str(gain))
                soin_total += gain
                p["pv"] = min(p["pv"] + gain, p["pv_max"])
            if p["pv"] > 0:
                p["mort"] = {"succes": 0, "echecs": 0, "stable": False, "mort": False}
            for c in p["capacites"]:
                if c.get("recharge") == "court":
                    c["utilisations"] = c["utilisations_max"]
            if p["classe"] == "Magicien" and not p.get("restauration_utilisee") and "1" in p["emplacements"]:
                e = p["emplacements"]["1"]
                if e["restants"] < e["max"]:
                    e["restants"] += 1
                    p["restauration_utilisee"] = True
                    details.append("Restauration arcanique : +1 emplacement niv.1")
            self._evt(f"🏕️ Repos court : +{soin_total} PV " + (f"({', '.join(details)})" if details else "")
                      + f" → {p['pv']}/{p['pv_max']} PV", "systeme")
        elif type == "long":
            p["pv"] = p["pv_max"]
            p["mort"] = {"succes": 0, "echecs": 0, "stable": False, "mort": False}
            dv = p["des_de_vie"]
            dv["restants"] = min(dv["restants"] + max(p["niveau"] // 2, 1), p["niveau"])
            for e in p["emplacements"].values():
                e["restants"] = e["max"]
            for c in p["capacites"]:
                if c.get("utilisations_max") is not None:
                    c["utilisations"] = c["utilisations_max"]
            p["endurance_utilisee"] = False
            p["restauration_utilisee"] = False
            p["conditions"] = [c for c in p["conditions"] if c != "Rage"]
            self._evt(f"🌙 Repos long : PV, sorts et capacités restaurés ({p['pv']}/{p['pv_max']} PV)", "systeme")
        else:
            raise ErreurAction("type doit être 'court' ou 'long'")
        return {"pv": p["pv"], "pv_max": p["pv_max"], "emplacements": p["emplacements"],
                "des_de_vie_restants": p["des_de_vie"]["restants"]}

    def modifier_condition(self, action: str, condition: str) -> dict:
        p = self.perso
        condition = (condition or "").strip()
        if action == "ajouter":
            if condition and condition not in p["conditions"]:
                p["conditions"].append(condition)
        elif action == "retirer":
            p["conditions"] = [c for c in p["conditions"] if c.lower() != condition.lower()]
        else:
            raise ErreurAction("action doit être 'ajouter' ou 'retirer'")
        self._evt(f"{'➕' if action == 'ajouter' else '➖'} Condition : {condition}", "systeme")
        return {"conditions": p["conditions"]}

    def noter_journal(self, note: str) -> dict:
        note = (note or "").strip()
        if note:
            self.partie["journal"].append(note)
            self.partie["journal"] = self.partie["journal"][-60:]
        return {"ok": True, "nombre_notes": len(self.partie["journal"])}

    # ---- répartiteur

    def executer(self, nom: str, arguments: dict) -> dict:
        fonction = OUTILS_AUTORISES.get(nom)
        if not fonction:
            return {"erreur": f"Outil inconnu : {nom}"}
        try:
            return getattr(self, fonction)(**arguments)
        except ErreurAction as exc:
            return {"erreur": str(exc)}
        except (TypeError, ValueError, KeyError) as exc:
            return {"erreur": f"Arguments invalides pour {nom} : {exc}"}


OUTILS_AUTORISES = {n: n for n in (
    "jet_de_test", "lancer_des", "commencer_combat", "attaque_joueur", "lancer_sort", "attaque_ennemi",
    "degats_ennemi", "changer_etat_ennemi", "fin_combat", "modifier_pv_joueur", "jet_contre_la_mort",
    "utiliser_capacite", "gerer_inventaire", "modifier_or", "donner_xp", "repos", "modifier_condition",
    "noter_journal",
)}


def _etat_joueur(p: dict) -> str:
    if p["mort"]["mort"]:
        return "mort"
    if p["pv"] == 0:
        return "stabilisé" if p["mort"]["stable"] else "inconscient"
    return "conscient"


def _doubler_des(formule: str) -> str:
    """Coup critique : double le nombre de dés (2d6+3 -> 4d6+3)."""
    return re.sub(r"(\d*)d(\d+)", lambda m: f"{int(m.group(1) or 1) * 2}d{m.group(2)}", formule)


def _multiplier_des(formule: str, n: int) -> str:
    return re.sub(r"(\d*)d(\d+)", lambda m: f"{int(m.group(1) or 1) * n}d{m.group(2)}", formule)
