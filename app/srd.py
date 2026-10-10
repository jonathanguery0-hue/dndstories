"""Données de règles issues du SRD 5.1 (Creative Commons BY 4.0), traduites et simplifiées.

Ce fichier ne contient que du contenu du System Reference Document 5.1
publié par Wizards of the Coast sous licence CC-BY-4.0 (voir LICENCE-SRD.md).
"""

CARACS = ["FOR", "DEX", "CON", "INT", "SAG", "CHA"]

NOMS_CARACS = {
    "FOR": "Force",
    "DEX": "Dextérité",
    "CON": "Constitution",
    "INT": "Intelligence",
    "SAG": "Sagesse",
    "CHA": "Charisme",
}

COMPETENCES = {
    "Acrobaties": "DEX",
    "Arcanes": "INT",
    "Athlétisme": "FOR",
    "Discrétion": "DEX",
    "Dressage": "SAG",
    "Escamotage": "DEX",
    "Histoire": "INT",
    "Intimidation": "CHA",
    "Intuition": "SAG",
    "Investigation": "INT",
    "Médecine": "SAG",
    "Nature": "INT",
    "Perception": "SAG",
    "Persuasion": "CHA",
    "Religion": "INT",
    "Représentation": "CHA",
    "Survie": "SAG",
    "Tromperie": "CHA",
}

TABLEAU_STANDARD = [15, 14, 13, 12, 10, 8]

# Paliers d'expérience pour atteindre chaque niveau.
PALIERS_XP = {1: 0, 2: 300, 3: 900, 4: 2700, 5: 6500, 6: 14000, 7: 23000, 8: 34000, 9: 48000, 10: 64000}

RACES = {
    "Humain": {
        "bonus": {c: 1 for c in CARACS},
        "vitesse": 9,
        "traits": ["Polyvalent : +1 à toutes les caractéristiques."],
    },
    "Nain des collines": {
        "bonus": {"CON": 2, "SAG": 1},
        "vitesse": 7.5,
        "pv_par_niveau": 1,
        "traits": [
            "Vision dans le noir (18 m).",
            "Résilience naine : avantage aux sauvegardes contre le poison, résistance aux dégâts de poison.",
            "Ténacité naine : +1 PV maximum par niveau.",
        ],
    },
    "Haut-elfe": {
        "bonus": {"DEX": 2, "INT": 1},
        "vitesse": 9,
        "competences": ["Perception"],
        "traits": [
            "Vision dans le noir (18 m).",
            "Ascendance féerique : avantage contre le charme, immunisé au sommeil magique.",
            "Transe : 4 heures de méditation remplacent le sommeil.",
        ],
    },
    "Halfelin pied-léger": {
        "bonus": {"DEX": 2, "CHA": 1},
        "vitesse": 7.5,
        "traits": [
            "Chanceux : sur un 1 naturel au d20, relancez le dé.",
            "Brave : avantage aux sauvegardes contre la terreur.",
            "Discrétion naturelle : peut se cacher derrière une créature plus grande.",
        ],
    },
    "Drakéide": {
        "bonus": {"FOR": 2, "CHA": 1},
        "vitesse": 9,
        "traits": [
            "Ascendance draconique (feu) : résistance aux dégâts de feu.",
            "Souffle : cône de feu de 4,5 m, 2d6 dégâts (sauvegarde de DEX), une fois par repos court.",
        ],
    },
    "Gnome des roches": {
        "bonus": {"INT": 2, "CON": 1},
        "vitesse": 7.5,
        "traits": [
            "Vision dans le noir (18 m).",
            "Ruse gnome : avantage aux sauvegardes d'INT, SAG et CHA contre la magie.",
            "Bricoleur : peut fabriquer de petits mécanismes.",
        ],
    },
    "Demi-elfe": {
        "bonus": {"CHA": 2},
        "bonus_libres": 2,
        "vitesse": 9,
        "traits": [
            "Vision dans le noir (18 m).",
            "Ascendance féerique : avantage contre le charme, immunisé au sommeil magique.",
            "Polyvalence : +1 à deux autres caractéristiques (vos deux meilleures).",
        ],
    },
    "Demi-orc": {
        "bonus": {"FOR": 2, "CON": 1},
        "vitesse": 9,
        "competences": ["Intimidation"],
        "traits": [
            "Vision dans le noir (18 m).",
            "Endurance implacable : une fois par repos long, tombé à 0 PV, vous restez à 1 PV.",
            "Attaques sauvages : sur un coup critique, ajoutez un dé de dégâts.",
        ],
    },
    "Tieffelin": {
        "bonus": {"CHA": 2, "INT": 1},
        "vitesse": 9,
        "traits": [
            "Vision dans le noir (18 m).",
            "Résistance infernale : résistance aux dégâts de feu.",
            "Héritage infernal : connaît le sort mineur Thaumaturgie.",
        ],
    },
}

