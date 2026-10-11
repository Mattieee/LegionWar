import {
  NEF_CAPTURE_RANGE,
  SHELL_DAMAGE_MAX,
  SHELL_DAMAGE_MIN,
  SHELL_TILES_PER_TICK,
  WARSHIP_DOCK_HEAL,
  WARSHIP_FIRE_TICKS,
  WARSHIP_HEAL_RANGE,
  WARSHIP_HP,
  WARSHIP_PASSIVE_HEAL,
  WARSHIP_PATROL_RADIUS,
  WARSHIP_RANGE,
  WARSHIP_REPAIR_PERCENT,
  WARSHIP_TILES_PER_TICK,
} from "../config/Rules";
import { mixHash } from "../core/hash";
import { PseudoRandom } from "../core/PseudoRandom";
import type { GameMap } from "../map/GameMap";
import { OCEAN_BIT } from "../map/Terrain";
import type { ShellView, WarshipView } from "./Types";

/**
 * Navires de guerre (GDD §10), comme ceux d'OpenFront : ils patrouillent autour d'un point,
 * tirent des boulets à tête chercheuse sur les barges puis sur les navires ennemis, capturent les
 * nefs marchandes qui passent près d'eux, et rentrent se réparer au port sous 75 % de PV.
 *
 * Déterminisme : navires et boulets dans l'ordre de création, cibles départagées par distance
 * puis identifiant, hasard (patrouille, dégâts) par un PseudoRandom dédié, positions entières.
 */

/** Une cible mobile en mer : barge, nef ou navire. */
export interface SeaUnit {
  id: number;
  owner: number;
  tile: number;
}

/** Ce dont les navires ont besoin du jeu. */
export interface WarshipHost {
  readonly map: GameMap;
  /** Vrai si les deux royaumes peuvent se combattre en mer (distincts, vivants, non alliés). */
  hostile(a: number, b: number): boolean;
  alive(owner: number): boolean;
  /** Ports achevés d'un royaume (tuiles côtières), dans l'ordre de création. */
  portsOf(owner: number): number[];
  /** Mer d'une tuile (océan, ou côte qui le borde) ; -1 si aucune. */
  seaAt(tile: number): number;
  boats(): SeaUnit[];
  nefs(): SeaUnit[];
  /** Une barge touchée coule avec ses troupes. */
  sinkBoat(id: number, by: number): void;
  /** Une nef capturée : sa cargaison va au capteur. */
  captureNef(nef: SeaUnit, by: number): void;
  warshipSunk(owner: number, by: number): void;
}

type Mode = "patrol" | "repair";

interface Warship {
  id: number;
  owner: number;
  tile: number;
  hp: number;
  sea: number;
  /** Centre de la patrouille (déplacé par le joueur). */
  patrol: number;
  /** Tuiles restantes jusqu'à l'étape en cours (la première à atteindre en tête). */
  path: number[];
  step: number;
  cooldown: number;
  mode: Mode;
  /** Quai visé en mode réparation (eau au pied d'un de ses ports), -1 sinon. */
  dock: number;
}

type ShellTarget = { kind: "boat" | "warship"; id: number };
type Targeted = Record<ShellTarget["kind"], Set<number>>;

interface Shell {
  id: number;
  owner: number;
  tile: number;
  target: ShellTarget;
  damage: number;
}

/** Tuiles d'eau explorées au plus pour un trajet (le navire reste dans sa zone). */
const PATH_SEARCH_LIMIT = 40_000;
/** Essais pour tirer une étape de patrouille sur l'eau de la bonne mer. */
const PATROL_TRIES = 8;

export class Warships {
  private ships: Warship[] = [];
  private shells: Shell[] = [];
  private nextShipId = 1;
  private nextShellId = 1;
  private readonly rng: PseudoRandom;
  private scratch: PathScratch | null = null;

  constructor(
    private readonly host: WarshipHost,
    seed: number,
  ) {
    this.rng = new PseudoRandom(seed ^ 0x51ed270b);
  }

  // Commandes -----------------------------------------------------------------------------------

  countOf(owner: number): number {
    let n = 0;
    for (const s of this.ships) if (s.owner === owner) n++;
    return n;
  }

  get total(): number {
    return this.ships.length;
  }

  /** Port d'où sortirait un navire armé vers `tile` : le plus proche, sur la même mer si possible. */
  launchPort(owner: number, tile: number): number | null {
    const map = this.host.map;
    const sea = this.host.seaAt(tile);
    let best: number | null = null;
    let bestSq = Infinity;
    for (const port of this.host.portsOf(owner)) {
      if (sea >= 0 && this.host.seaAt(port) !== sea) continue;
      if (this.waterBeside(port) === null) continue;
      const d = map.euclidSq(port, tile);
      if (d < bestSq) {
        bestSq = d;
        best = port;
      }
    }
    return best;
  }

