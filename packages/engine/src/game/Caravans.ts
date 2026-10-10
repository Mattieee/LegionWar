import { CARAVAN_RULES, type CaravanRules } from "../config/Rules";
import { mixHash } from "../core/hash";
import { PseudoRandom } from "../core/PseudoRandom";
import type { GameMap } from "../map/GameMap";
import { TerrainKind } from "../map/Terrain";
import type { CaravanView, RouteView } from "./Types";

/**
 * Commerce terrestre (GDD §9) : Marchés, routes et caravanes.
 *
 * - Un Marché achevé devient une étape et y rattache les Bourgs, Ports et Marchés (de tout
 *   maître) à moins de `range` cases. Un Bourg ou un Port achevé plus tard devient une étape
 *   s'il y a un Marché à portée.
 * - Chaque nouvelle étape trace une route par la terre vers les étapes à portée, sauf celles
 *   déjà joignables en `maxHops` étapes ou moins (pas de route en double). Une route ne disparaît
 *   qu'avec l'une de ses étapes : elle survit aux captures et traverse les frontières.
 * - Chaque Marché d'un seigneur ou prétendant envoie une caravane toutes les `interval` ticks
 *   vers un Bourg ou un Port tiré au sort dans son réseau (les siens, ou ceux d'un royaume sans
 *   embargo). Elle paie à chaque Bourg ou Port traversé : `gold.self` chez soi ; `gold.other`
 *   (ou `gold.ally`) au maître de la caravane ET au maître de l'étape chez un autre.
 * - Les tribus ne commercent pas : leurs étapes se traversent sans rien payer. Une caravane qui
 *   arrive chez un royaume sous embargo, ou dont la route a disparu, est perdue.
 *
 * - Les routes d'une nouvelle étape sont tracées au plus tard quelques ticks après (file d'attente,
 *   LINKS_PER_TICK étapes par tick) : un Marché qui rattache dix étapes ne fige pas un tick.
 *
 * Déterminisme : tout est parcouru dans un ordre stable (étapes dans l'ordre d'arrivée, celles
 * promues par un Marché triées par distance puis identifiant ; Map, tableaux), le hasard passe par
 * un PseudoRandom dédié, les coûts de chemin sont entiers. Aucun flottant n'entre dans l'état.
 */

export type StopKind = "bourg" | "port" | "marche";

/** Bâtiment achevé pouvant servir d'étape (fourni à chaque tick, ordre de création). */
export interface StopInfo {
  id: number;
  kind: StopKind;
  owner: number;
  tile: number;
}

/** Ce dont le commerce terrestre a besoin du jeu. */
export interface CaravanHost {
  /** Tick courant. */
  now(): number;
  readonly map: GameMap;
  /** Seigneur ou prétendant vivant : seuls eux commercent (les tribus non). */
  trader(id: number): boolean;
  allied(a: number, b: number): boolean;
  /** Embargo dans un sens ou dans l'autre (même état que les nefs). */
  blocked(a: number, b: number): boolean;
  /** Verse l'or d'une étape (entier) ; `tile` sert au « +or » de l'interface. */
  pay(owner: number, gold: number, tile: number): void;
}

interface Station {
  id: number;
  kind: StopKind;
  owner: number;
  tile: number;
  /** Étape voisine → route (ordre de création des routes). */
  links: Map<number, number>;
}

interface Route {
  id: number;
  a: number;
  b: number;
  /** Cases de a vers b, extrémités comprises. */
  tiles: Int32Array;
}

interface Caravan {
  id: number;
  owner: number;
  /** Étapes du trajet, Marché de départ compris. */
  path: number[];
  leg: number;
  route: number;
  tiles: Int32Array;
  step: number;
  paid: number;
}

/** Statistiques (banc et interface), hors hash. */
export interface CaravanStats {
  trips: number;
  lost: number;
  stopsPaid: number[];
  goldSelf: number;
  goldOther: number;
  goldAlly: number;
}

/** Coûts entiers de la recherche de route (géométrie, pas de l'équilibrage). */
const ORTH = 2;
const DIAG = 3;
/** Surcoût d'un pas en montagne (les routes contournent les reliefs quand elles le peuvent). */
const MOUNTAIN_EXTRA = 2;
/** Étapes dont on trace les routes à chaque tick (le reste attend son tour, dans l'ordre). */
const LINKS_PER_TICK = 2;

