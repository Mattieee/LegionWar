# LegionWar — Game Design Document

> **Statut des éléments :**
>
> - **[Proto]** : implémenté dans le prototype ; les valeurs citées sont celles du code.
> - **[Prévu]** : conçu, pas encore implémenté ; les valeurs sont des cibles de départ, à équilibrer.
>
> **Sources de vérité :** `packages/engine/src/config/Rules.ts` et `Races.ts`. Toute modification de valeur se reporte ici.
> **Unités :** 1 tick = 100 ms. « k » = millier, « M » = million.

---

## 1. Intention

Un jeu de territoire au rythme d'OpenFront (expansion fulgurante, fronts mouvants, retournements) dans un monde de fantasy héroïque : des peuples qui ne jouent pas de la même façon, de la magie dévastatrice et des créatures neutres à soumettre. On doit pouvoir lire la partie d'un coup d'œil, comme dans un RTS : bannières, couleurs franches, icônes claires.

**Expérience visée en une phrase :** _« J'ai démarré avec un hameau, j'ai écrasé les gnolls voisins, mon allié elfe m'a trahi, et j'ai rasé sa forêt d'une pluie de météores. »_

## 2. Univers : le continent de Valdren

L'Empire d'Ostre unifiait Valdren depuis mille ans. Il s'est effondré en une nuit, quand la **Couronne d'Astre** s'est brisée en éclats. Depuis, les peuples se disputent les ruines. Celui qui dominera Valdren pourra reforger la Couronne.

| Peuple         | Faction                     | En une ligne                                                          |
| -------------- | --------------------------- | --------------------------------------------------------------------- |
| Humains        | ⚜ **Royaume d'Aldoria**     | Héritiers de l'Empire : chevaliers, bâtisseurs et banquiers           |
| Orcs           | ⚒ **Clans de Kharag**       | Descendus des steppes de cendre, ils ne connaissent que la conquête   |
| Morts-vivants  | ☠ **Les Damnés de Morvane** | Une nécromancienne a relevé les légions de l'Empire déchu             |
| Elfes sylvains | ❦ **Cercle de Sylvanor**    | Gardiens des forêts anciennes, fantômes entre les arbres              |
| Neutres        | **Tribus sauvages**         | Gnolls, kobolds, ogres, brigands… qui occupent les terres sans maître |

> Noms et lieux originaux. Aucun emprunt à Warcraft ou Blizzard (Azeroth, Horde, Fléau, Lordaeron… sont proscrits).

## 3. Boucle de jeu

1. **Déploiement** [Proto] : on clique une terre libre et on reçoit un disque de rayon 4, soit environ 50 tuiles. En solo, la phase se termine dès ce choix ; en multijoueur, elle dure 20 s.
2. **Expansion** [Proto] : on attaque les terres libres avec un pourcentage de ses troupes (curseur, 20 % par défaut).
3. **Croissance** [Proto] : les troupes remontent vers un plafond qui dépend du territoire et des Bourgs. L'or tombe en continu.
4. **Construction** [Proto partiel] : Bourgs (population) et Tours de garde (défense) aujourd'hui ; ports, comptoirs et sanctuaires sont prévus.
5. **Guerre** [Proto] : attaques terrestres contre les voisins ; annexion des petits royaumes.
6. **Magie, mer et diplomatie** [Prévu] : sorts, flottes, alliances et trahisons.
7. **Victoire** [Proto] : contrôler **plus de 80 %** des terres conquérables, ou être le dernier seigneur debout.

## 4. Carte et terrains

### 4.1 Génération [Proto]

- **Méthode :** carte procédurale déterministe (bruit de valeur fractal) : un continent principal, des îles et des lacs. La même graine donne la même carte.

| Taille  | Dimensions | Tuiles de terre (≈) |
| ------- | ---------- | ------------------- |
| Petite  | 384×240    | 42 k                |
| Moyenne | 512×320    | 74 k                |
| Grande  | 768×480    | 170 k               |

