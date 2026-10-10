import {
  EMBARGO_TICKS,
  MAX_NEFS,
  NEF_TILES_PER_TICK,
  TRADE_GOLD_MAX,
  TRADE_GOLD_MIN,
  TRADE_GOLD_PER_TILE,
  TRADE_INTERVAL,
} from "../config/Rules";
import { mixHash } from "../core/hash";
import { PseudoRandom } from "../core/PseudoRandom";
import type { GameMap } from "../map/GameMap";
import type { Game } from "./Game";
import { SeaScratch } from "./Naval";
import type { EmbargoView, NefView } from "./Types";

/** Port achevé, tel que le commerce le voit. */
export interface PortInfo {
  id: number;
  owner: number;
  tile: number;
}

/** Nef marchande en mer, d'un port à un autre. */
interface Nef {
  id: number;
  src: number;
  dst: number;
  /** Maître du port de départ au moment du départ. */
  owner: number;
  path: Int32Array;
  step: number;
}

/** Embargo permanent : échéance « jamais » (entier sûr, pour rester dans le hash). */
const PERMANENT = Number.MAX_SAFE_INTEGER;
/** Pas de label d'océan (terre ou lac). */
const NO_SEA = -1;

/**
 * Commerce maritime (GDD §9) : chaque port achevé arme une nef toutes les 15 s vers le port
 * d'un autre seigneur ou prétendant de la même mer, sans embargo entre eux. À l'arrivée, les
 * maîtres actuels des deux ports touchent chacun 40 or par case de mer (4 000 à 20 000).
 * Les routes sont calculées à la première traversée de chaque paire de ports, puis gardées :
 * l'eau ne change jamais. Tout est stocké dans l'ordre de création (tableaux, Map) et le hasard
 * passe par un PseudoRandom dédié : l'état est identique sur tous les clients.
 */
export class Trade {
  private nefs: Nef[] = [];
  private nextNefId = 1;
  /** Chemin d'eau d'un port à un autre (clé : paire orientée). */
  private readonly routes = new Map<number, Int32Array>();
  /** Prochain départ de chaque port (identifiant de bâtiment → tick). */
  private readonly nextDeparture = new Map<number, number>();
  /** `from` ferme ses ports à `to` jusqu'à ce tick (clé : paire orientée). */
  private readonly embargoes = new Map<number, number>();
  /** Mer de chaque tuile d'océan (composante connexe), calculée au chargement de la partie. */
  private readonly seas: Int32Array;
  private scratch: SeaScratch | null = null;
  private readonly rng: PseudoRandom;
  /** Vrai quand la liste des embargos a changé depuis la dernière collecte. */
  dirty = true;

  constructor(
    private readonly game: Game,
    seed: number,
  ) {
    this.rng = new PseudoRandom(seed ^ 0x7f4a7c15);
    this.seas = labelSeas(game.map);
  }

  // Embargos ------------------------------------------------------------------------------------

  /** Vrai si l'un des deux a fermé ses ports à l'autre. */
  blocked(a: number, b: number): boolean {
    const now = this.game.ticks;
    return (
      (this.embargoes.get(pairKey(a, b)) ?? -1) > now ||
      (this.embargoes.get(pairKey(b, a)) ?? -1) > now
    );
  }

  /** Échéance de l'embargo de `from` envers `to` : null s'il n'y en a pas, -1 s'il est permanent. */
  embargo(from: number, to: number): number | null {
    const until = this.embargoes.get(pairKey(from, to));
    if (until === undefined || until <= this.game.ticks) return null;
    return until === PERMANENT ? -1 : until;
  }

  /** Ferme (ou rouvre) durablement ses ports à un royaume. Renvoie vrai si l'état a changé. */
  setPermanent(from: number, to: number, on: boolean): boolean {
    const key = pairKey(from, to);
    const current = this.embargoes.get(key);
    if (on) {
      if (current === PERMANENT) return false;
      this.embargoes.set(key, PERMANENT);
    } else {
      if (current === undefined) return false;
      this.embargoes.delete(key);
    }
    this.dirty = true;
    return true;
  }