export class Caravans {
  private readonly stops = new Map<number, StopInfo>();
  private readonly stations = new Map<number, Station>();
  private readonly routes = new Map<number, Route>();
  private caravans: Caravan[] = [];
  private readonly nextDeparture = new Map<number, number>();
  private component = new Map<number, number>();
  private componentsDirty = true;
  private nextRouteId = 1;
  private nextCaravanId = 1;
  private readonly rng: PseudoRandom;
  private scratch: PathScratch | null = null;
  /** Étapes dont les routes restent à tracer, dans l'ordre d'arrivée. */
  private pendingLinks: number[] = [];
  /** Vrai quand les routes ont changé depuis la dernière collecte (interface). */
  routesDirty = true;
  /** Mesures pour le banc et l'interface (hors état, jamais hachées). */
  readonly stats: CaravanStats = {
    trips: 0,
    lost: 0,
    stopsPaid: [0, 0, 0, 0, 0, 0, 0, 0],
    goldSelf: 0,
    goldOther: 0,
    goldAlly: 0,
  };

  constructor(
    private readonly host: CaravanHost,
    seed: number,
    private readonly rules: CaravanRules = CARAVAN_RULES,
  ) {
    this.rng = new PseudoRandom(seed ^ 0x2c1b3c6d);
  }

  // Boucle --------------------------------------------------------------------------------------

  /** Réseau, puis déplacements et arrivées, puis départs. `stops` : bâtiments achevés. */
  tick(stops: readonly StopInfo[]): void {
    this.syncNetwork(stops);
    this.linkPending();
    if (this.componentsDirty) this.computeComponents();
    this.moveCaravans();
    this.departures();
  }

  // Réseau --------------------------------------------------------------------------------------

  private syncNetwork(stops: readonly StopInfo[]): void {
    const seen = new Set<number>();
    for (const s of stops) seen.add(s.id);
    // Disparitions (bâtiment détruit) : l'étape et ses routes s'en vont.
    for (const id of [...this.stops.keys()]) {
      if (seen.has(id)) continue;
      this.stops.delete(id);
      if (this.stations.has(id)) this.removeStation(id);
      this.nextDeparture.delete(id);
    }
    // Captures : l'étape change de maître, les routes restent.
    for (const s of stops) {
      const known = this.stops.get(s.id);
      if (known) {
        known.owner = s.owner;
        const st = this.stations.get(s.id);
        if (st) st.owner = s.owner;
        continue;
      }
      const stop: StopInfo = { id: s.id, kind: s.kind, owner: s.owner, tile: s.tile };
      this.stops.set(s.id, stop);
      if (stop.kind === "marche") this.openMarket(stop);
      else if (this.marketInRange(stop.tile)) this.addStation(stop);
    }
  }

  private openMarket(market: StopInfo): void {
    this.addStation(market);
    const r2 = this.rules.range * this.rules.range;
    const map = this.host.map;
    const promoted = [...this.stops.values()]
      .filter((s) => !this.stations.has(s.id) && map.euclidSq(s.tile, market.tile) <= r2)
      .map((s) => ({ s, d: map.euclidSq(s.tile, market.tile) }))
      .sort((a, b) => a.d - b.d || a.s.id - b.s.id);
    for (const { s } of promoted) this.addStation(s);
  }

  private marketInRange(tile: number): boolean {
    const r2 = this.rules.range * this.rules.range;
    for (const st of this.stations.values()) {
      if (st.kind === "marche" && this.host.map.euclidSq(st.tile, tile) <= r2) return true;
    }
    return false;
  }

  /** Nouvelle étape : elle entre au réseau tout de suite, ses routes seront tracées dans l'ordre. */
  private addStation(stop: StopInfo): void {
    this.stations.set(stop.id, { ...stop, links: new Map() });
    this.pendingLinks.push(stop.id);
    this.componentsDirty = true;
  }

  private linkPending(): void {
    const batch = this.pendingLinks.splice(0, LINKS_PER_TICK);
    for (const id of batch) {
      const station = this.stations.get(id);
      if (station) this.link(station);
    }
  }