- **Proportions :** environ 46 % de terre. Les îles de moins de 40 tuiles sont supprimées, les lacs de moins de 60 tuiles comblés.
- **Mines d'or :** une pour environ 2 200 tuiles de terre, espacées d'au moins 28 tuiles. Chacune rapporte **40 or/tick** à son propriétaire, multipliés par le bonus d'or de sa race.

### 4.2 Terrains et combat [Proto]

| Terrain           | Pertes de l'attaquant (`mag`) | Lenteur (`tileCost`) | Rôle                                |
| ----------------- | ----------------------------- | -------------------- | ----------------------------------- |
| Plaine            | 80                            | 16,5                 | Expansion rapide, mines possibles   |
| Forêt             | 95                            | 19                   | Terrain des elfes                   |
| Collines          | 100                           | 20                   | Défensif, mines possibles           |
| Montagnes         | 120                           | 25                   | Remparts naturels                   |
| Pics enneigés     | —                             | —                    | Infranchissables                    |
| Eau (océan, lacs) | —                             | —                    | Infranchissable sans flotte [Prévu] |

### 4.3 Cartes dessinées [Prévu]

Une grande carte de Valdren, puis des cartes régionales : le Bassin d'Aldoria, les Steppes de Kharag, la Forêt de Sylvanor, les Marches de Morvane. Le format reste le même que pour la carte procédurale : une image, convertie en octets de terrain.

## 5. Ressources [Proto]

| Paramètre          | Seigneur (humain)   | Tribu sauvage |
| ------------------ | ------------------- | ------------- |
| Troupes de départ  | 25 000              | 10 000        |
| Or par tick        | 100 × bonus de race | 50            |
| Plafond de troupes | voir formule        | formule ÷ 3   |
| Régénération       | voir formule        | formule × 0,5 |

```
Plafond      = 2 × (tuiles^0,6 × 1000 + 50 000) + Bourgs achevés × 250 000   (× bonus de race)
Régénération = (10 + troupes^0,73 / 4) × (1 − troupes / plafond)             (par tick, × bonus de race)
```

- **Au-dessus du plafond**, par exemple après une perte de territoire, les troupes décroissent.
- **Butin de conquête :** quand on annexe un royaume, on récupère tout l'or d'une tribu, ou la moitié de celui d'un seigneur. Rien si ce seigneur n'avait jamais attaqué.

## 6. Combat [Proto]

- **Principe :** une attaque n'a pas de direction. Elle progresse sur **toute la frontière commune** avec la cible, en prenant d'abord les tuiles plates et celles déjà encerclées.
- **Fusion et annulation :** deux attaques vers la même cible fusionnent. Deux attaques opposées s'annulent : leurs troupes se soustraient.
- **Contre les terres libres :** perte de `mag / 5` troupes par tuile (`mag / 10` pour une tribu). La vitesse croît avec les troupes engagées.
- **Contre un seigneur :**

```
ratio  = troupes du défenseur / troupes de l'attaque
pertes = mag × clamp(ratio, 0,6, 2) × (0,463 × bonusGrandTerritoire + 0,0039 × densité du défenseur)
le défenseur perd sa densité moyenne (troupes / tuiles) par tuile prise
```

- **Modificateurs :**

| Situation                                | Effet                                  |
| ---------------------------------------- | -------------------------------------- |
| Tour de garde du défenseur à ≤ 20 tuiles | Pertes ×4, progression 2,5× plus lente |
| Seigneur qui attaque une tribu           | Pertes ×0,7                            |
| Défense en forêt d'un elfe               | Pertes ×1,5                            |

- **Bonus « grand territoire » :** un empire immense attaque et défend un peu moins bien, ce qui freine l'effet boule de neige.
- **Annexion :** un royaume réduit à **moins de 50 tuiles** est absorbé en entier par l'attaquant.

## 7. Les quatre peuples

### 7.1 Modificateurs [Proto]

