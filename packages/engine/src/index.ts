export * from "./config/Races";
export * from "./config/Rules";
export { DetMath } from "./core/DetMath";
export { simpleHash } from "./core/hash";
export { PseudoRandom } from "./core/PseudoRandom";
export { Game } from "./game/Game";
export * from "./game/Types";
export { GameMap } from "./map/GameMap";
export { MAP_DIMENSIONS, generateMap, type GeneratedMap, type MapSize } from "./map/MapGenerator";
export * from "./map/Terrain";

/** Version du protocole de simulation : deux clients doivent l'avoir identique pour jouer ensemble. */
export const ENGINE_VERSION = "0.2.0";
