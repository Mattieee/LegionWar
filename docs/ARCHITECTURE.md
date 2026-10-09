# Architecture technique de LegionWar

## Vue d'ensemble

```
            ┌─────────────────────── Navigateur ───────────────────────┐
            │                                                           │
 souris ──► │  Input ──► GameSession ──intents──► LocalServer (solo)    │
 clavier    │     ▲          │   ▲                    │  un tour / 100 ms│
            │     │          │   │ TickResult         ▼                  │
            │   HUD (DOM)    │   └──────────── Web Worker : Game ◄──────┤
            │                ▼                 (moteur déterministe)    │
            │  SceneRenderer + TerritoryLayer (Canvas 2D, 60 fps)       │
            └───────────────────────────────────────────────────────────┘
                     ▲ multijoueur (v0.2) : le LocalServer est remplacé
                     │ par une connexion WebSocket au serveur relais
            ┌────────┴──────── Serveur relais (Node + ws) ──────────────┐
            │  GameRoom : lobby → horodatage des intents → tour/100 ms  │
            │  Ne simule rien. Valide chaque message (@legionwar/shared)│
            └───────────────────────────────────────────────────────────┘
```

## Monorepo (npm workspaces)

| Package                    | Dépend de                           | Contenu                                                                                                                                                                         |
| -------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@legionwar/engine`        | rien                                | `core/` (PRNG, maths déterministes, tas, hash), `map/` (encodage des tuiles, `GameMap`, générateur), `config/` (règles, races), `game/` (`Game`, `Player`, `Attack`, IA, types) |
| `@legionwar/shared`        | engine                              | Messages client ↔ serveur, `parseClientMessage`, `sanitizeName`                                                                                                                 |
| `@legionwar/server`        | engine, shared, ws                  | `GameRoom` (logique testable sans réseau), `index.ts` (HTTP `/health` et WebSocket)                                                                                             |
| `@legionwar/design-system` | rien (polices @fontsource)          | Tokens (source unique), CSS généré `--lw-*`, composants `.lw-*`, utilitaires couleur et contraste — voir [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)                                   |
| `@legionwar/client`        | engine, shared, design-system, vite | Menu, session de jeu, worker de simulation, rendu, HUD, entrées                                                                                                                 |

- **Pas de compilation intermédiaire :** les packages exportent directement leur source TypeScript (`exports: "./src/index.ts"`). Vite, Vitest et tsx les consomment tels quels.
- **Contrôle des types :** `tsc --noEmit` par package. Le moteur est compilé **sans** les libs DOM et Node : il ne peut pas en dépendre par erreur.

## Le moteur déterministe

### Pourquoi

En lockstep, chaque client rejoue la même suite de tours. Le serveur n'envoie que les actions, jamais l'état. Cela permet des centaines de joueurs pour un coût serveur quasi nul, et les replays sont gratuits. La contrepartie : **la simulation doit donner exactement le même résultat partout**.

### Garanties

| Risque                                                        | Parade                                                                                                                                                                   |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Math.random`                                                 | `PseudoRandom` (sfc32 + splitmix32, opérations 32 bits)                                                                                                                  |
| `Math.pow/exp/log`… dont le résultat varie selon le moteur JS | `DetMath` (séries de Taylor et atanh, seulement `+ − × ÷` et des bits)                                                                                                   |
| Horloge, timers                                               | Interdits dans le moteur (règles ESLint `no-restricted-*`)                                                                                                               |
| Flottants cumulés                                             | Troupes et or en entiers (`Math.floor` à chaque modification)                                                                                                            |
| Ordre d'itération                                             | Tableaux, `Map` et `Set` (ordre d'insertion) ; tris à comparateur total                                                                                                  |
| Divergence non détectée                                       | `hash()` tous les 10 ticks (compteurs des joueurs, attaques, barges, charniers), plus l'état complet des tuiles tous les 100 ticks ; test « mêmes tours ⇒ mêmes hashes » |

### Boucle d'un tour (`Game.executeTurn`)

1. Appliquer les intents du tour, dans l'ordre reçu.
2. `tick()` :
   - **pendant le déploiement :** attendre (fin de phase au premier spawn en solo, à 200 ticks en multijoueur) ;
   - **ensuite :** économie (régénération, or, mines), puis chantiers, puis IA des tribus, puis attaques, puis vérification de victoire tous les 10 ticks.
3. `collect()` renvoie un `TickResult` :
   - les tuiles modifiées, en paires `[tuile, état]` dans un `Uint32Array` transférable ;
   - la vue des joueurs ;
   - les bâtiments, seulement s'ils ont changé ;
   - les attaques en cours ;
   - les événements ;
   - le hash, tous les 10 ticks ;
   - le vainqueur.

### Encodage d'une tuile

**Terrain** (1 octet, immuable) :

| Bit(s) | Signification     |
| ------ | ----------------- |
| 7      | Terre             |
| 6      | Rivage            |
| 5      | Océan             |
| 0-2    | Type de terre     |
| 3-4    | Variante visuelle |

Pour l'eau, les bits 0-4 contiennent la profondeur (distance à la côte, plafonnée à 31).