|                      | ⚜ Aldoria           | ⚒ Kharag  | ☠ Morvane                             | ❦ Sylvanor             |
| -------------------- | ------------------- | --------- | ------------------------------------- | ---------------------- |
| Or                   | **×1,20**           | ×0,75     | ×0,90                                 | ×1,05                  |
| Plafond de troupes   | ×1                  | ×1        | ×1                                    | ×1                     |
| Régénération         | ×1                  | ×1        | ×0,90                                 | ×1                     |
| Pertes en attaque    | ×1                  | **×0,85** | ×1                                    | ×1                     |
| Défense              | ×1 (remparts, §7.3) | ×0,95     | ×1                                    | ×1                     |
| Vitesse de conquête  | ×1                  | **×1,10** | ×1                                    | ×1                     |
| Coût des bâtiments   | **×0,85**           | ×1        | ×1                                    | ×1                     |
| Portée des tours     | **×1,25**           | ×1        | ×1                                    | ×1                     |
| Défense en forêt     | ×1                  | ×1        | ×1                                    | **×1,5**               |
| Progression en forêt | ×1                  | ×1        | ×1                                    | **×0,7** (plus rapide) |
| Moisson des morts    | —                   | —         | **25 %** des pertes ennemies relevées | —                      |
| Mécanique propre     | Remparts            | Pillage   | Levée des charniers (15 %)            | Bosquets               |

Rééquilibrage du 2026-10-09, mesuré par le game designer sur 300 parties simulées (4 seigneurs scriptés, un par race, sièges tournants, 60 tribus, carte moyenne) : avant, Aldoria 30,7 %, **Kharag 40 %**, Morvane 15,3 %, Sylvanor 14 % des parties menées ; après, **21,7 / 26,7 / 27,3 / 24,3 %** (écart d'une simulation à l'autre : environ ±5 points).

### 7.2 Identités

**⚜ Royaume d'Aldoria — les bâtisseurs**

- _Style :_ économie forte, frontières fortifiées, poussée méthodique.
- _Force :_ l'or, des tours bon marché et à longue portée.
- _Faiblesse :_ une armée moyenne, qui paie cher les guerres d'usure.
- _Bâtiments_ [Prévu] : Bourg, Port, Guilde marchande, Tour de garde, Tour des arcanes, Cathédrale des mages.
- _Sorts_ [Prévu] : Châtiment (mineur), Pluie de météores (majeur), **Jugement céleste** (ultime : plusieurs colonnes de lumière, sans corruption).

**⚒ Clans de Kharag — les conquérants**

- _Style :_ expansion brutale, guerre permanente.
- _Force :_ des attaques moins coûteuses et plus rapides.
- _Faiblesse :_ un trésor maigre et une défense fragile.
- _Bâtiments_ [Prévu] : Kraal, Quai de guerre, Comptoir de troc, Palissade à pointes, Totem de résistance, Autel des esprits.
- _Sorts_ [Prévu] : Éclair chamanique, Tempête de foudre, **Rage des ancêtres** (ultime : frappes multiples, puis 60 s de pertes en attaque −30 %).

**☠ Les Damnés de Morvane — les nécromanciens**

- _Style :_ guerre d'attrition ; chaque victoire nourrit la suivante.
- _Force :_ ils relèvent les morts. Plus le combat est sanglant, plus ils en sortent gagnants.
- _Faiblesse :_ une régénération et une économie lentes, une agonie s'ils restent passifs.
- _Bâtiments_ [Prévu] : Ossuaire, Débarcadère maudit, Crypte des tributs, Ziggourat, Obélisque nécrotique, Nécropole.
- _Sorts_ [Prévu] : Trait d'ombre, Nuée de crânes, **Peste noire** (ultime : corruption durable ; les troupes ennemies au contact perdent 1 %/s ; les Damnés conquièrent les terres maudites 2× plus vite).

**❦ Cercle de Sylvanor — les gardiens**