  /** Arme un navire au port donné ; il patrouillera autour de `patrol` (sinon autour du port). */
  launch(owner: number, port: number, patrol: number): number | null {
    const start = this.waterBeside(port);
    if (start === null) return null;
    const sea = this.host.seaAt(start);
    const center = this.isSea(patrol, sea) ? patrol : start;
    const ship: Warship = {
      id: this.nextShipId++,
      owner,
      tile: start,
      hp: WARSHIP_HP,
      sea,
      patrol: center,
      path: [],
      step: 0,
      cooldown: 0,
      mode: "patrol",
      dock: -1,
    };
    this.ships.push(ship);
    return ship.id;
  }

  /** Déplace le point de patrouille d'un de ses navires (même mer seulement). */
  move(owner: number, id: number, tile: number): boolean {
    const ship = this.ships.find((s) => s.id === id && s.owner === owner);
    if (!ship || !this.host.map.isValidRef(tile) || !this.isSea(tile, ship.sea)) return false;
    ship.patrol = tile;
    if (ship.mode === "patrol") this.setPath(ship, tile);
    return true;
  }

  // Boucle --------------------------------------------------------------------------------------

  tick(): void {
    this.ships = this.ships.filter((s) => this.host.alive(s.owner));
    for (const ship of this.ships) this.sail(ship);
    this.moveShells();
    // Une cible déjà visée par un boulet en vol n'en reçoit pas un second.
    const targeted: Targeted = { boat: new Set(), warship: new Set() };
    for (const shell of this.shells) targeted[shell.target.kind].add(shell.target.id);
    const boats = this.host.boats();
    const nefs = this.host.nefs();
    for (const ship of this.ships) {
      this.heal(ship);
      this.pirate(ship, nefs);
      this.fire(ship, boats, targeted);
    }
  }

  private sail(ship: Warship): void {
    if (ship.mode === "patrol" && ship.hp * 100 < WARSHIP_HP * WARSHIP_REPAIR_PERCENT) {
      const dock = this.nearestDock(ship);
      if (dock !== null) {
        ship.mode = "repair";
        ship.dock = dock;
        this.setPath(ship, dock);
      }
    }
    for (let i = 0; i < WARSHIP_TILES_PER_TICK && ship.step < ship.path.length; i++) {
      ship.tile = ship.path[ship.step++] as number;
    }
    if (ship.step < ship.path.length) return;
    if (ship.mode === "repair") {
      // Le quai doit toujours être celui de son port le plus proche (un port peut tomber).
      const dock = this.nearestDock(ship);
      if (dock === null) {
        ship.mode = "patrol";
        ship.dock = -1;
      } else if (dock !== ship.dock || ship.tile !== dock) {
        ship.dock = dock;
        this.setPath(ship, dock); // trajet partiel s'il est loin : il avance par étapes
      } else {
        // À quai : réparation rapide, puis retour en patrouille.
        ship.hp = Math.min(WARSHIP_HP, ship.hp + WARSHIP_DOCK_HEAL);
        if (ship.hp >= WARSHIP_HP) {
          ship.mode = "patrol";
          ship.dock = -1;
        }
      }
      return;
    }
    const next = this.patrolStep(ship);
    if (next !== null) this.setPath(ship, next);
  }

  private heal(ship: Warship): void {
    if (ship.hp >= WARSHIP_HP || ship.mode === "repair") return;
    const map = this.host.map;
    const r2 = WARSHIP_HEAL_RANGE * WARSHIP_HEAL_RANGE;
    for (const port of this.host.portsOf(ship.owner)) {
      if (map.euclidSq(port, ship.tile) <= r2) {
        ship.hp = Math.min(WARSHIP_HP, ship.hp + WARSHIP_PASSIVE_HEAL);
        return;
      }
    }
  }

  /** Capture les nefs ennemies qui passent à portée de grappin. */
  private pirate(ship: Warship, nefs: readonly SeaUnit[]): void {
    const map = this.host.map;
    const r2 = NEF_CAPTURE_RANGE * NEF_CAPTURE_RANGE;
    for (const nef of nefs) {
      if (!this.host.hostile(ship.owner, nef.owner)) continue;
      if (map.euclidSq(nef.tile, ship.tile) <= r2) this.host.captureNef(nef, ship.owner);
    }
  }

