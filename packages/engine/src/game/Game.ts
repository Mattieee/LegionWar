import {
  BUILDINGS,
  GOLD_PER_MINE_PER_TICK,
  HASH_INTERVAL,
  MIN_SPAWN_DISTANCE,
  MULTIPLAYER_SPAWN_PHASE_TICKS,
  SPAWN_ATTEMPTS,
  SPAWN_ATTEMPTS_STRICT,
  SPAWN_RADIUS,
  START_TROOPS,
  STRUCTURE_MIN_DIST,
  TOWER_RANGE,
  WIN_CHECK_INTERVAL,
  WIN_PERCENT,
  buildingCost,
  goldPerTick,
  maxTroops,
  troopIncrease,
} from "../config/Rules";
import { mixHash } from "../core/hash";
import { PseudoRandom } from "../core/PseudoRandom";
import type { GameMap } from "../map/GameMap";
import { generateMap } from "../map/MapGenerator";
import { MAX_PLAYER_ID } from "../map/Terrain";
import { Attack } from "./Attack";
import { BotBrain } from "./BotAI";
import { tribeName } from "./Names";
import { Player } from "./Player";
import {
  BuildingKind,
  type AttackView,
  type BuildRejection,
  type BuildingView,
  type GameConfig,
  type GameEvent,
  type Intent,
  type PlayerView,
  type TickResult,
  type Turn,
} from "./Types";

interface Building {
  id: number;
  kind: BuildingKind;
  owner: number;
  tile: number;
  /** Ticks de construction restants (0 = terminé). */
  remaining: number;
}

const BUILDING_KINDS = new Set<string>(Object.values(BuildingKind));

/**
 * État complet d'une partie et boucle de simulation.
 * Déterministe : mêmes config + même suite de tours ⇒ même état, au bit près, sur tout client.
 */
export class Game {
  readonly map: GameMap;
  readonly mines: readonly number[];
  readonly rng: PseudoRandom;
  ticks = 0;
  inSpawnPhase = true;
  winner: number | null = null;

  private readonly players: (Player | null)[] = [null];
  private readonly byClient = new Map<string, Player>();
  private readonly brains: BotBrain[] = [];
  private attacks: Attack[] = [];
  private readonly buildings = new Map<number, Building>();
  private readonly buildingAt = new Map<number, number>();
  private readonly spawnCenters: number[] = [];
  private nextBuildingId = 1;
  private nextAttackId = 1;
  private buildingsDirty = true;
  private changed: number[] = [];
  private events: GameEvent[] = [];

  constructor(readonly config: GameConfig) {
    const seed = config.seed >>> 0;
    if (config.humans.length + config.bots > MAX_PLAYER_ID) {
      throw new Error(`Trop de joueurs (maximum ${MAX_PLAYER_ID})`);
    }
    const generated = generateMap(seed, config.mapSize);
    this.map = generated.map;
    this.mines = generated.mines;
    this.rng = new PseudoRandom(seed ^ 0x5bd1e995);

    for (const slot of config.humans) {
      const p = new Player(
        this.players.length,
        slot.name,
        "human",
        slot.race,
        slot.clientId,
        START_TROOPS.human,
      );
      this.players.push(p);
      this.byClient.set(slot.clientId, p);
    }

    const usedNames = new Set(config.humans.map((h) => h.name));
    const nameRng = new PseudoRandom(seed ^ 0x2545f491);
    for (let i = 0; i < config.bots; i++) {
      const id = this.players.length;
      const bot = new Player(
        id,
        tribeName(nameRng, usedNames),
        "bot",
        null,
        null,
        START_TROOPS.bot,
      );
      this.players.push(bot);
      if (this.spawnRandom(bot)) {
        this.brains.push(new BotBrain(this, bot, (seed + id * 7919) | 0));
      } else {
        bot.alive = false;
      }
    }
  }

  // Accès ---------------------------------------------------------------------------------------

  player(id: number): Player | null {
    return this.players[id] ?? null;
  }

  playerByClient(clientId: string): Player | null {
    return this.byClient.get(clientId) ?? null;
  }

  // Boucle --------------------------------------------------------------------------------------

  /** Applique les intents d'un tour, avance d'un tick et renvoie les changements. */
  executeTurn(turn: Turn): TickResult {
    for (const stamped of turn.intents) {
      const p = this.byClient.get(stamped.clientId);
      if (p) this.handleIntent(p, stamped.intent);
    }
    this.tick();
    return this.collect();
  }