- _Style :_ défense en profondeur, guérilla, commerce discret.
- _Force :_ imprenables en forêt, et rapides pour s'emparer des bois voisins.
- _Faiblesse :_ moins de troupes ; vulnérables en plaine.
- _Bâtiments_ [Prévu] : Sylve-demeure, Havre, Marché des lunes, Arbre gardien, Puits de lune, Arbre ancestral.
- _Sorts_ [Prévu] : Ronces, Colère des racines, **Courroux sylvestre** (ultime : les tuiles touchées deviennent de la **forêt**, le terrain des elfes).

### 7.3 Mécaniques propres [Proto]

Chaque peuple a une mécanique visible sur la carte. Constantes dans `Rules.ts` (`RAMPART_*`, `GROVE_*`, `CHARNIER_TICKS`, `PILLAGE_TRIBE_RATIO`) et `Races.ts` (`rampart`, `grove`, `pillageGold`, `charnierRaise`).

- **Charniers (commun) :** toute tuile prise de force entre deux royaumes (tribus comprises) devient un **charnier pendant 60 s**. Ses morts (pertes de l'attaquant et du défenseur sur cette tuile) y gisent ; une nouvelle bataille ravive le charnier et remplace ses morts. La conquête de terres libres, l'annexion et le débarquement sur la plage n'en créent pas.
- **⚜ Remparts (Aldoria) :** toutes les 10 s, une tuile frontière déjà en lisière à la ronde précédente devient un **rempart** : l'assaillant y subit des **pertes ×1,5** et avance **1,5× plus lentement**. Pas de cumul avec une tour (la tour l'emporte). Le rempart disparaît quand la tuile est prise ou n'est plus en lisière : une brèche ouvre sur un intérieur sans défense. Les côtes comptent comme frontière et protègent des débarquements.
- **⚒ Pillage (Kharag) :** chaque tuile prise à un royaume rapporte **15 or** (7 sur une tribu), sauf si c'est un charnier (terre déjà ravagée). Kharag finance environ la moitié de sa guerre par la guerre.
- **☠ Levée des charniers (Morvane) :** prendre un charnier relève **15 % de ses morts**, en plus de la moisson. Morvane devient un charognard qui suit les guerres des autres. La Peste noire (corruption durable, bit 13) reste distincte.
- **❦ Bosquets (Sylvanor) :** sur ses terres, les **plaines à 8 tuiles ou moins d'une forêt se boisent** en 20 s au plus (balayage dispersé de la carte) ; un bosquet compte comme une **forêt au combat** tant qu'il reste sylvain. Environ 10 % des terres sylvaines deviennent bosquets.
- **État des tuiles :** bit 12 = marque du propriétaire (rempart ou bosquet selon sa race, effacée à chaque changement de propriétaire), bit 14 = charnier, bit 15 libre. Le hash d'état couvre les compteurs de chaque seigneur (marques, or pillé, morts relevés), le nombre de charniers et, toutes les 10 s, l'état complet des tuiles.
- **Rendu :** remparts en créneaux encre et pierre ; bosquets en feuillage semé d'arbres ; charniers en cendre et ossements (braises chez Kharag) ; terres de Morvane désaturées et violacées. Le HUD affiche le compteur du peuple (remparts, or pillé, morts relevés, bosquets).
- **À venir :** les heuristiques des seigneurs IA (Kharag vise les fronts sans charniers, Morvane les fronts couverts de charniers…) ; l'interdiction du pillage et de la levée contre les alliés avec la diplomatie.

## 8. Bâtiments

### 8.1 Règles générales [Proto]

- **Placement :** sur ses propres terres, à au moins **12 tuiles** de tout autre bâtiment, quel que soit son propriétaire.
- **Coût croissant :** le prix dépend du nombre de bâtiments du même type déjà possédés, chantiers compris. Perdre un bâtiment fait donc rebaisser le prix.
- **Capture :** un Bourg passe au conquérant ; une Tour de garde est **détruite**.