  /** Routes vers les étapes à portée, les plus proches d'abord ; une seule recherche, au besoin. */
  private link(station: Station): void {
    const map = this.host.map;
    const r2 = this.rules.range * this.rules.range;
    const targets = [...this.stations.values()]
      .filter((o) => o !== station && map.euclidSq(o.tile, station.tile) <= r2)
      .map((o) => ({ o, d: map.euclidSq(o.tile, station.tile) }))
      .sort((a, b) => a.d - b.d || a.o.id - b.o.id);
    let searched = false;
    for (const { o } of targets) {
      if (this.hopsWithin(station.id, o.id, this.rules.maxHops)) continue;
      const scratch = (this.scratch ??= new PathScratch(map.size));
      if (!searched) {
        searchLand(map, station.tile, this.rules.routeMaxSteps * ORTH, scratch);
        searched = true;
      }
      const tiles = scratch.pathTo(o.tile);
      if (!tiles || tiles.length - 1 > this.rules.routeMaxSteps) continue;
      const route: Route = { id: this.nextRouteId++, a: station.id, b: o.id, tiles };
      this.routes.set(route.id, route);
      station.links.set(o.id, route.id);
      o.links.set(station.id, route.id);
      this.routesDirty = true;
      this.componentsDirty = true;
    }
  }

  private removeStation(id: number): void {
    const st = this.stations.get(id) as Station;
    for (const [other, routeId] of st.links) {
      this.stations.get(other)?.links.delete(id);
      this.routes.delete(routeId);
    }
    this.stations.delete(id);
    this.componentsDirty = true;
    this.routesDirty = true;
  }

  /** Vrai si `to` est joignable depuis `from` en `max` étapes ou moins. */
  private hopsWithin(from: number, to: number, max: number): boolean {
    let frontier = [from];
    const seen = new Set<number>(frontier);
    for (let hop = 1; hop <= max && frontier.length > 0; hop++) {
      const next: number[] = [];
      for (const id of frontier) {
        for (const n of (this.stations.get(id) as Station).links.keys()) {
          if (n === to) return true;
          if (!seen.has(n)) {
            seen.add(n);
            next.push(n);
          }
        }
      }
      frontier = next;
    }
    return false;
  }

  private computeComponents(): void {
    this.component = new Map();
    let label = 0;
    for (const start of this.stations.keys()) {
      if (this.component.has(start)) continue;
      const queue = [start];
      this.component.set(start, label);
      for (let h = 0; h < queue.length; h++) {
        for (const n of (this.stations.get(queue[h] as number) as Station).links.keys()) {
          if (!this.component.has(n)) {
            this.component.set(n, label);
            queue.push(n);
          }
        }
      }
      label++;
    }
    this.componentsDirty = false;
  }

  // Caravanes -----------------------------------------------------------------------------------

  private departures(): void {
    const now = this.host.now();
    const { interval } = this.rules;
    for (const st of this.stations.values()) {
      if (st.kind !== "marche") continue;
      const next = this.nextDeparture.get(st.id);
      if (next === undefined) {
        this.nextDeparture.set(st.id, now + ((st.id * 37) % interval));
        continue;
      }
      if (now < next) continue;
      this.nextDeparture.set(st.id, now + interval);
      if (this.caravans.length >= this.rules.maxCaravans || !this.host.trader(st.owner)) continue;
      const dst = this.pickDestination(st);
      if (dst === null) continue;
      const path = this.stationPath(st, dst);
      if (path === null) continue;
      const first = this.legTiles(path[0] as number, path[1] as number);
      if (first === null) continue;
      this.caravans.push({
        id: this.nextCaravanId++,
        owner: st.owner,
        path,
        leg: 0,
        route: first.route,
        tiles: first.tiles,
        step: 0,
        paid: 0,
      });
      this.stats.trips++;
    }
  }

  /** Étape commerciale (Bourg ou Port) ouverte au maître du Marché. */
  private open(owner: number, st: Station): boolean {
    return (
      st.owner === owner || (this.host.trader(st.owner) && !this.host.blocked(owner, st.owner))
    );
  }

  /** Tirage uniforme parmi les Bourgs et Ports du réseau ouverts au maître du Marché. */
  private pickDestination(src: Station): Station | null {
    const comp = this.component.get(src.id);
    const candidates: Station[] = [];
    for (const st of this.stations.values()) {
      if (st === src || st.kind === "marche" || this.component.get(st.id) !== comp) continue;
      if (this.open(src.owner, st)) candidates.push(st);
    }
    if (candidates.length === 0) return null;
    return candidates[this.rng.nextInt(0, candidates.length)] as Station;
  }