  private handleIntent(p: Player, intent: Intent): void {
    switch (intent.type) {
      case "spawn":
        if (this.inSpawnPhase && this.map.isValidRef(intent.tile)) this.spawnAt(p, intent.tile);
        break;
      case "attack":
        if (
          !this.inSpawnPhase &&
          p.alive &&
          Number.isInteger(intent.target) &&
          Number.isFinite(intent.troops)
        ) {
          this.launchAttack(p, intent.target, intent.troops);
        }
        break;
      case "build":
        if (BUILDING_KINDS.has(intent.building) && this.map.isValidRef(intent.tile)) {
          this.build(p, intent.building, intent.tile);
        }
        break;
    }
  }

  private tick(): void {
    if (this.inSpawnPhase) {
      if (!this.config.singleplayer && this.ticks >= MULTIPLAYER_SPAWN_PHASE_TICKS) {
        this.endSpawnPhase();
      }
    } else {
      this.updateEconomy();
      this.updateConstructions();
      for (const brain of this.brains) brain.tick(this.ticks);
      for (const attack of this.attacks) attack.tick();
      this.attacks = this.attacks.filter((a) => a.active);
      if (this.winner === null && this.ticks % WIN_CHECK_INTERVAL === 0) this.checkWin();
    }
    this.ticks++;
  }

  // Déploiement ---------------------------------------------------------------------------------

  private spawnAt(p: Player, center: number): void {
    if (p.kind !== "human" || (this.config.singleplayer && p.spawned)) return;
    const owner = this.map.owner(center);
    if (!this.map.isPassableLand(center) || (owner !== 0 && owner !== p.id)) {
      this.events.push({ type: "spawnRejected", player: p.id });
      return;
    }
    if (p.spawned) {
      for (let t = 0; t < this.map.size; t++) if (this.map.owner(t) === p.id) this.conquer(t, 0);
    }
    this.claimSpawn(p, center);
    if (this.config.singleplayer) this.endSpawnPhase();
  }

  private claimSpawn(p: Player, center: number): void {
    const cx = this.map.x(center);
    const cy = this.map.y(center);
    const r2 = SPAWN_RADIUS * SPAWN_RADIUS + SPAWN_RADIUS;
    for (let dy = -SPAWN_RADIUS; dy <= SPAWN_RADIUS; dy++) {
      for (let dx = -SPAWN_RADIUS; dx <= SPAWN_RADIUS; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (
          dx * dx + dy * dy > r2 ||
          x < 0 ||
          y < 0 ||
          x >= this.map.width ||
          y >= this.map.height
        ) {
          continue;
        }
        const t = this.map.ref(x, y);
        if (this.map.isPassableLand(t) && this.map.owner(t) === 0) this.conquer(t, p.id);
      }
    }
    p.spawned = true;
    this.spawnCenters.push(center);
  }

  private spawnRandom(p: Player): boolean {
    for (let attempt = 0; attempt < SPAWN_ATTEMPTS; attempt++) {
      const t = this.rng.nextInt(0, this.map.size);
      if (!this.map.isPassableLand(t) || this.map.owner(t) !== 0) continue;
      if (
        attempt < SPAWN_ATTEMPTS_STRICT &&
        this.spawnCenters.some((c) => this.map.manhattan(c, t) < MIN_SPAWN_DISTANCE)
      ) {
        continue;
      }
      this.claimSpawn(p, t);
      return true;
    }
    return false;
  }

  private endSpawnPhase(): void {
    if (!this.inSpawnPhase) return;
    this.inSpawnPhase = false;
    for (const p of this.players) {
      if (p && p.kind === "human" && !p.spawned && !this.spawnRandom(p)) p.alive = false;
    }
    this.events.push({ type: "spawnPhaseEnd" });
  }

  // Économie ------------------------------------------------------------------------------------

  private updateEconomy(): void {
    for (const p of this.players) {
      if (!p || !p.alive || !p.spawned) continue;
      if (p.tiles === 0) {
        this.eliminate(p, 0, 0);
        continue;
      }
      p.addTroops(troopIncrease(p));
      p.addGold(goldPerTick(p));
    }
    for (const mine of this.mines) {
      const owner = this.player(this.map.owner(mine));
      if (owner && owner.alive) owner.addGold(GOLD_PER_MINE_PER_TICK * owner.mods.goldMult);
    }
  }

  // Attaques ------------------------------------------------------------------------------------