### 8.2 Liste

| Rôle               | Nom générique     | Coût                                               | Construction | Effet                                                                    | Statut  |
| ------------------ | ----------------- | -------------------------------------------------- | ------------ | ------------------------------------------------------------------------ | ------- |
| Population         | **Bourg**         | 125 k → 250 k → 500 k → 1 M (plafond)              | 2 s          | +250 000 troupes max                                                     | [Proto] |
| Défense            | **Tour de garde** | 50 k, +50 k par tour (plafond 250 k)               | 5 s          | Rayon 20 : pertes de l'attaquant ×4, conquête 2,5× plus lente            | [Proto] |
| Commerce maritime  | Port              | comme le Bourg (compteur partagé avec le Comptoir) | 5 s          | Nefs marchandes, chantier naval                                          | [Prévu] |
| Commerce terrestre | Comptoir          | comme le Port                                      | 2 s          | Crée des caravanes et des routes vers les Bourgs et Ports à ≤ 110 tuiles | [Prévu] |
| Contre-magie       | Bastion runique   | 1,5 M, puis 3 M                                    | 30 s         | Intercepte les sorts dans son rayon (70 + bonus de niveau)               | [Prévu] |
| Magie              | Sanctuaire        | 1 M                                                | 10 s         | Lance les sorts ; le niveau donne le nombre de sorts simultanés          | [Prévu] |

- **Amélioration** [Prévu] : Bourg, Port, Comptoir, Bastion et Sanctuaire pourront monter de niveau, au même coût qu'une nouvelle construction.

## 9. Commerce [Prévu]

- **Nefs marchandes :** chaque port lance des nefs vers les ports d'autres seigneurs, sauf en cas d'embargo. Les **deux** ports encaissent le gain : `75 000 / (1 + e^(−0,03 × (d − 300))) + 50 × d`, où `d` est la distance parcourue.
- **Caravanes :** elles circulent sur des routes entre Comptoirs, Bourgs et Ports. Gain par étape : 10 k (chez soi), 25 k (autre seigneur), 35 k (allié), dégressif après la 9ᵉ étape.
- **Piraterie :** un navire de guerre capture les nefs ennemies et empoche leur cargaison.

## 10. Guerre navale

- **Barge de transport** [Proto] :
  - **Lancement :** un clic sur une terre sans frontière terrestre commune envoie automatiquement une barge ; <kbd>B</kbd> force le débarquement sur la terre survolée. Les troupes engagées suivent le ratio d'attaque.
  - **Route :** la plus courte en tuiles d'eau, depuis une côte du joueur jusqu'à la plage la plus proche de la terre visée (8 plages candidates au plus). Il faut une côte sur la même mer.
  - **Vitesse et limite :** 3 tuiles par tick ; **3 barges** en mer au plus par seigneur (et 3 tentatives de lancement par tick).
  - **Débarquement :** la plage est prise, puis l'assaut continue depuis cette tête de pont contre le propriétaire de la plage. Si la plage est déjà à soi à l'arrivée, les troupes rentrent sans perte.
  - [Prévu] Annulation en mer (25 % de pertes), barges coulées par les navires de guerre.
- **Navire de guerre :** 1 000 PV ; tire sur les barges en priorité ; se répare au port ; trois niveaux de vétérance.
- **Noms par race :** Galère royale (Aldoria), Drakkar de guerre (Kharag), Navire spectral (Morvane), Voilier lunaire (Sylvanor).

## 11. Magie [Prévu]

C'est l'équivalent des armes nucléaires d'OpenFront.

| Rang        | Rayon intérieur / extérieur   | Coût                                             | Effet commun                                                       |
| ----------- | ----------------------------- | ------------------------------------------------ | ------------------------------------------------------------------ |
| Sort mineur | 12 / 30                       | 750 k                                            | Détruit les bâtiments et les tuiles dans le rayon, tue des troupes |
| Sort majeur | 80 / 100                      | 5 M                                              | Idem, à grande échelle, et laisse des **terres maudites**          |
| Sort ultime | jusqu'à 350 impacts (12 / 18) | 25 M + 15 M par ultime déjà lancé dans la partie | Propre à chaque race (§7.2)                                        |