  /** Plus court trajet en étapes, sans traverser un royaume sous embargo. */
  private stationPath(src: Station, dst: Station): number[] | null {
    const prev = new Map<number, number>([[src.id, -1]]);
    const queue = [src.id];
    for (let h = 0; h < queue.length; h++) {
      const id = queue[h] as number;
      if (id === dst.id) break;
      for (const n of (this.stations.get(id) as Station).links.keys()) {
        if (prev.has(n)) continue;
        const st = this.stations.get(n) as Station;
        if (
          st.owner !== src.owner &&
          this.host.trader(st.owner) &&
          this.host.blocked(src.owner, st.owner)
        )
          continue;
        prev.set(n, id);
        queue.push(n);
      }
    }
    if (!prev.has(dst.id)) return null;
    const path: number[] = [];
    for (let cur = dst.id; cur !== -1; cur = prev.get(cur) as number) path.push(cur);
    return path.reverse();
  }

  private legTiles(from: number, to: number): { route: number; tiles: Int32Array } | null {
    const routeId = this.stations.get(from)?.links.get(to);
    if (routeId === undefined) return null;
    const route = this.routes.get(routeId) as Route;
    return {
      route: routeId,
      tiles: route.a === from ? route.tiles : route.tiles.slice().reverse(),
    };
  }

  private moveCaravans(): void {
    const kept: Caravan[] = [];
    for (const c of this.caravans) {
      if (this.advance(c)) kept.push(c);
    }
    this.caravans = kept;
  }

  /** Avance d'un tick ; faux si la caravane est arrivée ou perdue. */
  private advance(c: Caravan): boolean {
    if (!this.host.trader(c.owner) || !this.routes.has(c.route)) {
      this.stats.lost++;
      return false;
    }
    c.step += this.rules.stepsPerTick;
    if (c.step < c.tiles.length - 1) return true;
    const st = this.stations.get(c.path[c.leg + 1] as number) as Station;
    if (!this.arrive(c, st)) {
      this.stats.lost++;
      return false;
    }
    c.leg++;
    if (c.leg >= c.path.length - 1) {
      const bin = Math.min(c.paid, 7);
      this.stats.stopsPaid[bin] = (this.stats.stopsPaid[bin] ?? 0) + 1;
      return false;
    }
    const next = this.legTiles(c.path[c.leg] as number, c.path[c.leg + 1] as number);
    if (next === null) {
      this.stats.lost++;
      return false;
    }
    c.route = next.route;
    c.tiles = next.tiles;
    c.step = 0;
    return true;
  }

  /** Paie l'étape ; faux si elle ferme la route (embargo). */
  private arrive(c: Caravan, st: Station): boolean {
    const host = this.host;
    const trade = st.kind !== "marche";
    if (st.owner === c.owner) {
      if (trade && c.paid < this.rules.maxPaidStops) {
        c.paid++;
        host.pay(c.owner, this.rules.gold.self, st.tile);
        this.stats.goldSelf += this.rules.gold.self;
      }
      return true;
    }
    if (!host.trader(st.owner)) return true; // tribu ou royaume éteint : on traverse
    if (host.blocked(c.owner, st.owner)) return false;
    if (trade && c.paid < this.rules.maxPaidStops) {
      c.paid++;
      const ally = host.allied(c.owner, st.owner);
      const gold = ally ? this.rules.gold.ally : this.rules.gold.other;
      host.pay(c.owner, gold, st.tile);
      host.pay(st.owner, gold, st.tile);
      if (ally) this.stats.goldAlly += 2 * gold;
      else this.stats.goldOther += 2 * gold;
    }
    return true;
  }

  // Sorties -------------------------------------------------------------------------------------

  /** Étapes possibles à portée d'une case (aperçu de pose, IA). */
  stopsInRange(tile: number): StopInfo[] {
    const r2 = this.rules.range * this.rules.range;
    return [...this.stops.values()].filter((s) => this.host.map.euclidSq(s.tile, tile) <= r2);
  }

  hash(h: number): number {
    h = mixHash(mixHash(h, this.stations.size), this.pendingLinks.length);
    for (const c of this.caravans) {
      h = mixHash(h, c.id);
      h = mixHash(h, c.owner);
      h = mixHash(h, c.route);
      h = mixHash(h, c.path[c.path.length - 1] as number);
      h = mixHash(h, c.leg);
      h = mixHash(h, c.step);
      h = mixHash(h, c.paid);
    }
    for (const r of this.routes.values()) h = mixHash(mixHash(mixHash(h, r.id), r.a), r.b);
    for (const [id, next] of this.nextDeparture) h = mixHash(mixHash(h, id), next);
    return h;
  }