  launchAttack(attacker: Player, targetId: number, requested: number): void {
    if (targetId === attacker.id) return;
    const target = targetId === 0 ? null : this.player(targetId);
    if (targetId !== 0 && (target === null || !target.alive)) return;

    let troops = attacker.removeTroops(requested);
    if (troops < 1) return;

    // Deux attaques opposées s'annulent.
    if (target !== null) {
      for (const a of this.attacks) {
        if (a.active && a.attacker.id === targetId && a.targetId === attacker.id) {
          const cancelled = Math.min(a.troops, troops);
          a.troops -= cancelled;
          troops -= cancelled;
          if (a.troops < 1) a.active = false;
        }
      }
      if (troops < 1) return;
    }

    // Une nouvelle attaque vers la même cible renforce l'attaque existante.
    const existing = this.attacks.find(
      (a) => a.active && a.attacker === attacker && a.targetId === targetId,
    );
    if (existing) {
      existing.troops += troops;
      existing.refreshFront();
      return;
    }

    const attack = new Attack(this, this.nextAttackId++, attacker, targetId, troops);
    if (!attack.init()) {
      attacker.addTroops(troops);
      return;
    }
    this.attacks.push(attack);
    attacker.everAttacked = true;
    if (attacker.kind === "human" || target?.kind === "human") {
      this.events.push({ type: "attackStarted", attacker: attacker.id, target: targetId, troops });
    }
  }

  /** Transfère tout le territoire restant du vaincu et son or au vainqueur. */
  annex(defeated: Player, victor: Player): void {
    for (let t = 0; t < this.map.size; t++) {
      if (this.map.owner(t) === defeated.id) this.conquer(t, victor.id);
    }
    let gold = defeated.gold;
    if (defeated.kind === "human") gold = defeated.everAttacked ? Math.floor(defeated.gold / 2) : 0;
    victor.addGold(gold);
    defeated.gold = 0;
    defeated.troops = 0;
    this.eliminate(defeated, victor.id, gold);
  }

  private eliminate(p: Player, by: number, gold: number): void {
    if (!p.alive) return;
    p.alive = false;
    this.events.push({ type: "eliminated", player: p.id, by, gold });
  }

  // Territoire ----------------------------------------------------------------------------------

  conquer(tile: number, newOwner: number): void {
    const map = this.map;
    const old = map.owner(tile);
    if (old === newOwner) return;
    const previous = this.players[old];
    if (old !== 0 && previous) {
      previous.tiles--;
      previous.border.delete(tile);
    }
    map.setOwner(tile, newOwner);
    map.setBlight(tile, false);
    const next = this.players[newOwner];
    if (newOwner !== 0 && next) next.tiles++;
    this.changed.push(tile);
    this.refreshBorder(tile);
    for (const n of map.neighbors(tile)) this.refreshBorder(n);
    this.onOwnerChanged(tile, newOwner);
  }

  private refreshBorder(t: number): void {
    const owner = this.map.owner(t);
    const p = this.players[owner];
    if (owner === 0 || !p) return;
    const isBorder = this.map.neighbors(t).some((n) => this.map.owner(n) !== owner);
    if (isBorder) p.border.add(t);
    else p.border.delete(t);
  }

  touchesOwner(tile: number, ownerId: number): boolean {
    return this.map.neighbors(tile).some((n) => this.map.owner(n) === ownerId);
  }

  /** Propriétaires des terres voisines de `p` (0 = terres libres). */
  neighborOwners(p: Player): Set<number> {
    const result = new Set<number>();
    for (const t of p.border) {
      for (const n of this.map.neighbors(t)) {
        if (!this.map.isPassableLand(n)) continue;
        const owner = this.map.owner(n);
        if (owner !== p.id) result.add(owner);
      }
    }
    return result;
  }

  // Bâtiments -----------------------------------------------------------------------------------

  private build(p: Player, kind: BuildingKind, tile: number): void {
    const reject = (reason: BuildRejection): void => {
      if (p.kind === "human") this.events.push({ type: "buildingRejected", player: p.id, reason });
    };
    if (this.inSpawnPhase) return reject("spawnPhase");
    if (!p.alive || this.map.owner(tile) !== p.id) return reject("notOwned");
    if (!this.map.isPassableLand(tile)) return reject("terrain");
    const minDistSq = STRUCTURE_MIN_DIST * STRUCTURE_MIN_DIST;
    for (const b of this.buildings.values()) {
      if (this.map.euclidSq(b.tile, tile) < minDistSq) return reject("tooClose");
    }
    const cost = buildingCost(kind, p);
    if (p.gold < cost) return reject("gold");

    p.gold -= cost;
    p.buildingCounts[kind]++;
    const building: Building = {
      id: this.nextBuildingId++,
      kind,
      owner: p.id,
      tile,
      remaining: BUILDINGS[kind].constructionTicks,
    };
    this.buildings.set(building.id, building);
    this.buildingAt.set(tile, building.id);
    this.buildingsDirty = true;
  }

  private updateConstructions(): void {
    for (const b of this.buildings.values()) {
      if (b.remaining === 0) continue;
      b.remaining--;
      if (b.remaining > 0) continue;
      const owner = this.players[b.owner];
      if (owner && b.kind === BuildingKind.Bourg) owner.completedBourgs++;
      if (owner) this.events.push({ type: "buildingDone", player: owner.id, building: b.kind });
      this.buildingsDirty = true;
    }
  }

