// Données de règles issues du SRD 5.1 (Creative Commons BY 4.0), traduites et simplifiées.
// Voir LICENCE-SRD.md.

export const CARACS = [
  "FOR",
  "DEX",
  "CON",
  "INT",
  "SAG",
  "CHA"
];

export const NOMS_CARACS = {
  "FOR": "Force",
  "DEX": "Dextérité",
  "CON": "Constitution",
  "INT": "Intelligence",
  "SAG": "Sagesse",
  "CHA": "Charisme"
};

export const COMPETENCES = {
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
  "Tromperie": "CHA"
};

export const TABLEAU_STANDARD = [
  15,
  14,
  13,
  12,
  10,
  8
];

export const PALIERS_XP = {
  "1": 0,
  "2": 300,
  "3": 900,
  "4": 2700,
  "5": 6500,
  "6": 14000,
  "7": 23000,
  "8": 34000,
  "9": 48000,
  "10": 64000
};

export const RACES = {
  "Humain": {
    "bonus": {
      "FOR": 1,
      "DEX": 1,
      "CON": 1,
      "INT": 1,
      "SAG": 1,
      "CHA": 1
    },
    "vitesse": 9,
    "traits": [
      "Polyvalent : +1 à toutes les caractéristiques."
    ]
  },
  "Nain des collines": {
    "bonus": {
      "CON": 2,
      "SAG": 1
    },
    "vitesse": 7.5,
    "pv_par_niveau": 1,
    "traits": [
      "Vision dans le noir (18 m).",
      "Résilience naine : avantage aux sauvegardes contre le poison, résistance aux dégâts de poison.",
      "Ténacité naine : +1 PV maximum par niveau."
    ]
  },
  "Haut-elfe": {
    "bonus": {
      "DEX": 2,
      "INT": 1
    },
    "vitesse": 9,
    "competences": [
      "Perception"
    ],
    "traits": [
      "Vision dans le noir (18 m).",
      "Ascendance féerique : avantage contre le charme, immunisé au sommeil magique.",
      "Transe : 4 heures de méditation remplacent le sommeil."
    ]
  },
  "Halfelin pied-léger": {
    "bonus": {
      "DEX": 2,
      "CHA": 1
    },
    "vitesse": 7.5,
    "traits": [
      "Chanceux : sur un 1 naturel au d20, relancez le dé.",
      "Brave : avantage aux sauvegardes contre la terreur.",
      "Discrétion naturelle : peut se cacher derrière une créature plus grande."
    ]
  },
  "Drakéide": {
    "bonus": {
      "FOR": 2,
      "CHA": 1
    },
    "vitesse": 9,
    "traits": [
      "Ascendance draconique (feu) : résistance aux dégâts de feu.",
      "Souffle : cône de feu de 4,5 m, 2d6 dégâts (sauvegarde de DEX), une fois par repos court."
    ]
  },
  "Gnome des roches": {
    "bonus": {
      "INT": 2,
      "CON": 1
    },
    "vitesse": 7.5,
    "traits": [
      "Vision dans le noir (18 m).",
      "Ruse gnome : avantage aux sauvegardes d'INT, SAG et CHA contre la magie.",
      "Bricoleur : peut fabriquer de petits mécanismes."
    ]
  },
  "Demi-elfe": {
    "bonus": {
      "CHA": 2
    },
    "bonus_libres": 2,
    "vitesse": 9,
    "traits": [
      "Vision dans le noir (18 m).",
      "Ascendance féerique : avantage contre le charme, immunisé au sommeil magique.",
      "Polyvalence : +1 à deux autres caractéristiques (vos deux meilleures)."
    ]
  },
  "Demi-orc": {
    "bonus": {
      "FOR": 2,
      "CON": 1
    },
    "vitesse": 9,
    "competences": [
      "Intimidation"
    ],
    "traits": [
      "Vision dans le noir (18 m).",
      "Endurance implacable : une fois par repos long, tombé à 0 PV, vous restez à 1 PV.",
      "Attaques sauvages : sur un coup critique, ajoutez un dé de dégâts."
    ]
  },
  "Tieffelin": {
    "bonus": {
      "CHA": 2,
      "INT": 1
    },
    "vitesse": 9,
    "traits": [
      "Vision dans le noir (18 m).",
      "Résistance infernale : résistance aux dégâts de feu.",
      "Héritage infernal : connaît le sort mineur Thaumaturgie."
    ]
  }
};