ARMES = {
    "Épée longue": {"degats": "1d8", "type": "tranchant", "carac": "FOR"},
    "Épée courte": {"degats": "1d6", "type": "perforant", "carac": "FINESSE"},
    "Rapière": {"degats": "1d8", "type": "perforant", "carac": "FINESSE"},
    "Dague": {"degats": "1d4", "type": "perforant", "carac": "FINESSE"},
    "Hache à deux mains": {"degats": "1d12", "type": "tranchant", "carac": "FOR"},
    "Hachette": {"degats": "1d6", "type": "tranchant", "carac": "FOR"},
    "Masse d'armes": {"degats": "1d6", "type": "contondant", "carac": "FOR"},
    "Bâton": {"degats": "1d6", "type": "contondant", "carac": "FOR"},
    "Arc court": {"degats": "1d6", "type": "perforant", "carac": "DEX", "distance": True},
    "Arc long": {"degats": "1d8", "type": "perforant", "carac": "DEX", "distance": True},
    "Arbalète légère": {"degats": "1d8", "type": "perforant", "carac": "DEX", "distance": True},
    "Mains nues": {"degats": "1", "type": "contondant", "carac": "FOR"},
}

# Armure : (base, ajoute DEX, plafond DEX)
ARMURES = {
    "Aucune": (10, True, None),
    "Armure de cuir": (11, True, None),
    "Armure d'écailles": (14, True, 2),
    "Cotte de mailles": (16, False, None),
}

