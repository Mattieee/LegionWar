import { clamp, pow } from "../core/DetMath";
import type { RaceModifiers } from "./Races";
import type { Player } from "../game/Player";
import { BuildingKind, Difficulty } from "../game/Types";
import { TerrainKind } from "../map/Terrain";

// Temps ---------------------------------------------------------------------------------------
export const TICK_MS = 100;
export const TICKS_PER_SECOND = 1000 / TICK_MS;

// Rythme (voir GDD §6) ------------------------------------------------------------------------
/**
 * Vitesse des batailles contre un royaume, relative aux formules du genre. Nos cartes ont
 * 5 à 15 fois moins de terres qu'une carte d'OpenFront : à formule égale, une vague balaie
 * une part bien plus grande de la carte et le défenseur n'a pas le temps de réagir.
 */
export const CONQUEST_PACE = 0.25;
/** Vitesse d'expansion sur les terres libres (l'ouverture reste plus vive que la guerre). */
export const EXPANSION_PACE = 0.5;
/** Multiplicateur global de la régénération des troupes : l'horloge de la partie. */
export const REGEN_PACE = 0.5;

// Déploiement ---------------------------------------------------------------------------------
export const SPAWN_RADIUS = 4;
export const MULTIPLAYER_SPAWN_PHASE_TICKS = 200;
export const MIN_SPAWN_DISTANCE = 30;
export const SPAWN_ATTEMPTS = 1000;
export const SPAWN_ATTEMPTS_STRICT = 750;

// Ressources ----------------------------------------------------------------------------------
export const START_TROOPS = { human: 25_000, bot: 10_000 } as const;
export const GOLD_PER_TICK = { human: 100, nation: 100, bot: 50 } as const;
export const GOLD_PER_MINE_PER_TICK = 40;
export const BOURG_TROOP_BONUS = 250_000;

// Prétendants (GDD §13.3) --------------------------------------------------------------------
export interface DifficultyLevel {
  /** Nom affiché. */
  name: string;
  startTroops: number;
  troopMult: number;
  regenMult: number;
  /** Intervalle d'action de l'IA, en ticks [min, max[. */
  interval: readonly [number, number];
  /** Probabilité de renoncer à une cible humaine. */
  humanGiveUp: number;
  /** Part des troupes du plus fort voisin non allié gardée en réserve. */
  prudence: number;
  /** Barges : jamais, vers les terres libres seulement, ou toutes. */
  boats: "none" | "free" | "all";
  towers: boolean;
  /** Se ligue contre le porteur de la Couronne. */
  league: boolean;
  /** Une réponse d'alliance sur N est inversée (0 = jamais). */
  confusion: number;
  /** Rapport de troupes requis pour trahir un allié voisin. */
  betrayRatio: number;
  /** Rapport requis pour trahir l'allié voisin le plus faible quand on est enfermé (0 = jamais). */
  boxedBetrayRatio: number;
  /** Relation infligée à qui l'attaque. */
  attackedRelation: number;
}

export const DIFFICULTIES: Record<Difficulty, DifficultyLevel> = {
  [Difficulty.Squire]: {
    name: "Écuyer",
    startTroops: 12_500,
    troopMult: 0.5,
    regenMult: 0.9,
    interval: [65, 100],
    humanGiveUp: 0.75,
    prudence: 0,
    boats: "none",
    towers: false,
    league: false,
    confusion: 10,
    betrayRatio: 10,
    boxedBetrayRatio: 0,
    attackedRelation: -60,
  },
  [Difficulty.Knight]: {
    name: "Chevalier",
    startTroops: 18_750,
    troopMult: 0.75,
    regenMult: 0.95,
    interval: [55, 70],
    humanGiveUp: 0.25,
    prudence: 0,
    boats: "free",
    towers: true,
    league: false,
    confusion: 20,
    betrayRatio: 10,
    boxedBetrayRatio: 2,
    attackedRelation: -70,
  },
  [Difficulty.Duke]: {
    name: "Duc",
    startTroops: 25_000,
    troopMult: 1,
    regenMult: 1,
    interval: [45, 60],
    humanGiveUp: 0,
    prudence: 0.75,
    boats: "all",
    towers: true,
    league: true,
    confusion: 40,
    betrayRatio: 3,
    boxedBetrayRatio: 1.5,
    attackedRelation: -80,
  },
  [Difficulty.Emperor]: {
    name: "Empereur",
    startTroops: 31_250,
    troopMult: 1.25,
    regenMult: 1.05,
    interval: [30, 50],
    humanGiveUp: 0,
    prudence: 0.9,
    boats: "all",
    towers: true,
    league: true,
    confusion: 0,
    betrayRatio: 2,
    boxedBetrayRatio: 1.2,
    attackedRelation: -100,
  },
};