  /** Tire sur la barge ennemie la plus proche, sinon sur le navire ennemi le plus proche. */
  private fire(ship: Warship, boats: readonly SeaUnit[], targeted: Targeted): void {
    if (ship.cooldown > 0) {
      ship.cooldown--;
      return;
    }
    const boat = this.closest(ship, boats, "boat", targeted);
    if (boat !== null) {
      this.shoot(ship, { kind: "boat", id: boat.id }, targeted);
      return; // pas de rechargement après un tir sur une barge
    }
    const target = this.closest(ship, this.ships, "warship", targeted);
    if (target !== null) {
      this.shoot(ship, { kind: "warship", id: target.id }, targeted);
      ship.cooldown = WARSHIP_FIRE_TICKS;
    }
  }

  private closest(
    ship: Warship,
    units: readonly SeaUnit[],
    kind: ShellTarget["kind"],
    targeted: Targeted,
  ): SeaUnit | null {
    const map = this.host.map;
    const r2 = WARSHIP_RANGE * WARSHIP_RANGE;
    let best: SeaUnit | null = null;
    let bestSq = r2 + 1;
    for (const u of units) {
      if (u.id === ship.id && kind === "warship") continue;
      if (!this.host.hostile(ship.owner, u.owner) || targeted[kind].has(u.id)) continue;
      const d = map.euclidSq(u.tile, ship.tile);
      if (d < bestSq || (d === bestSq && best !== null && u.id < best.id)) {
        bestSq = d;
        best = u;
      }
    }
    return best;
  }

  private shoot(ship: Warship, target: ShellTarget, targeted: Targeted): void {
    targeted[target.kind].add(target.id);
    this.shells.push({
      id: this.nextShellId++,
      owner: ship.owner,
      tile: ship.tile,
      target,
      damage: this.rng.nextInt(SHELL_DAMAGE_MIN, SHELL_DAMAGE_MAX + 1),
    });
  }

  /** Boulets à tête chercheuse : SHELL_TILES_PER_TICK tuiles par tick vers leur cible. */
  private moveShells(): void {
    const w = this.host.map.width;
    const boats = new Map(this.host.boats().map((b) => [b.id, b]));
    const kept: Shell[] = [];
    for (const shell of this.shells) {
      const target =
        shell.target.kind === "boat"
          ? boats.get(shell.target.id)
          : this.ships.find((s) => s.id === shell.target.id);
      if (!target) continue; // cible arrivée, coulée ou capturée : le boulet tombe à l'eau
      const x = shell.tile % w;
      const y = (shell.tile - x) / w;
      const tx = target.tile % w;
      const ty = (target.tile - tx) / w;
      const nx = x + clamp(tx - x, SHELL_TILES_PER_TICK);
      const ny = y + clamp(ty - y, SHELL_TILES_PER_TICK);
      shell.tile = ny * w + nx;
      if (nx !== tx || ny !== ty) {
        kept.push(shell);
        continue;
      }
      if (shell.target.kind === "boat") {
        this.host.sinkBoat(shell.target.id, shell.owner);
        continue;
      }
      const ship = target as Warship;
      ship.hp -= shell.damage;
      if (ship.hp <= 0) {
        this.ships = this.ships.filter((s) => s !== ship);
        this.host.warshipSunk(ship.owner, shell.owner);
      }
    }
    this.shells = kept;
  }

  // Trajets -------------------------------------------------------------------------------------

  /** Étape de patrouille : une tuile de sa mer tirée à ±rayon autour du point de patrouille. */
  private patrolStep(ship: Warship): number | null {
    const map = this.host.map;
    const cx = map.x(ship.patrol);
    const cy = map.y(ship.patrol);
    const r = WARSHIP_PATROL_RADIUS;
    for (let i = 0; i < PATROL_TRIES; i++) {
      const x = cx + this.rng.nextInt(-r, r + 1);
      const y = cy + this.rng.nextInt(-r, r + 1);
      if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
      const t = map.ref(x, y);
      if (t !== ship.tile && this.isSea(t, ship.sea)) return t;
    }
    return null;
  }

  private setPath(ship: Warship, goal: number): void {
    const scratch = (this.scratch ??= new PathScratch(this.host.map.size));
    ship.path = seaPath(this.host.map, ship.tile, goal, scratch);
    ship.step = 0;
  }

  /** Eau au pied du port le plus proche, sur la mer du navire. */
  private nearestDock(ship: Warship): number | null {
    const map = this.host.map;
    let best: number | null = null;
    let bestSq = Infinity;
    for (const port of this.host.portsOf(ship.owner)) {
      const water = this.waterBeside(port);
      if (water === null || this.host.seaAt(water) !== ship.sea) continue;
      const d = map.euclidSq(water, ship.tile);
      if (d < bestSq) {
        bestSq = d;
        best = water;
      }
    }
    return best;
  }