CLASSES = {
    "Guerrier": {
        "de_vie": 10,
        "sauvegardes": ["FOR", "CON"],
        "nb_competences": 2,
        "competences": ["Acrobaties", "Dressage", "Athlétisme", "Histoire", "Intuition",
                        "Intimidation", "Perception", "Survie"],
        "armure": "Cotte de mailles",
        "bouclier": True,
        "armes": ["Épée longue", "Arbalète légère"],
        "inventaire": ["Sac d'aventurier", "Rations (5 jours)", "Corde en chanvre (15 m)",
                       "Torches (5)", "Carreaux d'arbalète (20)"],
        "or": 10,
        "capacites": [
            {"nom": "Second souffle", "description": "Action bonus : récupère 1d10 + niveau PV.",
             "utilisations_max": 1, "recharge": "court", "effet": "second_souffle"},
            {"nom": "Style de combat : Défense", "description": "+1 à la CA en armure (inclus)."},
        ],
        "description": "Maître des armes et des armures, solide en première ligne.",
        "conseil": ["FOR", "CON", "DEX", "SAG", "CHA", "INT"],
    },
    "Barbare": {
        "de_vie": 12,
        "sauvegardes": ["FOR", "CON"],
        "nb_competences": 2,
        "competences": ["Dressage", "Athlétisme", "Intimidation", "Nature", "Perception", "Survie"],
        "armure": "Défense sans armure",
        "bouclier": False,
        "armes": ["Hache à deux mains", "Hachette"],
        "inventaire": ["Sac d'explorateur", "Rations (5 jours)", "Hachettes de lancer (2)",
                       "Javelines (4)"],
        "or": 10,
        "capacites": [
            {"nom": "Rage", "description": "Action bonus, 1 minute : +2 aux dégâts au corps à corps, "
             "résistance aux dégâts contondants/perforants/tranchants, avantage aux tests de FOR.",
             "utilisations_max": 2, "recharge": "long", "effet": "rage"},
            {"nom": "Défense sans armure", "description": "CA = 10 + DEX + CON (incluse)."},
        ],
        "description": "Guerrier sauvage porté par une rage dévastatrice.",
        "conseil": ["FOR", "CON", "DEX", "SAG", "CHA", "INT"],
    },
    "Roublard": {
        "de_vie": 8,
        "sauvegardes": ["DEX", "INT"],
        "nb_competences": 4,
        "competences": ["Acrobaties", "Athlétisme", "Tromperie", "Intuition", "Intimidation",
                        "Investigation", "Perception", "Représentation", "Persuasion",
                        "Escamotage", "Discrétion"],
        "armure": "Armure de cuir",
        "bouclier": False,
        "armes": ["Rapière", "Arc court", "Dague"],
        "inventaire": ["Sac de cambrioleur", "Outils de voleur", "Flèches (20)", "Rations (3 jours)"],
        "or": 15,
        "capacites": [
            {"nom": "Attaque sournoise", "description": "Une fois par tour, +1d6 dégâts (par tranche de "
             "2 niveaux) si vous avez l'avantage ou un allié près de la cible, avec une arme de "
             "finesse ou à distance."},
            {"nom": "Jargon des voleurs", "description": "Langage secret des voleurs."},
        ],
        "description": "Agile et rusé, spécialiste de la discrétion et des coups précis.",
        "conseil": ["DEX", "CON", "INT", "SAG", "CHA", "FOR"],
    },
    "Rôdeur": {
        "de_vie": 10,
        "sauvegardes": ["FOR", "DEX"],
        "nb_competences": 3,
        "competences": ["Dressage", "Athlétisme", "Intuition", "Investigation", "Nature",
                        "Perception", "Discrétion", "Survie"],
        "armure": "Armure d'écailles",
        "bouclier": False,
        "armes": ["Arc long", "Épée courte"],
        "inventaire": ["Sac d'explorateur", "Flèches (20)", "Rations (5 jours)",
                       "Corde en chanvre (15 m)"],
        "or": 10,
        "capacites": [
            {"nom": "Ennemi juré", "description": "Avantage pour pister et se souvenir d'informations "
             "sur un type de créature choisi."},
            {"nom": "Explorateur-né", "description": "Expert des terrains sauvages : ne se perd pas, "
             "voyage discrètement à vitesse normale."},
        ],
        "description": "Chasseur et pisteur des terres sauvages.",
        "conseil": ["DEX", "SAG", "CON", "FOR", "INT", "CHA"],
    },
    "Clerc": {
        "de_vie": 8,
        "sauvegardes": ["SAG", "CHA"],
        "nb_competences": 2,
        "competences": ["Histoire", "Intuition", "Médecine", "Persuasion", "Religion"],
        "armure": "Armure d'écailles",
        "bouclier": True,
        "armes": ["Masse d'armes", "Arbalète légère"],
        "inventaire": ["Sac d'ecclésiastique", "Symbole sacré", "Carreaux d'arbalète (20)",
                       "Rations (3 jours)"],
        "or": 15,
        "lanceur": "SAG",
        "capacites": [
            {"nom": "Domaine de la Vie", "description": "Disciple de la Vie : vos sorts de soins "
             "rendent 2 + niveau du sort PV supplémentaires (inclus)."},
        ],
        "description": "Serviteur d'une divinité, guérisseur et protecteur.",
        "conseil": ["SAG", "CON", "FOR", "CHA", "DEX", "INT"],
    },
    "Magicien": {
        "de_vie": 6,
        "sauvegardes": ["INT", "SAG"],
        "nb_competences": 2,
        "competences": ["Arcanes", "Histoire", "Intuition", "Investigation", "Médecine", "Religion"],
        "armure": "Aucune",
        "bouclier": False,
        "armes": ["Bâton", "Dague"],
        "inventaire": ["Grimoire", "Sacoche à composantes", "Sac d'érudit", "Rations (3 jours)"],
        "or": 10,
        "lanceur": "INT",
        "capacites": [
            {"nom": "Restauration arcanique", "description": "Une fois par jour, lors d'un repos court, "
             "récupère un emplacement de sort de niveau 1."},
        ],
        "description": "Érudit des arcanes, puissant mais fragile.",
        "conseil": ["INT", "CON", "DEX", "SAG", "CHA", "FOR"],
    },
}

# Emplacements de sorts des lanceurs complets selon le niveau du personnage.
EMPLACEMENTS = {
    1: {1: 2}, 2: {1: 3}, 3: {1: 4, 2: 2}, 4: {1: 4, 2: 3}, 5: {1: 4, 2: 3, 3: 2},
    6: {1: 4, 2: 3, 3: 3}, 7: {1: 4, 2: 3, 3: 3, 4: 1}, 8: {1: 4, 2: 3, 3: 3, 4: 2},
    9: {1: 4, 2: 3, 3: 3, 4: 3, 5: 1}, 10: {1: 4, 2: 3, 3: 3, 4: 3, 5: 2},
}