- **Terres maudites :** elles ralentissent la conquête, ne comptent pas pour la victoire et sont purifiées quand on les reconquiert.
- **Bastion runique :** intercepte de façon déterministe les sorts qui passent à portée près de leur point de départ ou d'arrivée.
- **Diplomatie :** lancer un sort majeur sur les terres d'un allié rompt l'alliance et fait du lanceur un traître.

## 12. Diplomatie [Prévu]

- **Alliances :** 5 min, renouvelables par accord mutuel ; demande valable 20 s, cooldown de 30 s.
- **Trahison :** rompre une alliance donne le statut **Parjure** pendant 30 s : les ennemis subissent −50 % de pertes contre lui et avancent 20 % plus vite.
- **Embargo :** coupe nefs et caravanes entre deux seigneurs ; un embargo temporaire de 5 min s'applique automatiquement après une attaque.
- **Dons :** or et troupes entre alliés, cooldown de 10 s.
- **Communication :** une grille d'emojis et des **messages prédéfinis** (pas de chat libre, pour la modération).

## 13. Neutres et IA

- **Tribus sauvages** [Proto] : 0 à 200 par partie (60 par défaut). Ce sont des IA passives.
  - _Rythme :_ elles agissent toutes les 4 à 8 s.
  - _Expansion :_ elles s'étendent tant qu'il reste des terres libres, en engageant 35 à 44 % de leurs troupes quand elles dépassent 20 % de leur plafond.
  - _Attaque :_ elles attaquent ensuite le voisin le moins dense quand elles atteignent 50 à 60 % de leur plafond, en gardant une réserve de 30 à 40 %. Elles évitent les seigneurs une fois sur deux.
  - _Limites :_ elles ne construisent pas et ne font pas de diplomatie.
- **Seigneurs IA** [Prévu] : des nations liées à une région de la carte, avec 4 niveaux (Écuyer, Chevalier, Seigneur, Empereur). Elles construisent, s'allient, trahissent et lancent des sorts.
- **Camps de créatures** [Idée] : des repaires neutres très défendus (dragon, troll ancestral) qui donnent un bonus durable quand on les prend. C'est un clin d'œil aux « creeps » de Warcraft III.

## 14. Fin de partie [Proto et Prévu]

- **Victoire** [Proto] : plus de 80 % des terres conquérables, ou dernier seigneur debout.
- **Crépuscule** [Prévu] : après 30 min, le seuil de victoire baisse de 2 points par minute.
- **Horloge du Jugement** [Prévu, option] : une part de territoire minimale qui monte par vagues ; ceux qui restent en dessous dépérissent.
- **Limite dure** [Prévu] : 170 min ; le plus grand royaume l'emporte.

## 15. Modes [Prévu]

| Mode                        | Description                                                                             |
| --------------------------- | --------------------------------------------------------------------------------------- |
| Solo                        | Contre les tribus et les seigneurs IA ; vitesse réglable, pause                         |
| Mêlée générale              | Chacun pour soi, file publique                                                          |
| Équipes                     | 2 à 7 équipes, duos, trios, quatuors                                                    |
| Peuples contre Seigneurs IA | Tous les humains contre les nations IA                                                  |
| Partie privée               | Code d'invitation, options de l'hôte (or de départ, unités désactivées, temps de paix…) |

## 16. Direction artistique et audio

- **Carte :** un parchemin de cartographe vivant. Terrain coloré par biome, frontières sombres, territoires teintés de la couleur héraldique du joueur.
- **Interface :** cartouches de cartographe en papier, capitales IM Fell et texte EB Garamond, voir [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md). Emblèmes par race : ⚜ ⚒ ☠ ❦.
- **Lisibilité :** le nom et les troupes sont affichés au cœur de chaque royaume, et les bâtiments ont une silhouette distincte (maison, tour crénelée).
- **Audio** [Prévu] : musique orchestrale médiévale, cors de guerre au début d'une attaque, cloche à l'achèvement d'un bâtiment, sons de sort propres à chaque race.