export const ARMES = {
  "Épée longue": {
    "degats": "1d8",
    "type": "tranchant",
    "carac": "FOR"
  },
  "Épée courte": {
    "degats": "1d6",
    "type": "perforant",
    "carac": "FINESSE"
  },
  "Rapière": {
    "degats": "1d8",
    "type": "perforant",
    "carac": "FINESSE"
  },
  "Dague": {
    "degats": "1d4",
    "type": "perforant",
    "carac": "FINESSE"
  },
  "Hache à deux mains": {
    "degats": "1d12",
    "type": "tranchant",
    "carac": "FOR"
  },
  "Hachette": {
    "degats": "1d6",
    "type": "tranchant",
    "carac": "FOR"
  },
  "Masse d'armes": {
    "degats": "1d6",
    "type": "contondant",
    "carac": "FOR"
  },
  "Bâton": {
    "degats": "1d6",
    "type": "contondant",
    "carac": "FOR"
  },
  "Arc court": {
    "degats": "1d6",
    "type": "perforant",
    "carac": "DEX",
    "distance": true
  },
  "Arc long": {
    "degats": "1d8",
    "type": "perforant",
    "carac": "DEX",
    "distance": true
  },
  "Arbalète légère": {
    "degats": "1d8",
    "type": "perforant",
    "carac": "DEX",
    "distance": true
  },
  "Mains nues": {
    "degats": "1",
    "type": "contondant",
    "carac": "FOR"
  }
};

export const ARMURES = {
  "Aucune": {
    "base": 10,
    "dex": true,
    "plafond": null
  },
  "Armure de cuir": {
    "base": 11,
    "dex": true,
    "plafond": null
  },
  "Armure d'écailles": {
    "base": 14,
    "dex": true,
    "plafond": 2
  },
  "Cotte de mailles": {
    "base": 16,
    "dex": false,
    "plafond": null
  }
};