  /** La victime d'une attaque ferme ses ports à l'agresseur pour 3 min (sauf embargo durable). */
  /** Renvoie vrai si les ports viennent d'être fermés (pas s'ils l'étaient déjà : délai relancé). */
  closeAfterAttack(victim: number, attacker: number): boolean {
    const key = pairKey(victim, attacker);
    const current = this.embargoes.get(key);
    if (current === PERMANENT) return false;
    this.embargoes.set(key, this.game.ticks + EMBARGO_TICKS);
    this.dirty = true;
    return current === undefined || current <= this.game.ticks;
  }

  /** Une alliance lève les embargos temporaires entre les deux royaumes. */
  liftTemporary(a: number, b: number): void {
    for (const key of [pairKey(a, b), pairKey(b, a)]) {
      const until = this.embargoes.get(key);
      if (until !== undefined && until !== PERMANENT) {
        this.embargoes.delete(key);
        this.dirty = true;
      }
    }
  }

  // Boucle --------------------------------------------------------------------------------------

  /** Pertes, déplacements, arrivées, puis départs. `ports` : ports achevés, ordre de création. */
  tick(ports: readonly PortInfo[]): void {
    const now = this.game.ticks;
    // Les embargos échus sont oubliés (ordre d'insertion conservé).
    for (const [key, until] of this.embargoes) {
      if (until <= now) {
        this.embargoes.delete(key);
        this.dirty = true;
      }
    }
    const byId = new Map(ports.map((p) => [p.id, p]));

    // Nefs : perdues (port détruit ou passé au même maître, maître éliminé, embargo), arrivées.
    const gains = new Map<number, number>();
    const kept: Nef[] = [];
    for (const nef of this.nefs) {
      const src = byId.get(nef.src);
      const dst = byId.get(nef.dst);
      if (!src || !dst || !this.canTrade(src.owner, dst.owner)) continue;
      nef.step = Math.min(nef.path.length - 1, nef.step + NEF_TILES_PER_TICK);
      if (nef.step < nef.path.length - 1) {
        kept.push(nef);
        continue;
      }
      const gold = tradeGold(nef.path.length);
      for (const port of [src, dst]) {
        this.game.payTrade(port.owner, gold);
        gains.set(port.id, (gains.get(port.id) ?? 0) + gold);
      }
    }
    this.nefs = kept;
    for (const [portId, amount] of gains) {
      const port = byId.get(portId) as PortInfo;
      this.game.emit({
        type: "tradeGold",
        player: port.owner,
        tile: port.tile,
        amount,
        source: "nef",
      });
    }

    // Départs : chaque port arme une nef toutes les 15 s, décalée selon son identifiant.
    for (const port of ports) {
      const next = this.nextDeparture.get(port.id);
      if (next === undefined) {
        this.nextDeparture.set(port.id, now + ((port.id * 37) % TRADE_INTERVAL));
        continue;
      }
      if (now < next) continue;
      this.nextDeparture.set(port.id, now + TRADE_INTERVAL);
      if (this.nefs.length >= MAX_NEFS) continue;
      const dst = this.pickDestination(port, ports);
      if (!dst) continue;
      const path = this.route(port, dst, ports);
      if (!path) continue;
      this.nefs.push({
        id: this.nextNefId++,
        src: port.id,
        dst: dst.id,
        owner: port.owner,
        path,
        step: 0,
      });
    }
  }

  /** Port détruit : on oublie sa cadence (les nefs liées sont perdues au tick suivant). */
  forgetPort(id: number): void {
    this.nextDeparture.delete(id);
    for (const key of this.routes.keys()) {
      if (Math.floor(key / PORT_PAIR) === id || key % PORT_PAIR === id) this.routes.delete(key);
    }
  }

  /** Nefs en mer d'un royaume (pour l'interface). */
  nefsOf(owner: number): number {
    let n = 0;
    for (const nef of this.nefs) if (nef.owner === owner) n++;
    return n;
  }

  // Sorties -------------------------------------------------------------------------------------