**État** (`Uint16`, mutable) :

| Bit(s) | Signification                                                                                        |
| ------ | ---------------------------------------------------------------------------------------------------- |
| 0-11   | Propriétaire (0 = libre ; 4 095 joueurs maximum)                                                     |
| 12     | Marque de race : rempart (Aldoria), bosquet (Sylvanor) ; effacée à chaque changement de propriétaire |
| 13     | Terre maudite                                                                                        |
| 14     | Charnier (bataille de moins de 60 s)                                                                 |
| 15     | Libre                                                                                                |

Le client reçoit l'état 16 bits complet des tuiles modifiées (`changedTiles`) et le garde dans `TerritoryLayer.state` (le `GameMap` du client ne porte que le terrain).

### Attaques

- Chaque `Attack` maintient un **tas de priorité** des tuiles de front.
- Par tick, elle consomme un budget de 1 : chaque tuile prise en coûte une fraction (`attackLogic`).
- Les tuiles frontières de chaque joueur sont maintenues de façon incrémentale (`Player.border`) à chaque `conquer()`. On n'a jamais à reparcourir toute la carte, sauf pour l'annexion, qui est rare.

### Performances mesurées (Node 22, poste de développement)

| Carte                           | Génération | Tick moyen | Pire tick |
| ------------------------------- | ---------- | ---------- | --------- |
| Moyenne, 60 tribus, 3 000 ticks | 0,46 s     | 0,98 ms    | 12,7 ms   |
| Grande, 150 tribus, 3 000 ticks | 0,72 s     | 1,81 ms    | 17,3 ms   |

Le budget est de 100 ms par tick ; l'objectif est de rester sous 5 ms en moyenne.

## Client

- **Worker de simulation** (`sim.worker.ts`) : il construit `Game` et exécute les tours. Il renvoie les tampons de tuiles **par transfert** (zéro copie).
- **LocalServer :** une horloge de 100 ms qui joue le rôle du serveur en solo. Le protocole est identique au multijoueur. Si le worker accumule plus de 3 tours de retard, l'horloge se met en pause au lieu d'empiler les tours.
- **Rendu :**
  - `TerritoryLayer` est une image d'1 pixel par tuile. Seules les tuiles modifiées et leurs voisines sont repeintes, et seul le rectangle concerné est renvoyé (`putImageData`).
  - `SceneRenderer` dessine cette image mise à l'échelle par la caméra (`imageSmoothingEnabled = false`), puis les mines, les bâtiments, l'aperçu de construction et les noms (en coordonnées écran).
  - L'emplacement des noms est recalculé toutes les 500 ms : barycentre du territoire, ramené sur la tuile possédée la plus proche.
- **Interface :** DOM et CSS superposés au canvas. Tout texte venant d'un joueur passe par `escapeHtml`.
- **Entrées :** Pointer Events (souris et tactile), molette (zoom centré sur le curseur), clavier.

## Protocole réseau (`@legionwar/shared`)

- **Format :** JSON sur WebSocket.

| Sens             | Messages                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Client → serveur | `join {roomId, name, race, version}`, `rejoin {roomId, clientId, lastTurn, version}`, `start` (hôte), `intent {intent}`, `ping` |
| Serveur → client | `lobby {players}`, `start {you, config, turns}`, `turn {turn}`, `pong`, `error {code}`                                          |

- **Sécurité côté serveur :**
  - validation stricte de chaque message ;
  - pseudo nettoyé (2 à 20 caractères) ;
  - message de 4 Ko maximum ;
  - 20 messages/s par connexion ;
  - contrôle de version du moteur ;
  - intents horodatés avec l'identifiant attribué par le serveur (impossible à usurper).
- **Reconnexion :** `rejoin` renvoie les tours manquants depuis `lastTurn`.

## Qualité

| Outil                                    | Rôle                                                            |
| ---------------------------------------- | --------------------------------------------------------------- |
| TypeScript strict                        | Types, `verbatimModuleSyntax`, variables inutilisées interdites |
| ESLint (typescript-eslint)               | Qualité, et règles de déterminisme propres au moteur            |
| Prettier                                 | Formatage (largeur 100)                                         |
| Vitest                                   | Tests unitaires : moteur, protocole, salle de jeu               |
| GitHub Actions                           | `npm run verify` sur chaque push et chaque PR                   |
| EditorConfig, `.nvmrc`, `.gitattributes` | Cohérence entre postes (LF, UTF-8, Node 22)                     |

## Évolutions prévues

- **v0.2 :** client multijoueur (`NetworkServer`, même interface que `LocalServer`), comparaison des hashes côté serveur (vote majoritaire), écran de lobby.
- **Rendu :** passage au WebGL (texture de tuiles et palette) si le Canvas 2D sature sur les grandes cartes.
- **Réseau :** format binaire et dictionnaire des identifiants clients si la bande passante devient un enjeu.
- **Production :**
  - en-têtes de sécurité (CSP stricte, HSTS) sur l'hébergement statique ;
  - serveur relais derrière un reverse proxy TLS ;
  - journaux structurés et métriques.