export const CLASSES = {
  "Guerrier": {
    "de_vie": 10,
    "sauvegardes": [
      "FOR",
      "CON"
    ],
    "nb_competences": 2,
    "competences": [
      "Acrobaties",
      "Dressage",
      "Athlétisme",
      "Histoire",
      "Intuition",
      "Intimidation",
      "Perception",
      "Survie"
    ],
    "armure": "Cotte de mailles",
    "bouclier": true,
    "armes": [
      "Épée longue",
      "Arbalète légère"
    ],
    "inventaire": [
      "Sac d'aventurier",
      "Rations (5 jours)",
      "Corde en chanvre (15 m)",
      "Torches (5)",
      "Carreaux d'arbalète (20)"
    ],
    "or": 10,
    "capacites": [
      {
        "nom": "Second souffle",
        "description": "Action bonus : récupère 1d10 + niveau PV.",
        "utilisations_max": 1,
        "recharge": "court",
        "effet": "second_souffle"
      },
      {
        "nom": "Style de combat : Défense",
        "description": "+1 à la CA en armure (inclus)."
      }
    ],
    "description": "Maître des armes et des armures, solide en première ligne.",
    "conseil": [
      "FOR",
      "CON",
      "DEX",
      "SAG",
      "CHA",
      "INT"
    ]
  },
  "Barbare": {
    "de_vie": 12,
    "sauvegardes": [
      "FOR",
      "CON"
    ],
    "nb_competences": 2,
    "competences": [
      "Dressage",
      "Athlétisme",
      "Intimidation",
      "Nature",
      "Perception",
      "Survie"
    ],
    "armure": "Défense sans armure",
    "bouclier": false,
    "armes": [
      "Hache à deux mains",
      "Hachette"
    ],
    "inventaire": [
      "Sac d'explorateur",
      "Rations (5 jours)",
      "Hachettes de lancer (2)",
      "Javelines (4)"
    ],
    "or": 10,
    "capacites": [
      {
        "nom": "Rage",
        "description": "Action bonus, 1 minute : +2 aux dégâts au corps à corps, résistance aux dégâts contondants/perforants/tranchants, avantage aux tests de FOR.",
        "utilisations_max": 2,
        "recharge": "long",
        "effet": "rage"
      },
      {
        "nom": "Défense sans armure",
        "description": "CA = 10 + DEX + CON (incluse)."
      }
    ],
    "description": "Guerrier sauvage porté par une rage dévastatrice.",
    "conseil": [
      "FOR",
      "CON",
      "DEX",
      "SAG",
      "CHA",
      "INT"
    ]
  },
  "Roublard": {
    "de_vie": 8,
    "sauvegardes": [
      "DEX",
      "INT"
    ],
    "nb_competences": 4,
    "competences": [
      "Acrobaties",
      "Athlétisme",
      "Tromperie",
      "Intuition",
      "Intimidation",
      "Investigation",
      "Perception",
      "Représentation",
      "Persuasion",
      "Escamotage",
      "Discrétion"
    ],
    "armure": "Armure de cuir",
    "bouclier": false,
    "armes": [
      "Rapière",
      "Arc court",
      "Dague"
    ],
    "inventaire": [
      "Sac de cambrioleur",
      "Outils de voleur",
      "Flèches (20)",
      "Rations (3 jours)"
    ],
    "or": 15,
    "capacites": [
      {
        "nom": "Attaque sournoise",
        "description": "Une fois par tour, +1d6 dégâts (par tranche de 2 niveaux) si vous avez l'avantage ou un allié près de la cible, avec une arme de finesse ou à distance."
      },
      {
        "nom": "Jargon des voleurs",
        "description": "Langage secret des voleurs."
      }
    ],
    "description": "Agile et rusé, spécialiste de la discrétion et des coups précis.",
    "conseil": [
      "DEX",
      "CON",
      "INT",
      "SAG",
      "CHA",
      "FOR"
    ]
  },
  "Rôdeur": {
    "de_vie": 10,
    "lanceur": "SAG",
    "demi_lanceur": true,
    "sauvegardes": [
      "FOR",
      "DEX"
    ],
    "nb_competences": 3,
    "competences": [
      "Dressage",
      "Athlétisme",
      "Intuition",
      "Investigation",
      "Nature",
      "Perception",
      "Discrétion",
      "Survie"
    ],
    "armure": "Armure d'écailles",
    "bouclier": false,
    "armes": [
      "Arc long",
      "Épée courte"
    ],
    "inventaire": [
      "Sac d'explorateur",
      "Flèches (20)",
      "Rations (5 jours)",
      "Corde en chanvre (15 m)"
    ],
    "or": 10,
    "capacites": [
      {
        "nom": "Ennemi juré",
        "description": "Avantage pour pister et se souvenir d'informations sur un type de créature choisi."
      },
      {
        "nom": "Explorateur-né",
        "description": "Expert des terrains sauvages : ne se perd pas, voyage discrètement à vitesse normale."
      }
    ],
    "description": "Chasseur et pisteur des terres sauvages.",
    "conseil": [
      "DEX",
      "SAG",
      "CON",
      "FOR",
      "INT",
      "CHA"
    ]
  },
  "Clerc": {
    "de_vie": 8,
    "sauvegardes": [
      "SAG",
      "CHA"
    ],
    "nb_competences": 2,
    "competences": [
      "Histoire",
      "Intuition",
      "Médecine",
      "Persuasion",
      "Religion"
    ],
    "armure": "Armure d'écailles",
    "bouclier": true,
    "armes": [
      "Masse d'armes",
      "Arbalète légère"
    ],
    "inventaire": [
      "Sac d'ecclésiastique",
      "Symbole sacré",
      "Carreaux d'arbalète (20)",
      "Rations (3 jours)"
    ],
    "or": 15,
    "lanceur": "SAG",
    "capacites": [
],
    "description": "Serviteur d'une divinité, guérisseur et protecteur.",
    "conseil": [
      "SAG",
      "CON",
      "FOR",
      "CHA",
      "DEX",
      "INT"
    ]
  },
  "Magicien": {
    "de_vie": 6,
    "sauvegardes": [
      "INT",
      "SAG"
    ],
    "nb_competences": 2,
    "competences": [
      "Arcanes",
      "Histoire",
      "Intuition",
      "Investigation",
      "Médecine",
      "Religion"
    ],
    "armure": "Aucune",
    "bouclier": false,
    "armes": [
      "Bâton",
      "Dague"
    ],
    "inventaire": [
      "Grimoire",
      "Sacoche à composantes",
      "Sac d'érudit",
      "Rations (3 jours)"
    ],
    "or": 10,
    "lanceur": "INT",
    "capacites": [
      {
        "nom": "Restauration arcanique",
        "description": "Une fois par jour, lors d'un repos court, récupère un emplacement de sort de niveau 1."
      }
    ],
    "description": "Érudit des arcanes, puissant mais fragile.",
    "conseil": [
      "INT",
      "CON",
      "DEX",
      "SAG",
      "CHA",
      "FOR"
    ]
  }
};

export const EMPLACEMENTS = {
  "1": {
    "1": 2
  },
  "2": {
    "1": 3
  },
  "3": {
    "1": 4,
    "2": 2
  },
  "4": {
    "1": 4,
    "2": 3
  },
  "5": {
    "1": 4,
    "2": 3,
    "3": 2
  },
  "6": {
    "1": 4,
    "2": 3,
    "3": 3
  },
  "7": {
    "1": 4,
    "2": 3,
    "3": 3,
    "4": 1
  },
  "8": {
    "1": 4,
    "2": 3,
    "3": 3,
    "4": 2
  },
  "9": {
    "1": 4,
    "2": 3,
    "3": 3,
    "4": 3,
    "5": 1
  },
  "10": {
    "1": 4,
    "2": 3,
    "3": 3,
    "4": 3,
    "5": 2
  }
};