/**
 * Un prétendant attaque son voisin le plus faible quand ses troupes valent au moins 1,25 fois
 * les siennes (l'ancien seuil, 0,8 × troupes engageables, figeait les fronts entre égaux).
 */
export const NATION_WEAKEST_EDGE = 1.25;

/** Prétendants par défaut selon la taille de carte. */
export const DEFAULT_NATIONS = { small: 3, medium: 5, large: 8 } as const;
export const MAX_NATIONS = 12;
/** Distance minimale (Manhattan) entre deux prétendants au déploiement, relâchée si besoin. */
export const NATION_SPAWN_DISTANCE = 60;
export const NATION_SPAWN_DISTANCE_RELAXED = 30;

// Diplomatie (GDD §12) ------------------------------------------------------------------------
/** Une demande d'alliance vaut 20 s ; 30 s avant de redemander à la même cible. */
export const ALLIANCE_REQUEST_TICKS = 200;
export const ALLIANCE_REQUEST_COOLDOWN = 300;
/** Durée d'une alliance (5 min) et fenêtre de renouvellement (30 dernières secondes). */
export const ALLIANCE_TICKS = 3000;
export const ALLIANCE_RENEW_WINDOW = 300;
/** Alliances simultanées par joueur, tribus comprises. */
export const MAX_ALLIANCES = 5;
/** Statut de Parjure après une trahison (60 s, rythme du §6) et ses effets en combat. */
export const PARJURE_TICKS = 600;
export const PARJURE_LOSS_MULT = 0.5;
export const PARJURE_COST_MULT = 0.8;
/** Un don par destinataire toutes les 10 s, or et troupes confondus. */
export const DONATION_COOLDOWN = 100;
/** Part des terres à partir de laquelle on porte la Couronne (et devient la cible de la Ligue). */
export const CROWN_PERCENT = 35;
/** Relations des prétendants : bornes, retour vers 0 d'un point tous les 25 ticks. */
export const RELATION_MAX = 100;
export const RELATION_DECAY_TICKS = 25;

// Victoire ------------------------------------------------------------------------------------
export const WIN_PERCENT = 80;
/**
 * Crépuscule (GDD §14) : 20 min après la fin du déploiement, le seuil de victoire baisse de
 * 3 points par minute écoulée (77 % à 21 min, 50 % à 30 min, 35 % à 35 min).
 */
export const TWILIGHT_START_TICKS = 12_000;
export const TWILIGHT_STEP_TICKS = 600;
export const TWILIGHT_STEP_PERCENT = 3;
/** Fin de partie : à 35 min, le plus grand royaume l'emporte, quelle que soit sa part. */
export const TIME_LIMIT_TICKS = 21_000;
export const WIN_CHECK_INTERVAL = 10;
export const HASH_INTERVAL = 10;
/** Le hash couvre aussi l'état complet des tuiles à cet intervalle (≈ 2 ms sur 2 M de tuiles). */
export const STATE_HASH_INTERVAL = 100;
/** Sous ce nombre de tuiles, un joueur conquis est annexé en entier. */
export const ANNEX_THRESHOLD = 50;

/** Seuil de victoire (en % des terres) après `warTicks` ticks de guerre (Crépuscule compris). */
export function winPercentAt(warTicks: number): number {
  if (warTicks < TWILIGHT_START_TICKS + TWILIGHT_STEP_TICKS) return WIN_PERCENT;
  const steps = Math.floor((warTicks - TWILIGHT_START_TICKS) / TWILIGHT_STEP_TICKS);
  return Math.max(0, WIN_PERCENT - TWILIGHT_STEP_PERCENT * steps);
}

// Anti-boule de neige (GDD §6) ----------------------------------------------------------------
/**
 * Poids de la Couronne : qui porte la Couronne (CROWN_PERCENT % des terres, le plus grand) perd
 * 50 % de troupes en plus quand il attaque un royaume (pas une tribu ni les terres libres).
 */
