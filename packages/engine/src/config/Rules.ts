import { clamp, pow } from "../core/DetMath";
import type { RaceModifiers } from "./Races";
import type { Player } from "../game/Player";
import { BuildingKind } from "../game/Types";
import { TerrainKind } from "../map/Terrain";

// Temps ---------------------------------------------------------------------------------------
export const TICK_MS = 100;
export const TICKS_PER_SECOND = 1000 / TICK_MS;

// Déploiement ---------------------------------------------------------------------------------
export const SPAWN_RADIUS = 4;
export const MULTIPLAYER_SPAWN_PHASE_TICKS = 200;
export const MIN_SPAWN_DISTANCE = 30;
export const SPAWN_ATTEMPTS = 1000;
export const SPAWN_ATTEMPTS_STRICT = 750;

// Ressources ----------------------------------------------------------------------------------
export const START_TROOPS = { human: 25_000, bot: 10_000 } as const;
export const GOLD_PER_TICK = { human: 100, bot: 50 } as const;
export const GOLD_PER_MINE_PER_TICK = 40;
export const BOURG_TROOP_BONUS = 250_000;

// Victoire ------------------------------------------------------------------------------------
export const WIN_PERCENT = 80;
export const WIN_CHECK_INTERVAL = 10;
export const HASH_INTERVAL = 10;
/** Le hash couvre aussi l'état complet des tuiles à cet intervalle (≈ 2 ms sur 2 M de tuiles). */
export const STATE_HASH_INTERVAL = 100;
/** Sous ce nombre de tuiles, un joueur conquis est annexé en entier. */
export const ANNEX_THRESHOLD = 50;

// Bâtiments -----------------------------------------------------------------------------------
export const STRUCTURE_MIN_DIST = 12;
export const TOWER_RANGE = 20;
/** Pertes de l'attaquant ×4 et progression ×2,5 plus lente sous couverture d'une tour. */
export const TOWER_LOSS_MULT = 4;
export const TOWER_COST_MULT = 2.5;

// Mécaniques de race (voir GDD §7.3) ------------------------------------------------------------
/** Aldoria : une tuile frontière tenue deux rondes de suite devient un rempart. Ronde = 10 s. */
export const RAMPART_INTERVAL = 100;
/** Pertes de l'attaquant ×1,5 et progression 1,5× plus lente sur un rempart (sans cumul avec une tour). */
export const RAMPART_LOSS_MULT = 1.5;
export const RAMPART_COST_MULT = 1.5;
/** Sylvanor : les plaines à cette distance d'une forêt (en tuiles) se boisent. */
export const GROVE_REACH = 8;
/** Durée d'un balayage complet de la carte par la pousse des bosquets (20 s). */
export const GROVE_SWEEP_TICKS = 200;
/** Durée de vie d'un charnier (60 s). */
export const CHARNIER_TICKS = 600;
/** Kharag : part du butin quand la tuile pillée appartient à une tribu. */
export const PILLAGE_TRIBE_RATIO = 0.5;

// Naval ---------------------------------------------------------------------------------------
/** Barges de débarquement en mer simultanément, par seigneur. */
export const MAX_BOATS = 3;
/** Vitesse d'une barge, en tuiles d'eau par tick. */
export const BOAT_TILES_PER_TICK = 3;
/** Nombre maximal de plages candidates essayées pour un débarquement. */
export const LANDING_CANDIDATES = 8;
/** Tuiles de terre explorées au maximum pour trouver une plage depuis la tuile visée. */
export const LANDING_SEARCH_LIMIT = 4000;

export interface BuildingInfo {
  name: string;
  constructionTicks: number;
  /** Coût de base selon le nombre déjà possédé (chantiers compris). */
  baseCost: (owned: number) => number;
}

export const BUILDINGS: Record<BuildingKind, BuildingInfo> = {
  [BuildingKind.Bourg]: {
    name: "Bourg",
    constructionTicks: 20,
    // 125 k → 250 k → 500 k → 1 M (plafond)
    baseCost: (owned) => 125_000 * (1 << Math.min(owned, 3)),
  },
  [BuildingKind.Tour]: {
    name: "Tour de garde",
    constructionTicks: 50,
    // 50 k, 100 k, … plafonné à 250 k
    baseCost: (owned) => Math.min(250_000, (owned + 1) * 50_000),
  },
};

/** Coût d'un bâtiment à partir du nombre déjà possédé (utilisable côté client). */
export function costFor(kind: BuildingKind, owned: number, mods: RaceModifiers): number {
  return Math.floor(BUILDINGS[kind].baseCost(owned) * mods.buildCostMult);
}

export function buildingCost(kind: BuildingKind, player: Player): number {
  return costFor(kind, player.buildingCounts[kind], player.mods);
}

// Formules de ressources ----------------------------------------------------------------------
export function maxTroops(p: Player): number {
  const base = 2 * (pow(p.tiles, 0.6) * 1000 + 50_000) + p.completedBourgs * BOURG_TROOP_BONUS;
  const kindMult = p.kind === "bot" ? 1 / 3 : 1;
  return Math.floor(base * kindMult * p.mods.maxTroopsMult);
}