export const SORTS = {
  "Trait de feu": {
    "niveau": 0,
    "classes": [
      "Magicien"
    ],
    "type": "attaque",
    "degats": "1d10",
    "degats_type": "feu",
    "description": "Projette un trait de feu (36 m)."
  },
  "Rayon de givre": {
    "niveau": 0,
    "classes": [
      "Magicien"
    ],
    "type": "attaque",
    "degats": "1d8",
    "degats_type": "froid",
    "description": "Rayon glacé, la cible perd 3 m de vitesse."
  },
  "Lumière": {
    "niveau": 0,
    "classes": [
      "Magicien",
      "Clerc"
    ],
    "type": "special",
    "description": "Un objet émet une vive lumière pendant 1 heure."
  },
  "Prestidigitation": {
    "niveau": 0,
    "classes": [
      "Magicien"
    ],
    "type": "special",
    "description": "Petits tours de magie : étincelles, nettoyer, réchauffer, odeur…"
  },
  "Main du mage": {
    "niveau": 0,
    "classes": [
      "Magicien"
    ],
    "type": "special",
    "description": "Une main spectrale manipule un objet à 9 m (5 kg max)."
  },
  "Flamme sacrée": {
    "niveau": 0,
    "classes": [
      "Clerc"
    ],
    "type": "sauvegarde",
    "sauvegarde": "DEX",
    "degats": "1d8",
    "degats_type": "radiant",
    "moitie": false,
    "description": "Une flamme radieuse frappe une créature (18 m)."
  },
  "Thaumaturgie": {
    "niveau": 0,
    "classes": [
      "Clerc"
    ],
    "type": "special",
    "description": "Manifestation mineure : voix tonitruante, flammes qui vacillent, tremblements…"
  },
  "Assistance": {
    "niveau": 0,
    "classes": [
      "Clerc"
    ],
    "type": "special",
    "description": "Un allié touché ajoute 1d4 à un test de caractéristique."
  },
  "Projectile magique": {
    "niveau": 1,
    "classes": [
      "Magicien"
    ],
    "type": "auto",
    "projectiles": 3,
    "degats": "1d4+1",
    "degats_type": "force",
    "description": "Trois fléchettes de force touchent automatiquement (+1 par niveau supérieur)."
  },
  "Armure du mage": {
    "niveau": 1,
    "classes": [
      "Magicien"
    ],
    "type": "special",
    "effet": "armure_du_mage",
    "description": "CA = 13 + DEX pendant 8 heures."
  },
  "Sommeil": {
    "niveau": 1,
    "classes": [
      "Magicien"
    ],
    "type": "sommeil",
    "degats": "5d8",
    "par_niveau": "2d8",
    "description": "Endort les créatures en commençant par celles qui ont le moins de PV."
  },
  "Bouclier": {
    "niveau": 1,
    "classes": [
      "Magicien"
    ],
    "type": "special",
    "description": "Réaction : +5 à la CA jusqu'au prochain tour."
  },
  "Mains brûlantes": {
    "niveau": 1,
    "classes": [
      "Magicien"
    ],
    "type": "sauvegarde",
    "sauvegarde": "DEX",
    "degats": "3d6",
    "par_niveau": "1d6",
    "degats_type": "feu",
    "moitie": true,
    "description": "Cône de flammes de 4,5 m (plusieurs cibles possibles)."
  },
  "Détection de la magie": {
    "niveau": 1,
    "classes": [
      "Magicien",
      "Clerc"
    ],
    "type": "special",
    "description": "Perçoit la magie à 9 m pendant 10 minutes."
  },
  "Soins": {
    "niveau": 1,
    "classes": [
      "Clerc",
      "Rôdeur"
    ],
    "type": "soin",
    "soin": "1d8",
    "par_niveau": "1d8",
    "description": "Une créature touchée récupère des PV."
  },
  "Mot de guérison": {
    "niveau": 1,
    "classes": [
      "Clerc"
    ],
    "type": "soin",
    "soin": "1d4",
    "par_niveau": "1d4",
    "description": "Action bonus, à distance (18 m) : une créature récupère des PV."
  },
  "Bénédiction": {
    "niveau": 1,
    "classes": [
      "Clerc"
    ],
    "type": "special",
    "description": "Jusqu'à 3 créatures ajoutent 1d4 à leurs attaques et sauvegardes (1 minute)."
  },
  "Éclair traçant": {
    "niveau": 1,
    "classes": [
      "Clerc"
    ],
    "type": "attaque",
    "degats": "4d6",
    "par_niveau": "1d6",
    "degats_type": "radiant",
    "description": "Trait de lumière ; la prochaine attaque contre la cible a l'avantage."
  },
  "Rayon ardent": {
    "niveau": 2,
    "classes": [
      "Magicien"
    ],
    "type": "attaque",
    "degats": "2d6",
    "degats_type": "feu",
    "rayons": 3,
    "description": "Trois rayons de feu, chacun avec son propre jet d'attaque."
  },
  "Pas brumeux": {
    "niveau": 2,
    "classes": [
      "Magicien"
    ],
    "type": "special",
    "description": "Action bonus : téléportation jusqu'à 9 m."
  },
  "Toile d'araignée": {
    "niveau": 2,
    "classes": [
      "Magicien"
    ],
    "type": "special",
    "description": "Toiles collantes (cube de 6 m), sauvegarde de DEX ou entravé."
  },
  "Arme spirituelle": {
    "niveau": 2,
    "classes": [
      "Clerc"
    ],
    "type": "attaque",
    "degats": "1d8",
    "ajoute_mod": true,
    "degats_type": "force",
    "description": "Une arme spectrale frappe à 18 m (action bonus les tours suivants)."
  },
  "Prière de guérison": {
    "niveau": 2,
    "classes": [
      "Clerc"
    ],
    "type": "soin",
    "soin": "2d8",
    "par_niveau": "1d8",
    "description": "Jusqu'à 6 créatures récupèrent des PV (10 minutes d'incantation)."
  },
  "Marque du chasseur": {
    "niveau": 1,
    "classes": ["Rôdeur"],
    "type": "special",
    "description": "Action bonus : marque une cible ; +1d6 dégâts à chaque coup d'arme contre elle (concentration, 1 h)."
  },
  "Grêle d'épines": {
    "niveau": 1,
    "classes": ["Rôdeur"],
    "type": "sauvegarde",
    "sauvegarde": "DEX",
    "degats": "1d10",
    "par_niveau": "1d10",
    "degats_type": "perforant",
    "moitie": false,
    "description": "Après un tir réussi, une pluie d'épines frappe la cible et ses voisins (1,5 m)."
  },
  "Passage sans trace": {
    "niveau": 2,
    "classes": ["Rôdeur"],
    "type": "special",
    "description": "+10 aux tests de Discrétion du groupe, aucune trace laissée (concentration, 1 h)."
  },
  "Boule de feu": {
    "niveau": 3,
    "classes": ["Magicien"],
    "type": "sauvegarde",
    "sauvegarde": "DEX",
    "degats": "8d6",
    "par_niveau": "1d6",
    "degats_type": "feu",
    "moitie": true,
    "description": "Explosion de flammes de 6 m de rayon à 45 m (toutes les créatures de la zone)."
  },
  "Éclair": {
    "niveau": 3,
    "classes": ["Magicien"],
    "type": "sauvegarde",
    "sauvegarde": "DEX",
    "degats": "8d6",
    "par_niveau": "1d6",
    "degats_type": "foudre",
    "moitie": true,
    "description": "Ligne de foudre de 30 m de long (toutes les créatures sur la ligne)."
  },
  "Contresort": {
    "niveau": 3,
    "classes": ["Magicien"],
    "type": "special",
    "description": "Réaction : interrompt un sort lancé à 18 m (automatique jusqu'au niveau 3, sinon test)."
  },
  "Hâte": {
    "niveau": 3,
    "classes": ["Magicien"],
    "type": "special",
    "description": "Une créature : vitesse doublée, +2 CA, avantage aux sauvegardes de DEX, une action de plus (concentration, 1 min)."
  },
  "Esprits gardiens": {
    "niveau": 3,
    "classes": ["Clerc"],
    "type": "sauvegarde",
    "sauvegarde": "SAG",
    "degats": "3d8",
    "par_niveau": "1d8",
    "degats_type": "radiant",
    "moitie": true,
    "description": "Des esprits entourent le lanceur (4,5 m) : les ennemis qui y entrent ou y commencent leur tour subissent les dégâts et sont ralentis (concentration, 10 min)."
  },
  "Mot de guérison de groupe": {
    "niveau": 3,
    "classes": ["Clerc"],
    "type": "soin",
    "soin": "1d4",
    "par_niveau": "1d4",
    "description": "Action bonus : jusqu'à 6 créatures à 18 m récupèrent des PV."
  },
  "Revigorer": {
    "niveau": 3,
    "classes": ["Clerc"],
    "type": "special",
    "description": "Ramène à la vie (1 PV) une créature morte depuis moins d'une minute (300 po de diamants)."
  },
  "Dissipation de la magie": {
    "niveau": 3,
    "classes": ["Magicien", "Clerc"],
    "type": "special",
    "description": "Met fin aux sorts sur une cible (automatique jusqu'au niveau 3, sinon test)."
  }
};

