import { OWNER_MASK, type AttackView } from "@legionwar/engine";

/** Durée de la trace laissée sur une tuile prise de force (ms). */
export const SPARK_MS = 1000;
/** Fenêtre des prises récentes qui situent le front d'une attaque (ms). */
const FRONT_WINDOW_MS = 2000;
/** Prises « fraîches » : la ligne de front actuelle, que suit le chiffre (ms). */
const FRESH_MS = 500;
/** Au-delà, les plus anciennes étincelles sont oubliées (200 tribus en guerre). */
const MAX_SPARKS = 6000;
/** Lissage par image : le chiffre glisse vers la frontière au lieu d'y sauter. */
const FRONT_SMOOTHING = 0.15;

interface Capture {
  tile: number;
  at: number;
}

/** Front d'une attaque entre deux royaumes : là où ses tuiles tombent en ce moment. */
export interface Front {
  attack: number;
  attacker: number;
  target: number;
  troops: number;
  /** Position du chiffre (tuiles), lissée vers le cœur de la ligne de front. */
  x: number;
  y: number;
  /** Prises récentes, de la plus ancienne à la plus récente. */
  recent: Capture[];
}

/**
 * Effets de bataille, purement visuels : ligne de front sur les tuiles qui changent de main
 * (vert ou rouge sur vos fronts) et chiffre des troupes de chaque front, comme sur OpenFront.
 * Tout se déduit des changements de tuiles reçus à chaque tick : le moteur n'en sait rien.
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
    const byPair = new Map<number, AttackView>();
    for (const a of attacks) if (a.target !== 0) byPair.set(pairKey(a.attacker, a.target), a);

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
      const attack = byPair.get(pairKey(owner, before));
      if (attack) this.front(attack).recent.push({ tile, at: now });
    }
    if (this.sparkTiles.length > MAX_SPARKS) {
      this.dropSparks(this.sparkTiles.length - MAX_SPARKS);
    }

    // Les fronts suivent les attaques en cours ; une attaque terminée retire ses effets.
    const alive = new Set<number>();
    for (const a of attacks) {
      if (a.target === 0) continue;
      alive.add(a.id);
      const f = this.fronts.get(a.id);
      if (f) f.troops = a.troops;
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

  private dropSparks(count: number): void {
    if (count <= 0) return;
    this.sparkTiles.splice(0, count);
    this.sparkTimes.splice(0, count);
    this.sparkWinners.splice(0, count);
    this.sparkLosers.splice(0, count);
  }

  /** Fronts ayant des prises récentes, chiffre recalé sur la ligne de front actuelle. */
  activeFronts(now: number): Front[] {
    const out: Front[] = [];
    for (const f of this.fronts.values()) {
      f.recent = f.recent.filter((r) => now - r.at <= FRONT_WINDOW_MS);
      if (f.recent.length === 0) continue;
      // La ligne de front, c'est ce qui est tombé au dernier tick ; à défaut, les prises récentes.
      const fresh = this.fresh(f, now);
      const lastAt = fresh.length > 0 ? (fresh[fresh.length - 1] as Capture).at : 0;
      const line = fresh.length > 0 ? fresh.filter((r) => r.at === lastAt) : f.recent;
      // La prise la plus proche du centre de la ligne : toujours sur la frontière, même quand
      // le front est long ou en plusieurs morceaux.
      let cx = 0;
      let cy = 0;
      for (const r of line) {
        cx += this.tx(r.tile);
        cy += this.ty(r.tile);
      }
      cx /= line.length;
      cy /= line.length;
      const best = this.nearest(line, cx, cy, Infinity) as Capture;
      const tx = this.tx(best.tile);
      const ty = this.ty(best.tile);
      if (Number.isNaN(f.x)) {
        f.x = tx;
        f.y = ty;
      } else {
        f.x += (tx - f.x) * FRONT_SMOOTHING;
        f.y += (ty - f.y) * FRONT_SMOOTHING;
      }
      out.push(f);
    }
    return out;
  }

  private fresh(front: Front, now: number): Capture[] {
    let i = front.recent.length;
    while (i > 0 && now - (front.recent[i - 1] as Capture).at <= FRESH_MS) i--;
    return front.recent.slice(i);
  }

  /** Prise la plus proche de (x, y) à moins de √`maxSq` tuiles, ou null. */
  private nearest(
    captures: readonly Capture[],
    x: number,
    y: number,
    maxSq: number,
  ): Capture | null {
    let best: Capture | null = null;
    let bestSq = maxSq;
    for (const r of captures) {
      const d = dist2(this.tx(r.tile), this.ty(r.tile), x, y);
      if (d < bestSq) {
        bestSq = d;
        best = r;
      }
    }
    return best;
  }

  private tx(tile: number): number {
    return (tile % this.width) + 0.5;
  }

  private ty(tile: number): number {
    return Math.floor(tile / this.width) + 0.5;
  }

  private front(attack: AttackView): Front {
    let f = this.fronts.get(attack.id);
    if (!f) {
      f = {
        attack: attack.id,
        attacker: attack.attacker,
        target: attack.target,
        troops: attack.troops,
        x: Number.NaN,
        y: Number.NaN,
        recent: [],
      };
      this.fronts.set(attack.id, f);
    }
    return f;
  }
}

function dist2(ax: number, ay: number, bx: number, by: number): number {
  return (ax - bx) ** 2 + (ay - by) ** 2;
}

function pairKey(attacker: number, target: number): number {
  return attacker * 4096 + target;
}
