import json
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app import config, dice, main, mj, moteur
from app.moteur import Moteur
from app.personnage import ca, creer_personnage, gagner_niveau, vue_fiche

CARACS = {"FOR": 15, "DEX": 14, "CON": 13, "INT": 8, "SAG": 12, "CHA": 10}


@pytest.fixture(autouse=True)
def isolement(tmp_path, monkeypatch):
    monkeypatch.setattr(moteur, "DOSSIER_SAUVEGARDES", tmp_path / "sauvegardes")
    monkeypatch.setattr(config, "FICHIER", tmp_path / "config.json")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    dice.set_seed(42)


def guerrier():
    return creer_personnage("Brann", "Nain des collines", "Guerrier", CARACS, ["Athlétisme", "Perception"])


def magicien():
    caracs = {"FOR": 8, "DEX": 14, "CON": 13, "INT": 15, "SAG": 12, "CHA": 10}
    return creer_personnage("Ilsa", "Haut-elfe", "Magicien", caracs, ["Arcanes", "Histoire"])


# ------------------------------------------------------------------ dés

def test_formules_de_des():
    for _ in range(200):
        r = dice.roll("2d6+3")
        assert 5 <= r["total"] <= 15
        assert 3 <= dice.roll("4d6kh3")["total"] <= 18
    assert dice.roll("7")["total"] == 7
    assert dice.roll("1d4-1")["total"] <= 3
    for mauvaise in ("", "abc", "2d", "1d6+x", "1000d6"):
        with pytest.raises(ValueError):
            dice.roll(mauvaise)


def test_d20_avantage():
    for _ in range(100):
        r = dice.d20(avantage=True)
        assert r["resultat"] == max(r["des"])
        r = dice.d20(desavantage=True)
        assert r["resultat"] == min(r["des"])


# ------------------------------------------------------------------ personnage

def test_creation_guerrier_nain():
    p = guerrier()
    assert p["caracs"]["CON"] == 15 and p["caracs"]["SAG"] == 13
    assert p["pv_max"] == 10 + 2 + 1  # d10 + CON + ténacité naine
    assert ca(p) == 16 + 2 + 1  # cotte de mailles + bouclier + Défense
    fiche = vue_fiche(p)
    athl = next(c for c in fiche["toutes_competences"] if c["nom"] == "Athlétisme")
    assert athl["bonus"] == 2 + 2


def test_creation_refuse_competences_invalides():
    with pytest.raises(ValueError):
        creer_personnage("X", "Humain", "Guerrier", CARACS, ["Arcanes", "Perception"])
    with pytest.raises(ValueError):
        creer_personnage("", "Humain", "Guerrier", CARACS, ["Athlétisme", "Perception"])


def test_montee_de_niveau():
    p = magicien()
    p["xp"] = 900
    assert gagner_niveau(p) == [2, 3]
    assert p["emplacements"]["2"] == {"max": 2, "restants": 2}
    assert any(s["nom"] == "Rayon ardent" for s in vue_fiche(p)["sorts"])


# ------------------------------------------------------------------ moteur

def test_combat_complet():
    partie = moteur.nouvelle_partie(guerrier(), "brumesaule")
    m = Moteur(partie)
    res = m.commencer_combat([{"nom": "Gobelin", "nombre": 2}])
    assert [e["id"] for e in res["ennemis"]] == ["Gobelin 1", "Gobelin 2"]
    for _ in range(30):
        cible = next((e for e in partie["combat"]["ennemis"] if e["etat"] == "actif"), None)
        if not cible:
            break
        m.attaque_joueur("Épée longue", cible["id"])
    assert all(e["etat"] == "vaincu" for e in partie["combat"]["ennemis"])
    fin = m.fin_combat("victoire")
    assert fin["xp_gagne"] == 100 and partie["personnage"]["xp"] == 100
    assert partie["combat"] is None
    assert m.evenements