## 17. Contrôles [Proto]

| Action                     | Souris / clavier                                                         |
| -------------------------- | ------------------------------------------------------------------------ |
| Choisir sa terre de départ | Clic sur une terre libre                                                 |
| Attaquer                   | Clic gauche sur la cible                                                 |
| Ratio d'attaque            | Curseur, <kbd>T</kbd> / <kbd>Y</kbd> (pas de 10 %)                       |
| Construire                 | <kbd>1</kbd> Bourg, <kbd>2</kbd> Tour, puis clic                         |
| Annuler                    | <kbd>Échap</kbd>, clic droit                                             |
| Caméra                     | Glisser, molette, <kbd>+</kbd> / <kbd>−</kbd>, <kbd>C</kbd> pour centrer |
| Débarquer                  | Clic sur une terre au-delà de la mer, ou <kbd>B</kbd> sur la terre visée |

Le tactile est géré via les Pointer Events : un appui attaque ou se déploie, un glissement déplace la caméra.

## 18. Correspondance avec OpenFront (référence du genre)

| OpenFront                  | LegionWar                                           |
| -------------------------- | --------------------------------------------------- |
| City                       | Bourg (Kraal, Ossuaire, Sylve-demeure)              |
| Defense Post               | Tour de garde (Palissade, Ziggourat, Arbre gardien) |
| Port / Trade Ship          | Port / Nef marchande                                |
| Factory / Train / Railroad | Comptoir / Caravane / Route commerciale             |
| SAM Launcher               | Bastion runique                                     |
| Missile Silo               | Sanctuaire                                          |
| Atom / Hydrogen Bomb       | Sort mineur / Sort majeur                           |
| MIRV                       | Sort ultime (propre à chaque race)                  |
| Fallout                    | Terres maudites                                     |
| Bots (Tribes)              | Tribus sauvages                                     |
| Nations                    | Seigneurs IA                                        |
| Traitor                    | Parjure                                             |
| Overtime / Doomsday Clock  | Crépuscule / Horloge du Jugement                    |

## 19. Équilibrage : points à surveiller

- La part de victoires par race doit rester **entre 20 et 30 %** à niveau égal.
- Le délai avant que les terres libres soient épuisées est mesuré à **20 s environ** sur une carte moyenne avec 60 tribus ; viser 20 à 40 s.
- Le premier Bourg arrive vers 2 min de jeu (125 k d'or à environ 1 000 à 1 200 or/s) : vérifier que ce n'est pas trop lent.
- La moisson de Morvane (25 %) et la levée des charniers (15 %) peuvent faire boule de neige pendant les guerres longues : si c'est le cas, interdire la levée sur les charniers créés par Morvane lui-même.
- Le banc d'essai des mécaniques propres fait beaucoup de va-et-vient (environ 55 % des prises tombent sur un charnier) : avec de vrais joueurs, Morvane pourrait être plus faible et Kharag piller davantage. Suivre l'or pillé et les morts relevés.
- Aldoria est sous-estimée par ce banc d'essai : ses bots ne construisent pas de tours.
- Le bonus forestier de Sylvanor dépend de la carte. Mesuré sur 4 graines (carte moyenne) : forêt **25 à 37 %** des terres, plaine 36 à 44 %, collines 20 à 25 %, montagnes 5 à 14 %, pics 1 %. On craignait que ce soit trop favorable à Sylvanor, mais la simulation de 2026-10-09 le donnait au contraire faible (14 % des parties menées) avant les bosquets. À revérifier sur les graines très boisées (37 % de forêt) ; le seuil d'humidité `0.53` du générateur permet de réduire la forêt si besoin.