export const CROWN_LOSS_MULT = 1.5;

// Bâtiments -----------------------------------------------------------------------------------
export const STRUCTURE_MIN_DIST = 12;
export const TOWER_RANGE = 20;
/** Pertes de l'attaquant ×4 et progression ×2,5 plus lente sous couverture d'une tour. */
export const TOWER_LOSS_MULT = 4;
export const TOWER_COST_MULT = 2.5;

// Mécaniques de race (voir GDD §7.3) ------------------------------------------------------------
/** Aldoria : une tuile frontière tenue deux rondes de suite devient un rempart. Ronde = 10 s. */
export const RAMPART_INTERVAL = 100;
/**
 * Pertes de l'attaquant ×1,5 et progression 1,2× plus lente sur un rempart (sans cumul avec une
 * tour). Le ralentissement a été réduit de 1,5 à 1,2 avec le rythme (§6) : à batailles 4× plus
 * lentes, il durait 4× plus longtemps et portait Aldoria à 33 % des parties menées.
 */
export const RAMPART_LOSS_MULT = 1.5;
export const RAMPART_COST_MULT = 1.2;
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
/** Vitesse d'une barge, en tuiles d'eau par tick (10 tuiles/s, comme OpenFront). */
export const BOAT_TILES_PER_TICK = 1;
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
  const kindMult = p.kind === "bot" ? 1 / 3 : p.kind === "nation" ? p.level.troopMult : 1;
  return Math.floor(base * kindMult * p.mods.maxTroopsMult);
}

/** Troupes gagnées (ou perdues si au-dessus du plafond) ce tick. */
export function troopIncrease(p: Player): number {
  const max = maxTroops(p);
  let add = (10 + pow(p.troops, 0.73) / 4) * (1 - p.troops / max);
  if (p.kind === "bot") add *= 0.5;
  if (p.kind === "nation") add *= p.level.regenMult;
  add *= p.mods.regenMult * REGEN_PACE;
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
  /** Le défenseur est Parjure. */
  parjure: boolean;
  /** Tuiles terrestres de la carte (échelle du bonus « grand territoire »). */
  landTiles: number;
  /** L'attaquant porte la Couronne (état figé au début du tick). */
  crowned?: boolean;
}

export interface CombatResult {
  attackerLoss: number;
  defenderLoss: number;
  /** Part du budget du tick consommée par cette tuile (budget = 1 par tick). */
  tickFraction: number;
}

/**
 * Bonus « grand territoire » : 1 − depth / (1 + (mid / n)^2,5).
 * Proche de 1 pour un petit empire, décroît quand il devient immense. Seul le défenseur y est
 * soumis : un empire immense se défend moins bien. Côté attaquant, la formule du genre réduisait
 * ses pertes et accélérait ses conquêtes, un moteur de boule de neige retiré (GDD §6).
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
        attacker.mods.conquestSpeedMult /
        EXPANSION_PACE,
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
  // Seigneurs et prétendants saignent moins contre les tribus.
  if (attacker.kind !== "bot" && defender.kind === "bot") mag *= 0.7;
  // Le Parjure : ses ennemis perdent moitié moins et avancent plus vite.
  if (input.parjure) {
    mag *= PARJURE_LOSS_MULT;
    tileCost *= PARJURE_COST_MULT;
  }
  // Poids de la Couronne : le meneur paie ses conquêtes plus cher (pas contre les tribus).
  if (input.crowned && defender.kind !== "bot") mag *= CROWN_LOSS_MULT;

  const defenderBonus = largeTerritoryBonus(defender.tiles, 0.3, input.landTiles);

  const defenderDensity = defender.troops / Math.max(1, defender.tiles);
  const ratio = defender.troops / Math.max(1, input.attackTroops);
  const attackerLoss =
    mag * clamp(ratio, 0.6, 2) * (0.463 * defenderBonus + 0.0039 * defenderDensity);
  const speedCost = (clamp(ratio, 0.82, 7.5) * clamp(ratio / 20, 1, 50)) / 8.55;
  const tickFraction =
    (speedCost * tileCost * defenderBonus) /
    Math.max(1, input.borderSize) /
    attacker.mods.conquestSpeedMult /
    CONQUEST_PACE;

  return { attackerLoss, defenderLoss: defenderDensity, tickFraction };
}
