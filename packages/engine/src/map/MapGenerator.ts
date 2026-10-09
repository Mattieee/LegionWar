import { PseudoRandom } from "../core/PseudoRandom";
import { GameMap } from "./GameMap";
import { LAND_BIT, OCEAN_BIT, SHORE_BIT, TerrainKind, encodeLand } from "./Terrain";

export type MapSize = "small" | "medium" | "large";

export const MAP_DIMENSIONS: Record<MapSize, { width: number; height: number }> = {
  small: { width: 384, height: 240 },
  medium: { width: 512, height: 320 },
  large: { width: 768, height: 480 },
};

const LAND_FRACTION = 0.46;
const MIN_ISLAND_TILES = 40;
const MIN_LAKE_TILES = 60;
const BASE_FEATURES = 6;
const MINE_SPACING = 28;
const LAND_TILES_PER_MINE = 2200;

export interface GeneratedMap {
  map: GameMap;
  /** Tuiles portant une mine d'or (revenu bonus pour leur propriétaire). */
  mines: number[];
}

/**
 * Génère une carte procédurale déterministe : même graine + même taille = mêmes octets.
 * Bruit de valeur fractal (entiers 32 bits + interpolation polynomiale, aucun Math.sin/exp).
 */
export function generateMap(seed: number, size: MapSize): GeneratedMap {
  const { width, height } = MAP_DIMENSIONS[size];
  const n = width * height;
  const rng = new PseudoRandom(seed);
  const elevSeed = rng.nextUint32() | 0;
  const moistSeed = rng.nextUint32() | 0;
  const detailSeed = rng.nextUint32() | 0;

  const elevation = new Float64Array(n);
  const moisture = new Float64Array(n);
  const freq = BASE_FEATURES / width;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = y * width + x;
      const nx = x / width - 0.5;
      const ny = y / height - 0.5;
      const falloff = (nx * nx + ny * ny) * 1.6;
      let e = fbm(x * freq, y * freq, elevSeed, 6) - falloff * 0.6;
      const edge = Math.min(x, y, width - 1 - x, height - 1 - y);
      if (edge < 4) e -= 1;
      elevation[t] = e;
      moisture[t] = fbm(x * freq * 1.7, y * freq * 1.7, moistSeed, 4);
    }
  }

  const sorted = Float64Array.from(elevation).sort();
  const seaLevel = sorted[Math.floor(n * (1 - LAND_FRACTION))] as number;
  const maxElevation = sorted[n - 1] as number;
  const span = Math.max(maxElevation - seaLevel, 1e-9);

  const terrain = new Uint8Array(n);
  for (let t = 0; t < n; t++) {
    const e = elevation[t] as number;
    if (e <= seaLevel) continue;
    const h = (e - seaLevel) / span;
    let kind: TerrainKind;
    if (h > 0.88) kind = TerrainKind.Impassable;
    else if (h > 0.62) kind = TerrainKind.Mountain;
    else if (h > 0.36) kind = TerrainKind.Hills;
    else kind = (moisture[t] as number) > 0.53 ? TerrainKind.Forest : TerrainKind.Plain;
    const variant = Math.floor(latticeHash(t % width, Math.floor(t / width), detailSeed) * 4);
    terrain[t] = encodeLand(kind, variant);
  }

  removeSmallIslands(terrain, width);
  fillSmallLakes(terrain, width);
  markOceanShoreAndDepth(terrain, width, height);

  const map = new GameMap(width, height, terrain);
  return { map, mines: placeMines(map, rng) };
}

function latticeHash(ix: number, iy: number, seed: number): number {
  let h = (Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1) ^ seed) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

function valueNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = smooth(x - ix);
  const fy = smooth(y - iy);
  const a = latticeHash(ix, iy, seed);
  const b = latticeHash(ix + 1, iy, seed);
  const c = latticeHash(ix, iy + 1, seed);
  const d = latticeHash(ix + 1, iy + 1, seed);
  const top = a + (b - a) * fx;
  const bottom = c + (d - c) * fx;
  return top + (bottom - top) * fy;
}

function fbm(x: number, y: number, seed: number, octaves: number): number {
  let sum = 0;
  let amplitude = 1;
  let frequency = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amplitude * valueNoise(x * frequency, y * frequency, (seed + o * 1013) | 0);
    norm += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return sum / norm;
}

