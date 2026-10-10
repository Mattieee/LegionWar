import { OWNER_MASK, type AttackView } from "@legionwar/engine";

/** Durée de la trace laissée sur une tuile prise de force (ms). */
export const SPARK_MS = 1000;
/** Au-delà, les plus anciennes traces sont oubliées (200 tribus en guerre). */
const MAX_SPARKS = 6000;
/** Un chiffre de front glisse vers son nouveau repère en ce temps (ms), comme sur OpenFront. */
const SLIDE_MS = 250;
/** Au-delà de cette distance (tuiles), il saute au lieu de glisser. */
const SNAP_TILES = 200;

/** Un chiffre de front : glisse de (fromX, fromY) vers (toX, toY) à partir de `start`. */
interface Slot {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  start: number;
}

/** Front d'une attaque entre deux royaumes, avec un chiffre par tronçon de la ligne de front. */
export interface Front {
  attack: number;
  attacker: number;
  target: number;
  troops: number;
  /** Positions affichées des chiffres (tuiles), calculées pour l'image courante. */
  positions: { x: number; y: number }[];
  slots: Slot[];
}

/**
 * Effets de bataille, purement visuels : trace sur les tuiles qui changent de main (vert ou
 * rouge sur vos fronts) et chiffre des troupes de chaque front, comme sur OpenFront.
 * Le moteur fournit, pour chaque attaque, un repère par tronçon de la ligne de front (recalculé
 * toutes les 200 ms) ; les chiffres y glissent en 250 ms au lieu de sauter à chaque tick.
 */
export class BattleFx {
  private sparkTiles: number[] = [];
  private sparkTimes: number[] = [];
  /** Nouveau et ancien propriétaire de chaque tuile prise : la couleur dit qui gagne. */
  private sparkWinners: number[] = [];
  private sparkLosers: number[] = [];
  private readonly fronts = new Map<number, Front>();

  constructor(private readonly width: number) {}

  /**
   * À appeler avant d'appliquer les changements du tick : `ownerBefore` donne encore
   * l'ancien propriétaire de chaque tuile.
   */
  record(
    changed: Uint32Array,
    ownerBefore: (tile: number) => number,
    attacks: readonly AttackView[],
    now: number,
  ): void {
    for (let i = 0; i < changed.length; i += 2) {
      const tile = changed[i] as number;
      const owner = (changed[i + 1] as number) & OWNER_MASK;
      const before = ownerBefore(tile);
      // Seules les prises entre deux royaumes sont des batailles (pas l'expansion).
      if (before === owner || before === 0 || owner === 0) continue;
      this.sparkTiles.push(tile);
      this.sparkTimes.push(now);
      this.sparkWinners.push(owner);
      this.sparkLosers.push(before);
    }
    this.dropSparks(this.sparkTiles.length - MAX_SPARKS);

    // Les fronts suivent les attaques en cours ; une attaque terminée retire ses chiffres.
    const alive = new Set<number>();
    for (const a of attacks) {
      if (a.target === 0) continue;
      alive.add(a.id);
      let front = this.fronts.get(a.id);
      if (!front) {
        front = {
          attack: a.id,
          attacker: a.attacker,
          target: a.target,
          troops: a.troops,
          positions: [],
          slots: [],
        };
        this.fronts.set(a.id, front);
      }
      front.troops = a.troops;
      this.retarget(front, a.fronts, now);
    }
    for (const id of this.fronts.keys()) if (!alive.has(id)) this.fronts.delete(id);
  }

  /** Tuiles prises encore visibles : `draw(tuile, âge entre 0 et 1, gagnant, perdant)`. */
  forEachSpark(
    now: number,
    draw: (tile: number, age: number, winner: number, loser: number) => void,
  ): void {
    let first = 0;
    while (first < this.sparkTimes.length && now - (this.sparkTimes[first] as number) > SPARK_MS) {
      first++;
    }
    this.dropSparks(first);
    for (let i = 0; i < this.sparkTiles.length; i++) {
      draw(
        this.sparkTiles[i] as number,
        (now - (this.sparkTimes[i] as number)) / SPARK_MS,
        this.sparkWinners[i] as number,
        this.sparkLosers[i] as number,
      );
    }
  }

  /** Fronts ayant au moins un repère, positions interpolées pour l'image courante. */
  activeFronts(now: number): Front[] {
    const out: Front[] = [];
    for (const f of this.fronts.values()) {
      if (f.slots.length === 0) continue;
      f.positions = f.slots.map((s) => position(s, now));
      out.push(f);
    }
    return out;
  }

  /** Nouveaux repères d'un front : chaque chiffre repart de sa position actuelle. */
  private retarget(front: Front, tiles: readonly number[], now: number): void {
    if (tiles.length === 0) return;
    const targets = tiles.map((t) => ({
      x: (t % this.width) + 0.5,
      y: Math.floor(t / this.width) + 0.5,
    }));
    // Deux tronçons : on garde l'appariement le plus proche, pour que les chiffres ne se croisent pas.
    const [s0, s1] = front.slots;
    const [t0, t1] = targets;
    if (s0 && s1 && t0 && t1) {
      const straight = manhattan(s0, t0) + manhattan(s1, t1);
      const swapped = manhattan(s0, t1) + manhattan(s1, t0);
      if (swapped < straight) targets.reverse();
    }
    front.slots.length = Math.min(front.slots.length, targets.length);
    targets.forEach((target, i) => {
      const slot = front.slots[i];
      if (!slot) {
        front.slots.push({
          fromX: target.x,
          fromY: target.y,
          toX: target.x,
          toY: target.y,
          start: now,
        });
        return;
      }
      if (slot.toX === target.x && slot.toY === target.y) return;
      const current = position(slot, now);
      const far = Math.hypot(target.x - current.x, target.y - current.y) > SNAP_TILES;
      slot.fromX = far ? target.x : current.x;
      slot.fromY = far ? target.y : current.y;
      slot.toX = target.x;
      slot.toY = target.y;
      slot.start = now;
    });
  }

  private dropSparks(count: number): void {
    if (count <= 0) return;
    this.sparkTiles.splice(0, count);
    this.sparkTimes.splice(0, count);
    this.sparkWinners.splice(0, count);
    this.sparkLosers.splice(0, count);
  }
}

/** Position d'un chiffre à l'instant `now` : glissement linéaire de 250 ms. */
function position(slot: Slot, now: number): { x: number; y: number } {
  const t = Math.min(1, Math.max(0, (now - slot.start) / SLIDE_MS));
  return {
    x: slot.fromX + (slot.toX - slot.fromX) * t,
    y: slot.fromY + (slot.toY - slot.fromY) * t,
  };
}

/** Distance de Manhattan entre la destination d'un chiffre et un repère. */
function manhattan(slot: Slot, p: { x: number; y: number }): number {
  return Math.abs(slot.toX - p.x) + Math.abs(slot.toY - p.y);
}