  routeViews(): RouteView[] {
    // Copies : les tracés internes sont partagés avec les caravanes ; transférés au fil principal,
    // ils seraient détachés et ce client divergerait.
    return [...this.routes.values()].map((r) => ({ id: r.id, tiles: r.tiles.slice() }));
  }

  caravanViews(): CaravanView[] {
    return this.caravans.map((c) => ({
      id: c.id,
      owner: c.owner,
      tile: c.tiles[c.step] as number,
    }));
  }

  counts(): { stations: number; routes: number; caravans: number; routeTiles: number } {
    let routeTiles = 0;
    for (const r of this.routes.values()) routeTiles += r.tiles.length;
    return {
      stations: this.stations.size,
      routes: this.routes.size,
      caravans: this.caravans.length,
      routeTiles,
    };
  }
}

// Recherche de route ----------------------------------------------------------------------------

/** Tableaux réutilisés d'une recherche à l'autre (marque de génération : pas de remise à zéro). */
class PathScratch {
  readonly cost: Int32Array;
  readonly prev: Int32Array;
  readonly stamp: Int32Array;
  /** Files par coût, réutilisées (vidées au début de chaque recherche). */
  readonly buckets: number[][] = [];
  mark = 0;
  constructor(size: number) {
    this.cost = new Int32Array(size);
    this.prev = new Int32Array(size);
    this.stamp = new Int32Array(size);
  }

  pathTo(goal: number): Int32Array | null {
    if (this.stamp[goal] !== this.mark) return null;
    const out: number[] = [];
    for (let cur = goal; cur !== -1; cur = this.prev[cur] as number) out.push(cur);
    return Int32Array.from(out.reverse());
  }
}

/**
 * Dijkstra à coûts entiers (pas droit 2, diagonale 3, montagne +2) sur la terre praticable,
 * borné à `maxCost`, files par seau : ordre d'exploration fixe, donc chemins identiques partout.
 * Une diagonale exige ses deux cases orthogonales praticables (pas de coin coupé).
 */
function searchLand(map: GameMap, from: number, maxCost: number, s: PathScratch): void {
  s.mark++;
  const mark = s.mark;
  const { cost, prev, stamp } = s;
  const w = map.width;
  const buckets = s.buckets;
  while (buckets.length <= maxCost) buckets.push([]);
  for (let i = 0; i <= maxCost; i++) (buckets[i] as number[]).length = 0;
  stamp[from] = mark;
  cost[from] = 0;
  prev[from] = -1;
  (buckets[0] as number[]).push(from);
  const relax = (t: number, n: number, nc: number): void => {
    if (map.kind(n) === TerrainKind.Mountain) nc += MOUNTAIN_EXTRA;
    if (nc > maxCost || (stamp[n] === mark && (cost[n] as number) <= nc)) return;
    stamp[n] = mark;
    cost[n] = nc;
    prev[n] = t;
    (buckets[nc] as number[]).push(n);
  };
  for (let c = 0; c <= maxCost; c++) {
    const bucket = buckets[c] as number[];
    for (let i = 0; i < bucket.length; i++) {
      const t = bucket[i] as number;
      if (cost[t] !== c) continue;
      const x = t % w;
      const up = t >= w ? t - w : -1;
      const down = t + w < map.size ? t + w : -1;
      const u = up >= 0 && map.isPassableLand(up);
      const d = down >= 0 && map.isPassableLand(down);
      const l = x > 0 && map.isPassableLand(t - 1);
      const r = x < w - 1 && map.isPassableLand(t + 1);
      if (u) relax(t, up, c + ORTH);
      if (d) relax(t, down, c + ORTH);
      if (l) relax(t, t - 1, c + ORTH);
      if (r) relax(t, t + 1, c + ORTH);
      if (u && l && map.isPassableLand(up - 1)) relax(t, up - 1, c + DIAG);
      if (u && r && map.isPassableLand(up + 1)) relax(t, up + 1, c + DIAG);
      if (d && l && map.isPassableLand(down - 1)) relax(t, down - 1, c + DIAG);
      if (d && r && map.isPassableLand(down + 1)) relax(t, down + 1, c + DIAG);
    }
  }
}