  hash(h: number): number {
    for (const nef of this.nefs) {
      h = mixHash(h, nef.id);
      h = mixHash(h, nef.src);
      h = mixHash(h, nef.dst);
      h = mixHash(h, nef.step);
    }
    for (const [key, until] of this.embargoes) h = mixHash(mixHash(h, key), until);
    for (const [id, next] of this.nextDeparture) h = mixHash(mixHash(h, id), next);
    return h;
  }

  nefViews(): NefView[] {
    return this.nefs.map((n) => ({ id: n.id, owner: n.owner, tile: n.path[n.step] as number }));
  }

  embargoViews(): EmbargoView[] {
    const now = this.game.ticks;
    const out: EmbargoView[] = [];
    for (const [key, until] of this.embargoes) {
      if (until <= now) continue;
      out.push({
        from: Math.floor(key / 4096),
        to: key % 4096,
        until: until === PERMANENT ? -1 : until,
      });
    }
    return out;
  }

  // Interne -------------------------------------------------------------------------------------

  /** Commerce possible entre deux maîtres : deux seigneurs ou prétendants vivants, sans embargo. */
  private canTrade(a: number, b: number): boolean {
    if (a === b) return false;
    const pa = this.game.player(a);
    const pb = this.game.player(b);
    if (!pa || !pb || !pa.alive || !pb.alive || pa.kind === "bot" || pb.kind === "bot")
      return false;
    return !this.blocked(a, b);
  }

  /**
   * Destination d'une nef, tirée au sort : poids 1, +1 pour le tiers le plus proche, +1 si son
   * maître est allié. Seulement les ports d'une même mer, d'un autre maître, sans embargo.
   */
  private pickDestination(src: PortInfo, ports: readonly PortInfo[]): PortInfo | null {
    const sea = this.seaOf(src.tile);
    if (sea === NO_SEA || !this.canTradeFrom(src.owner)) return null;
    const map = this.game.map;
    const candidates = ports
      .filter((p) => this.canTrade(src.owner, p.owner) && this.seaOf(p.tile) === sea)
      .map((p) => ({ port: p, distance: map.manhattan(src.tile, p.tile) }))
      .sort((a, b) => a.distance - b.distance || a.port.id - b.port.id);
    if (candidates.length === 0) return null;
    const close = Math.max(1, Math.ceil(candidates.length / 3));
    let total = 0;
    const weights = candidates.map((c, i) => {
      const w =
        1 + (i < close ? 1 : 0) + (this.game.diplomacy.allied(src.owner, c.port.owner) ? 1 : 0);
      total += w;
      return w;
    });
    let pick = this.rng.nextInt(0, total);
    for (let i = 0; i < candidates.length; i++) {
      const w = weights[i] as number;
      if (pick < w) return (candidates[i] as { port: PortInfo }).port;
      pick -= w;
    }
    return null;
  }

  private canTradeFrom(owner: number): boolean {
    const p = this.game.player(owner);
    return p !== null && p.alive && p.kind !== "bot";
  }

  /** Mer (composante connexe d'océan) bordant une tuile côtière ; NO_SEA s'il n'y en a pas. */
  private seaOf(tile: number): number {
    let found = NO_SEA;
    forEachNeighbor(this.game.map, tile, (n) => {
      const label = this.seas[n] as number;
      if (found === NO_SEA && label !== NO_SEA) found = label;
    });
    return found;
  }

  /** Chemin d'eau entre deux ports, calculé une fois par paire (et gardé pour le retour). */
  private route(src: PortInfo, dst: PortInfo, ports: readonly PortInfo[]): Int32Array | null {
    const cached = this.routes.get(portPairKey(src.id, dst.id));
    if (cached) return cached;
    // Un seul parcours depuis ce port donne d'un coup les routes vers tous les ports de sa mer.
    const sea = this.seaOf(src.tile);
    const targets = ports.filter((p) => p.id !== src.id && this.seaOf(p.tile) === sea);
    const scratch = (this.scratch ??= new SeaScratch(this.game.map.size));
    for (const [id, path] of searchSea(this.game.map, src.tile, targets, scratch)) {
      if (!this.routes.has(portPairKey(src.id, id))) {
        this.routes.set(portPairKey(src.id, id), path);
        this.routes.set(portPairKey(id, src.id), path.slice().reverse());
      }
    }
    return this.routes.get(portPairKey(src.id, dst.id)) ?? null;
  }
}

