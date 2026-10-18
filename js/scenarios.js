// Aventures proposées au lancement d'une partie (contenu original).

export const SCENARIOS = {
  brumesaule: {
    titre: "Les Ombres de Brumesaule",
    accroche: "Un village de pêcheurs au bord d'un lac brumeux. Des enfants disparaissent la nuit, et l'on murmure que les cloches de la vieille abbaye engloutie sonnent à nouveau.",
    niveau: "Niveau 1 à 3",
    intro: "Commence la partie : le personnage arrive à Brumesaule au crépuscule, alors que la brume monte du lac. Décris l'ambiance et l'auberge du Brochet Rieur, puis laisse le joueur agir.",
    notes_mj: `CADRE : Brumesaule, village de pêcheurs (≈200 âmes) au bord du lac Morne, à l'orée de la forêt des Saules-Gris.
Brume épaisse chaque soir. Lieux : l'auberge « Le Brochet Rieur » (tenancière Margot Pellerin, bavarde, généreuse),
le temple de la Dame des Eaux (sœur Aveline, inquiète, soigneuse), la maison du bourgmestre Odon Ferlac
(nerveux, cache quelque chose), les pontons, et l'îlot de l'abbaye engloutie (ruines à moitié sous l'eau).

INTRIGUE SECRÈTE : trois enfants ont disparu en deux semaines (dont Lise, la fille du passeur Bastien).
Des gobelins de la tribu des Crocs-de-Vase les enlèvent la nuit, en barque, pour les livrer à leur chef
Gruk le Borgne (un Gobelours). Gruk obéit à Maître Sélène, une ancienne novice de l'abbaye devenue
nécromancienne, qui veut sonner la cloche maudite de l'abbaye pour relever les moines noyés. Il lui faut
« trois voix pures » (les enfants chantent en chœur sous la contrainte). Le bourgmestre Odon a accepté de
fermer les yeux contre de l'or (il croyait qu'il s'agissait de contrebande).

PROGRESSION SUGGÉRÉE :
1. Arrivée à l'auberge, rumeurs, rencontre avec Bastien désespéré (offre 50 po, tout ce qu'il a).
2. Enquête : traces de barque et empreintes griffues sur les pontons (Investigation/Survie DD 12),
   un enfant témoin qui a vu « des petits hommes verts », le bourgmestre qui ment (Intuition DD 13).
3. La forêt des Saules-Gris : piste vers le camp gobelin (embuscade possible : 2-3 gobelins ou des loups).
4. Camp des Crocs-de-Vase : négociation, infiltration ou combat ; Gruk le Borgne (Gobelours) et ses gobelins.
   Un des enfants est ici. Gruk peut révéler le nom de Sélène s'il est vaincu ou intimidé.
5. L'abbaye engloutie : squelettes et zombies de moines, énigme des cloches, affrontement final avec
   Maître Sélène (adapter : CA 12, 27 PV, attaque de sort +5, 2d8 nécrotique, peut invoquer des squelettes).
   Libérer les enfants, briser la cloche.
RÉCOMPENSES : 50 po de Bastien, 100 po du temple, une potion de soins (2d4+2), une amulette de la Dame
des Eaux (avantage aux sauvegardes contre la nécromancie).
Adapte librement selon les choix du joueur : d'autres pistes sont bienvenues.`,
  },
  route: {
    titre: "La Caravane de l'Aube",
    accroche: "Engagé pour escorter une caravane marchande à travers les collines Rousses, vous découvrez que la cargaison cache bien plus que des épices.",
    niveau: "Niveau 1 à 3",
    intro: "Commence la partie : le personnage rejoint la caravane de Tobias Mirelle à l'aube, aux portes de Valcourt. Décris la scène et les compagnons de route, puis laisse le joueur agir.",
    notes_mj: `CADRE : la caravane du marchand Tobias Mirelle (jovial, cupide, bon fond) relie la cité de Valcourt au
bourg minier de Hautepierre en 4 jours à travers les collines Rousses. Compagnons : Ysolde (garde
mercenaire, taciturne, loyale), Pip (jeune palefrenier curieux), et une passagère mystérieuse voilée, Dame
Néra (en réalité une prêtresse en fuite qui transporte un reliquaire sacré volé à un culte).

INTRIGUE SECRÈTE : un culte (les Fils du Couchant) poursuit Néra pour récupérer le reliquaire. Ils ont payé
des bandits pour attaquer la caravane. Tobias ignore tout. Néra est honnête : le culte veut utiliser la
relique pour un rituel ; elle veut la mettre à l'abri au monastère de Hautepierre.

PROGRESSION SUGGÉRÉE :
1. Départ et présentation de la caravane, premier soir au camp (discussions, Pip pose des questions).
2. Jour 2 : pont effondré (contournement, Athlétisme/Dressage), loups affamés la nuit.
3. Jour 3 : embuscade de bandits (3-4 bandits) qui cherchent « la femme voilée ».
4. Révélation : Néra se confie si on gagne sa confiance (Persuasion/Intuition DD 13).
5. Jour 4 : les Fils du Couchant (chef : CA 13, 22 PV, attaque +4, 1d8+2 ; 2 bandits) tendent un piège
   dans un col. Ysolde peut trahir ou être loyale selon les choix faits.
RÉCOMPENSES : 40 po de Tobias, bénédiction du monastère, une potion de soins.
Adapte librement selon les choix du joueur.`,
  },
  donjon: {
    titre: "Le Gouffre aux Mille Marches",
    accroche: "Un donjon sans fond, salle après salle, étage après étage. Combats, butin et un boss tous les cinq étages : jusqu'où descendras-tu ?",
    niveau: "Tous niveaux · combats en série",
    intro: "Commence la partie : le personnage se tient au bord du Gouffre aux Mille Marches, au fond d'une ruine envahie de lierre. Décris brièvement l'escalier qui s'enfonce dans le noir, puis fais-le entrer dans la première salle : appelle salle_suivante et mets en scène ce qu'elle renvoie.",
    notes_mj: `MODE DONJON (« dungeon crawler ») : l'intérêt est l'enchaînement des combats. Va droit au but.
- Récit COURT : 40 à 100 mots par réponse, 2-3 phrases d'ambiance par salle, pas de longs dialogues.
- PROGRESSION GÉRÉE PAR LE MOTEUR : à chaque fois que le personnage entre dans une nouvelle salle (y compris
  la toute première), appelle salle_suivante. Il renvoie l'étage, la salle (3 par étage) et le TYPE de salle
  (combat, piège, coffre, calme ou boss) avec une consigne : respecte-la toujours. Ne compte pas toi-même.
- APRÈS CHAQUE SALLE : propose dans la ligne CHOIX 2 ou 3 portes ou passages différents (« La porte
  aux runes rouges », « Le couloir inondé », « L'escalier qui descend » quand l'étage est fini).
- DIFFICULTÉ : adapte les rencontres au niveau du personnage et à l'étage (de plus en plus dur).
  Niveau 1 : 2 ou 3 Kobolds, Rats géants, Gobelins, 1 Loup ou 2 Squelettes.
  Niveau 2 : Gobelins + Hobgobelin, 2 Zombies, Orc, Goule.
  Niveau 3 et plus : Gnolls, Orcs, Araignée géante, Gobelours, puis monstres du SRD plus puissants
  (consulter_regles pour choisir : « Bugbear », « Ghast », « Wight », « Minotaur »…).
- BOSS tous les 5 étages (étage 5, 10, 15…) : une créature nommée, plus forte (ex. « Grokk, chef
  gobelours » à partir du Gobelours avec plus de PV, ou un monstre du SRD : Ogre, Owlbear, Minotaur),
  avec un ou deux sbires. Raconte-le avec un peu plus d'emphase. C'est salle_suivante qui annonce la salle
  du boss (type « boss ») : ce jour-là, pas de rencontre ordinaire.
- BUTIN après les combats : or (modifier_or, 5 à 30 po × étage), potions de soins (gerer_inventaire,
  « Potion de soins » : boire = modifier_pv_joueur soin 2d4+2), parfois une arme ou un objet magique
  du SRD après un boss. Donne l'XP des combats avec fin_combat (automatique).
- REPOS : quand salle_suivante l'indique (sanctuaire en début d'étage, feu de camp après un boss),
  propose le repos dans les CHOIX ; ne fais reposer le personnage que s'il le choisit.
- Si le personnage meurt, raconte une fin héroïque en indiquant l'étage atteint (son record).`,
  },
  libre: {
    titre: "Aventure libre",
    accroche: "Aucun scénario imposé : le maître du jeu improvise un monde et une aventure autour de votre personnage et de son historique.",
    niveau: "Tous niveaux",
    intro: "Commence la partie dans un lieu de départ évocateur, en tenant compte de l'historique du personnage. Donne-lui une accroche claire, puis laisse le joueur agir.",
    notes_mj: `Improvise une aventure originale de fantasy adaptée au niveau et à l'historique du personnage. Crée un lieu de départ, un mystère ou une menace, des PNJ mémorables, et prévois une progression en plusieurs étapes. Note les éléments importants dans le journal.`,
  },
};
