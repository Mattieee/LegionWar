---
name: ajouter-batiment
description: Procédure complète pour ajouter un bâtiment (ou une unité constructible) à LegionWar, du moteur à l'interface, aux tests et au GDD. À utiliser dès qu'on demande un nouveau bâtiment, une nouvelle unité ou un nouveau type de construction.
---

# Ajouter un bâtiment à LegionWar

Un bâtiment traverse quatre couches. Les oublier crée des incohérences silencieuses. Suis les étapes dans l'ordre.

## 1. Design (avant tout code)

- Vérifie dans `docs/GDD.md` que le bâtiment est décrit : rôle, coût, temps de construction, effet, placement, comportement à la capture et noms par race. S'il ne l'est pas, rédige la section, avec l'aide du sous-agent `game-designer` si l'équilibrage est incertain.
- Choisis un identifiant de code en anglais ou en français sans accent (ex. `forge`), et un nom affiché en français.

## 2. Moteur (`packages/engine`)

1. `src/game/Types.ts` : ajoute la valeur à l'enum `BuildingKind`. Si le bâtiment a un compteur dédié, ajoute aussi le champ dans `PlayerView`.
2. `src/config/Rules.ts` : ajoute l'entrée dans `BUILDINGS` (`name`, `constructionTicks`, `baseCost(owned)`) et les constantes d'effet. Aucune valeur en dur ailleurs.
3. `src/game/Player.ts` : `buildingCounts` se construit à partir de l'enum ; vérifie l'initialisation.
4. `src/game/Game.ts` :
   - règles de placement spécifiques dans `build()` (ex. côte obligatoire) ;
   - effet à l'achèvement dans `updateConstructions()` ;
   - capture ou destruction dans `onOwnerChanged()` ;
   - effet continu dans `updateEconomy()` ou dans la logique de combat.
5. **Déterminisme** : aucune API interdite (voir AGENTS.md).

## 3. Protocole et client

1. `packages/shared/src/index.ts` : la validation d'intent `build` accepte automatiquement les valeurs de l'enum ; vérifie-le.
2. `packages/client/src/ui/Hud.ts` : ajoute la touche dans `BUILD_KEYS` et le compteur possédé (calcul du coût via `costFor`).
3. `packages/client/src/GameSession.ts` : raccourci clavier dans `onKey()`.
4. `packages/client/src/render/SceneRenderer.ts` : forme ou icône dans `drawBuilding()`, et aperçu de portée dans `drawHover()` si pertinent.

## 4. Tests

Dans `packages/engine/test/` : construction possible, refus (or, placement), effet à l'achèvement, comportement à la capture. Le test de déterminisme doit toujours passer.

## 5. Documentation et vérification

1. `docs/GDD.md` : passe le bâtiment de [Prévu] à [Proto] et aligne les valeurs.
2. `PROJECT.md` : coche l'élément de la feuille de route.
3. Lance la skill `/verifier`, puis fais relire le moteur par le sous-agent `gardien-determinisme`.