def test_attaque_ennemi_et_mort():
    partie = moteur.nouvelle_partie(magicien(), "libre")
    m = Moteur(partie)
    m.commencer_combat([{"nom": "Ogre"}])
    p = partie["personnage"]
    for _ in range(100):
        if p["mort"]["mort"]:
            break
        if p["pv"] == 0:
            r = m.executer("attaque_joueur", {"arme": "Dague", "cible": "Ogre"})
            assert "erreur" in r  # inconscient : ne peut pas agir
            m.jet_contre_la_mort() if not p["mort"]["stable"] else None
        m.executer("attaque_ennemi", {"ennemi": "Ogre"})
    assert p["pv"] == 0


def test_sorts_et_emplacements():
    partie = moteur.nouvelle_partie(magicien(), "libre")
    m = Moteur(partie)
    m.commencer_combat([{"nom": "Kobold", "nombre": 3}])
    r = m.lancer_sort("Projectile magique", ["Kobold 1"])
    assert r["emplacements_restants"]["1"] == 1
    m.lancer_sort("Sommeil", [])
    assert m.executer("lancer_sort", {"sort": "Mains brûlantes", "cibles": ["Kobold 2"]}).get("erreur")
    assert "erreur" in m.executer("lancer_sort", {"sort": "Boule de feu", "cibles": ["Kobold 2"]})
    r = m.lancer_sort("Trait de feu", ["Kobold 3"])  # sort mineur : pas d'emplacement
    assert r["resultats"]
    m.fin_combat("victoire")
    m.repos("long")
    assert partie["personnage"]["emplacements"]["1"]["restants"] == 2


def test_clerc_soigne():
    caracs = {"FOR": 13, "DEX": 10, "CON": 14, "INT": 8, "SAG": 15, "CHA": 12}
    p = creer_personnage("Aube", "Humain", "Clerc", caracs, ["Médecine", "Religion"])
    partie = moteur.nouvelle_partie(p, "libre")
    m = Moteur(partie)
    m.modifier_pv_joueur("degats", "5")
    r = m.lancer_sort("Soins", ["joueur"])
    assert r["resultats"][0]["soin"] >= 1 + 3 + 3  # 1d8 + SAG + Disciple de la Vie
    assert p["pv"] == p["pv_max"]


def test_outils_inventaire_or_xp():
    partie = moteur.nouvelle_partie(guerrier(), "libre")
    m = Moteur(partie)
    m.gerer_inventaire("ajouter", "Potion de soins", 2)
    m.gerer_inventaire("retirer", "Potion de soins")
    assert any(o["nom"] == "Potion de soins" and o["quantite"] == 1 for o in partie["personnage"]["inventaire"])
    assert "erreur" in m.executer("modifier_or", {"montant": -1000})
    m.gerer_inventaire("ajouter", "Rapière")
    assert any(a["nom"] == "Rapière" for a in partie["personnage"]["armes"])
    assert m.donner_xp(300)["nouveaux_niveaux"] == [2]
    assert "erreur" in m.executer("outil_inexistant", {})
    assert "erreur" in m.executer("jet_de_test", {"type": "competence", "nom": "Cuisine"})
    r = m.executer("jet_de_test", {"type": "competence", "nom": "perception", "dd": 10})
    assert "reussite" in r


def test_sauvegarde_et_chargement():
    partie = moteur.nouvelle_partie(guerrier(), "brumesaule")
    moteur.sauvegarder(partie)
    assert moteur.charger(partie["id"])["personnage"]["nom"] == "Brann"
    assert moteur.lister_parties()[0]["id"] == partie["id"]
    with pytest.raises(ValueError):
        moteur.charger("../config")


# ------------------------------------------------------------------ IA maître du jeu (client simulé)

def _appel(nom, args, i=0):
    return SimpleNamespace(id=f"appel{i}", function=SimpleNamespace(name=nom, arguments=json.dumps(args)))


def _reponse(contenu=None, appels=None):
    msg = SimpleNamespace(content=contenu, tool_calls=appels)
    return SimpleNamespace(choices=[SimpleNamespace(message=msg)])