/** Étiquette les composantes 4-connexes des tuiles satisfaisant `inSet`. */
function labelComponents(
  width: number,
  n: number,
  inSet: (t: number) => boolean,
): { labels: Int32Array; sizes: number[] } {
  const labels = new Int32Array(n).fill(-1);
  const sizes: number[] = [];
  const queue = new Int32Array(n);
  for (let start = 0; start < n; start++) {
    if (labels[start] !== -1 || !inSet(start)) continue;
    const label = sizes.length;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    labels[start] = label;
    while (head < tail) {
      const t = queue[head++] as number;
      const x = t % width;
      const candidates = [
        t >= width ? t - width : -1,
        t + width < n ? t + width : -1,
        x > 0 ? t - 1 : -1,
        x < width - 1 ? t + 1 : -1,
      ];
      for (const nb of candidates) {
        if (nb >= 0 && labels[nb] === -1 && inSet(nb)) {
          labels[nb] = label;
          queue[tail++] = nb;
        }
      }
    }
    sizes.push(tail);
  }
  return { labels, sizes };
}

function removeSmallIslands(terrain: Uint8Array, width: number): void {
  const { labels, sizes } = labelComponents(
    width,
    terrain.length,
    (t) => ((terrain[t] as number) & LAND_BIT) !== 0,
  );
  for (let t = 0; t < terrain.length; t++) {
    const label = labels[t] as number;
    if (label >= 0 && (sizes[label] as number) < MIN_ISLAND_TILES) terrain[t] = 0;
  }
}

function fillSmallLakes(terrain: Uint8Array, width: number): void {
  const { labels, sizes } = labelComponents(
    width,
    terrain.length,
    (t) => ((terrain[t] as number) & LAND_BIT) === 0,
  );
  const largest = largestLabel(sizes);
  for (let t = 0; t < terrain.length; t++) {
    const label = labels[t] as number;
    if (label >= 0 && label !== largest && (sizes[label] as number) < MIN_LAKE_TILES) {
      terrain[t] = encodeLand(TerrainKind.Plain, 0);
    }
  }
}

function largestLabel(sizes: number[]): number {
  let best = -1;
  let bestSize = -1;
  for (let i = 0; i < sizes.length; i++) {
    if ((sizes[i] as number) > bestSize) {
      bestSize = sizes[i] as number;
      best = i;
    }
  }
  return best;
}

function markOceanShoreAndDepth(terrain: Uint8Array, width: number, height: number): void {
  const n = width * height;
  const isLand = (t: number): boolean => ((terrain[t] as number) & LAND_BIT) !== 0;
  const { labels, sizes } = labelComponents(width, n, (t) => !isLand(t));
  const ocean = largestLabel(sizes);

  const depth = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  const neighbors = (t: number): number[] => {
    const x = t % width;
    const out: number[] = [];
    if (t >= width) out.push(t - width);
    if (t + width < n) out.push(t + width);
    if (x > 0) out.push(t - 1);
    if (x < width - 1) out.push(t + 1);
    return out;
  };

  for (let t = 0; t < n; t++) {
    const land = isLand(t);
    let touchesOther = false;
    for (const nb of neighbors(t)) {
      if (isLand(nb) !== land) {
        touchesOther = true;
        break;
      }
    }
    if (touchesOther) terrain[t] = (terrain[t] as number) | SHORE_BIT;
    if (!land) {
      if (labels[t] === ocean) terrain[t] = (terrain[t] as number) | OCEAN_BIT;
      if (touchesOther) {
        depth[t] = 1;
        queue[tail++] = t;
      }
    }
  }
  // Profondeur = distance (BFS) à la côte, plafonnée à 31.
  while (head < tail) {
    const t = queue[head++] as number;
    for (const nb of neighbors(t)) {
      if (!isLand(nb) && depth[nb] === -1) {
        depth[nb] = (depth[t] as number) + 1;
        queue[tail++] = nb;
      }
    }
  }
  for (let t = 0; t < n; t++) {
    if (!isLand(t)) {
      const d = depth[t] === -1 ? 31 : Math.min(31, depth[t] as number);
      terrain[t] = (terrain[t] as number) | d;
    }
  }
}

function placeMines(map: GameMap, rng: PseudoRandom): number[] {
  const candidates: number[] = [];
  for (let t = 0; t < map.size; t++) {
    const kind = map.kind(t);
    if ((kind === TerrainKind.Plain || kind === TerrainKind.Hills) && !map.isShore(t)) {
      candidates.push(t);
    }
  }
  rng.shuffle(candidates);
  const target = Math.max(4, Math.floor(map.numLandTiles / LAND_TILES_PER_MINE));
  const minDistSq = MINE_SPACING * MINE_SPACING;
  const mines: number[] = [];
  for (const t of candidates) {
    if (mines.length >= target) break;
    if (mines.every((m) => map.euclidSq(m, t) >= minDistSq)) mines.push(t);
  }
  return mines;
}
