# OpenFront.io — Analyse fonctionnelle et technique complète

> **Source** : code open-source officiel `github.com/openfrontio/OpenFrontIO`, commit `b773251` du 9 octobre 2026, lu fichier par fichier. Le site openfront.io bloque le scraping (HTTP 403), donc tout ce qui suit vient du code et de la doc du dépôt (`docs/*.md`), sauf mention contraire.
> **Unités** : 1 tick = 100 ms, donc 10 ticks = 1 s. Les montants d'or sont notés k (milliers) et M (millions).
> **Références** : les chemins sont relatifs à la racine du dépôt.
> **Incertain** : signale un point non confirmé dans le code.

---

## Sommaire

1. [Présentation du produit](#1-présentation-du-produit)
2. [Boucle de gameplay](#2-boucle-de-gameplay)
3. [Carte et terrain](#3-carte-et-terrain)
4. [Temps, phases et boucle de simulation](#4-temps-phases-et-boucle-de-simulation)
5. [Ressources : troupes et or](#5-ressources--troupes-et-or)
6. [Expansion et attaques terrestres](#6-expansion-et-attaques-terrestres)
7. [Naval : transports, navires de guerre, commerce](#7-naval--transports-navires-de-guerre-commerce)
8. [Bâtiments et unités](#8-bâtiments-et-unités)
9. [Économie avancée : commerce maritime et trains](#9-économie-avancée--commerce-maritime-et-trains)
10. [Armes nucléaires et SAM](#10-armes-nucléaires-et-sam)
11. [Diplomatie](#11-diplomatie)
12. [Victoire, élimination, anti-stagnation](#12-victoire-élimination-anti-stagnation)
13. [Intelligence artificielle](#13-intelligence-artificielle)
14. [Modes de jeu, options, lobbies, classé](#14-modes-de-jeu-options-lobbies-classé)
15. [Cartes : catalogue, format, générateur](#15-cartes--catalogue-format-générateur)
16. [Client : écrans, HUD, contrôles, rendu](#16-client--écrans-hud-contrôles-rendu)
17. [Architecture technique](#17-architecture-technique)
18. [Réseau et protocole](#18-réseau-et-protocole)
19. [Serveur, infrastructure, déploiement](#19-serveur-infrastructure-déploiement)
20. [Comptes, sécurité, anti-triche](#20-comptes-sécurité-anti-triche)
21. [Monétisation et cosmétiques](#21-monétisation-et-cosmétiques)
22. [Licences et points d'attention pour un projet dérivé](#22-licences-et-points-dattention-pour-un-projet-dérivé)
23. [Points incertains](#23-points-incertains)

---

## 1. Présentation du produit

| Élément | Valeur |
|---|---|
| Genre | RTS en temps réel, massivement multijoueur, dans le navigateur. On conquiert du territoire sur des cartes géographiques réelles. |
| Origine | Fork et réécriture de **WarFront.io**. Même famille que Territorial.io. |
| Éditeur | OpenFront Inc. (dév. principal : Evan Pellegrini) |
| Plateformes | Web (desktop et mobile), **Steam** (shell Electron, accès anticipé annoncé pour le 17/09/2026 d'après game8.jp), portail **CrazyGames**, PWA/iOS |
| Joueurs par partie | De 2 (classé 1v1) à plusieurs centaines. La config accepte jusqu'à 1000 joueurs, 400 nations et 400 bots. |
| Durée typique | Environ 30 min. Limite dure de 170 min. |
| Modèle économique | Free-to-play avec publicités. Cosmétiques, monnaie premium « Plutonium » et abonnements (Vanguard, Warlord, Sovereign). Tout achat supprime les pubs à vie. |
| Licence | Code sous **AGPL-3.0**, assets sous **CC BY-SA 4.0**, dossier `proprietary/` sous tous droits réservés (voir §22) |
| Langues | 41 (traduction via Crowdin) |

**Pitch.** On apparaît sur une carte du monde avec un petit disque de territoire, puis on s'étend sur les terres neutres et on attaque ses voisins. On construit une économie (villes, ports, usines, trains), on noue et trahit des alliances, on lance des bombes nucléaires. Un joueur gagne en contrôlant 80 % des terres.

---

## 2. Boucle de gameplay

1. **Phase de spawn (10 à 20 s).** Chaque joueur clique un point de départ et reçoit un disque de rayon 4, soit environ 50 tuiles. Le spawn peut aussi être aléatoire.
2. **Expansion.** On attaque les terres neutres (« terra nullius ») avec un pourcentage de ses troupes, réglé par le curseur de ratio (20 % par défaut).
3. **Croissance.** Les troupes se régénèrent vers un plafond qui dépend du territoire et des villes. L'or tombe en continu.
4. **Construction.** Villes pour plus de troupes, ports et usines pour le commerce, postes défensifs, SAM, silos, navires de guerre.
5. **Conflit.** Attaques terrestres, débarquements navals et frappes nucléaires (atomique, hydrogène, MIRV).
6. **Diplomatie.** Alliances temporaires de 5 min renouvelables, trahison (statut « traître »), embargos, dons d'or et de troupes, emojis, quick chat.
7. **Fin.** Un joueur ou une équipe atteint 80 % des terres non irradiées. Sinon le timer expire, ou un mécanisme anti-stagnation tranche : Overtime ou Doomsday Clock.

---

## 3. Carte et terrain

### 3.1 Modèle de tuile
Code : `packages/engine-lib/src/game/GameMapImpl.ts`.

- Une tuile est un entier `ref = y*width + x`. L'origine est en haut à gauche.
- **Terrain, immuable, `Uint8Array`, 1 octet par tuile :**

| Bit | Signification |
|---|---|
| 7 | Terre (`IS_LAND`) |
| 6 | Rivage (`SHORELINE`) |
| 5 | Océan (le plus grand plan d'eau ; les autres sont des lacs) |
| 0-4 | Magnitude : altitude de la terre (0-30), ou distance à la côte pour l'eau |
| Spécial | `0b10011111` (terre + magnitude 31) = **infranchissable** |

- **Types de terrain :** magnitude < 10 = **Plaine**, < 20 = **Colline** (Highland), sinon **Montagne**. Magnitude 31 = Infranchissable. Toute tuile non terrestre = Océan. Les lacs sont de l'eau sans le bit océan.
- **État, mutable, `Uint16Array` :**

| Bits | Signification |
|---|---|
| 0-11 | Propriétaire `smallID`. 0 = personne, d'où **4095 joueurs maximum**. |
| 13 | Retombées radioactives (fallout) |
| 14 | Bonus défense (inutilisé) |

- **Connexité :** 4-voisins (N, S, O, E) pour le territoire et les attaques. 8-voisins pour la détection d'enclaves.
- **Bordure :** tuile ayant un 4-voisin d'un autre propriétaire.

### 3.2 Échelles
Chaque carte existe en 3 résolutions :

| Fichier | Résolution |
|---|---|
| `map.bin` | Pleine |
| `map4x.bin` | ½ largeur et ½ hauteur, soit ¼ des tuiles |
| `map16x.bin` | ¼ largeur et ¼ hauteur |

| Taille de partie | Carte de jeu | Mini-carte (pathfinding naval et rail) |
|---|---|---|
| Normal | `map.bin` | `map4x.bin` |
| **Compact** | `map4x.bin` | `map16x.bin` |

En mode Compact, les coordonnées des nations et des zones de spawn sont divisées par 2.

### 3.3 Ordres de grandeur

| Carte | Taille | Tuiles terrestres | Nations |
|---|---|---|---|
| World | 2000×1000 | 651 569 | 72 |
| Giant World Map | 4108×1948 | 2,34 M | 107 |
| Europe | 2904×1672 | 2,35 M | 52 |
| The Box | 2048×2048 | 4,19 M (100 % terre) | 13 |
| Onion | 512×512 | 210 k | 3 |

Taille recommandée pour une nouvelle carte : 2 à 3 Mpx, au plus 3 M tuiles terrestres.

---

## 4. Temps, phases et boucle de simulation

### 4.1 Rythme
- **1 tick = 1 tour = 100 ms**, soit 10 Hz. Le serveur émet un tour toutes les 100 ms et chaque client exécute exactement un tick par tour.
- Le rendu tourne à 60 fps et interpole les déplacements à partir des « motion plans ».

### 4.2 Phases

| Phase | Durée / règle |
|---|---|
| Lobby | Public : décompte de 2 min, ou départ immédiat si le lobby est plein. Privé : lancé par l'hôte. |
| Prestart | Le serveur envoie la carte, les clients la chargent, la partie démarre 2 s plus tard. |
| **Spawn** | Solo : 100 ticks, mais la phase se termine dès que le joueur choisit son spawn. Spawn aléatoire : 150 ticks. Sinon : **200 ticks (20 s)**. Pendant cette phase : ni régénération, ni construction, ni attaque. |
| Immunité post-spawn | 50 ticks (5 s) par défaut, configurable. Seuls les attaquants **humains** la respectent, et personne ne peut lancer de nucléaire pendant cette fenêtre. |
| Jeu | Jusqu'à la victoire, au timer, ou à 170 min (limite dure) |

### 4.3 Ordre d'exécution d'un tick
Code : `GameImpl.executeNextTick`.

1. Les intents du tour deviennent des *Executions* (pattern Command).
2. `tick()` est appelé sur chaque exécution active, dans l'ordre d'insertion.
3. `init()` est appelé sur les nouvelles exécutions. Un intent reçu au tick T commence donc à agir à T+1.
4. Les exécutions inactives sont purgées.
5. Les diffs par joueur sont construits.
6. Tous les 10 ticks, un **hash** de l'état est émis pour détecter les désynchronisations.
7. Le compteur de ticks est incrémenté.

**Par joueur et par tick** (`PlayerExecution`) :
- décroissance des relations ;
- capture ou destruction des bâtiments situés sur des tuiles perdues ;
- régénération des troupes et revenu d'or ;
- expiration des alliances et des embargos ;
- détection d'enclaves tous les 20 ticks, ou à chaque tick si le joueur a moins de 100 tuiles.

---

## 5. Ressources : troupes et or

### 5.1 Valeurs de départ

| Joueur | Troupes | Or |
|---|---|---|
| Humain | 25 000 (1 M si troupes infinies) | `startingGold`, 0 par défaut |
| Bot (Tribu) | 10 000 | 0 |
| Nation Facile / Moyen / Difficile / Impossible | 12 500 / 18 750 / 25 000 / 31 250 | `startingGold` |

Troupes et or sont stockés en **BigInt**, arrondis à l'entier inférieur à chaque modification, pour garantir le déterminisme.

### 5.2 Troupes maximum
```
maxTroops = 2 × (tiles^0.6 × 1000 + 50 000) + Σ(niveaux de villes) × 250 000
```
- Bot : ÷3.
- Nation : ×0,5 / 0,75 / 1 / 1,25 selon la difficulté.
- Exemples : 1 tuile → 102 k ; 10 000 tuiles → environ 602 k ; 100 000 tuiles → environ 2,1 M.

### 5.3 Régénération par tick
```
toAdd = (10 + troops^0.73 / 4) × (1 − troops / maxTroops)
```
- Bot : ×0,5.
- Nation : ×0,9 / 0,95 / 1 / 1,05.
- Le résultat ne dépasse jamais le maximum. Au-dessus du maximum (après une perte de territoire), les troupes décroissent.
- Exemple : 25 k troupes pour un maximum de 102 k donne environ **314 troupes/tick**.
- Il n'y a pas de séparation entre ouvriers et soldats. Le nom de variable `goldFromWorkers` est un reste de l'ancien code.

### 5.4 Or

| Source | Formule |
|---|---|
| Revenu passif | **100 or/tick** (1 000/s) pour les humains et les nations, 50/tick pour les bots, × `goldMultiplier` (0,1 à 1000). Ne dépend **pas** de la taille du territoire. |
| Navires marchands | voir §9.1 |
| Trains | voir §9.2 |
| Conquête d'un joueur | Bot ou Nation : 100 % de son or. Humain : 50 %. Rien si l'humain n'a jamais attaqué. |

---

## 6. Expansion et attaques terrestres

### 6.1 Lancer une attaque
- **Intent** `attack {targetID | null, troops}`. `null` cible les terres neutres.
- **Troupes envoyées :** le client envoie `troupes × attackRatio`, le curseur allant de 1 à 100 % (20 % par défaut). Le moteur utilise `troops/5` par défaut (`troops/20` pour un bot).
- **Pas de direction.** L'attaque progresse sur **toute la frontière commune** avec la cible.
- **Effets à l'initialisation :**
  1. Les troupes sont retirées immédiatement.
  2. La cible obtient un **embargo temporaire** contre l'attaquant (5 min) et rejette ses demandes d'alliance en attente.
  3. Les **attaques opposées s'annulent** : les troupes se soustraient.
  4. Les attaques vers une même cible **fusionnent**.
  5. La relation de la cible envers l'attaquant baisse de −60, −70, −80 ou −100 selon la difficulté.
- **Interdictions :** attaquer un allié ou un coéquipier, ou une cible immunisée (pour un attaquant humain).

### 6.2 Conquête tuile par tuile
- Un **tas de priorité** contient les tuiles de front :
  ```
  priorité = (rand[0,7) + 10) × (1 − 0,5 × voisinsDéjàÀMoi + terrainMag/2) + tickCourant
  terrainMag : Plaine 1, Colline 1,5, Montagne 2
  ```
  On prend d'abord les tuiles plates, celles déjà entourées par l'attaquant, et les plus anciennes.
- **Boucle par tick :** budget = 1. Chaque tuile consomme `tickFraction`. Le nombre de tuiles prises par tick augmente donc avec les troupes engagées et la longueur du front.

### 6.3 Formules de combat
Code : `EngineConfig.attackLogic`.

| Terrain | `mag` (pertes) | `tileCost` (lenteur) |
|---|---|---|
| Plaine | 80 | 16,5 |
| Colline | 100 | 20 |
| Montagne | 120 | 25 |

- **Poste défensif** du défenseur à moins de 30 tuiles (distance euclidienne) : `mag ×5`, `tileCost ×3`.
- **Tuile irradiée :** `mag` et `tileCost` sont multipliés par `5 − 2 × (tuilesIrradiées / tuilesTerre)`.

**Contre les terres neutres :**
```
perteAttaquant = mag / 5   (bot : mag / 10)     → 16 troupes par tuile de plaine
tickFraction   = clamp(2000 × tileCost / troupesAttaque, 5, 100) / (2 × tailleFront)
```

**Contre un joueur :**
```
LB(n, d) = 1 − d / (1 + (300 000 / n)^2.5)       // bonus « grand territoire »
ratio = troupesDéfenseur / troupesAttaque
perteAttaquant = mag × clamp(ratio, 0.6, 2) × (0.463 × LB(att,0.7) × LB(déf,0.3) + 0.0039 × densitéDéfenseur)
perteDéfenseur = troupesDéfenseur / tuilesDéfenseur      (densité moyenne, par tuile prise)
vitesse = clamp(ratio, 0.82, 7.5) × clamp(ratio/20, 1, 50) / 8.55
tickFraction = vitesse × tileCost × LB(att,0.73) × LB(déf,0.3) × modTraître / tailleFront
```

**Modificateurs :**

| Situation | Effet |
|---|---|
| Défenseur traître | pertes de l'attaquant ×0,5, conquête 20 % plus rapide (×0,8) |
| Humain ou Nation qui attaque un Bot | pertes ×0,7 |
| Coéquipier déconnecté en défense | aucune perte pour l'attaquant |

Des tests « golden » (`tests/AttackLogicGolden.test.ts`) figent ces formules.

### 6.4 Retraite
- **Annulation manuelle** (`cancel_attack`) : l'attaque se fige pendant 20 ticks (2 s), puis revient. On perd **25 % des troupes** si la cible est un joueur, rien sur des terres neutres.
- **Retraite automatique sans perte :** la cible devient alliée, ou le front disparaît.
- **Fin d'une attaque :** elle meurt quand ses troupes tombent sous 1.

### 6.5 Élimination et enclaves
- Un joueur est mort quand il n'a **plus aucune tuile**.
- **Défenseur sous 100 tuiles :** il est annexé entièrement, en jusqu'à 100 passes. Le conquérant reçoit son or.
- **Enclaves :** un groupe de tuiles entièrement entouré par un seul joueur non allié, sans accès à la mer ni au bord de carte, est transféré à ce joueur.
- **Terres neutres :** on ne peut les attaquer que si un parcours à travers d'autres terres neutres (distance Manhattan ≤ 200) rejoint notre frontière.

---

## 7. Naval : transports, navires de guerre, commerce

### 7.1 Navire de transport (débarquement)
- **Intent** `boat {troops, dst}`. Au plus **3 transports en mer** par joueur. Troupes par défaut : troops/5.
- **Trajet :** de notre côte la plus proche (par voie d'eau) vers la côte ennemie la plus proche, à **1 tuile/tick**.
- **Débarquement :** prise de la tuile d'arrivée, puis lancement d'une attaque terrestre depuis ce point, jamais fusionnée avec une autre.
- **Cas particuliers :**

| Situation | Résultat |
|---|---|
| La cible est devenue alliée | troupes rendues |
| Le transport revient sur notre propre côte | −25 % des troupes |
| Annulation (`cancel_boat`) | retour à la côte la plus proche, −25 % |
| Aucun chemin trouvé | troupes remboursées |
| La destination devient de l'eau (nuke aquatique) | retraite automatique |

- **Fragilité :** pas de PV, un obus suffit à le couler.

### 7.2 Navire de guerre

| Paramètre | Valeur |
|---|---|
| Coût | 250 k × (n+1), plafonné à 1 M |
| PV | 1000 |
| Apparition | au port possédé le plus proche dans le même plan d'eau |
| Portée de ciblage | 130 |
| Priorité de cible | Transport > Navire de guerre > Marchand |
| Cadence de tir | 1 obus / 20 ticks (2 s). **Aucun rechargement après avoir tiré sur un transport.** |
| Obus | 3 tuiles/tick, à tête chercheuse, **200 à 300 dégâts** (aléatoire) |

- **Piraterie :** il capture les navires marchands ennemis à moins de 100 tuiles de son point de patrouille, quand il passe à 5 tuiles ou moins. L'or de la cargaison va au capteur.
- **Patrouille :** tuile d'eau aléatoire à ±50 du point de patrouille. Le point se déplace avec `move_warship`, et une sélection multiple est possible.
- **Réparation :**
  - Sous 75 % de PV, le navire retourne au port et y accoste.
  - Soin passif : +1 PV/tick à moins de 150 d'un port.
  - Soin à quai : niveau du port × 5 PV/tick, partagé entre les navires.
  - Capacité d'accueil : niveau du port.
- **Vétérance :** jusqu'au niveau 3, chaque niveau donne +20 % de PV max et +20 % de dégâts.
  - Couler un navire de guerre = +1 niveau immédiat.
  - 10 transports coulés = +1 niveau.
  - 25 marchands capturés = +1 niveau.

---

## 8. Bâtiments et unités

### 8.1 Liste des types d'unités
16 types :

- **Bâtiments :** City, Port, Factory, DefensePost, SAMLauncher, MissileSilo
- **Mobiles :** Warship, TransportShip, TradeShip, Train
- **Projectiles :** AtomBomb, HydrogenBomb, MIRV, MIRVWarhead, Shell, SAMMissile

### 8.2 Tableau récapitulatif

| Unité | Coût (n = nombre déjà possédé, niveaux compris) | Construction | Améliorable | Effet |
|---|---|---|---|---|
| **City** | min(1 M, 2ⁿ × 125 k) : 125 k → 250 k → 500 k → 1 M | 2 s | oui | +250 k troupes max par niveau ; gare de train si une usine est à ≤ 110 |
| **Port** | min(1 M, 2ⁿ × 125 k), n = ports + usines | 5 s | oui | Génère des navires marchands, permet de construire des navires de guerre, soigne. Le niveau multiplie l'apparition de marchands, le poids comme destination et le soin. |
| **Factory** | idem, compteur partagé avec Port | 2 s | oui | Crée une gare qui **génère des trains** et relie toutes les villes et ports à ≤ 110 tuiles |
| **Defense Post** | min(250 k, (n+1) × 50 k) | 5 s | **non** | Dans un rayon de 30 : pertes de l'attaquant ×5 et conquête 3× plus lente. **Ne tire pas** (code commenté). Détruit, et non capturé, quand sa tuile est prise. |
| **SAM Launcher** | min(3 M, (n+1) × 1,5 M) | 30 s | oui | Intercepte les bombes A, H et les ogives MIRV (§10.4) |
| **Missile Silo** | 1 M fixe, chaque niveau compris | 10 s | oui | Lance les nucléaires. Niveau = nombre de missiles simultanés. Recharge de 9 s par emplacement. |
| **Warship** | min(1 M, (n+1) × 250 k) | instantané | non | voir §7.2 |
| **Transport** | gratuit (coûte des troupes) | — | — | voir §7.1 |
| **Atom Bomb** | 750 k | — | — | rayon intérieur 12, extérieur 30 |
| **Hydrogen Bomb** | 5 M | — | — | rayon intérieur 80, extérieur 100 |
| **MIRV** | **25 M + 15 M × nombre de MIRV déjà lancés dans la partie (tous joueurs confondus)** | — | — | jusqu'à 350 ogives |
| Trade Ship, Train, Shell, SAM Missile, Warhead | gratuits ou générés automatiquement | — | — | — |

### 8.3 Règles générales
- **Coût croissant :** `n = min(possédés, construits_à_vie)`. Perdre des bâtiments fait donc **rebaisser** les prix.
- **Amélioration :** une amélioration coûte comme une nouvelle construction du même type. Aucun niveau maximum dans le moteur. Achat groupé jusqu'à **50** par intent ; l'interface propose ×1, des paliers et ×Max.
- **Placement :**
  - Sur son propre territoire.
  - À au moins **15 tuiles** (distance euclidienne) de tout autre bâtiment, de n'importe quel joueur.
  - La recherche se fait dans un rayon de 15 autour du clic.
  - Un clic près d'un bâtiment de même type **l'améliore** au lieu d'en créer un.
  - Un port doit être sur une tuile de rivage, à une distance Manhattan ≤ 20 du clic.
- **Capture :** un bâtiment sur une tuile conquise est **capturé**, sauf le poste défensif, qui est détruit. Un chantier capturé est terminé par son nouveau propriétaire.
- **Suppression volontaire** (`delete_unit`) : seulement sur sa propre terre. Délai de 30 s avant destruction et cooldown de 30 s.
- **Nucléaire :** une bombe détruit **toutes** les unités dans son rayon extérieur, quel que soit leur niveau, y compris celles du lanceur.
- **Unités désactivables** dans la config de partie (`disabledUnits`).

---

## 9. Économie avancée : commerce maritime et trains

### 9.1 Navires marchands
- **Apparition :** chaque port tente un tirage tous les 10 ticks, autant de fois que son niveau. La probabilité est `1/spawnRate` :
  ```
  spawnRate = max(1, floor(100 / (rejets+1) / saturation(nbMarchandsGlobal)))
  ```
  Le terme `rejets` sert de compteur de malchance (« pity timer »). La courbe de saturation globale freine la production au-delà d'environ 330 navires.
- **Destination :**
  - Un port d'un **autre** joueur, sans embargo, dans le même plan d'eau.
  - Pondération par le niveau du port.
  - Bonus si le port est à ≥ 300 de distance et parmi les plus proches.
  - Bonus supplémentaire si son propriétaire est un allié.
- **Gain :**
  ```
  or = (75 000 / (1 + e^(−0.03 × (d − 300))) + 50 × d) × goldMultiplier
  ```
  `d` = nombre de tuiles parcourues. Exemples : d = 100 → environ 5 k ; d = 300 → 52,5 k ; d = 1000 → environ 125 k.
  **Les propriétaires du port de départ et du port d'arrivée touchent chacun le montant complet.**
- **Protection :** un navire passé sur une tuile de rivage dans les 20 derniers ticks ne peut pas être ciblé par les pirates.
- **Suppression :** embargo, perte du port de destination.

### 9.2 Trains et chemins de fer
- **Gares :**
  - Usine : génère des trains.
  - Ville et Port : arrêts commerciaux.
- **Réseau :**
  - Une nouvelle gare se raccorde à un rail existant à ≤ 3 tuiles.
  - Sinon elle se connecte à chaque gare située entre 15 et 110 tuiles, si celle-ci n'est pas déjà joignable en 4 sauts.
  - Longueur maximale d'un rail : environ 155 tuiles.
  - Le rail peut franchir l'eau sur de courts ponts.
  - Les boucles sont possibles.
- **Composition d'un train :** 7 unités (locomotive, locomotive de queue, 5 wagons), 2 tuiles/tick, sans PV.
- **Apparition :** au moins 10 ticks entre deux départs d'une même gare. Tirage :
  ```
  1 / max(1, floor((niveauxUsines + 10) × 15 / saturationTrains))
  ```
  La destination est une gare commerciale tirée au hasard dans le même cluster.
- **Gain à chaque arrêt Ville ou Port :**
  - Base : 10 k (sa propre gare), 25 k (autre joueur ou coéquipier), **35 k (allié)**.
  - −5 k par arrêt au-delà du 9e, minimum 5 k.
  - Si la gare appartient à un autre joueur, **les deux** propriétaires touchent le montant.

---

## 10. Armes nucléaires et SAM

### 10.1 Rayons et vitesses

| Arme | Rayon intérieur | Rayon extérieur | Vitesse (tuiles/tick) |
|---|---|---|---|
| Bombe A | 12 | 30 | 10 |
| Bombe H | 80 | 100 | 10 |
| MIRV (porteur) | — | — | 15 |
| Ogive MIRV | 12 | 18 | 22 à 26 |

- **Trajectoire :** parabole de Bézier, de hauteur max(distance/3, 50). La courbure peut être inversée vers le haut ou le bas (touche U).

### 10.2 Conditions de lancement
- Avoir un silo prêt.
- Pas pendant l'immunité de spawn.
- Ne pas viser un coéquipier ni une tuile infranchissable.
- En mode équipe, une bombe A ou H est interdite si un bâtiment allié se trouve dans le rayon extérieur.
- Un MIRV doit viser une tuile possédée par quelqu'un.

### 10.3 Détonation
- **Tuiles touchées :** 100 % des tuiles dans le rayon intérieur, 50 % entre le rayon intérieur et le rayon extérieur.
- **Effet sur ces tuiles :** elles deviennent neutres, avec des **retombées** (fallout). Avec l'option `waterNukes`, elles deviennent **de l'eau**, ce qui modifie la carte et déclenche une reconstruction du graphe naval.
- **Pertes de troupes :**
  - Bombes A et H : `5 × troupes / tuilesRestantes` par tuile détruite.
  - Ogive MIRV : `500 × (1 − e^(−2 × excès / maxTroops))`.
  - Les mêmes pertes s'appliquent aux attaques en cours et aux transports du joueur touché.
- **Unités :** toutes celles dans le rayon extérieur sont détruites, sauf les missiles.
- **Retombées :**
  - Elles ralentissent l'attaque de la tuile (§6.3).
  - Elles sont effacées quand la tuile est reconquise.
  - Elles sont exclues du total servant au calcul de victoire.

### 10.4 SAM

| Paramètre | Valeur |
|---|---|
| Portée | `150 − 480/(niveau + 5)` : N1 = 70, N3 = 90, N5 = 102, asymptote 150. Augmente progressivement après une amélioration. |
| Missiles | `niveau` missiles simultanés, rechargement de 9 s par emplacement, vitesse 12 tuiles/tick |
| Cibles | Bombes A, H et ogives MIRV. **Jamais le porteur MIRV.** |
| Interception | **Déterministe, sans probabilité.** Si le missile atteint le point d'interception précalculé, la bombe est détruite. |
| Fenêtre de vulnérabilité | La bombe n'est interceptable qu'à moins de **150 tuiles de sa cible ou de son point de lancement**. En plein vol long-courrier, elle est intouchable. |
| Priorité | Bombe H, puis proximité de la cible |

### 10.5 MIRV
- **Ogives :** jusqu'à **350**, réparties sur les terres du joueur ciblé dans un rayon de 1500 autour du point visé, espacées de ≥ 55.
- **Vol :** le porteur monte jusqu'à un point de séparation, puis les ogives se dispersent.
- **Effets diplomatiques :** l'alliance avec la cible est rompue et les relations baissent de −100 dans les deux sens. La cible reçoit l'alerte « MIRV INBOUND ».
- **Prix :** il augmente globalement de +15 M à chaque MIRV lancé dans la partie.

### 10.6 Nucléaire et alliances
Concerne les bombes A et H, au lancement.
- **Qui est « fâché » :** tout joueur qui a plus de **100 tuiles pondérées** dans le rayon (intérieur = 1, anneau = 0,5) **ou** un bâtiment dans le rayon.
- **Conséquences pour chaque joueur fâché :**
  - l'alliance est rompue, ce qui fait du lanceur un **traître** ;
  - relation −100 ;
  - les demandes d'alliance en attente sont rejetées.
- **Les ogives MIRV ne rompent jamais d'alliance.**
- **Si une alliance se forme pendant le vol**, les bombes qui la rompraient sont annulées.

---

## 11. Diplomatie

### 11.1 Relations (surtout pour l'IA)
- Score de −100 à +100, qui revient vers 0 de 0,05/tick.

| Score | État |
|---|---|
| < −50 | Hostile |
| −50 à < 0 | Méfiant |
| 0 à < 50 | Neutre |
| ≥ 50 | Amical |

| Événement | Variation |
|---|---|
| Être attaqué | −60 à −100 selon la difficulté |
| Être nuké, MIRV, ou trahi | −100 |
| Voisins du traître | −40 |
| Être ciblé (`target`) | −40 |
| Alliance acceptée | +100 dans les deux sens |
| Don d'or | +5 par tranche, plafond +100 |
| Don de troupes au-delà d'un seuil | +50 |
| Emoji 🖕 envoyé à une nation | −100 |
| Emoji 🤡 envoyé à une nation | −10 |
| Emojis 🕊️ 🏳️ ❤️ 🥰 👏 envoyés à une nation (Facile uniquement) | +15 |

### 11.2 Alliances
- **Demande :**
  - Expire après **20 s**.
  - Cooldown de **30 s** par cible après une réponse.
  - Envoyer une demande à quelqu'un qui nous en a envoyé une = acceptation.
- **Durée :** **5 min** par défaut, réglable de 1 à 15 min. 0 désactive les alliances.
- **Renouvellement :** une fenêtre s'ouvre 30 s avant l'expiration. Les deux joueurs doivent accepter, et la durée repart au complet.
- **Effets :** pas d'attaque entre alliés. Une attaque en cours se retire sans perte. Les embargos temporaires sont levés. Les bombes en vol sont annulées.
- **Commerce entre alliés :** bonus sur les trains (35 k) et préférence de destination pour les navires.

### 11.3 Trahison
- Rompre une alliance avec un joueur connecté et non traître donne le statut **Traître** pendant **30 s**.
- Effets du statut :
  - les attaquants subissent **½ des pertes** contre le traître ;
  - ils conquièrent ses tuiles **20 % plus vite** ;
  - les nations rejettent ses demandes d'alliance dans 90 % des cas.
- L'icône traître et un cadre rouge clignotant s'affichent chez la victime.
- Le compteur de trahisons est visible dans les statistiques.

### 11.4 Embargo
- **Effet :** le commerce est bloqué si **l'un des deux** joueurs a un embargo. Plus de navires marchands entre eux (ceux en route sont supprimés) et plus de trains sur leurs gares.
- **Permanent :** `embargo` sur un joueur, ou `embargo_all` (cooldown 10 s, exclut les bots et les coéquipiers).
- **Temporaire :** **5 min**, posé automatiquement par la victime d'une attaque.

### 11.5 Dons
- Seulement vers un **allié ou un coéquipier** connecté.
- Les dons à un humain peuvent être désactivés par les options `donateGold` / `donateTroops`.
- **Cooldown de 10 s par destinataire**, partagé entre or et troupes.
- **Montant par défaut :** ⅓. Les troupes sont plafonnées à la marge restante du destinataire (maximum − actuel).

### 11.6 Ciblage, emojis, quick chat
- **Cibler un joueur** (`targetPlayer`) :
  - marqueur visible pendant 10 s, cooldown 15 s ;
  - partagé avec les alliés ;
  - relation −40 chez la cible.
- **Emojis :**
  - 60 emojis (grille 12×5), visibles 5 s au-dessus du nom.
  - Limite : 5 envois par fenêtre de 5 s et par destinataire. « Tous » compte comme un destinataire.
  - 6 favoris accessibles avec Q W E A S D.
- **Quick chat :**
  - 66 messages prédéfinis, traduits, en 6 catégories : help (10), attack (8), defend (6), greet (16), misc (8), warnings (18).
  - Certains messages exigent un joueur cible `[P1]`.
  - Cooldown de 3 s par destinataire.
  - **Pas de chat libre** (choix volontaire de modération).
- **Signalement d'un joueur :** botting, teaming, nom inapproprié, griefing. Le signalement est enregistré dans l'archive de la partie.

---

## 12. Victoire, élimination, anti-stagnation

### 12.1 Conditions de victoire
Vérification tous les 10 ticks.

| Mode | Condition |
|---|---|
| FFA | Le joueur qui a le plus de tuiles gagne si : il détient **plus de 80 %** des terres non irradiées, **ou** le timer `maxTimerValue` (1 à 120 min) est écoulé, **ou** 170 min sont écoulées. |
| Équipes | Même règle sur la somme des tuiles de l'équipe. L'équipe « Bot » ne peut pas gagner. |
| Classé 1v1 | Victoire immédiate quand il ne reste qu'un humain connecté |
| Classé 2v2 | La dernière équipe avec un humain connecté gagne. Partie annulée si moins de 4 humains ont spawné. |

- **Vainqueur enregistré :** `["player", id]`, `["team", nom, ...ids]` ou `["nation", nom]`.
- **Coéquipier déconnecté :** il n'est crédité que si son équipe tenait au moins 70 % des terres au moment de sa déconnexion.

### 12.2 Overtime (actif par défaut en FFA public)
Après 30 min (réglable), le seuil de 80 % baisse de **2 points par minute**.

### 12.3 Doomsday Clock (option)
- **Grâce :** aucun effet pendant les 10 premières minutes.
- **Seuil :** 7 vagues font monter la part de terre minimale.
  - FFA : 2 / 4 / 7 / 11 / 17 / 25 / 35 %.
  - Équipes : 3 / 6 / 10 / 15 / 21 / 28 / 35 %.
- **Rythme :** le seuil atteint 35 % à 15, 25, 35 ou 45 min selon la vitesse choisie.
- **En dessous du seuil :**
  1. avertissement de 30 s ;
  2. drainage des troupes de 2 à 5 %/s vers un plancher qui descend de 40 % à 5 % ;
  3. le territoire « pourrit » ;
  4. élimination au bout de 150 s.
- Les navires du joueur condamné ne peuvent plus se soigner.

---

## 13. Intelligence artificielle

### 13.1 Types de joueurs

| Type | Nom en jeu | Rôle |
|---|---|---|
| `HUMAN` | Joueur | — |
| `BOT` | **Tribu** | Remplissage passif, faible. 0 à 400 par partie. Noms générés par thème (préfixe + suffixe : « Iron Legion »…). On peut aussi **acheter un nom de tribu** pour qu'il apparaisse dans les parties des autres. |
| `NATION` | **Nation** | IA « humaine » liée à un pays de la carte (nom, drapeau, coordonnées dans le manifest). Sa difficulté est réglable. |

### 13.2 Tribu (Bot)
- **Rythme :** agit tous les 40 à 79 ticks (valeur aléatoire par tribu).
- **Paramètres :** déclenchement 50-59 % du max, réserve 30-39 %, expansion 10-19 %.
- **Comportement :**
  - accepte **toutes** les alliances ;
  - les rompt parfois pour attaquer un traître voisin (probabilité 1/3 ou 1/6) ;
  - détruit les bâtiments qu'il capture ;
  - ne construit pas, ne nuke pas, n'envoie pas de demandes.
- **Cibles :** d'abord les terres neutres, puis riposte contre le plus gros attaquant, puis un traître, puis un voisin au hasard. Il évite les humains et les nations une fois sur deux.

### 13.3 Nation : leviers liés à la difficulté

| | Facile | Moyen | Difficile | Impossible |
|---|---|---|---|---|
| Troupes max | ×0,5 | ×0,75 | ×1 | ×1,25 |
| Régénération | ×0,9 | ×0,95 | ×1 | ×1,05 |
| Intervalle d'action (ticks) | 65-99 | 55-69 | 45-59 | 30-49 |
| Abandon d'une attaque contre un humain | 75 % | 25 % | 0 | 0 |
| Probabilité de construire un navire en riposte | 0 % | 15 % | 50 % | 80 % |
| Seuil d'un MIRV « anti-victoire » | 75 % | 65 % | 55 % | 40 % |

### 13.4 Nation : ordre d'action par cycle
1. Emojis.
2. Embargos.
3. Réponses aux demandes d'alliance et de renouvellement.
4. MIRV.
5. Bâtiments. Cette étape tourne aussi à ⅓ et ⅔ du cycle, soit 3 passes.
6. Navire de guerre.
7. Attaque.
8. Contre-flotte.
9. Nucléaire.

### 13.5 Nation : attaque
- **Priorité absolue :** l'expansion sur les terres neutres, par voie de terre ou en bateau si elles sont outre-mer.
- **Stratégies essayées dans l'ordre**, selon la difficulté :
  - **Facile :** irradiées, bots, riposte, aide aux alliés, trahison, haïs, plus faible.
  - **Impossible :** bots, très faibles, trahison, aide aux alliés, victimes (joueurs déjà sous attaque), couronne (leader en fuite), traîtres, « juteux » (score bâtiments/troupes), AFK, irradiées, haïs, plus faible, île, don.
- **Spécificités Difficile et Impossible :**
  - **Têtes de pont :** un petit bateau, puis une attaque terrestre dès l'atterrissage.
  - **Prudence en FFA :** garder 75 à 90 % des troupes du plus fort voisin non allié.
  - Vérification par pathfinding des navires de guerre ennemis sur la route.
  - Nettoyage des voies maritimes.

### 13.6 Nation : alliances
Décision prise dans l'ordre suivant :
1. Confusion aléatoire : 1/10, 1/20, 1/40 ou jamais, selon la difficulté.
2. Rejet des traîtres dans 90 % des cas.
3. Rejet des joueurs qui ont déjà trop d'alliés.
4. Rejet du leader en fuite.
5. **Acceptation** si le demandeur est une menace.
6. En équipes, rejet dans 25 à 100 % des cas.
7. Rejet si la relation est en dessous de Neutre.
8. Acceptation si Amical.
9. Rejet si la nation a déjà assez d'alliances.
10. Fenêtre « début de partie ».
11. Acceptation si la force est comparable.

**Trahisons programmées :**
- Difficile et Impossible trahissent un allié « juteux » quand le rapport de forces le permet.
- Facile et Moyen ne trahissent qu'avec un rapport de 10 contre 1.

### 13.7 Nation : construction
- **Ordre :** Port → Usine → SAM → Silo, chacun sous un ratio par ville ; sinon une Ville.

| Bâtiment | Ratio par ville |
|---|---|
| Port | 0,75 |
| Usine | 0,75, ×0,33 si la nation est côtière |
| SAM | 0,15 à 0,30 selon la difficulté |
| Silo | 0,2, maximum 3 |

- **Épargne :** chaque bâtiment possédé gonfle le « coût perçu » des suivants, ce qui pousse la nation à épargner pour un MIRV + une bombe H en FFA.
- **Amélioration plutôt que construction** au-delà d'un bâtiment par 1 500 tuiles.
- **Placement :** 25 tuiles candidates, notées selon l'altitude, la distance à la frontière, l'espacement, la connexité ferroviaire et la couverture SAM.
- **Postes défensifs :** construits derrière le front quand les attaques entrantes dépassent 35 % des troupes. Jamais en Facile.

### 13.8 Nation : nucléaire et MIRV
- **Cibles par priorité :** dernier adversaire restant, plus gros attaquant, joueur riche en bâtiments, leader au-delà de 50 %, cible d'un allié, joueur le plus haï, couronne, équipe la plus forte.
- **Choix du point d'impact :** score selon les bâtiments touchés (Ville 25 k, Silo 50 k, Port et Usine 15 k), en évitant les SAM. L'IA Impossible peut **saturer les SAM** avec des salves synchronisées de bombes A.
- **Déclenchement d'un MIRV :** contre-MIRV, refus de victoire (un joueur au-delà du seuil de 40 à 75 %), ou arrêt d'un joueur qui écrase les autres en nombre de villes.
- **Cooldown MIRV :** 300 ticks par cible, partagé par toutes les nations.

### 13.9 Nation : emojis
- **Situations :** submergée, se vante quand elle domine, charme ses alliés humains, se moque des traîtres 🤡, envoie « rat » 🐀 aux petits humains après 10 min, salue en début de partie, félicite le vainqueur.
- **Limite :** un emoji par humain toutes les 30 s.

---

## 14. Modes de jeu, options, lobbies, classé

### 14.1 Énumérations
- **GameType :** Singleplayer, Public, Private.
- **GameMode :** FFA, Team.
- **Équipes :** 2 à 7 nommées (Red, Blue, Yellow, Green, Purple, Orange, Teal), ou « Team 1..N » au-delà. Formats **Duos, Trios, Quads**, et **Humans vs Nations** (tous les humains contre toutes les nations, une nation par humain).
- **RankedType :** 1v1, 2v2.
- **GameMapSize :** Normal, Compact.

### 14.2 Configuration de partie
Schéma Zod : `packages/engine-api/src/Schemas.ts`.

| Groupe | Champs |
|---|---|
| Base | carte, taille, mode, type, difficulté, `playerTeams`, `maxPlayers` (2-1000) |
| Population | `nations` (1-400, `default` ou `disabled`), `bots` (0-400), `randomSpawn` |
| Économie / triche | `infiniteGold`, `infiniteTroops`, `instantBuild`, `goldMultiplier` (0,1-1000), `startingGold` (≤ 1e9), `hostCheats` (ces avantages réservés à l'hôte) |
| Règles | `disabledUnits[]`, `customAllianceDuration` (0-15 min), `donateGold`, `donateTroops`, `waterNukes`, `spawnImmunityDuration` (temps de paix) |
| Timers | `maxTimerValue` (1-120 min), `startDelay` (≤ 600 s), `overtime {startMinutes}`, `doomsdayClock {speed}` |
| Social | `disableClanTags`, `anonymizeNames`, `allowedPublicIds` (liste blanche ≤ 200), `trusted` (comptes de confiance uniquement) |

**Contraintes sur les noms :**
- Pseudo : 3 à 27 caractères, 20 côté interface.
- Tag de clan : 2 à 5 caractères alphanumériques, affiché `[TAG] nom`.

### 14.3 Solo
- **Défauts :** carte World, difficulté Facile, 400 tribus (100 en Compact), toutes les nations.
- **Vitesse de jeu :** ×0,5, ×1, ×2 ou maximum.
- **Pause** disponible.
- **Médailles** par carte, désactivées si des options personnalisées sont utilisées.
- **Tutoriel interactif.**

### 14.4 Lobby privé
- **Création :** `POST /api/create_game` (connexion requise). L'identifiant de partie sert de code d'invitation.
- **Outils de l'hôte :**
  - expulser un joueur (bannissement de la partie) ;
  - modifier la config avant le départ ;
  - lancer un timer de départ ;
  - mettre en pause ;
  - liste blanche ;
  - spectateurs ;
  - « nouveau lobby » pour rejouer avec les mêmes joueurs.
- **Lobby listé publiquement :** réservé aux abonnés Warlord et Sovereign. Maximum 10 sur le cluster, départ automatique après 1 à 5 min, 10 à 100 joueurs.
- **File payante :** on paie en Plutonium pour placer son lobby dans la file « Special ».

### 14.5 Lobbies publics (rotation)
Code : `src/server/MapPlaylist.ts`.

- **3 files permanentes :** **FFA**, **Teams**, **Special**. 6 lobbies sont en attente par file, avec un décompte de 2 min chacun.
- **Partie sécurisée :** 1 partie sur 7 est réservée aux comptes « trusted », plafonnée à 25 joueurs.
- **Choix de carte :** sac pondéré par la fréquence propre à chaque carte. World a un poids de 30, Sol 20, Giant World 15. Pas de répétition sur 5 parties.
- **Nombre de joueurs :** base = `max(5, round5(tuilesTerre / 1e6 × 50))`.
  - Paliers L (100 %), M (75 %), S (50 %), tirés à 30 / 30 / 40 %.
  - ×1,5 en équipes.
  - Compact : 25 %.
- **FFA public :**
  - 1 partie sur 3 en Compact ;
  - nations en difficulté Moyenne ;
  - 400 bots ;
  - tags de clan masqués ;
  - Overtime actif.
- **Teams :** poids des formats : 2 à 7 équipes (10 chacun), Duos 5, Trios 7,5, Quads 7,5, Humans vs Nations 20. Nations en Difficile pour HvN.
- **Special :** FFA ou équipes, avec **1 à 3 modificateurs** tirés au sort :

| Modificateur | Poids |
|---|---|
| spawn aléatoire | 4 |
| compact | 4 |
| bondé (125 joueurs) | 2 |
| nations difficiles | 1 |
| or de départ 1 M | 2 |
| or de départ 5 M | 4 |
| or de départ 25 M | 3 |
| or ×2 | 6 |
| sans alliances | 1 |
| sans nucléaire | 1 |
| sans SAM | 1 |
| temps de paix (240 s) | 1 |
| nukes aquatiques | 4 |
| doomsday | 4 |

  Il existe des exclusions mutuelles, et chaque carte peut forcer ou interdire des modificateurs.

### 14.6 Classé (matchmaking, alpha)
- **Formats :**
  - **1v1 :** Australia (40 %), Iceland, Asia ou Europe Classic. Timer de 15 min (10 en Compact), immunité 30 s, pas de nations.
  - **2v2 :** mêmes cartes, 50 % en Compact, immunité 60 s. Les amis puis les membres du même clan sont regroupés.
- **Accès :** connexion obligatoire avec un compte « trusted ». Nombre de parties quotidiennes gratuites limité, illimité pour les abonnés.
- **ELO** calculé par l'API, qui est fermée. Classements séparés pour le 1v1, le 2v2, les clans et les tribus.

---

## 15. Cartes : catalogue, format, générateur

### 15.1 Catalogue
**132 cartes**, réparties en 16 catégories (une carte peut appartenir à plusieurs) :

| Catégorie | Nombre | Exemples |
|---|---|---|
| featured | 6 | World, Europe, North America, South America, Asia, Africa |
| new | 9 | Madagascar, New Zealand, Rio de Janeiro… |
| world | 4 | World, Giant World Map, World Inverted, Dyslexdria |
| continental | 8 | Africa, Antarctica, Asia, Europe, Europe Classic, N/S America, Oceania |
| europe | 34 | France, Germany, Italia, Britannia, Alps, Balkans, Baltics, Iceland, Venice… |
| asia | 34 | China, Japan, Korea, Middle East, Indian Subcontinent, Hong Kong… |
| north_america | 27 | United States, Great Lakes, Gulf of Mexico, New York City, Los Angeles… |
| africa | 12 | Gulf of Guinea, Horn of Africa, Nile Delta… |
| south_america | 5 | Amazon River, Falkland Islands… |
| oceania | 4 | Australia, Hawaii, New Zealand, Oceania |
| antarctica | 2 | Antarctica, Deglaciated Antarctica |
| countries | 9 | China, France, Germany, Russia, United States… |
| cosmic | 6 | Luna, Mars, MilkyWay, Pluto, Sol, Titan |
| fictional | 11 | Pangaea, Four Islands, Traders Dream, Svalmel… |
| arcade | 10 | Labyrinth, Sierpinski, The Box, Onion, Warship Warship… |
| tournament | 4 | Tourney 2 / 3 / 4 / 8 Teams |

**Données propres à chaque carte :**
- nations (nom, drapeau ISO, coordonnées) ;
- `additionalNations` ;
- `teamGameSpawnAreas` : rectangles de spawn par équipe ;
- `custom_tribes` ;
- thèmes de noms de tribus : 20 thèmes (europe, asia, fantasy, space, war, funny…) ;
- calques graphiques optionnels.

### 15.2 Fichiers par carte
- **Source :** `map-generator/assets/maps/<id>/image.png` et `info.json`.
- **Sortie :** `resources/maps/<id>/` contient `manifest.json`, `map.bin`, `map4x.bin`, `map16x.bin` et `thumbnail.webp`.

**`info.json` :**
- Obligatoires : `id`, `name` (nom réseau, immuable), `translation_key`, `categories`.
- Optionnels : fréquences par file, `featured_rank`, `special_team_count`, modificateurs forcés ou interdits, `themes`, `custom_tribes`, `layers`, `nations[]`.

**`manifest.json`** = `info.json` + `{width, height, num_land_tiles}` pour chacune des 3 échelles.

**Format `.bin` :**
- Octets bruts, **sans en-tête**, 1 octet par tuile, ligne par ligne.
- Longueur = `width × height`.
- Bits décrits au §3.1.

### 15.3 Générateur (Go, hors ligne)
Code : `map-generator/map_generator.go`, lancé par `npm run gen-maps`.

1. **Lecture du PNG.** Seul le **canal bleu** compte :
   - alpha < 20, ou bleu = 106 → eau ;
   - `#000000` → infranchissable ;
   - sinon terre, avec `magnitude = (clamp(bleu, 140, 200) − 140) / 2` :

   | Bleu | Terrain |
   |---|---|
   | 140-158 | plaine |
   | 159-178 | colline |
   | 179-200 | montagne |

2. **Dimensions** tronquées à un multiple de 4.
3. **Nettoyage :** suppression des îles de moins de 30 tuiles et des lacs de moins de 200 tuiles.
4. **Eau :** le plus grand plan d'eau devient l'océan. Calcul du rivage. Profondeur de l'eau = distance (BFS) à la terre.
5. **Réduction** en 4x puis en 16x, en préservant l'eau (priorité eau > infranchissable > terre) pour garder les rivières navigables.
6. **Miniature** WebP.
7. **Génération de code :** `Maps.gen.ts` (enum `GameMapType`) et les traductions anglaises.
8. **Contrôle CI :** la CI vérifie que les cartes générées sont à jour.

---

## 16. Client : écrans, HUD, contrôles, rendu

### 16.1 Écrans hors partie
Composants Lit. La navigation se fait par hash d'URL (`#modal=…&tab=…`).

| Écran | Contenu |
|---|---|
| **Jouer** | News, pseudo + tag de clan, sélecteur de mode (Solo, Tutoriel, Créer un lobby, Rejoindre, Classé), flux temps réel des **lobbies publics** (WebSocket) avec cartes de lobby, vue détaillée filtrable, alerte sonore au lancement d'un lobby, stream Twitch mis en avant |
| Solo / Créer un lobby | Sélecteur de carte (catégories, recherche, favoris), difficulté, mode et équipes, curseurs bots et nations, options (§14.2), désactivation d'unités, médailles |
| Rejoindre | Saisie d'un code, jouer ou spectateur, aperçu des réglages |
| Classé | 1v1 / 2v2, ELO, taille de la file d'attente |
| Paramètres | onglets Jeu, Graphismes, Affichage (Steam uniquement), Audio, Touches |
| Compte | Connexion Discord / Google / Steam / lien magique par e-mail, liaison de comptes, pseudo vérifié, statistiques, historique des parties, amis, suppression du compte, jeton d'identité, récompenses |
| Profil joueur | Statistiques détaillées, historique |
| Boutique | Packs de monnaie, abonnements, bundles, cosmétiques, effets, noms de tribus |
| Inventaire | Skins, drapeaux, couronnes, effets ; jusqu'à 10 tenues sauvegardées (loadouts) |
| Clans | Carte, mes clans, parcourir. Gestion des membres, rôles, demandes, bannissements, dons de Plutonium, historique |
| Classements | 1v1, 2v2, clans (victoires pondérées, demi-vie de 30 jours), tribus |
| News / Changelog, Aide, Langue, Dépannage (diagnostic GPU), Replays, Code créateur, Abonnement, Progression | Niveaux 1-100, prestige, multiplicateurs d'XP pour les abonnés |

### 16.2 HUD en partie
L'interface est en DOM/Lit, superposée au canvas WebGL et rafraîchie environ à 10 Hz.

| Élément | Rôle |
|---|---|
| Barre latérale gauche | Classement des joueurs et des équipes. Colonnes configurables : % de terre, or, troupes, nombre de chaque bâtiment, alliés, trahisons, or/min par source (commerce, trains, piraterie)… |
| Barre latérale droite | Timer (compte à rebours si `maxTimerValue`), pause, vitesse, nouveau lobby, paramètres, plein écran, quitter, panneaux Overtime et Doomsday |
| Barre du haut | Progression de la phase de spawn, puis répartition du territoire par équipe |
| **Panneau de contrôle** | Or, barre troupes / max (dont troupes engagées), taux de croissance, **curseur de ratio d'attaque** 1-100 % |
| Barre d'unités | 10 boutons (Ville, Usine, Port, Poste défensif, Silo, SAM, Navire de guerre, A, H, MIRV) avec touche, coût et quantité possédée |
| Attaques en cours | Attaques terrestres et navales, entrantes et sortantes, avec bouton de retraite et clic pour centrer la vue |
| Journal d'événements | Alliances, trahisons, dons, conquêtes, destructions, captures, interceptions SAM, détonations, emojis, quick chat |
| Événements actionnables | Cartes « demande d'alliance » (accepter / refuser / centrer) et « alliance expirante » (renouveler) |
| **Menu radial** | Clic droit ou appui tactile ; détail plus bas |
| Menu de construction | Grille des 10 constructibles avec description et coût |
| Infobulle joueur | Au survol : drapeau, nom, type, relation, statuts (couronne, traître, alliance), bâtiments, raccourcis |
| Panneau joueur | Alliance, dons (curseurs), commerce / embargo, ciblage, emojis, chat, inversion de la trajectoire nucléaire, signalement |
| Fin de partie | Gagné / perdu / annulé, XP gagnée, rejouer, spectateur, promos |
| Messages centraux | « Choisissez un point de départ », pause, rattrapage, immunité, 1 min restante |
| Cadre d'alerte | Bordure clignotante, rouge en cas de trahison, orange en cas d'attaque ; cooldown 15 s |
| Overlay de performance | FPS, TPS, temps par couche de rendu (Shift+D) |
| Pub en jeu | Emplacements IAB en bas à gauche ; la pub de bas d'écran disparaît après le spawn |

**Menu radial** (centré sur la tuile visée) :
- **Centre :** spawn pendant la phase de spawn, sinon attaque, ou don de troupes si la cible est amie.
- **Sur son territoire :** Info, Supprimer, Allié, Construire.
- **Sur un autre joueur :** Info, Rompre l'alliance ou Bateau, Demander ou Prolonger une alliance, Attaque (A / H / MIRV / navire) ou Don d'or.
- **Achat groupé :** sous-anneau ×1, ×2, ×5, ×Max.

**Indicateurs dessinés sur la carte :**
- noms + troupes en texte MSDF, drapeaux, emojis, icônes de statut ;
- **aperçu de la trajectoire nucléaire** avec croix rouges aux points d'interception SAM ;
- cercles d'impact des bombes en vol ;
- fantôme de construction : portée, rayons SAM colorés (soi / allié / ennemi), coût sous le curseur ;
- nombre de troupes affiché sur les fronts ;
- grille de coordonnées A1/B2 ;
- sélection rectangulaire de navires ;
- barres de PV, de chantier et de vétérance ;
- popups d'or « +45K ».

**Pas de mini-carte.**

### 16.3 Contrôles
Toutes les touches sont **reconfigurables** (stockées dans `KeyboardEvent.code`).

| Action | Touche |
|---|---|
| Vue alternative (relations), maintenir | Espace |
| Construire Ville / Usine / Port / Poste / Silo / SAM / Navire / A / H / MIRV | 1 à 0 |
| Ratio d'attaque − / + | T / Y |
| Attaque en bateau / au sol / riposte | B / G / Shift+R |
| Demander / rompre une alliance | K / L |
| Cibler un joueur | N |
| Emojis / Quick chat | F / R |
| Inverser la trajectoire nucléaire | U |
| Zoom − / + | Q / E (ou − / =) |
| Déplacer la caméra | WASD ou flèches |
| Centrer sur soi | C |
| Grille de coordonnées | M |
| Sélectionner tous les navires | X |
| Pause / vitesse − / + | P / , / . |
| Menu de construction / emojis au clic | Ctrl + clic / Alt + clic |
| Sélection rectangulaire de navires | Shift + glisser |
| Fixes : performances, annuler, valider | Shift+D, Échap, Entrée |

**Souris :**
- Clic gauche : attaque, ou bateau automatique si la cible est outre-mer. Option : le clic gauche ouvre le menu.
- Clic droit : menu radial.
- Clic molette : améliore le bâtiment le plus proche.
- Molette : zoom. Shift + molette : ratio d'attaque.

**Tactile** (Pointer Events natifs) :
- Appui : menu radial.
- Appui long (800 ms) : sélection.
- 1 doigt : déplacement de la caméra.
- 2 doigts : zoom par pincement.

**Caméra :** zoom de 0,2 à 20, avec animation de centrage.

### 16.4 Rendu
- **Technique :** **WebGL2 écrit à la main**, sans Pixi ni Three. Exige l'accélération matérielle : SwiftShader est refusé et un message s'affiche.
- **Pipeline :**
  1. Le Worker produit environ 10 ticks/s.
  2. Les diffs (tuiles, joueurs, unités) sont envoyés au GPU.
  3. Une boucle `requestAnimationFrame` dessine à 60 fps.
- **Ordre des passes :**
  1. Terrain
  2. Calques
  3. Territoire
  4. Éclairage nuit (optionnel)
  5. Bordures et damier de défense
  6. Rails
  7. Unités au sol
  8. Fallout
  9. Rayons SAM
  10. Trajectoires
  11. Bâtiments et niveaux
  12. Barres
  13. Sélection
  14. Télégraphes nucléaires
  15. Traînées
  16. Missiles
  17. Effets visuels (FX)
  18. Grille
  19. Noms
  20. Texte du monde
- **Territoire :** une texture `R16UI`, une valeur par tuile (propriétaire, fallout, défense). Une texture de **palette** (4096 joueurs) donne les couleurs. Les motifs et skins sont des tableaux de textures.
- **Optimisations :**
  - Les tuiles modifiées sont appliquées « au goutte-à-goutte » sur 12 seaux, un par frame.
  - Écritures « scatter » sur le GPU au lieu de `texSubImage2D`.
  - Bordures recalculées de façon incrémentale.
  - Un seul draw instancié par passe.
  - Noms entièrement disposés sur le GPU.
  - DPR plafonné à 2.
  - Gestion de la perte de contexte WebGL.
- **Couleurs :**
  - Thèmes `default` et `colorblind`.
  - Allocation de couleurs maximalement distinctes (ΔE2000) : 63 couleurs pour les humains, 48 pour les nations, 49 pour les bots.
  - Préréglages graphiques : Default, Night, Colorblind, ainsi que des préréglages personnels exportables en JSON.
  - Environ 50 réglages avancés : couleurs du terrain, opacités, taille des noms, icônes, rails, éclairage, effets, visibilité des cosmétiques des autres joueurs.

### 16.5 Paramètres utilisateur
Stockés dans le `localStorage`, préfixe `settings.*`.

- **Jeu :**
  - cadre d'alerte ;
  - coût affiché sous le curseur ;
  - clic gauche = menu ;
  - noms anonymes ;
  - masquer les identifiants de lobby ;
  - alertes de lancement de lobby ;
  - nouveau lecteur de replays ;
  - centrer sur soi au départ ;
  - messages d'aide ;
  - affichage des troupes en attaque ;
  - ratio d'attaque par défaut (20 %) et pas de réglage (10 %) ;
  - délai de sécurité nucléaire entre alliés.
- **Audio :** volumes Master, Musique, Effets, Alertes, Ambiance, Interface ; couper le son hors focus.

### 16.6 Son
Bibliothèque Howler.

- **Musiques :** 2 pistes, menu et partie. **Propriétaires.**
- **Ambiances** de proximité : ville, usine, silo, SAM, selon le niveau de zoom.
- **Effets :**
  - lancements et impacts nucléaires ;
  - alerte nucléaire ;
  - conquête, « ka-ching » ;
  - une construction par type de bâtiment ;
  - cinq événements d'alliance ;
  - victoire, défaite, clics d'interface.

### 16.7 Internationalisation
- **41 langues**, dont toki pona.
- **Fichiers :** `en.json` est inclus dans le bundle, les autres langues sont chargées depuis le CDN.
- **Format :** ICU MessageFormat (`intl-messageformat`).
- Attributs `data-i18n` dans le HTML.
- Traductions gérées sur Crowdin.

### 16.8 Replays
- **Principe :** l'archive (config + liste des intents) est rejouée **dans le navigateur** par le moteur déterministe. Les hashes sont vérifiés tous les 10 tours.
- **Nouveau lecteur :**
  - timeline avec saut, vitesses ×0,5 à ×32, suivi d'un joueur ;
  - traitement dans un Worker ;
  - stockage en morceaux gzip dans IndexedDB (256 Mo maximum).
- **Version requise :** un replay ne fonctionne qu'avec **la même version** du jeu. Pour une partie d'une autre version, le client est redirigé vers `replay.<domaine>`, qui sert l'ancien build archivé.

---

## 17. Architecture technique

### 17.1 Stack

| Couche | Technologies |
|---|---|
| Langage | **TypeScript 6**, ESM, Node 24 |
| Build et tests | **Vite 8**, Vitest 4, oxlint + ESLint, Prettier, husky |
| Client | **Lit 3** (web components), **Tailwind 4**, **WebGL2** maison, Howler, d3 (menu radial), intl-messageformat, marked + DOMPurify, Stripe.js, Grafana Faro |
| Serveur de jeu | Node (exécuté via `tsx`, sans bundle), **Express 5**, **ws**, Zod 4, jose (JWT), winston + OpenTelemetry, obscenity (censure) |
| Générateur de cartes | **Go** |
| Backend de comptes | **API fermée** sur Cloudflare Workers, Durable Objects et R2. Absente du dépôt. |
| Base de données | **Aucune dans le dépôt.** Elle se trouve côté API (D1, Postgres ou autre ; inconnu). |

### 17.2 Monorepo (npm workspaces)

| Package | Contenu |
|---|---|
| `packages/zbin` | Codec binaire générique dérivé des schémas Zod |
| `packages/engine-api` | Contrats : schémas des intents et de la config, types, `GameUpdates`, protocole du Worker, `Maps.gen.ts` |
| `packages/engine-lib` | Grille de tuiles, chargement des cartes, règles `Config`, PRNG, `DetMath` |
| `packages/engine` | Simulation : Executions, `*Impl`, pathfinding, snapshots, `GameRunner`, Worker, rejeu côté serveur |
| `packages/shared` | Schémas réseau, HTTP, cosmétiques et clans ; environnements ; URLs d'assets ; liste des serveurs ; codes de fermeture |
| `src/client` | Interface, rendu, transport |
| `src/server` | Relais, lobbies, matchmaking |
| `map-generator/` | Outil Go |

Les dépendances entre couches sont **vérifiées par un test** (`tests/LayerBoundaries.test.ts`).

### 17.3 Déterminisme
C'est le cœur de l'architecture.

- **Lockstep relayé :** **le serveur ne simule pas.** Il horodate et relaie les intents. **Chaque client exécute toute la simulation** dans un Web Worker.
- **Interdits dans le moteur :** `Math.random`, `Date`, ainsi que `Math.sin/pow/exp/log/atan2`. Ils sont remplacés par :
  - **PRNG sfc32**, avec une graine dérivée de `simpleHash(gameID)` et des variantes par sous-système ;
  - **DetMath** : `exp`, `log`, `pow` et `atan2` en séries, n'utilisant que `+ − × /`, donc identiques au bit près sur toutes les plateformes.
- **Ordre :** les entiers sont en BigInt et l'ordre d'exécution est strictement celui d'insertion.
- **Snapshots :** sérialisation complète de l'état à un tick donné (environ 2,7 Mo pour une partie World avancée), versionnée avec migrations. Sert à la pause, au fork et à la navigation dans les replays.

### 17.4 Données envoyées du moteur au rendu
`GameUpdateViewData`, par tick :

| Champ | Format |
|---|---|
| `packedTileUpdates` | `Uint32Array` : paires [tuile, état16 \| terrain<<16] |
| `packedPlayerUpdates` | `Float64Array` : [id, tuiles, or, troupes, orGagné], uniquement en cas de changement |
| `packedAttackUpdates` | attaques |
| `packedMotionPlans` | chemins des unités, pour l'interpolation à 60 fps |
| impacts nucléaires, noms, `updates` typées | événements : unité, alliance, emoji, victoire, hash, rails, conquête, embargo, don… |

- **Transport :** buffers **transférables** (zéro copie) entre le Worker et le thread principal.
- **Rythme du Worker :** il rend la main tous les 4 ticks.

### 17.5 Pathfinding

| Domaine | Méthode |
|---|---|
| Terrestre | Aucun : les attaques avancent par front via un tas de priorité (§6.2) |
| Naval | **HPA\*** (clusters 32×32, passerelles) sur la mini-carte, puis lissage par ligne de vue. Coût A* : +1000 trop près de la côte, +100 en eau profonde. Cache LRU de 24 Mo. Graphe reconstruit au plus tous les 20 ticks après une nuke aquatique. |
| Rail | A* sur la mini-carte ; +5 sur l'eau ou le rivage, +3 par changement de direction |
| Trains | A* sur le graphe des gares |
| Nucléaire | Parabole de Bézier |

---

## 18. Réseau et protocole

### 18.1 Modèle
- **Lockstep cadencé par le serveur :**
  - Toutes les **100 ms**, le serveur publie `Turn {turnNumber, intents[], hash?}`.
  - **Il n'attend jamais les clients lents.**
  - Les clients exécutent les tours dans l'ordre.
- **Contrôle de version :** tout client doit avoir **le même commit Git** que le serveur, sinon il reçoit `version_mismatch`.

### 18.2 Sérialisation : zbin
- **Toutes les trames WebSocket sont binaires (zbin). Le HTTP reste en JSON.**
- **Encodage :**
  - champs dans l'ordre de déclaration, précédés d'un bitmap de présence ;
  - entiers LEB128, entiers signés en zigzag, flottants float64 ;
  - littéraux sur 0 octet ;
  - étiquette d'union sur environ 1 octet.
- **Compression par dictionnaire :** les `clientID` sont mappés sur 1 ou 2 octets grâce à une table initialisée depuis la liste des joueurs.
- **Garde-fous :** 2²⁰ éléments maximum, profondeur 64. Vecteurs « golden », fuzzing.

### 18.3 Messages

**Client → serveur :**

| Message | Contenu |
|---|---|
| `join` | JWT, gameID, pseudo, tag, cosmétiques, jeton Turnstile, commit, plateforme |
| `rejoin` | lastTurn |
| `intent` | une action de jeu |
| `hash` | tous les 10 ticks |
| `ping` | toutes les 5 s |
| `winner` | vote de fin de partie |
| `live_stats` | statistiques en direct |
| `spectate` | bascule spectateur |
| `report` | signalement |

**Serveur → client :**

| Message | Contenu |
|---|---|
| `lobby_info` | toutes les 1 s |
| `prestart` | carte à charger |
| `start` | historique complet des tours, infos de départ |
| `turn` | un tour |
| `desync` | désynchronisation détectée |
| `error` | erreur |
| `pong` | réponse au ping |
| `new_lobby` | lobby suivant |
| `redirect` | redirection vers un autre lobby |

**Intents :**
- **Jeu :** attack, cancel_attack, spawn, boat, cancel_boat, allianceRequest, allianceReject, breakAlliance, allianceExtension, targetPlayer, emoji, quick_chat, donate_gold, donate_troops, build_unit, upgrade_structure, delete_unit, move_warship, embargo, embargo_all.
- **Contrôle :** kick_player, toggle_pause, update_game_config, toggle_game_start_timer, mark_disconnected (serveur uniquement).

**Codes de fermeture :**

| Code | Signification |
|---|---|
| 4001 | Non autorisé |
| 4003 | Banni |
| 4006 | Lobby plein |
| 4007 | Mauvais worker |
| 4008 | Partie déjà commencée |
| 4100 | Limite de parties classées atteinte |
| 4103 | Compte non « trusted » |

### 18.4 Robustesse
- **Reconnexion :**
  - jusqu'à 10 tentatives avec back-off exponentiel de 1 à 15 s ;
  - `rejoin` renvoie les tours manquants ;
  - un chien de garde se déclenche après 5 s sans message.
- **Désynchronisation :** tous les 10 tours, le serveur compare les hashes. La majorité l'emporte et les clients minoritaires reçoivent `desync`. Le hash validé est stocké dans l'archive.
- **Vote du vainqueur :** majorité stricte, pondérée par IP. En cas de litige, le serveur **rejoue toute la partie** dans un processus enfant (30 min et 2 Go maximum) et journalise les votants qui ont menti.
- **Déconnexion :** sans ping pendant 30 s, le serveur injecte `mark_disconnected`.
- **Retardataires :**
  - moins de 5 s après le départ : refusés ;
  - au-delà : spectateurs, avec rattrapage de l'historique.
- **Solo :** un `LocalServer` dans le navigateur émule le même protocole. La partie est archivée via l'API.

---

## 19. Serveur, infrastructure, déploiement

### 19.1 Processus
- **Cluster Node : un maître et N workers.**
  - **Maître** (port 3000) :
    - sert la page et les fichiers statiques ;
    - planifie les lobbies publics ;
    - diffuse la liste des lobbies aux workers toutes les 500 ms (IPC validé par Zod) ;
    - se signale auprès de l'API toutes les 10 s.
  - **Worker *i*** (port 3001 + i) : un `GameManager` qui fait tourner les `GameServer`, un tick par seconde pour la gestion des cycles de vie.
- **Routage :** `worker = hash(gameID) % NUM_WORKERS`. Le client se connecte sur `wss://hôte/w<index>`.
  - Les parties privées sont créées sur un worker aléatoire, qui génère un identifiant tombant sur lui-même.
  - L'identifiant de partie fait 10 caractères : une lettre d'instance + 9 caractères aléatoires.
- **nginx :**
  - `/w(\d+)` est routé vers le port du worker (WebSocket) ;
  - `/api/create_game` va vers un worker aléatoire ;
  - les assets statiques sont mis en cache 24 h.
  - TLS est terminé chez **Cloudflare**, puis par **Traefik**.
- **Multi-serveurs (en cours) :**
  - registre de serveurs dans l'API (une lettre par instance) ;
  - états open, draining et fenced ;
  - coordinateur de lobbies (Durable Object par site) ;
  - anciennes versions servies sous `/v/<commit>/`.

### 19.2 Déploiement
- **Image Docker :** `node:24-slim` + nginx + supervisord. Le serveur tourne en TypeScript via `tsx`.
- **Hébergement :** machines **Hetzner**, Traefik, certificats d'origine Cloudflare, node-exporter et otel-collector.
- **Assets :** envoyés sur **Cloudflare R2** (CDN) à chaque déploiement.
- **GitHub Actions :**
  - CI : typecheck, build, tests avec couverture, lint, prettier, cartes à jour ;
  - **chaque branche est déployée** sur `<branche>.openfront.dev` ;
  - nightly ;
  - release : alpha, puis beta, puis slots **blue/green** en production.
- **Environnements :** Dev (Vite sur le port 9000 + 2 workers), Preprod (`openfront.dev`), Prod (`openfront.io`).

### 19.3 Observabilité
- **Serveur :** logs winston vers OTLP. Métriques toutes les 15 s : parties actives, clients par plateforme, désynchronisations, mémoire, rejeux.
- **Client :** Grafana Faro (erreurs, web vitals, RTT, temps par tick).
- **Santé :** `/api/health` répond 200 si au moins la moitié des workers sont prêts.
- **Télémétrie de match privée :** optionnelle, envoyée par lots signés HMAC.

### 19.4 Tests
- Environ 160 fichiers de tests unitaires : moteur, serveur, client, zbin, économie, nucléaire, pathfinding.
- Tests « golden » sur l'attaque et sur les trains.
- Tests sur des extraits des scripts shell de déploiement.
- Harnais de matchmaking avec un navigateur headless.
- Benchmarks : partie complète, client, mémoire, MIRV, essaim de SAM.

---

## 20. Comptes, sécurité, anti-triche

### 20.1 Authentification
- **Jeton d'accès :** JWT **EdDSA**, durée 15 min, gardé en mémoire.
- **Jeton de rafraîchissement :** cookie HttpOnly de 30 jours, renouvelé à chaque usage.
- **Fournisseurs :** Discord, Google, Steam, lien magique par e-mail, CrazyGames.
- **Jeu anonyme** autorisé (hors classé et création de lobby).
- **Rôles :** root, admin, mod, flagged, banned.

### 20.2 Protections

| Menace | Mesure |
|---|---|
| Bots / multi-comptes | **Cloudflare Turnstile** à la connexion à une partie (non requis pour Steam). Maximum 3 connexions par IP en partie publique. Une seule session par compte. Niveau de confiance (`trustTier`) pour le classé et les lobbies « trusted ». |
| Noms offensants | Vérification par l'API (avec un LLM pour les noms inconnus, d'après les commentaires du code). Repli local sur `obscenity` (anglais, leetspeak, homoglyphes). Un nom banni est remplacé par un « nom fantôme » déterministe. |
| Flood | HTTP : 20 requêtes/s par IP. WebSocket : 10 intents/s et 150/min. Un intent de plus de 2 Ko entraîne une expulsion, tout comme 5 Mo cumulés. Rejoin : 5/min. |
| Usurpation | Le `clientID` est horodaté par le serveur. Les spectateurs ne peuvent pas envoyer d'intent. Un tag de clan n'est accepté que pour les membres du clan. Les cosmétiques sont vérifiés côté serveur contre les droits du joueur (« flares »). |
| Triche | Hashes de désynchronisation, vote majoritaire pondéré par IP, rejeu côté serveur en cas de litige, contrôle du commit, signalements archivés |
| Fuites | Identifiants persistants hachés, IP anonymisées dans les logs, listes blanches retirées des données envoyées aux clients |
| Bot d'administration | API par clé (`x-admin-bot-key`), limitée aux parties privées : créer une partie ou un pool, lire le roster et les statistiques, envoyer des intents de contrôle |

---

## 21. Monétisation et cosmétiques

- **Publicité :**
  - **Playwire RAMP** : bandeaux sur l'accueil, emplacements en jeu pour les joueurs sans bloqueur de pub ;
  - mesure des bloqueurs via **Admiral** ;
  - pub mid-game sur CrazyGames.
  - **Tout achat supprime les publicités à vie.**
- **Monnaies :**
  - **Plutonium** : premium, achetée.
  - **Caps** : gratuite, gagnée en jouant.
- **Paiement :** Stripe sur le web (dont Apple Pay), microtransactions Steam.
- **Abonnements :**

| Palier | Avantages |
|---|---|
| Vanguard | monnaie quotidienne, classé illimité, multiplicateur d'XP |
| Warlord | idem + **lobby public listé** |
| Sovereign | idem + lobby public listé |

- **Ce qui est vendu :**
  - **Motifs** de territoire (avec palettes de couleurs) ;
  - **skins** de territoire (PNG) ;
  - **drapeaux** de catalogue ; environ 994 drapeaux de pays sont gratuits ;
  - **couronnes** ;
  - **effets** : traînées de bateau et de nucléaire (dégradé, transition, spirale), explosions (onde de choc, étincelles, braises), teintes des bâtiments, navires, trains et rails ;
  - **noms de tribus** + « boosts » (votre nom apparaît comme tribu dans les parties des autres) ;
  - **place dans la file publique** pour un lobby.
- **Rareté :** commun, peu commun, rare, épique, légendaire. Crédit de l'artiste et mention si l'objet a été fait par IA.
- **Droits :** les objets possédés sont des « **flares** » renvoyés par `/users/@me`, au format `pattern:<nom>[:<palette>]`, `flag:…`, `crown:…`, `skin:…`, avec des jokers.
- **Visibilité :** chaque joueur choisit s'il voit les cosmétiques des autres.
- **Progression :** XP et niveaux 1-100, prestige, récompenses quotidiennes et paliers, **codes créateur** (affiliation).
- **Social :** amis, **clans** (rôles, dons de Plutonium, boosts, classement des clans).

---

## 22. Licences et points d'attention pour un projet dérivé

| Élément | Licence | Conséquence |
|---|---|---|
| Code (depuis le 4 sept. 2025) | **AGPL-3.0** | Réutiliser du code oblige à **publier tout le code source**, y compris le serveur s'il est accessible en ligne. Il faut aussi conserver « © OpenFront and Contributors » de façon visible (pied de page et écran de chargement). |
| Code antérieur au 25 mars 2025 | MIT | Seuls les anciens commits sont réutilisables librement |
| Assets (cartes, sprites…) | **CC BY-SA 4.0** | Attribution, et partage sous la même licence |
| `proprietary/` (logo, polices, musiques, certains sons) | Tous droits réservés | **Ne pas réutiliser** |
| Marque « OpenFront » | — | Ne pas l'utiliser |

**Pour un jeu similaire écrit de zéro (« clean room »)**, les mécaniques de jeu ne sont pas protégeables. Ces choix d'architecture méritent d'être repris :
1. **Lockstep déterministe** avec serveur relais. Il coûte très peu de CPU serveur et permet des centaines de joueurs.
2. Grille de tuiles compacte : 1 octet de terrain et 2 octets d'état par tuile.
3. Simulation dans un **Web Worker** et rendu **WebGL** par textures de tuiles.
4. PRNG à graine et mathématiques déterministes dès le premier jour.
5. Pattern **Intent → Execution** : chaque action est une commande sérialisable, ce qui donne les replays gratuitement.
6. Générateur de cartes à partir d'images PNG.

**Ce qui n'est pas dans le dépôt et resterait à construire :** comptes, boutique, ELO et matchmaking, archives des parties, clans. Tout cela vit dans l'API Cloudflare fermée.

---

## 23. Points incertains

- Le stockage de l'API (D1, Postgres ou R2) et l'algorithme ELO ne sont pas visibles.
- Le commentaire du code sur le malus de fallout annonce [5 ; 2,5], mais la formule donne [5 ; 3].
- Les postes défensifs ne tirent pas : leur code de tir est commenté, il pourrait être réactivé.
- Le bit `DEFENSE_BONUS` et la fonction `GameMapImpl.cost()` semblent inutilisés.
- L'interface spectateur n'a pas été entièrement tracée.
- Les prix des abonnements viennent de l'API et ne sont pas dans le code.
- Le déploiement multi-serveurs (« Server list v2 ») est en cours ; on ne sait pas quelles parties sont actives.
- La date de sortie Steam vient d'une source tierce (game8.jp), non vérifiée sur Steam.