class FauxClient:
    def __init__(self, reponses):
        self.reponses = list(reponses)
        self.requetes = []
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._creer))

    def _creer(self, **params):
        self.requetes.append(params)
        return self.reponses.pop(0)


def test_tour_avec_outils():
    partie = moteur.nouvelle_partie(guerrier(), "brumesaule")
    client = FauxClient([
        _reponse(appels=[_appel("jet_de_test", {"type": "competence", "nom": "Perception", "dd": 12})]),
        _reponse(appels=[_appel("gerer_inventaire", {"action": "ajouter", "objet": "Clé rouillée"}),
                         _appel("noter_journal", {"note": "Margot tient l'auberge"}, 1)]),
        _reponse("Tu remarques une **clé rouillée** sous le comptoir. Que fais-tu ?"),
    ])
    res = mj.jouer_tour(partie, "Je fouille la salle.", client, "modele-test")
    assert "clé rouillée" in res["narration"]
    assert len(res["evenements"]) == 2
    assert partie["journal"] == ["Margot tient l'auberge"]
    assert [m["role"] for m in partie["messages"]] == ["user", "assistant"]
    assert [a["type"] for a in partie["affichage"]] == ["joueur", "de", "systeme", "mj"]
    systeme = client.requetes[0]["messages"][0]["content"]
    assert "Brann" in systeme and "Brumesaule" in systeme
    # Les résultats d'outils sont renvoyés au modèle.
    assert client.requetes[1]["messages"][-1]["role"] == "tool"


def test_erreur_ia_lisible():
    class Echec:
        chat = SimpleNamespace(completions=SimpleNamespace(create=lambda **_: (_ for _ in ()).throw(
            type("AuthenticationError", (Exception,), {})("bad key"))))
    partie = moteur.nouvelle_partie(guerrier(), "libre")
    with pytest.raises(mj.ErreurIA, match="clé API"):
        mj.jouer_tour(partie, "Bonjour", Echec(), "m")


def test_memoire_condensee():
    partie = moteur.nouvelle_partie(guerrier(), "libre")
    partie["messages"] = [{"role": "user" if i % 2 == 0 else "assistant", "content": f"m{i}"} for i in range(42)]
    client = FauxClient([_reponse("Résumé de l'histoire.")])
    assert mj.condenser_memoire(partie, client, "m")
    assert partie["resume"] == "Résumé de l'histoire." and len(partie["messages"]) == 22


# ------------------------------------------------------------------ API web

def test_parcours_api(monkeypatch):
    client_ia = FauxClient([_reponse("Bienvenue à Brumesaule. Que fais-tu ?"),
                            _reponse("Margot te sert une bière.")])
    monkeypatch.setattr(main, "_client", lambda cfg: client_ia)
    web = TestClient(main.app)
    assert web.get("/").status_code == 200
    assert "Guerrier" in web.get("/api/regles").json()["classes"]
    assert web.get("/api/config").json()["configure"] is False
    web.post("/api/config", json={"api_key": "sk-test-1234567890"})
    assert web.get("/api/config").json()["configure"] is True

    r = web.post("/api/parties", json={"nom": "Brann", "race": "Nain des collines", "classe": "Guerrier",
                                       "caracs": CARACS, "competences": ["Athlétisme", "Perception"]})
    assert r.status_code == 200, r.text
    pid = r.json()["id"]
    r = web.post(f"/api/parties/{pid}/tour", json={"texte": ""})
    assert r.status_code == 200 and "Brumesaule" in r.json()["affichage"][-1]["texte"]
    assert web.post(f"/api/parties/{pid}/tour", json={"texte": ""}).status_code == 400
    r = web.post(f"/api/parties/{pid}/tour", json={"texte": "Je commande une bière."})
    assert len(r.json()["affichage"]) == 3
    assert web.get("/api/parties").json()["parties"][0]["nom"] == "Brann"
    assert web.get("/api/parties/zzz").status_code == 404
    assert web.delete(f"/api/parties/{pid}").status_code == 200
