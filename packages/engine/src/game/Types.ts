import type { Race } from "../config/Races";
import type { MapSize } from "../map/MapGenerator";

export type PlayerKind = "human" | "bot";

export enum BuildingKind {
  /** Habitat : augmente le plafond de troupes. */
  Bourg = "bourg",
  /** Défense : ralentit et saigne les attaquants à proximité. */
  Tour = "tour",
}

export interface HumanSlot {
  clientId: string;
  name: string;
  race: Race;
}

export interface GameConfig {
  seed: number;
  mapSize: MapSize;
  /** Nombre de tribus sauvages (IA neutres). */
  bots: number;
  humans: HumanSlot[];
  /** Solo : la phase de déploiement se termine dès que le joueur choisit sa terre. */
  singleplayer: boolean;
}

/** Action d'un joueur. Tout ce qui modifie la simulation passe par un intent. */
export type Intent =
  | { type: "spawn"; tile: number }
  /**
   * target = 0 → terres libres. `tile` (optionnel) = tuile visée : si la cible n'a aucune
   * frontière terrestre commune, l'attaque part en barge vers cette tuile.
   */
  | { type: "attack"; target: number; troops: number; tile?: number }
  /** Débarquement forcé vers la tuile visée, même si une frontière terrestre existe. */
  | { type: "boat"; tile: number; troops: number }
  | { type: "build"; building: BuildingKind; tile: number };

export interface StampedIntent {
  clientId: string;
  intent: Intent;
}

export interface Turn {
  turn: number;
  intents: StampedIntent[];
}

export interface PlayerView {
  id: number;
  name: string;
  kind: PlayerKind;
  race: Race | null;
  clientId: string | null;
  alive: boolean;
  spawned: boolean;
  tiles: number;
  troops: number;
  maxTroops: number;
  gold: number;
  bourgs: number;
  tours: number;
  /** Remparts (Aldoria) ou bosquets (Sylvanor) possédés. */
  marks: number;
  /** Or pillé (Kharag). */
  pillaged: number;
  /** Troupes relevées sur les charniers (Morvane). */
  raised: number;
}

export interface BuildingView {
  id: number;
  kind: BuildingKind;
  owner: number;
  tile: number;
  done: boolean;
}

export interface AttackView {
  id: number;
  attacker: number;
  target: number;
  troops: number;
}

export interface BoatView {
  id: number;
  owner: number;
  /** Tuile d'eau où se trouve la barge. */
  tile: number;
  /** Tuile de terre où elle débarquera. */
  landing: number;
  /** Propriétaire de la tuile de débarquement au départ (0 = terres libres). */
  target: number;
  troops: number;
}

export type BoatRejection = "maxBoats" | "notCoastal" | "noRoute";

export type GameEvent =
  | { type: "spawnPhaseEnd" }
  | { type: "boatLaunched"; attacker: number; target: number; troops: number }
  | { type: "boatLanded"; attacker: number; target: number }
  | { type: "boatRejected"; player: number; reason: BoatRejection }
  | { type: "spawnRejected"; player: number }
  | { type: "attackStarted"; attacker: number; target: number; troops: number }
  | { type: "eliminated"; player: number; by: number; gold: number }
  | { type: "buildingDone"; player: number; building: BuildingKind }
  | { type: "buildingCaptured"; player: number; from: number; building: BuildingKind }
  | { type: "buildingRejected"; player: number; reason: BuildRejection }
  | { type: "win"; player: number };

export type BuildRejection = "spawnPhase" | "notOwned" | "terrain" | "tooClose" | "gold";

export interface TickResult {
  tick: number;
  inSpawnPhase: boolean;
  /** Paires [tuile, état16] pour chaque tuile modifiée pendant ce tick. */
  changedTiles: Uint32Array;
  players: PlayerView[];
  /** Liste complète des bâtiments, seulement si elle a changé (sinon null). */
  buildings: BuildingView[] | null;
  attacks: AttackView[];
  boats: BoatView[];
  events: GameEvent[];
  /** Hash d'état (tous les 10 ticks) pour détecter les désynchronisations, sinon null. */
  hash: number | null;
  winner: number | null;
}