/** Troupes gagnées (ou perdues si au-dessus du plafond) ce tick. */
export function troopIncrease(p: Player): number {
  const max = maxTroops(p);
  let add = (10 + pow(p.troops, 0.73) / 4) * (1 - p.troops / max);
  if (p.kind === "bot") add *= 0.5;
  add *= p.mods.regenMult;
  return Math.floor(Math.min(p.troops + add, max) - p.troops);
}

export function goldPerTick(p: Player): number {
  return Math.floor(GOLD_PER_TICK[p.kind] * p.mods.goldMult);
}

// Combat --------------------------------------------------------------------------------------
export interface TerrainCombat {
  /** Ampleur des pertes de l'attaquant. */
  mag: number;
  /** Lenteur de conquête. */
  tileCost: number;
  /** Poids dans la priorité du front (les terrains durs sont pris en dernier). */
  frontWeight: number;
}

export const TERRAIN_COMBAT: Partial<Record<TerrainKind, TerrainCombat>> = {
  [TerrainKind.Plain]: { mag: 80, tileCost: 16.5, frontWeight: 1 },
  [TerrainKind.Forest]: { mag: 95, tileCost: 19, frontWeight: 1.3 },
  [TerrainKind.Hills]: { mag: 100, tileCost: 20, frontWeight: 1.5 },
  [TerrainKind.Mountain]: { mag: 120, tileCost: 25, frontWeight: 2 },
};

export function terrainCombat(kind: TerrainKind): TerrainCombat {
  const stats = TERRAIN_COMBAT[kind];
  if (!stats) throw new Error(`Terrain non attaquable : ${kind}`);
  return stats;
}

export interface CombatInput {
  kind: TerrainKind;
  attacker: Player;
  /** null = terres libres. */
  defender: Player | null;
  attackTroops: number;
  /** Nombre de tuiles du front (+ bruit). */
  borderSize: number;
  /** Une tour de garde du défenseur couvre la tuile. */
  towerCover: boolean;
  /** La tuile est un rempart du défenseur (ignoré si une tour la couvre déjà). */
  rampart: boolean;
  /** Tuiles terrestres de la carte (échelle du bonus « grand territoire »). */
  landTiles: number;
}

export interface CombatResult {
  attackerLoss: number;
  defenderLoss: number;
  /** Part du budget du tick consommée par cette tuile (budget = 1 par tick). */
  tickFraction: number;
}

/**
 * Bonus « grand territoire » : 1 − depth / (1 + (mid / n)^2,5).
 * Proche de 1 pour un petit empire, décroît quand il devient immense.
 */
function largeTerritoryBonus(tiles: number, depth: number, landTiles: number): number {
  const mid = Math.max(1, landTiles * 0.45);
  return 1 - depth / (1 + pow(mid / Math.max(1, tiles), 2.5));
}

export function attackLogic(input: CombatInput): CombatResult {
  const { attacker, defender, kind } = input;
  const terrain = terrainCombat(kind);
  let mag = terrain.mag;
  let tileCost = terrain.tileCost;

  if (kind === TerrainKind.Forest) tileCost *= attacker.mods.forestAttackCostMult;

  if (defender === null) {
    return {
      attackerLoss: (attacker.kind === "bot" ? mag / 10 : mag / 5) * attacker.mods.attackLossMult,
      defenderLoss: 0,
      tickFraction:
        clamp((2000 * tileCost) / Math.max(1, input.attackTroops), 5, 100) /
        (2 * Math.max(1, input.borderSize)) /
        attacker.mods.conquestSpeedMult,
    };
  }

  if (input.towerCover) {
    mag *= TOWER_LOSS_MULT;
    tileCost *= TOWER_COST_MULT;
  } else if (input.rampart) {
    mag *= RAMPART_LOSS_MULT;
    tileCost *= RAMPART_COST_MULT;
  }
  mag *= defender.mods.defenseMult * attacker.mods.attackLossMult;
  if (kind === TerrainKind.Forest) mag *= defender.mods.forestDefenseMult;
  if (attacker.kind === "human" && defender.kind === "bot") mag *= 0.7;

  const attackerBonus = largeTerritoryBonus(attacker.tiles, 0.7, input.landTiles);
  const defenderBonus = largeTerritoryBonus(defender.tiles, 0.3, input.landTiles);
  const attackerSpeedBonus = largeTerritoryBonus(attacker.tiles, 0.73, input.landTiles);

  const defenderDensity = defender.troops / Math.max(1, defender.tiles);
  const ratio = defender.troops / Math.max(1, input.attackTroops);
  const attackerLoss =
    mag * clamp(ratio, 0.6, 2) * (0.463 * attackerBonus * defenderBonus + 0.0039 * defenderDensity);
  const speedCost = (clamp(ratio, 0.82, 7.5) * clamp(ratio / 20, 1, 50)) / 8.55;
  const tickFraction =
    (speedCost * tileCost * attackerSpeedBonus * defenderBonus) /
    Math.max(1, input.borderSize) /
    attacker.mods.conquestSpeedMult;

  return { attackerLoss, defenderLoss: defenderDensity, tickFraction };
}