/** Or d'une traversée, touché par chacun des deux ports : 40 par case, borné à 4 000–20 000. */
export function tradeGold(tiles: number): number {
  return Math.floor(
    Math.min(TRADE_GOLD_MAX, Math.max(TRADE_GOLD_MIN, TRADE_GOLD_PER_TILE * tiles)),
  );
}

/** Composantes connexes de l'océan (4 voisins) ; NO_SEA pour la terre et les lacs. */
function labelSeas(map: GameMap): Int32Array {
  const seas = new Int32Array(map.size).fill(NO_SEA);
  const queue = new Int32Array(map.size);
  let label = 0;
  for (let start = 0; start < map.size; start++) {
    if (seas[start] !== NO_SEA || !map.isOcean(start)) continue;
    let tail = 0;
    queue[tail++] = start;
    seas[start] = label;
    for (let head = 0; head < tail; head++) {
      forEachNeighbor(map, queue[head] as number, (n) => {
        if (seas[n] === NO_SEA && map.isOcean(n)) {
          seas[n] = label;
          queue[tail++] = n;
        }
      });
    }
    label++;
  }
  return seas;
}

/**
 * Parcours en largeur sur l'océan depuis les eaux d'un port : le chemin le plus court vers les
 * eaux de chacun des ports visés (ordre des cibles, puis ordre du parcours : déterministe).
 */
function searchSea(
  map: GameMap,
  from: number,
  targets: readonly PortInfo[],
  scratch: SeaScratch,
): Map<number, Int32Array> {
  const found = new Map<number, Int32Array>();
  if (targets.length === 0) return found;
  // Eaux de chaque cible : la première atteinte donne sa route.
  const goalOf = new Map<number, number[]>();
  for (const target of targets) {
    forEachNeighbor(map, target.tile, (n) => {
      if (!map.isOcean(n)) return;
      const list = goalOf.get(n);
      if (list) list.push(target.id);
      else goalOf.set(n, [target.id]);
    });
  }
  const mark = scratch.next();
  const { prev, stamp, queue } = scratch;
  let tail = 0;
  forEachNeighbor(map, from, (n) => {
    if (map.isOcean(n) && stamp[n] !== mark) {
      stamp[n] = mark;
      prev[n] = -1;
      queue[tail++] = n;
    }
  });
  for (let head = 0; head < tail && found.size < targets.length; head++) {
    const t = queue[head] as number;
    const reached = goalOf.get(t);
    if (reached) {
      for (const id of reached) {
        if (found.has(id)) continue;
        const path: number[] = [];
        for (let cur = t; cur >= 0; cur = prev[cur] as number) path.push(cur);
        found.set(id, Int32Array.from(path.reverse()));
      }
    }
    forEachNeighbor(map, t, (n) => {
      if (stamp[n] !== mark && map.isOcean(n)) {
        stamp[n] = mark;
        prev[n] = t;
        queue[tail++] = n;
      }
    });
  }
  return found;
}

/** Voisins orthogonaux sans allouer de tableau (parcours chauds). */
function forEachNeighbor(map: GameMap, t: number, visit: (n: number) => void): void {
  const w = map.width;
  const x = t % w;
  if (t >= w) visit(t - w);
  if (t + w < map.size) visit(t + w);
  if (x > 0) visit(t - 1);
  if (x < w - 1) visit(t + 1);
}

function pairKey(from: number, to: number): number {
  return from * 4096 + to;
}

/** Clé d'une paire orientée de ports (identifiants de bâtiment). */
const PORT_PAIR = 1_000_000;

function portPairKey(a: number, b: number): number {
  return a * PORT_PAIR + b;
}