// Emplacements des demi-lanceurs (rôdeur) : rien au niveau 1.
export const EMPLACEMENTS_DEMI = {
  "1": {},
  "2": { "1": 2 },
  "3": { "1": 3 },
  "4": { "1": 3 },
  "5": { "1": 4, "2": 2 },
  "6": { "1": 4, "2": 2 },
  "7": { "1": 4, "2": 3 },
  "8": { "1": 4, "2": 3 },
  "9": { "1": 4, "2": 3, "3": 2 },
  "10": { "1": 4, "2": 3, "3": 2 }
};

// Capacités gagnées en montant de niveau (niveaux 2 à 5). "amelioration" : +2 à la caractéristique principale.
export const CAPACITES_NIVEAU = {
  "Guerrier": {
    "2": [{ "nom": "Fougue", "description": "Une action supplémentaire pendant ce tour.", "utilisations_max": 1, "recharge": "court" }],
    "4": ["amelioration"],
    "5": [{ "nom": "Attaque supplémentaire", "description": "Deux attaques quand il choisit l'action Attaquer (un appel d'attaque par coup)." }]
  },
  "Barbare": {
    "2": [
      { "nom": "Attaque téméraire", "description": "Peut attaquer avec l'avantage (FOR) ; les ennemis ont alors l'avantage contre lui jusqu'à son prochain tour." },
      { "nom": "Sens du danger", "description": "Avantage aux sauvegardes de DEX contre les effets qu'il voit (pièges, sorts)." }
    ],
    "4": ["amelioration"],
    "5": [
      { "nom": "Attaque supplémentaire", "description": "Deux attaques quand il choisit l'action Attaquer (un appel d'attaque par coup)." },
      { "nom": "Déplacement rapide", "description": "+3 m de vitesse sans armure lourde (inclus)." }
    ]
  },
  "Roublard": {
    "2": [{ "nom": "Ruse", "description": "Action bonus : Foncer, Se désengager ou Se cacher." }],
    "4": ["amelioration"],
    "5": [{ "nom": "Esquive instinctive", "description": "Réaction : divise par deux les dégâts d'une attaque qu'il voit venir." }]
  },
  "Rôdeur": {
    "2": [
      { "nom": "Style de combat : Archerie", "description": "+2 aux attaques avec une arme à distance (inclus).", "effet": "archerie" },
      { "nom": "Sorts de rôdeur", "description": "Lance des sorts de rôdeur (SAG)." }
    ],
    "4": ["amelioration"],
    "5": [{ "nom": "Attaque supplémentaire", "description": "Deux attaques quand il choisit l'action Attaquer (un appel d'attaque par coup)." }]
  },
  "Clerc": {
    "2": [{ "nom": "Conduit divin", "description": "Renvoi des morts-vivants (sauvegarde de SAG ou ils fuient) ou Préservation de la vie (répartit 5 × niveau PV de soins).", "utilisations_max": 1, "recharge": "court" }],
    "4": ["amelioration"],
    "5": [{ "nom": "Destruction des morts-vivants", "description": "Le Renvoi détruit les morts-vivants de FP 1/2 ou moins." }]
  },
  "Magicien": {
    "4": ["amelioration"]
  }
};