# type : "attaque" (jet d'attaque de sort), "sauvegarde" (la cible sauvegarde),
# "auto" (touche automatiquement), "soin", "sommeil", "special" (effet raconté par le MJ).
SORTS = {
    # Sorts mineurs (niveau 0)
    "Trait de feu": {"niveau": 0, "classes": ["Magicien"], "type": "attaque", "degats": "1d10",
                     "degats_type": "feu", "description": "Projette un trait de feu (36 m)."},
    "Rayon de givre": {"niveau": 0, "classes": ["Magicien"], "type": "attaque", "degats": "1d8",
                       "degats_type": "froid", "description": "Rayon glacé, la cible perd 3 m de vitesse."},
    "Lumière": {"niveau": 0, "classes": ["Magicien", "Clerc"], "type": "special",
                "description": "Un objet émet une vive lumière pendant 1 heure."},
    "Prestidigitation": {"niveau": 0, "classes": ["Magicien"], "type": "special",
                         "description": "Petits tours de magie : étincelles, nettoyer, réchauffer, odeur…"},
    "Main du mage": {"niveau": 0, "classes": ["Magicien"], "type": "special",
                     "description": "Une main spectrale manipule un objet à 9 m (5 kg max)."},
    "Flamme sacrée": {"niveau": 0, "classes": ["Clerc"], "type": "sauvegarde", "sauvegarde": "DEX",
                      "degats": "1d8", "degats_type": "radiant", "moitie": False,
                      "description": "Une flamme radieuse frappe une créature (18 m)."},
    "Thaumaturgie": {"niveau": 0, "classes": ["Clerc"], "type": "special",
                     "description": "Manifestation mineure : voix tonitruante, flammes qui vacillent, tremblements…"},
    "Assistance": {"niveau": 0, "classes": ["Clerc"], "type": "special",
                   "description": "Un allié touché ajoute 1d4 à un test de caractéristique."},
    # Niveau 1
    "Projectile magique": {"niveau": 1, "classes": ["Magicien"], "type": "auto", "projectiles": 3,
                           "degats": "1d4+1", "degats_type": "force",
                           "description": "Trois fléchettes de force touchent automatiquement (+1 par niveau supérieur)."},
    "Armure du mage": {"niveau": 1, "classes": ["Magicien"], "type": "special", "effet": "armure_du_mage",
                       "description": "CA = 13 + DEX pendant 8 heures."},
    "Sommeil": {"niveau": 1, "classes": ["Magicien"], "type": "sommeil", "degats": "5d8", "par_niveau": "2d8",
                "description": "Endort les créatures en commençant par celles qui ont le moins de PV."},
    "Bouclier": {"niveau": 1, "classes": ["Magicien"], "type": "special",
                 "description": "Réaction : +5 à la CA jusqu'au prochain tour."},
    "Mains brûlantes": {"niveau": 1, "classes": ["Magicien"], "type": "sauvegarde", "sauvegarde": "DEX",
                        "degats": "3d6", "par_niveau": "1d6", "degats_type": "feu", "moitie": True,
                        "description": "Cône de flammes de 4,5 m (plusieurs cibles possibles)."},
    "Détection de la magie": {"niveau": 1, "classes": ["Magicien", "Clerc"], "type": "special",
                              "description": "Perçoit la magie à 9 m pendant 10 minutes."},
    "Soins": {"niveau": 1, "classes": ["Clerc"], "type": "soin", "soin": "1d8", "par_niveau": "1d8",
              "description": "Une créature touchée récupère des PV."},
    "Mot de guérison": {"niveau": 1, "classes": ["Clerc"], "type": "soin", "soin": "1d4", "par_niveau": "1d4",
                        "description": "Action bonus, à distance (18 m) : une créature récupère des PV."},
    "Bénédiction": {"niveau": 1, "classes": ["Clerc"], "type": "special",
                    "description": "Jusqu'à 3 créatures ajoutent 1d4 à leurs attaques et sauvegardes (1 minute)."},
    "Éclair traçant": {"niveau": 1, "classes": ["Clerc"], "type": "attaque", "degats": "4d6",
                       "par_niveau": "1d6", "degats_type": "radiant",
                       "description": "Trait de lumière ; la prochaine attaque contre la cible a l'avantage."},
    # Niveau 2
    "Rayon ardent": {"niveau": 2, "classes": ["Magicien"], "type": "attaque", "degats": "2d6",
                     "degats_type": "feu", "rayons": 3,
                     "description": "Trois rayons de feu, chacun avec son propre jet d'attaque."},
    "Pas brumeux": {"niveau": 2, "classes": ["Magicien"], "type": "special",
                    "description": "Action bonus : téléportation jusqu'à 9 m."},
    "Toile d'araignée": {"niveau": 2, "classes": ["Magicien"], "type": "special",
                         "description": "Toiles collantes (cube de 6 m), sauvegarde de DEX ou entravé."},
    "Arme spirituelle": {"niveau": 2, "classes": ["Clerc"], "type": "attaque", "degats": "1d8",
                         "ajoute_mod": True, "degats_type": "force",
                         "description": "Une arme spectrale frappe à 18 m (action bonus les tours suivants)."},
    "Prière de guérison": {"niveau": 2, "classes": ["Clerc"], "type": "soin", "soin": "2d8", "par_niveau": "1d8",
                           "description": "Jusqu'à 6 créatures récupèrent des PV (10 minutes d'incantation)."},
}

