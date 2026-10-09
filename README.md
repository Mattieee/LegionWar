# ⚜ LegionWar

**Conquête territoriale en temps réel dans un monde médiéval-fantastique.** Choisissez votre peuple, plantez votre bannière sur le continent de Valdren et étendez votre royaume tuile par tuile, face aux tribus sauvages et aux autres seigneurs.

> Prototype v0.1 jouable en solo. Voir la [feuille de route](PROJECT.md#feuille-de-route).

## Démarrer

Prérequis : **Node.js ≥ 22.12** (voir `.nvmrc`).

```bash
npm install
npm run dev        # → http://localhost:5173
```

Serveur relais multijoueur (le client s'y branchera en v0.2) :

```bash
npm run server     # ws://localhost:3001, santé sur http://localhost:3001/health
```

Variables d'environnement du serveur (toutes optionnelles) : `PORT` (3001), `MAX_PLAYERS` (16), `BOTS` (60).

## Comment jouer

| Action                                  | Commande                                             |
| --------------------------------------- | ---------------------------------------------------- |
| Choisir sa terre de départ              | Clic sur une terre libre                             |
| Attaquer (terres libres ou voisin)      | Clic gauche sur la cible                             |
| Ratio de troupes engagées               | Curseur, ou <kbd>T</kbd> / <kbd>Y</kbd>              |
| Construire un Bourg / une Tour de garde | <kbd>1</kbd> / <kbd>2</kbd> puis clic sur vos terres |
| Annuler la construction                 | <kbd>Échap</kbd> ou clic droit                       |
| Déplacer la caméra / zoomer             | Glisser / molette, <kbd>+</kbd> <kbd>−</kbd>         |
| Centrer sur votre royaume               | <kbd>C</kbd>                                         |

**Les quatre peuples :**

- ⚜ **Royaume d'Aldoria** (humains) : riches bâtisseurs.
- ⚒ **Clans de Kharag** (orcs) : conquérants rapides.
- ☠ **Damnés de Morvane** (morts-vivants) : relèvent les ennemis tombés.
- ❦ **Cercle de Sylvanor** (elfes) : maîtres des forêts.

Pour gagner, il faut contrôler **80 % des terres**.

## Développement

| Commande                          | Rôle                                                                  |
| --------------------------------- | --------------------------------------------------------------------- |
| `npm run verify`                  | Types, lint, formatage, tests et build : à lancer avant chaque commit |
| `npm test`                        | Tests unitaires (Vitest)                                              |
| `npm run typecheck`               | Vérification TypeScript de tous les packages                          |
| `npm run lint` / `npm run format` | ESLint / Prettier                                                     |
| `npm run build`                   | Build de production du client (`packages/client/dist`)                |

```
packages/engine   simulation déterministe (aucune dépendance DOM/Node)
packages/shared   protocole réseau et validation
packages/server   relais WebSocket (lobbies, tours)
packages/client   jeu navigateur (Vite, Canvas 2D, Web Worker)
```

## Documentation

- [PROJECT.md](PROJECT.md) : vision, feuille de route, décisions, risques
- [AGENTS.md](AGENTS.md) : règles de développement (humains et agents IA)
- [docs/GDD.md](docs/GDD.md) : game design
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) : architecture technique
- [docs/reference/OpenFront_Analyse.md](docs/reference/OpenFront_Analyse.md) : analyse du jeu de référence

## Crédits

Univers, noms et code originaux. Inspiré du genre popularisé par OpenFront.io et Territorial.io, et de l'esprit de Warcraft III. Aucun code ni asset de ces jeux n'est utilisé.