export const MONSTRES = {
  "Gobelin": {
    "ca": 15,
    "pv": "2d6",
    "attaque": 4,
    "degats": "1d6+2",
    "arme": "cimeterre",
    "type_degats": "tranchant",
    "dex": 2,
    "sauvegarde": 1,
    "xp": 50
  },
  "Kobold": {
    "ca": 12,
    "pv": "2d6-2",
    "attaque": 4,
    "degats": "1d4+2",
    "arme": "dague",
    "type_degats": "perforant",
    "dex": 2,
    "sauvegarde": 1,
    "xp": 25
  },
  "Loup": {
    "ca": 13,
    "pv": "2d8+2",
    "attaque": 4,
    "degats": "2d4+2",
    "arme": "morsure",
    "type_degats": "perforant",
    "dex": 2,
    "sauvegarde": 1,
    "xp": 50
  },
  "Rat géant": {
    "ca": 12,
    "pv": "2d6",
    "attaque": 4,
    "degats": "1d4+2",
    "arme": "morsure",
    "type_degats": "perforant",
    "dex": 2,
    "sauvegarde": 0,
    "xp": 25
  },
  "Squelette": {
    "ca": 13,
    "pv": "2d8+4",
    "attaque": 4,
    "degats": "1d6+2",
    "arme": "épée courte",
    "type_degats": "perforant",
    "dex": 2,
    "sauvegarde": 1,
    "xp": 50
  },
  "Zombie": {
    "ca": 8,
    "pv": "3d8+9",
    "attaque": 3,
    "degats": "1d6+1",
    "arme": "coup",
    "type_degats": "contondant",
    "dex": -2,
    "sauvegarde": 1,
    "xp": 50
  },
  "Bandit": {
    "ca": 12,
    "pv": "2d8+2",
    "attaque": 3,
    "degats": "1d6+1",
    "arme": "cimeterre",
    "type_degats": "tranchant",
    "dex": 1,
    "sauvegarde": 1,
    "xp": 25
  },
  "Orc": {
    "ca": 13,
    "pv": "2d8+6",
    "attaque": 5,
    "degats": "1d12+3",
    "arme": "hache à deux mains",
    "type_degats": "tranchant",
    "dex": 1,
    "sauvegarde": 2,
    "xp": 100
  },
  "Hobgobelin": {
    "ca": 18,
    "pv": "2d8+2",
    "attaque": 3,
    "degats": "1d8+1",
    "arme": "épée longue",
    "type_degats": "tranchant",
    "dex": 1,
    "sauvegarde": 1,
    "xp": 100
  },
  "Gnoll": {
    "ca": 15,
    "pv": "5d8",
    "attaque": 4,
    "degats": "1d8+2",
    "arme": "lance",
    "type_degats": "perforant",
    "dex": 1,
    "sauvegarde": 1,
    "xp": 100
  },
  "Goule": {
    "ca": 12,
    "pv": "5d8",
    "attaque": 4,
    "degats": "2d6+2",
    "arme": "griffes (paralysantes)",
    "type_degats": "tranchant",
    "dex": 2,
    "sauvegarde": 1,
    "xp": 200
  },
  "Araignée géante": {
    "ca": 14,
    "pv": "4d10+4",
    "attaque": 5,
    "degats": "1d8+3",
    "arme": "morsure venimeuse",
    "type_degats": "perforant",
    "dex": 3,
    "sauvegarde": 2,
    "xp": 200
  },
  "Gobelours": {
    "ca": 16,
    "pv": "5d8+5",
    "attaque": 4,
    "degats": "2d8+2",
    "arme": "morgenstern",
    "type_degats": "perforant",
    "dex": 2,
    "sauvegarde": 1,
    "xp": 200
  },
  "Ogre": {
    "ca": 11,
    "pv": "7d10+21",
    "attaque": 6,
    "degats": "2d8+4",
    "arme": "massue",
    "type_degats": "contondant",
    "dex": -1,
    "sauvegarde": 2,
    "xp": 450
  }
};
// Types de dégâts reconnus par le moteur.
export const TYPES_DEGATS = [
  "contondant", "perforant", "tranchant", "feu", "froid", "foudre", "tonnerre", "acide", "poison",
  "nécrotique", "radiant", "force", "psychique",
];