# Petit bestiaire (SRD 5.1). ca, pv (formule), attaque (bonus), degats, sauvegarde (bonus moyen), xp.
MONSTRES = {
    "Gobelin": {"ca": 15, "pv": "2d6", "attaque": 4, "degats": "1d6+2", "arme": "cimeterre",
                "dex": 2, "sauvegarde": 1, "xp": 50},
    "Kobold": {"ca": 12, "pv": "2d6-2", "attaque": 4, "degats": "1d4+2", "arme": "dague",
               "dex": 2, "sauvegarde": 1, "xp": 25},
    "Loup": {"ca": 13, "pv": "2d8+2", "attaque": 4, "degats": "2d4+2", "arme": "morsure",
             "dex": 2, "sauvegarde": 1, "xp": 50},
    "Rat géant": {"ca": 12, "pv": "2d6", "attaque": 4, "degats": "1d4+2", "arme": "morsure",
                  "dex": 2, "sauvegarde": 0, "xp": 25},
    "Squelette": {"ca": 13, "pv": "2d8+4", "attaque": 4, "degats": "1d6+2", "arme": "épée courte",
                  "dex": 2, "sauvegarde": 1, "xp": 50},
    "Zombie": {"ca": 8, "pv": "3d8+9", "attaque": 3, "degats": "1d6+1", "arme": "coup",
               "dex": -2, "sauvegarde": 1, "xp": 50},
    "Bandit": {"ca": 12, "pv": "2d8+2", "attaque": 3, "degats": "1d6+1", "arme": "cimeterre",
               "dex": 1, "sauvegarde": 1, "xp": 25},
    "Orc": {"ca": 13, "pv": "2d8+6", "attaque": 5, "degats": "1d12+3", "arme": "hache à deux mains",
            "dex": 1, "sauvegarde": 2, "xp": 100},
    "Hobgobelin": {"ca": 18, "pv": "2d8+2", "attaque": 3, "degats": "1d8+1", "arme": "épée longue",
                   "dex": 1, "sauvegarde": 1, "xp": 100},
    "Gnoll": {"ca": 15, "pv": "5d8", "attaque": 4, "degats": "1d8+2", "arme": "lance",
              "dex": 1, "sauvegarde": 1, "xp": 100},
    "Goule": {"ca": 12, "pv": "5d8", "attaque": 4, "degats": "2d6+2", "arme": "griffes (paralysantes)",
              "dex": 2, "sauvegarde": 1, "xp": 200},
    "Araignée géante": {"ca": 14, "pv": "4d10+4", "attaque": 5, "degats": "1d8+3", "arme": "morsure venimeuse",
                        "dex": 3, "sauvegarde": 2, "xp": 200},
    "Gobelours": {"ca": 16, "pv": "5d8+5", "attaque": 4, "degats": "2d8+2", "arme": "morgenstern",
                  "dex": 2, "sauvegarde": 1, "xp": 200},
    "Ogre": {"ca": 11, "pv": "7d10+21", "attaque": 6, "degats": "2d8+4", "arme": "massue",
             "dex": -1, "sauvegarde": 2, "xp": 450},
}