  /** Une tour est détruite quand sa tuile tombe ; un bourg est capturé. */
  private onOwnerChanged(tile: number, newOwner: number): void {
    const id = this.buildingAt.get(tile);
    if (id === undefined) return;
    const b = this.buildings.get(id);
    if (!b) return;
    const from = this.players[b.owner];
    if (from) {
      from.buildingCounts[b.kind]--;
      if (b.kind === BuildingKind.Bourg && b.remaining === 0) from.completedBourgs--;
    }
    const to = this.players[newOwner];
    if (b.kind === BuildingKind.Tour || newOwner === 0 || !to) {
      this.buildings.delete(id);
      this.buildingAt.delete(tile);
    } else {
      to.buildingCounts[b.kind]++;
      if (b.kind === BuildingKind.Bourg && b.remaining === 0) to.completedBourgs++;
      this.events.push({
        type: "buildingCaptured",
        player: to.id,
        from: b.owner,
        building: b.kind,
      });
      b.owner = newOwner;
    }
    this.buildingsDirty = true;
  }

  hasTowerCover(defender: Player, tile: number): boolean {
    const range = TOWER_RANGE * defender.mods.towerRangeMult;
    const rangeSq = range * range;
    for (const b of this.buildings.values()) {
      if (
        b.kind === BuildingKind.Tour &&
        b.owner === defender.id &&
        b.remaining === 0 &&
        this.map.euclidSq(b.tile, tile) <= rangeSq
      ) {
        return true;
      }
    }
    return false;
  }

  // Victoire ------------------------------------------------------------------------------------

  private checkWin(): void {
    let leader: Player | null = null;
    let alive = 0;
    let everSpawned = 0;
    for (const p of this.players) {
      if (!p || !p.spawned) continue;
      everSpawned++;
      if (!p.alive) continue;
      alive++;
      if (leader === null || p.tiles > leader.tiles) leader = p;
    }
    if (leader === null) return;
    const dominates = leader.tiles * 100 > this.map.numLandTiles * WIN_PERCENT;
    const lastStanding = alive === 1 && everSpawned > 1;
    if (dominates || lastStanding) {
      this.winner = leader.id;
      this.events.push({ type: "win", player: leader.id });
    }
  }

  // Sorties -------------------------------------------------------------------------------------

  hash(): number {
    let h = mixHash(1, this.ticks);
    for (const p of this.players) {
      if (!p) continue;
      h = mixHash(h, p.id);
      h = mixHash(h, p.troops);
      h = mixHash(h, p.tiles);
      h = mixHash(h, p.gold);
    }
    for (const a of this.attacks) h = mixHash(h, Math.floor(a.troops));
    return h >>> 0;
  }

  playerViews(): PlayerView[] {
    const views: PlayerView[] = [];
    for (const p of this.players) {
      if (!p) continue;
      views.push({
        id: p.id,
        name: p.name,
        kind: p.kind,
        race: p.race,
        clientId: p.clientId,
        alive: p.alive,
        spawned: p.spawned,
        tiles: p.tiles,
        troops: p.troops,
        maxTroops: maxTroops(p),
        gold: p.gold,
        bourgs: p.buildingCounts[BuildingKind.Bourg],
        tours: p.buildingCounts[BuildingKind.Tour],
      });
    }
    return views;
  }

  buildingViews(): BuildingView[] {
    return [...this.buildings.values()].map((b) => ({
      id: b.id,
      kind: b.kind,
      owner: b.owner,
      tile: b.tile,
      done: b.remaining === 0,
    }));
  }

  private collect(): TickResult {
    const changedTiles = new Uint32Array(this.changed.length * 2);
    for (let i = 0; i < this.changed.length; i++) {
      const t = this.changed[i] as number;
      changedTiles[2 * i] = t;
      changedTiles[2 * i + 1] = this.map.state[t] as number;
    }
    const attacks: AttackView[] = this.attacks.map((a) => ({
      id: a.id,
      attacker: a.attacker.id,
      target: a.targetId,
      troops: Math.floor(a.troops),
    }));
    const result: TickResult = {
      tick: this.ticks,
      inSpawnPhase: this.inSpawnPhase,
      changedTiles,
      players: this.playerViews(),
      buildings: this.buildingsDirty ? this.buildingViews() : null,
      attacks,
      events: this.events,
      hash: this.ticks % HASH_INTERVAL === 0 ? this.hash() : null,
      winner: this.winner,
    };
    this.changed = [];
    this.events = [];
    this.buildingsDirty = false;
    return result;
  }
}