// Résistances (dégâts divisés par deux) accordées par la race.
export const RESISTANCES_RACE = {
  "Nain des collines": ["poison"],
  "Drakéide": ["feu"],
  "Tieffelin": ["feu"],
};

// Résistances accordées par la Rage du barbare.
export const RESISTANCES_RAGE = ["contondant", "perforant", "tranchant"];

// Sous-classes. La première de chaque classe vient du SRD 5.1 ; les deux autres sont des créations
// originales de Contes & Dragons. Les capacités sont gagnées au niveau indiqué (clé de `capacites`).
export const SOUS_CLASSES = {
  "Guerrier": {
    "niveau": 3, "titre": "Archétype martial",
    "options": [
      { "nom": "Champion", "srd": true, "description": "La force brute et la précision : ses coups critiques tombent plus souvent.",
        "capacites": { "3": [{ "nom": "Champion : critique amélioré", "description": "Coup critique sur 19 ou 20 aux attaques d'arme (inclus).", "effet": "critique_ameliore" }] } },
      { "nom": "Duelliste", "description": "L'escrimeur élégant qui frappe là où ça fait mal.",
        "capacites": { "3": [{ "nom": "Duelliste : botte secrète", "description": "+2 aux dégâts des armes de corps à corps (inclus).", "effet": "duelliste" }] } },
      { "nom": "Sentinelle", "description": "Le rempart inébranlable qui encaisse et tient la ligne.",
        "capacites": { "3": [{ "nom": "Sentinelle : rempart", "description": "Réaction quand il est touché : récupère 1d10 + niveau PV (2 fois par repos court).", "utilisations_max": 2, "recharge": "court", "effet": "rempart" }] } }
    ]
  },
  "Barbare": {
    "niveau": 3, "titre": "Voie primitive",
    "options": [
      { "nom": "Berserker", "srd": true, "description": "La fureur pure : encore plus d'attaques quand la rage monte.",
        "capacites": { "3": [{ "nom": "Berserker : frénésie", "description": "En rage, peut faire une attaque d'arme en action bonus à chaque tour (1 niveau d'épuisement à la fin)." }] } },
      { "nom": "Colosse", "description": "La peau devient pierre : presque intouchable pendant la rage.",
        "capacites": { "3": [{ "nom": "Colosse : peau de pierre", "description": "En rage, +2 à la CA (inclus).", "effet": "colosse" }] } },
      { "nom": "Sang-de-braise", "description": "Un feu ancestral brûle dans ses veines et ses armes.",
        "capacites": { "3": [{ "nom": "Sang-de-braise : rage ardente", "description": "En rage, ses coups de corps à corps infligent 1d4 dégâts de feu en plus (inclus).", "effet": "rage_ardente" }] } }
    ]
  },
  "Roublard": {
    "niveau": 3, "titre": "Archétype de roublard",
    "options": [
      { "nom": "Voleur", "srd": true, "description": "Mains agiles, crochets et objets : rien ne lui résiste.",
        "capacites": { "3": [{ "nom": "Voleur : mains lestes", "description": "Action bonus : utiliser un objet, crocheter, désamorcer ou faire les poches." }] } },
      { "nom": "Lame de l'ombre", "description": "Frappe avant que l'ennemi ne comprenne ce qui arrive.",
        "capacites": { "3": [{ "nom": "Lame de l'ombre : premier sang", "description": "Avantage aux attaques contre une créature qui n'a pas encore joué dans le combat ; ses coups contre elle ajoutent l'attaque sournoise." }] } },
      { "nom": "Charmeur", "description": "Le beau parleur qui ouvre les portes et les cœurs.",
        "capacites": { "3": [{ "nom": "Charmeur : langue d'argent", "description": "Double maîtrise en Persuasion et Tromperie (inclus).", "effet": "expertise", "competences": ["Persuasion", "Tromperie"] }] } }
    ]
  },
  "Rôdeur": {
    "niveau": 3, "titre": "Archétype de rôdeur",
    "options": [
      { "nom": "Chasseur", "srd": true, "description": "Le traqueur de grandes proies.",
        "capacites": { "3": [{ "nom": "Chasseur : tueur de colosses", "description": "Une fois par tour, +1d8 dégâts contre une créature déjà blessée." }] } },
      { "nom": "Pisteur des brumes", "description": "Il surgit du brouillard et frappe le premier.",
        "capacites": { "3": [{ "nom": "Pisteur des brumes : embuscade", "description": "+3 m de vitesse ; au premier tour d'un combat, sa première attaque qui touche inflige 1d8 dégâts en plus." }] } },
      { "nom": "Compagnon de meute", "description": "Un loup fidèle l'accompagne partout.",
        "capacites": { "3": [{ "nom": "Compagnon de meute : loup fidèle", "description": "Un loup (statistiques du Loup) combat à ses côtés ; il agit juste après le rôdeur. S'il tombe, il revient après un repos long." }] } }
    ]
  },
  "Clerc": {
    "niveau": 1, "titre": "Domaine divin",
    "options": [
      { "nom": "Vie", "srd": true, "description": "Le guérisseur par excellence.",
        "capacites": { "1": [{ "nom": "Domaine de la Vie", "description": "Disciple de la Vie : ses sorts de soins rendent 2 + niveau du sort PV supplémentaires (inclus).", "effet": "disciple_vie" }] } },
      { "nom": "Soleil", "description": "La lumière brûlante qui purifie les ténèbres.",
        "capacites": { "1": [{ "nom": "Domaine du Soleil", "description": "Éclat solaire : ajoute son modificateur de SAG aux dégâts de ses sorts radiants (inclus).", "effet": "puissance_sorts", "types": ["radiant"] }] } },
      { "nom": "Bataille", "description": "Le prêtre guerrier, arme au poing.",
        "capacites": { "1": [{ "nom": "Domaine de la Bataille", "description": "Bras armé : +1 aux jets d'attaque avec une arme (inclus).", "effet": "attaque_bonus" }] } }
    ]
  },
  "Magicien": {
    "niveau": 2, "titre": "Tradition arcanique",
    "options": [
      { "nom": "Évocation", "srd": true, "description": "Boules de feu et éclairs, sans brûler ses alliés.",
        "capacites": { "2": [{ "nom": "École d'évocation : sculpter les sorts", "description": "Ses sorts d'évocation épargnent des alliés pris dans la zone." }] } },
      { "nom": "Éléments", "description": "Le feu, le froid et la foudre lui obéissent mieux qu'à quiconque.",
        "capacites": { "2": [{ "nom": "École des éléments : maîtrise élémentaire", "description": "Ajoute son modificateur d'INT aux dégâts de ses sorts de feu, de froid et de foudre (inclus).", "effet": "puissance_sorts", "types": ["feu", "froid", "foudre"] }] } },
      { "nom": "Garde", "description": "Le protecteur arcanique, entouré de boucliers.",
        "capacites": { "2": [{ "nom": "École de la garde : égide arcanique", "description": "Action bonus : +2 à la CA jusqu'à la fin du combat (1 fois par repos court).", "utilisations_max": 1, "recharge": "court", "effet": "egide" }] } }
    ]
  }
};
