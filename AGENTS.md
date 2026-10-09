# AGENTS.md — Instructions pour les agents IA

Ce fichier s'adresse à tout agent de code (Claude Code, Codex, Cursor…) qui travaille sur **LegionWar**. Il complète le [README](README.md) destiné aux humains. Vision et feuille de route : [PROJECT.md](PROJECT.md). Game design : [docs/GDD.md](docs/GDD.md). Architecture : [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Le projet en bref

LegionWar est un jeu de **conquête territoriale en temps réel**, dans le navigateur, en univers **médiéval-fantastique** avec quatre races asymétriques. Il s'inspire du genre d'OpenFront.io, mais **son code est écrit de zéro**. Tous les textes, commentaires et messages de l'interface sont **en français**.

## Commandes

| Action                                             | Commande                                     |
| -------------------------------------------------- | -------------------------------------------- |
| Installer                                          | `npm install` (Node ≥ 22.12, voir `.nvmrc`)  |
| Lancer le jeu (client Vite, http://localhost:5173) | `npm run dev`                                |
| Lancer le serveur relais multijoueur (port 3001)   | `npm run server`                             |
| Vérifier les types                                 | `npm run typecheck`                          |
| Tests                                              | `npm test`                                   |
| Lint                                               | `npm run lint` (ou `npm run lint:fix`)       |
| Formatage                                          | `npm run format` (ou `npm run format:check`) |
| **Tout vérifier avant de rendre la main**          | `npm run verify`                             |

## Structure

```
packages/
  engine/   Simulation déterministe : carte, règles, races, combat, IA. Aucune dépendance DOM ni Node.
  shared/   Protocole client ↔ serveur et validation des messages.
  server/   Serveur relais WebSocket (lobbies, diffusion des tours). Ne simule rien.
  client/   Jeu dans le navigateur : Vite, Canvas 2D, interface DOM, simulation dans un Web Worker.
docs/       GDD, architecture, analyse de référence d'OpenFront.
```

## Règles d'architecture (non négociables)

1. **Le moteur est déterministe.** Mêmes config et mêmes tours donnent le même état, au bit près, sur toutes les machines. C'est ce qui rend le multijoueur possible.
   - Interdit dans `packages/engine/src` : `Math.random`, `Date`, `performance`, timers, `fetch`, `Math.pow/exp/log/sin/cos/tan/atan2/hypot`, l'opérateur `**`. ESLint bloque ces usages.
   - À utiliser à la place : `PseudoRandom` (aléa à graine) et `DetMath` (`pow`, `exp`, `log`, `clamp`).
   - Parcourir les collections dans un ordre stable : tableaux, `Map` et `Set` (ordre d'insertion). Ne jamais itérer sur un ordre qui dépend d'un hash ou de l'horloge.
   - Troupes et or sont des entiers : `Math.floor` à chaque modification.
2. **Toute action de joueur est un `Intent`** (`packages/engine/src/game/Types.ts`) appliqué au début d'un tour. Le client ne modifie jamais l'état de jeu directement.
3. **Le serveur ne simule pas.** Il valide les messages (`packages/shared`), horodate les intents avec l'identité de l'émetteur et diffuse un tour toutes les 100 ms.
4. **Couches :** `client` et `server` dépendent de `engine` et `shared` ; `engine` ne dépend de rien. Ne pas importer de code client ou serveur dans le moteur.
5. **Équilibrage :** les constantes de jeu vivent dans `packages/engine/src/config/Rules.ts` et `Races.ts`, jamais en dur ailleurs. Toute modification de valeur doit être reportée dans `docs/GDD.md`.

## Conventions de code

- TypeScript strict, modules ES, `import type` pour les types (`verbatimModuleSyntax`).
- Prettier (largeur 100) et ESLint font foi ; ne pas les contourner sans justification écrite en commentaire.
- Noms de code (identifiants) en anglais ; commentaires, docs et textes affichés en français.
- Commentaires utiles uniquement : le **pourquoi** et les invariants, pas la paraphrase du code.
- Interface : le HTML injecté via `innerHTML` passe **toujours** par `escapeHtml` (`packages/client/src/ui/format.ts`) dès qu'il contient une donnée de joueur (pseudo…).
- `localStorage` uniquement via le wrapper `storage` (tolérant aux erreurs).

## Tests

- Vitest, fichiers `packages/*/test/**/*.test.ts`.
- Toute nouvelle règle de jeu s'accompagne d'un test dans `packages/engine/test/`.
- Le test « est déterministe : mêmes tours ⇒ mêmes hashes » doit toujours passer. S'il casse, c'est un bug bloquant.
- Ne jamais affaiblir ou supprimer un test pour le faire passer.

## Git et contributions

- Branche par fonctionnalité (`feat/…`, `fix/…`, `docs/…`), commits au format Conventional Commits (`feat(engine): …`).
- `npm run verify` doit passer avant tout commit ou PR.
- Ne jamais committer `.env`, de secrets, ni `node_modules`/`dist`.
- Pas de `push --force` sur `main`.

## Propriété intellectuelle

- **Aucun code d'OpenFront** (licence AGPL-3.0) ne doit être copié. On peut s'inspirer des mécaniques et des formules documentées dans `docs/reference/OpenFront_Analyse.md`, mais il faut les réécrire.
- **Aucun nom, lieu, personnage ni asset de Warcraft/Blizzard** : pas d'Azeroth, de Horde, de Fléau, d'Arthas… L'univers de LegionWar (Valdren, Aldoria, Kharag, Morvane, Sylvanor) est original.
- Les assets (images, sons, polices) ajoutés doivent avoir une licence compatible, notée dans `docs/CREDITS.md` (à créer au premier asset).

## Documentation à tenir à jour

| Changement                      | Document à mettre à jour                               |
| ------------------------------- | ------------------------------------------------------ |
| Règle, valeur ou race           | `docs/GDD.md`                                          |
| Structure, protocole, flux      | `docs/ARCHITECTURE.md`                                 |
| Fonctionnalité livrée, décision | `PROJECT.md` (feuille de route, journal des décisions) |
| Commande ou prérequis           | `README.md` et ce fichier                              |
