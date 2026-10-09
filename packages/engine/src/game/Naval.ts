import type { GameMap } from "../map/GameMap";
import type { Player } from "./Player";

/** Une barge de débarquement en mer. */
export interface Boat {
  id: number;
  owner: Player;
  troops: number;
  /** Tuiles d'eau, du rivage de l'attaquant jusqu'au rivage de débarquement. */
  path: number[];
  /** Index courant dans `path`. */
  step: number;
  /** Tuile de terre où la barge débarque. */
  landing: number;
  /** Propriétaire de la plage au moment du départ (0 = terres libres). */
  target: number;
  done: boolean;
}

/**
 * Tampons réutilisés par la recherche de route (taille de la carte). Le marquage par
 * génération évite de remettre les tableaux à zéro à chaque recherche.
 */
export class SeaScratch {
  readonly prev: Int32Array;
  readonly stamp: Uint32Array;
  readonly queue: Int32Array;
  private generation = 0;

  constructor(size: number) {
    this.prev = new Int32Array(size);
    this.stamp = new Uint32Array(size);
    this.queue = new Int32Array(size);
  }

  /** Commence une nouvelle recherche ; renvoie le marqueur des tuiles visitées. */
  next(): number {
    this.generation++;
    if (this.generation === 0xffffffff) {
      this.stamp.fill(0);
      this.generation = 1;
    }
    return this.generation;
  }
}

/**
 * Plages candidates pour un débarquement : tuiles côtières appartenant au même propriétaire
 * que `dst`, de la plus proche à la plus lointaine (parcours en largeur sur la terre).
 */
export function landingCandidates(
  map: GameMap,
  dst: number,
  maxCandidates: number,
  searchLimit: number,
): number[] {
  const owner = map.owner(dst);
  const seen = new Set<number>([dst]);
  const queue = [dst];
  const found: number[] = [];
  for (let head = 0; head < queue.length && head < searchLimit; head++) {
    const t = queue[head] as number;
    const neighbors = map.neighbors(t);
    if (neighbors.some((n) => map.isWater(n))) {
      found.push(t);
      if (found.length >= maxCandidates) break;
    }
    for (const n of neighbors) {
      if (!seen.has(n) && map.isPassableLand(n) && map.owner(n) === owner) {
        seen.add(n);
        queue.push(n);
      }
    }
  }
  return found;
}

export interface SeaRoute {
  /** Tuiles d'eau, du rivage du joueur vers la plage. */
  path: number[];
  landing: number;
}

/**
 * Route maritime la plus courte entre le rivage d'un joueur et l'une des plages candidates.
 * Un seul parcours en largeur part de toutes les plages à la fois : la première côte du joueur
 * atteinte donne la route et la plage correspondante. Null si aucune mer ne les relie.
 */
export function findSeaRoute(
  map: GameMap,
  ownerId: number,
  landings: readonly number[],
  scratch: SeaScratch,
): SeaRoute | null {
  const mark = scratch.next();
  const { prev, stamp, queue } = scratch;
  const origin = new Map<number, number>();
  let tail = 0;
  for (const landing of landings) {
    for (const n of map.neighbors(landing)) {
      if (map.isWater(n) && stamp[n] !== mark) {
        stamp[n] = mark;
        prev[n] = -1;
        origin.set(n, landing);
        queue[tail++] = n;
      }
    }
  }
  const width = map.width;
  const size = map.size;
  for (let head = 0; head < tail; head++) {
    const t = queue[head] as number;
    const x = t % width;
    const around = [
      t >= width ? t - width : -1,
      t + width < size ? t + width : -1,
      x > 0 ? t - 1 : -1,
      x < width - 1 ? t + 1 : -1,
    ];
    for (const n of around) {
      if (n >= 0 && map.isLand(n) && map.owner(n) === ownerId) {
        const path = [t];
        let cur = prev[t] as number;
        let start = t;
        while (cur >= 0) {
          path.push(cur);
          start = cur;
          cur = prev[cur] as number;
        }
        return { path, landing: origin.get(start) as number };
      }
    }
    for (const n of around) {
      if (n >= 0 && stamp[n] !== mark && map.isWater(n)) {
        stamp[n] = mark;
        prev[n] = t;
        queue[tail++] = n;
      }
    }
  }
  return null;
}
