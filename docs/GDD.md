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
7. **Victoire** [Proto] : contrôler **plus de 80 %** des terres conquérables (seuil qui baisse au Crépuscule, §14), ou être le dernier seigneur debout, ou le plus grand royaume à 35 min.

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
Régénération = (10 + troupes^0,73 / 4) × (1 − troupes / plafond) × 0,5       (par tick, × bonus de race ; 0,5 = REGEN_PACE, §6)
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
pertes = mag × clamp(ratio, 0,6, 2) × (0,463 × bonusGrandTerritoire(défenseur) + 0,0039 × densité du défenseur)
le défenseur perd sa densité moyenne (troupes / tuiles) par tuile prise
```

- **Modificateurs :**

| Situation                                    | Effet                                  |
| -------------------------------------------- | -------------------------------------- |
| Tour de garde du défenseur à ≤ 20 tuiles     | Pertes ×4, progression 2,5× plus lente |
| Seigneur ou prétendant qui attaque une tribu | Pertes ×0,7                            |
| Défenseur Parjure (§12.3)                    | Pertes ×0,5, progression ×1,25         |
| Défense en forêt d'un elfe                   | Pertes ×1,5                            |
| Attaquant qui porte la Couronne, vs royaume  | Pertes ×1,5 (pas contre une tribu)     |

- **Bonus « grand territoire » :** un empire immense **se défend** moins bien : le terme principal des pertes de son assaillant et son temps par tuile sont multipliés par `1 − 0,3 / (1 + (0,45 × terres de la carte / terres du défenseur)^2,5)`, soit ×0,83 contre un empire à 50 %. La part attaquante de la formule du genre (pertes ×0,60 et conquête 1,7× plus rapide pour un empire à 50 % des terres) est **retirée** depuis le 2026-10-10 : elle accélérait la boule de neige, à l'inverse de ce que ce paragraphe annonçait.
- **Poids de la Couronne** (`CROWN_LOSS_MULT`) : qui porte la Couronne (au moins 35 % des terres, le plus grand ; ♛ au classement) perd **50 % de troupes en plus** quand il attaque un royaume. Les tribus et les terres libres ne coûtent pas plus. Le porteur est fixé au début de chaque tick. En une phrase : « La Couronne se paie en sang. »
- **Anti-boule de neige, mesures** (game designer, 2026-10-10 ; 4 prétendants Duc + 60 tribus, carte moyenne, 400 parties) : le meneur passait de 35 % à 80 % des terres en **2,9 min** médianes (50 → 80 % en 1,5 min), nourri à 63 % par les royaumes conquis ; il tient désormais **6,1 min** (50 → 80 % : 3,0 min). Les royaumes reprennent à la Couronne l'équivalent de 20 % de la carte au lieu de 10 %, et le porteur repasse sous 35 % au moins une fois dans 36 % des parties au lieu de 25 %. Écartés : régénération de la Couronne ×0,5 (22 % des parties sans vainqueur à 45 min), butin des tribus ×0,5 et plafond de la Couronne ×0,75 (sans effet), « défense du faible » (pertes × (terres de l'attaquant / terres du défenseur)^0,3 ; durée équivalente mais le seigneur gagne 59 % des parties contre des Écuyers au lieu de 78 %), « fardeau » proportionnel à la taille (Aldoria à 35–38 %).
- **Annexion :** un royaume réduit à **moins de 50 tuiles** est absorbé en entier par l'attaquant.
- **Rythme** (`Rules.ts`, 2026-10-10) : nos cartes ont 9 à 15 fois moins de terres qu'une carte du monde d'OpenFront. À formules égales, l'ouverture y est 3 fois plus rapide et chaque vague 2,4 fois plus décisive : une vague décidait d'une guerre en 7 s, une tribu disparaissait en 0,5 s. Trois facteurs ralentissent la partie :
  - `CONQUEST_PACE = 0,25` : contre un royaume, la progression (`tickFraction`) est divisée par 0,25, soit des batailles **4× plus lentes** ;
  - `EXPANSION_PACE = 0,5` : sur les terres libres, **2× plus lente** (l'ouverture reste plus vive que la guerre) ;
  - `REGEN_PACE = 0,5` : régénération des troupes **2× plus lente**. Sans elle, ralentir les batailles raccourcissait les guerres, car les troupes engagées ne comptent pas dans le stock et le reste se régénère plus vite.
  - Mesures (game designer, carte moyenne, 60 tribus ; médianes) : fin des terres libres 27 s → **52 s** ; une tribu voisine absorbée 0,5 s → **3 à 6 s** ; une vague entre deux seigneurs 7 s → **20 s** ; guerre jusqu'à l'élimination 175 s → **243 s** ; victoire en solo 2,6 → **5,2 min**, à 4 seigneurs 6 → **10 min**.

## 7. Les quatre peuples

### 7.1 Modificateurs [Proto]

|                      | ⚜ Aldoria           | ⚒ Kharag  | ☠ Morvane                             | ❦ Sylvanor             |
| -------------------- | ------------------- | --------- | ------------------------------------- | ---------------------- |
| Or                   | **×1,20**           | ×0,75     | ×0,90                                 | ×1,05                  |
| Plafond de troupes   | ×1                  | ×1        | ×1                                    | ×1                     |
| Régénération         | ×1                  | ×1        | ×0,95                                 | ×1                     |
| Pertes en attaque    | ×1                  | **×0,85** | ×1                                    | ×1                     |
| Défense              | ×1 (remparts, §7.3) | ×0,95     | ×1                                    | ×1                     |
| Vitesse de conquête  | ×1                  | **×1,10** | ×1                                    | ×1                     |
| Coût des bâtiments   | **×0,85**           | ×1        | ×1                                    | ×1                     |
| Portée des tours     | **×1,25**           | ×1        | ×1                                    | ×1                     |
| Défense en forêt     | ×1                  | ×1        | ×1                                    | **×1,5**               |
| Progression en forêt | ×1                  | ×1        | ×1                                    | **×0,7** (plus rapide) |
| Moisson des morts    | —                   | —         | **25 %** des pertes ennemies relevées | —                      |
| Mécanique propre     | Remparts            | Pillage   | Levée des charniers (15 %)            | Bosquets               |

Avec le rythme du 2026-10-10 (§6), le ralentissement des remparts passe de 1,5 à **1,2** (sinon Aldoria monte à 33 %) ; mesuré sur 200 parties : **27,5 / 22,5 / 23 / 27 %**. Il faut au moins 200 parties pour mesurer l'équilibre : entre deux moitiés de 100 parties, l'écart atteint ±8 points.

Réglage de l'IA du 2026-10-10 : régénération de Morvane −10 % → **−5 %**. Mesures du game designer : 4 prétendants Duc, un par peuple, sans nuances (400 parties, sièges tournants) : **23 / 29 / 26 / 22 %** des parties menées ; contre-épreuve sur 4 seigneurs scriptés (300 parties) : 30,7 / 25 / 24,7 / 19,7 %. Cette contre-épreuve place Aldoria à 32,7 % sur les règles d'avant, contrairement à la mesure du 2026-10-09 ci-dessous : à suivre (option : remparts ×1,35).

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
- **⚜ Remparts (Aldoria) :** toutes les 10 s, une tuile frontière déjà en lisière à la ronde précédente devient un **rempart** : l'assaillant y subit des **pertes ×1,5** et avance **1,2× plus lentement** (1,5× avant le rythme du §6). Pas de cumul avec une tour (la tour l'emporte). Le rempart disparaît quand la tuile est prise ou n'est plus en lisière : une brèche ouvre sur un intérieur sans défense. Les côtes comptent comme frontière et protègent des débarquements.
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
  - **Vitesse et limite :** **1 tuile par tick** (10 tuiles/s, comme OpenFront ; 3 avant le rythme du §6), soit environ 10 s pour une traversée moyenne ; **3 barges** en mer au plus par seigneur (et 3 tentatives de lancement par tick).
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

## 12. Diplomatie [Proto]

Comme sur OpenFront, avec la granularité de ses types de joueurs (§13). Constantes dans `Rules.ts` (`ALLIANCE_*`, `PARJURE_*`, `DONATION_COOLDOWN`, `CROWN_PERCENT`, `RELATION_*`). Spécification du game designer, validée le 2026-10-10.

### 12.1 Relations [Proto]

- Seuls les prétendants tiennent des relations : un entier de **−100 à +100** envers chaque joueur, qui revient vers 0 d'un point toutes les 2,5 s (une rancune de −100 s'efface en environ 4 min, la durée d'une guerre).
- États : Hostile < −50 ≤ Méfiant < 0 ≤ Neutre < 50 ≤ Amical.

| Événement                                            | Variation                                   |
| ---------------------------------------------------- | ------------------------------------------- |
| Lancer une attaque ou une barge contre le prétendant | −60 / −70 / −80 / −100 selon son niveau     |
| Attaquer un allié du prétendant                      | −30                                         |
| Trahir le prétendant                                 | fixée à −100                                |
| Trahir quelqu'un en étant voisin du prétendant       | −40                                         |
| Refuser une demande du prétendant                    | −10                                         |
| Alliance conclue ou renouvelée                       | +100 dans les deux sens                     |
| Don d'or / de troupes                                | +5 par 25 k d'or / par 10 k troupes (≤ +50) |

### 12.2 Alliances [Proto]

- **Demande :** valable **20 s** ; après un refus ou une expiration, **30 s** avant de redemander à la même cible. Une demande vers quelqu'un qui nous en a envoyé une vaut acceptation. Attaquer la cible annule sa propre demande en attente.
- **Durée :** **5 min** par défaut (option de partie `allianceTicks`, 0 = alliances désactivées).
- **Renouvellement :** fenêtre dans les **30 dernières secondes** ; les deux alliés doivent renouveler, et la durée repart au complet.
- **Plafond :** **5 alliances simultanées** par joueur, tribus comprises (mesure : 7 tribus voisines en médiane à 1–2 min ; sans plafond, on supprimerait toute pression dès la première minute).
- **Effets :** impossible d'attaquer un allié ou de débarquer chez lui ; à la conclusion, les attaques en cours entre les deux se retirent **sans perte** ; une barge qui touche une plage devenue alliée rentre sans perte ; pillage et levée sont de fait impossibles contre un allié ; **les remparts ne se forment pas sur une frontière commune avec un allié** (ceux déjà posés restent) ; les dons deviennent possibles.
- **Fin :** à l'expiration ; par rupture (Parjure, §12.3) ; quand un allié est éliminé.
- **Victoire :** un seul vainqueur. Quand tous les seigneurs et prétendants encore en vie sont alliés entre eux, **les alliances ne se renouvellent plus** : « La Couronne ne se partage pas ». Au Crépuscule (§14), le seuil compare la part d'un **seul** royaume : les terres des alliés ne s'additionnent pas, et un allié peut l'emporter seul.

### 12.3 Trahison : le Parjure [Proto]

- Rompre une alliance rend **Parjure pendant 60 s** (environ 3 vagues au rythme du §6), y compris avec une tribu. Rompre avec un Parjure ne coûte rien.
- Quiconque attaque un Parjure subit des **pertes ×0,5** et avance **25 % plus vite** (`tickFraction ×0,8`).
- Compteur de trahisons permanent. Les prétendants rejettent un Parjure dans 90 % des cas, et un joueur qui a trahi au moins deux fois dans 50 % des cas.
- Côté victime : cadre d'alerte et entrée au journal. Pour tous : écu brisé à côté du nom [Prévu, interface].

### 12.4 Dons [Proto]

- Vers un **allié vivant** uniquement ; **un don toutes les 10 s** par destinataire, or et troupes confondus ; montant par défaut : un tiers (côté client).
- L'or est borné par l'or du donneur, les troupes par la marge du destinataire (plafond moins troupes actuelles). Option de partie `donations` (activés par défaut).
- Les prétendants reçoivent des dons (leur relation s'améliore) mais n'en font pas en v1.

### 12.5 Embargo, commerce, communication [Prévu]

- L'embargo (permanent, ou de 5 min après une attaque) n'agira que sur les nefs et caravanes : reporté avec le commerce (§9), comme le bonus des caravanes entre alliés. La v1 ne crée aucun état d'embargo.
- Emojis et **messages prédéfinis** (pas de chat libre, pour la modération) : reportés.

## 13. Joueurs et IA

### 13.1 Types de joueurs [Proto]

|                              | Seigneur (humain)                | Tribu sauvage                           | **Prétendant** (IA)                               |
| ---------------------------- | -------------------------------- | --------------------------------------- | ------------------------------------------------- |
| Rôle                         | Joueur                           | Remplissage passif et faible            | Rival qui joue comme un humain                    |
| Nombre (menu)                | 1 en solo, 2 à 16 en multi       | 0 à 200 (60 par défaut)                 | 0 à 12 (3 / 5 / 8 selon la carte)                 |
| Peuple                       | Choisi                           | Aucun                                   | Un des 4, chaque peuple au plus ⌈N/4⌉ fois        |
| Troupes de départ            | 25 000                           | 10 000                                  | 12 500 / 18 750 / 25 000 / 31 250 selon le niveau |
| Plafond / régénération       | Formule × peuple                 | Formule ÷ 3 / × 0,5                     | Formule × peuple × niveau                         |
| Or par tick                  | 100 × peuple                     | 50                                      | 100 × peuple                                      |
| Pertes ×0,7 contre une tribu | oui                              | —                                       | oui                                               |
| Or cédé quand il est annexé  | 50 % (0 s'il n'a jamais attaqué) | 100 %                                   | 50 % (même règle que le seigneur)                 |
| Construit                    | oui                              | non                                     | Bourg, Tour de garde                              |
| Diplomatie                   | complète                         | accepte presque tout, ne demande jamais | complète (§13.4)                                  |
| Peut gagner                  | oui                              | **non**                                 | oui (en solo, sa victoire est une défaite)        |

- **« Prétendant » :** depuis que la Couronne d'Astre s'est brisée, chaque maison prétend la reforger. Niveaux : **Écuyer, Chevalier** (par défaut), **Duc, Empereur**.
- **Noms** propres à chaque peuple : maisons d'Aldoria (« Comté de Valgarde », « Duché d'Aubeval »…), clans de Kharag (Clan des Crocs de Cendre, Clan Fend-l'Os…), cours de Morvane (Cour des Linceuls, Ost de Morne-Glas…), cercles de Sylvanor (Sylve d'Ambreciel, Conclave des Saules…). Aucun calque de Warcraft.
- **Déploiement :** les prétendants se déploient à la création de la partie, avant les tribus, à au moins 60 tuiles les uns des autres (puis 30, puis sans contrainte si la place manque) : le joueur les voit avant de choisir sa terre. Identifiants : humains, puis prétendants, puis tribus.
- **Victoire :** les tribus sont exclues ; « dernier debout » désigne le dernier seigneur ou prétendant en vie, s'il y en a eu au moins deux.

### 13.2 Tribus sauvages [Proto]

- **Rythme :** elles agissent toutes les 4 à 8 s ; elles se déclenchent à 50–59 % du plafond et gardent une réserve de 30–39 % ; sur les terres libres, au-delà de 20 % du plafond, elles engagent 35 à 44 % de leurs troupes.
- **Cibles, dans l'ordre :** 1. terres libres adjacentes ; 2. **riposte** contre le royaume non allié qui l'attaque avec le plus de troupes ; 3. **Parjure voisin** (s'il est allié, elle rompt une fois sur 3, sans devenir Parjure) ; 4. **voisin non allié au hasard**, un seigneur ou un prétendant tiré étant écarté une fois sur deux.
- **Diplomatie :** elle répond à son prochain cycle et accepte toute demande, **sauf** celle d'un royaume qui l'attaque à ce moment-là (sinon on récupérerait son attaque sans perte) ; elle ne demande jamais ; elle ne renouvelle que si l'allié l'a demandé ; elle ne construit pas.

### 13.3 Prétendants : version 1 [Proto]

| Levier                                                                      | Écuyer      | Chevalier            | Duc     | Empereur      |
| --------------------------------------------------------------------------- | ----------- | -------------------- | ------- | ------------- |
| Plafond / régénération                                                      | ×0,5 / ×0,9 | ×0,75 / ×0,95        | ×1 / ×1 | ×1,25 / ×1,05 |
| Intervalle d'action (ticks)                                                 | 65–99       | 55–69                | 45–59   | 30–49         |
| Renonce à une cible humaine                                                 | 75 %        | 25 %                 | 0       | 0             |
| Prudence (part des troupes du plus fort voisin non allié gardée en réserve) | 0           | 0                    | 75 %    | 90 %          |
| Barges                                                                      | non         | terres libres et île | toutes  | toutes        |
| Tours de garde                                                              | jamais      | oui                  | oui     | oui           |
| Ligue contre la Couronne                                                    | non         | non                  | oui     | oui           |
| Réponse d'alliance inversée (« confusion »)                                 | 1/10        | 1/20                 | 1/40    | jamais        |
| Trahison programmée (rapport de troupes requis)                             | 10:1        | 10:1                 | 3:1     | 2:1           |
| Trahison quand il est enfermé (allié voisin le plus faible)                 | jamais      | 2:1                  | 1,5:1   | 1,2:1         |
| Relation quand il est attaqué                                               | −60         | −70                  | −80     | −100          |

- **Cycle :** 1. répondre aux demandes et renouvellements ; 2. trahison programmée éventuelle ; 3. au plus une demande d'alliance sortante ; 4. construction ; 5. attaque. Reportés : emojis, embargo, navires de guerre, sorts.
- **Attaque :** déclenchement à 45–54 % du plafond ; réserve = max(25–34 % du plafond, prudence × troupes du plus fort voisin non allié). Priorité absolue aux terres libres (40 % des troupes au-delà de 15 % du plafond), en barge si aucune n'est adjacente (dès Chevalier). Puis, dans l'ordre : **riposte** ; **Couronne** (Duc, Empereur : le royaume qui tient au moins 35 % des terres, voisin ou en barge) ; **aide à un allié** ; **Parjure voisin** ; tribu voisine la moins dense ; voisin le plus haï (relation < −50) ; voisin le moins dense si nos troupes valent au moins **1,25 fois** les siennes (`NATION_WEAKEST_EDGE` ; l'ancien seuil, 0,8 × troupes engageables, exigeait un voisin 5 fois plus faible entre Ducs égaux et figeait 44 % des parties) ; **île** : sans aucun voisin à attaquer, une barge vers le royaume non allié le plus faible, au même rapport (dès Chevalier). Une barge offensive ne sert qu'en riposte, contre la Couronne ou vers une île.
- **Construction :** Bourg dès que l'or le couvre (×1,5 pour Écuyer et Chevalier), au cœur du royaume ; Tour quand les attaques entrantes engagent plus de 35 % de ses troupes, quelques tuiles derrière la frontière la plus menacée.
- **Pas de nuance de peuple** : le caractère d'un prétendant ne dépend que de son niveau. Mesurées, les nuances portaient Kharag à 38–41 % des parties menées et laissaient Morvane à 13–16 % ; la stratégie « charognard » de Morvane est retirée, et tous bâtissent une Tour à 35 % d'attaque entrante.

### 13.4 Arbre d'alliance des prétendants [Proto]

1. Confusion : selon le niveau, une chance sur 10, 20 ou 40 d'inverser la réponse finale.
2. Demandeur Parjure : rejet dans 90 % des cas ; ayant trahi au moins deux fois : rejet dans 50 % des cas.
3. Demandeur qui a déjà au moins 3 alliances hors tribus : rejet.
4. Demandeur qui porte la Couronne : rejet.
5. Demandeur menaçant (voisin dont les troupes valent au moins 1,5 fois les siennes) : **acceptation**.
6. Relation < 0 : rejet.
7. Relation ≥ 50 : acceptation.
8. Le prétendant a déjà au moins 2 alliances hors tribus : rejet.
9. Moins de 3 minutes de jeu : acceptation.
10. Forces comparables (rapport des troupes entre 0,5 et 2) : acceptation ; sinon rejet.

- **Enfermé** : ni terre libre ni voisin non allié (tribu ou royaume) à sa frontière : toutes ses frontières sont alliées.
- **Renouvellement :** si la relation est ≥ 0, que l'allié ne porte pas la Couronne, qu'aucune trahison n'est prévue contre lui et, s'il est enfermé, que ce n'est pas son allié voisin le plus faible (qu'il laisse expirer). Mesure : le test de relation seul ne filtrait presque rien (la relation retombe à 0 avant l'ouverture de la fenêtre), d'où des renouvellements systématiques et des fronts figés.
- **Demandes sortantes :** à un voisin Amical ; ou, s'il est menacé, à un voisin de la menace dont la relation est ≥ 0 ; jamais vers un Parjure ni vers la Couronne.
- **Trahison programmée :** il rompt avec un allié voisin si le rapport de troupes atteint le seuil de son niveau, qu'aucune attaque ne le vise et que l'alliance dure depuis au moins 60 s ; le même cycle, il attaque cet ancien allié. Enfermé, il trahit aussi son allié voisin le plus faible à un rapport moindre (tableau du §13.3).

### 13.5 Plus tard

- **Camps de créatures** [Idée] : des repaires neutres très défendus (dragon, troll ancestral) qui donnent un bonus durable quand on les prend. C'est un clin d'œil aux « creeps » de Warcraft III.
- Prétendants : victimes déjà attaquées, cibles « juteuses », têtes de pont, emojis, sorts.

## 14. Fin de partie [Proto et Prévu]

- **Victoire** [Proto] : plus de 80 % des terres conquérables, ou dernier seigneur ou prétendant debout. Les tribus ne gagnent jamais et ne comptent pas pour « dernier debout » ; des alliés ne gagnent pas ensemble.
- **Crépuscule** [Proto] (`TWILIGHT_*`) : **20 min** après la fin du déploiement, le Crépuscule tombe ; chaque minute écoulée ensuite, le seuil de victoire perd **3 points** : 77 % à 21 min, 50 % à 30 min, 35 % (la Couronne) à 35 min. Le seuil courant et le compte à rebours sont envoyés au client (`TickResult.winPercent`, `warTicks`), et l'événement `twilight` l'annonce au journal. Pourquoi 20 min et pas 30 comme OpenFront : nos parties visent 10 à 20 min ; à 30 min le Crépuscule ne toucherait que 5 % des parties et les laisserait durer jusqu'à 45 min.
- **Limite** [Proto] (`TIME_LIMIT_TICKS`) : à **35 min** de guerre, le plus grand royaume l'emporte, quelle que soit sa part (le premier identifiant en cas d'égalité). Remplace la limite de 170 min.
- Mesures (400 parties, 4 prétendants Duc) : 9 % des parties se terminent par le Crépuscule ou la limite (part du vainqueur : 59 % en médiane, 34 % au minimum) ; aucune ne dépasse 35,3 min (déploiement compris). « Dernier debout » reste immédiat à tout moment.
- **Horloge du Jugement** [Reporté, option] : une part de territoire minimale qui monte par vagues ; ceux qui restent en dessous dépérissent. Inutile tant que la limite de 35 min borne les parties : nos fins lentes viennent d'un meneur bloqué entre 55 et 75 %, pas de petits royaumes qui se cachent. À reconsidérer pour les grandes parties multijoueur.

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

| Action                     | Souris / clavier                                                                                               |
| -------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Choisir sa terre de départ | Clic sur une terre libre                                                                                       |
| Attaquer                   | Clic gauche sur la cible                                                                                       |
| Ratio d'attaque            | Curseur, <kbd>T</kbd> / <kbd>Y</kbd> (pas de 10 %)                                                             |
| Construire                 | <kbd>1</kbd> Bourg, <kbd>2</kbd> Tour, puis clic                                                               |
| Annuler                    | <kbd>Échap</kbd>, clic droit                                                                                   |
| Caméra                     | Glisser, molette, <kbd>+</kbd> / <kbd>−</kbd>, <kbd>C</kbd> pour centrer                                       |
| Débarquer                  | Clic sur une terre au-delà de la mer, ou <kbd>B</kbd> sur la terre visée                                       |
| Alliance                   | <kbd>K</kbd> sur un royaume : proposer, accepter sa demande, ou renouveler (fenêtre des 30 dernières secondes) |
| Rompre une alliance        | <kbd>L</kbd> deux fois en moins de 2 s sur un allié (vous devenez Parjure 60 s)                                |
| Menu diplomatique          | Clic droit sur un royaume, cartes de demande, marqueurs sur la carte [Prévu, étape interface]                  |

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
- Le délai avant que les terres libres soient épuisées est mesuré à **50 s environ** sur une carte moyenne avec 60 tribus ; viser **40 à 60 s**. Si l'ouverture semble molle, c'est le premier réglage à revoir (`EXPANSION_PACE`, `REGEN_PACE`).
- Cibles de rythme : une vague entre deux seigneurs **15 à 30 s**, une barge **10 à 20 s** pour une traversée moyenne, une guerre entre royaumes comparables **2 à 4 min**.
- Durée de partie (cible : médiane de 10 à 20 min, aucune partie au-delà de 35 min). Mesures du game designer (2026-10-10), avant → après le poids de la Couronne, le bonus « grand territoire » défensif et le Crépuscule : 4 prétendants Duc + 60 tribus, carte moyenne, 400 parties : médiane **8,6 → 12,7 min** (p10–p90 : 6,6–14,5 → 8,8–27,3 ; maximum 34,6 min avec 1 % de parties sans vainqueur à 45 min → 35,3 min, toutes terminées) ; victoires par peuple Aldoria 23 → 29 %, Kharag 29 → 25 %, Morvane 26 → 23 %, Sylvanor 22 → 24 %. Un seigneur scripté contre 5 prétendants : il gagne **78 → 76 %** des parties contre des Écuyers, 18 → 13 % contre des Chevaliers, 4 → 3 % contre des Ducs, 0 % contre des Empereurs ; sa partie dure 7,4 → 9,1 min en médiane contre des Chevaliers (p10 5,0 → 5,6 min).
- Les charniers relèvent deux fois moins de morts au nouveau rythme (vagues plus espacées). Allonger `CHARNIER_TICKS` à 900 a été mesuré sans effet (Morvane à 17 %) : le levier est la régénération de Morvane (−5 % depuis le 2026-10-10).
- **IA des prétendants (2026-10-10)**, mesures du game designer : 4 prétendants Duc + 60 tribus, carte moyenne, 400 parties : parties gagnées en moins de 30 min **54 % → 98,5 %**, durée médiane 11,2 → **8,6 min** (p10–p90 : 6,6–14,3), trahisons par partie 0,44 → **1,2**. Un seigneur contre 5 prétendants : il gagne 78 % des parties contre des Écuyers, 18 % contre des Chevaliers (éliminé avant 5 min : 10 %), 4 % contre des Ducs, 0 % contre des Empereurs.
- Les parties longues favorisent Aldoria (or ×1,2, Bourgs moins chers, remparts) : 29 % des victoires à 4 Ducs, et 34 à 37 % des victoires de prétendants contre un seigneur seul au niveau Duc ou Empereur (100 parties chacun, ±5 points ; 27 à 31 % avant). Remparts ×1,35 ou or ×1,1 mesurés sans effet net : refaire un banc solo de 400 parties avant de toucher au peuple.
- Recherche de route maritime : pics de 60 à 85 ms par tick sur 2 M de tuiles avec 12 prétendants (budget 100 ms) ; la stratégie « île » l'utilise un peu plus. À optimiser.
- Le premier Bourg arrive vers 2 min de jeu (125 k d'or à environ 1 000 à 1 200 or/s) : vérifier que ce n'est pas trop lent.
- La moisson de Morvane (25 %) et la levée des charniers (15 %) peuvent faire boule de neige pendant les guerres longues : si c'est le cas, interdire la levée sur les charniers créés par Morvane lui-même.
- Le banc d'essai des mécaniques propres fait beaucoup de va-et-vient (environ 55 % des prises tombent sur un charnier) : avec de vrais joueurs, Morvane pourrait être plus faible et Kharag piller davantage. Suivre l'or pillé et les morts relevés.
- Aldoria est sous-estimée par ce banc d'essai : ses bots ne construisent pas de tours.
- Le bonus forestier de Sylvanor dépend de la carte. Mesuré sur 4 graines (carte moyenne) : forêt **25 à 37 %** des terres, plaine 36 à 44 %, collines 20 à 25 %, montagnes 5 à 14 %, pics 1 %. On craignait que ce soit trop favorable à Sylvanor, mais la simulation de 2026-10-09 le donnait au contraire faible (14 % des parties menées) avant les bosquets. À revérifier sur les graines très boisées (37 % de forêt) ; le seuil d'humidité `0.53` du générateur permet de réduire la forêt si besoin.