  /** Première tuile d'océan voisine d'une tuile côtière (haut, bas, gauche, droite). */
  private waterBeside(tile: number): number | null {
    for (const n of this.host.map.neighbors(tile)) if (this.host.map.isOcean(n)) return n;
    return null;
  }

  private isSea(tile: number, sea: number): boolean {
    return this.host.map.isOcean(tile) && this.host.seaAt(tile) === sea;
  }

  // Sorties -------------------------------------------------------------------------------------

  hash(h: number): number {
    for (const s of this.ships) {
      h = mixHash(h, s.id);
      h = mixHash(h, s.owner);
      h = mixHash(h, s.tile);
      h = mixHash(h, s.hp);
      h = mixHash(h, s.patrol);
      h = mixHash(h, s.cooldown);
      h = mixHash(h, s.mode === "patrol" ? 0 : 1);
      h = mixHash(h, s.path.length - s.step);
      h = mixHash(h, s.path[s.path.length - 1] ?? -1);
      h = mixHash(h, s.dock);
    }
    for (const b of this.shells) {
      h = mixHash(h, b.id);
      h = mixHash(h, b.owner);
      h = mixHash(h, b.tile);
      h = mixHash(h, b.target.kind === "boat" ? 0 : 1);
      h = mixHash(h, b.target.id);
      h = mixHash(h, b.damage);
    }
    return h;
  }

  views(): WarshipView[] {
    return this.ships.map((s) => ({
      id: s.id,
      owner: s.owner,
      tile: s.tile,
      hp: s.hp,
      maxHp: WARSHIP_HP,
      repairing: s.mode === "repair",
    }));
  }

  shellViews(): ShellView[] {
    return this.shells.map((s) => ({ id: s.id, owner: s.owner, tile: s.tile }));
  }
}

function clamp(v: number, max: number): number {
  return v > max ? max : v < -max ? -max : v;
}

class PathScratch {
  readonly prev: Int32Array;
  readonly stamp: Uint32Array;
  readonly queue: Int32Array;
  private mark = 0;
  constructor(size: number) {
    this.prev = new Int32Array(size);
    this.stamp = new Uint32Array(size);
    this.queue = new Int32Array(size);
  }

  /** Nouveau marqueur de recherche ; remise à zéro au rebouclage (comme SeaScratch). */
  next(): number {
    this.mark++;
    if (this.mark === 0xffffffff) {
      this.stamp.fill(0);
      this.mark = 1;
    }
    return this.mark;
  }
}

/**
 * Plus court trajet sur l'océan (4 voisins, ordre fixe), borné à PATH_SEARCH_LIMIT tuiles : la
 * liste des tuiles à parcourir, départ exclu. Si le but est trop loin ou hors d'atteinte, le
 * trajet mène à la tuile explorée la plus proche du but : le navire avance par étapes au lieu de
 * relancer la même recherche à chaque tick.
 */
function seaPath(map: GameMap, from: number, goal: number, s: PathScratch): number[] {
  if (from === goal) return [];
  const mark = s.next();
  const { prev, stamp, queue } = s;
  let closest = from;
  let closestSq = map.euclidSq(from, goal);
  const terrain = map.terrain;
  const w = map.width;
  const size = map.size;
  stamp[from] = mark;
  prev[from] = -1;
  queue[0] = from;
  let tail = 1;
  for (let head = 0; head < tail && tail < PATH_SEARCH_LIMIT; head++) {
    const t = queue[head] as number;
    const x = t % w;
    const around = [t - w, t + w, x > 0 ? t - 1 : -1, x < w - 1 ? t + 1 : -1];
    for (const n of around) {
      if (n < 0 || n >= size || stamp[n] === mark) continue;
      if (((terrain[n] as number) & OCEAN_BIT) === 0) continue;
      stamp[n] = mark;
      prev[n] = t;
      if (n === goal) return walkBack(prev, from, n);
      const d = map.euclidSq(n, goal);
      if (d < closestSq) {
        closestSq = d;
        closest = n;
      }
      queue[tail++] = n;
    }
  }
  return closest === from ? [] : walkBack(prev, from, closest);
}

function walkBack(prev: Int32Array, from: number, to: number): number[] {
  const path: number[] = [];
  for (let cur = to; cur !== from; cur = prev[cur] as number) path.push(cur);
  return path.reverse();
}
