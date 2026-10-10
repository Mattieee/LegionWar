import {
  ALLIANCE_TICKS,
  BOAT_TILES_PER_TICK,
  BUILDINGS,
  CROWN_PERCENT,
  DIFFICULTIES,
  CHARNIER_TICKS,
  FRONT_VIEW_INTERVAL,
  FRONT_VIEW_MAX_SEGMENTS,
  FRONT_VIEW_MIN_SEGMENT,
  GOLD_PER_MINE_PER_TICK,
  GROVE_REACH,
  GROVE_SWEEP_TICKS,
  HASH_INTERVAL,
  LANDING_CANDIDATES,
  LANDING_SEARCH_LIMIT,
  MAX_BOATS,
  MAX_NATIONS,
  MIN_SPAWN_DISTANCE,
  MULTIPLAYER_SPAWN_PHASE_TICKS,
  NATION_SPAWN_DISTANCE,
  NATION_SPAWN_DISTANCE_RELAXED,
  RAMPART_INTERVAL,
  RELATION_DECAY_TICKS,
  RELATION_MAX,
  SPAWN_ATTEMPTS,
  SPAWN_ATTEMPTS_STRICT,
  SPAWN_RADIUS,
  START_TROOPS,
  STATE_HASH_INTERVAL,
  STRUCTURE_MIN_DIST,
  TIME_LIMIT_TICKS,
  TWILIGHT_START_TICKS,
  TOWER_RANGE,
  WIN_CHECK_INTERVAL,
  WIN_PERCENT,
  buildingCost,
  goldPerTick,
  maxTroops,
  troopIncrease,
  winPercentAt,
} from "../config/Rules";
import { arrayHash, mixHash } from "../core/hash";
import { PseudoRandom } from "../core/PseudoRandom";
import type { GameMap } from "../map/GameMap";
import { generateMap } from "../map/MapGenerator";
import { ALL_RACES, type Race } from "../config/Races";
import { MAX_PLAYER_ID, TerrainKind } from "../map/Terrain";
import { Attack } from "./Attack";
import { BotBrain } from "./BotAI";
import { Diplomacy } from "./Diplomacy";
import { NationBrain } from "./NationAI";
import { type Boat, SeaScratch, findSeaRoute, landingCandidates } from "./Naval";
import { nationName, tribeName } from "./Names";
import { Player } from "./Player";
import {
  BuildingKind,
  Difficulty,
  type DiplomacyRejection,
  type DonationResource,
  type AttackView,
  type BoatRejection,
  type BoatView,
  type BuildRejection,
  type BuildingView,
  type GameConfig,
  type GameEvent,
  type Intent,
  type PlayerView,
  type TickResult,
  type Turn,
  type WinReason,
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

/** Champ de bataille récent : morts qui y gisent et tick où il disparaît. */
interface Charnier {
  dead: number;
  expires: number;
}

/** Valeur de `forestDist` pour une tuile hors de portée d'une forêt. */
const FAR_FROM_FOREST = 255;

/** Cerveau d'IA (tribu ou prétendant), exécuté une fois par tick dans l'ordre des identifiants. */
interface Brain {
  tick(ticks: number): void;
}

/** Variation de relation d'un prétendant quand on attaque un de ses alliés. */
const RELATION_ALLY_ATTACKED = -30;
/** … quand un voisin trahit quelqu'un, quand on refuse sa demande, quand on le trahit. */
const RELATION_NEIGHBOR_BETRAYAL = -40;
const RELATION_REFUSED = -10;
const RELATION_BETRAYED = -100;
/** Dons : +5 par tranche (25 k d'or ou 10 k troupes), au plus +50 par don. */
const RELATION_GIFT_STEP = { gold: 25_000, troops: 10_000 } as const;
const RELATION_GIFT_MAX = 50;

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
  /** Tick de la fin du déploiement : l'horloge du Crépuscule part de là. */
  warStartTick = 0;
  /** Porteur de la Couronne au début du tick (0 = personne), fixe pendant les combats du tick. */
  crownId = 0;
  winner: number | null = null;

  private readonly players: (Player | null)[] = [null];
  private readonly byClient = new Map<string, Player>();
  private readonly brains: Brain[] = [];
  readonly diplomacy: Diplomacy;
  /** Relations de chaque prétendant envers chaque joueur (−100 à +100). */
  private readonly relations = new Map<number, Int8Array>();
  private attacks: Attack[] = [];
  private boats: Boat[] = [];
  private nextBoatId = 1;
  /** Tentatives de lancement de barge pendant le tour courant, par joueur. */
  private readonly boatAttempts = new Map<number, number>();
  /** Tampon réutilisé par la recherche de route maritime (taille de la carte). */
  private seaScratch: SeaScratch | null = null;
  private readonly buildings = new Map<number, Building>();
  private readonly buildingAt = new Map<number, number>();
  private readonly spawnCenters: number[] = [];
  private nextBuildingId = 1;
  private nextAttackId = 1;
  private buildingsDirty = true;
  private changed: number[] = [];
  private events: GameEvent[] = [];

  // Mécaniques de race
  private readonly charniers = new Map<number, Charnier>();
  /**
   * Échéances des charniers dans l'ordre de pose (tuile, tick), lues depuis `charnierHead` :
   * l'expiration coûte O(1) amorti. Une entrée périmée (charnier ravivé depuis) est ignorée.
   */
  private charnierQueue: number[] = [];
  private charnierQueueExpiry: number[] = [];
  private charnierHead = 0;
  /** Distance de chaque tuile à la forêt la plus proche (≤ GROVE_REACH), si un Sylvain joue. */
  private readonly forestDist: Uint8Array | null;
  /** Joueurs dont les plaines se boisent. */
  private readonly groveOwners: Player[];
  /** Balayage des bosquets : pas premier avec la taille de la carte, pour une pousse dispersée. */
  private readonly groveStride: number;
  private groveCursor = 0;

  constructor(readonly config: GameConfig) {
    const seed = config.seed >>> 0;
    const nations = Math.max(0, Math.min(MAX_NATIONS, Math.floor(config.nations ?? 0)));
    if (config.humans.length + nations + config.bots > MAX_PLAYER_ID) {
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

    // Prétendants : déployés avant les tribus, éloignés les uns des autres, peuples équilibrés
    // (chaque peuple au plus ⌈N/4⌉ fois).
    // Configuration venue du réseau : une valeur inconnue retombe sur le niveau par défaut.
    const level =
      DIFFICULTIES[config.difficulty ?? Difficulty.Knight] ?? DIFFICULTIES[Difficulty.Knight];
    const raceRng = new PseudoRandom(seed ^ 0x68e31da4);
    const races: Race[] = [...ALL_RACES];
    for (let i = races.length - 1; i > 0; i--) {
      const j = raceRng.nextInt(0, i + 1);
      [races[i], races[j]] = [races[j] as Race, races[i] as Race];
    }
    for (let i = 0; i < nations; i++) {
      const id = this.players.length;
      const race = races[i % races.length] as Race;
      const nation = new Player(
        id,
        nationName(race, nameRng, usedNames),
        "nation",
        race,
        null,
        level.startTroops,
        level,
      );
      this.players.push(nation);
      const spawned = this.spawnRandom(nation, [
        [NATION_SPAWN_DISTANCE, 500],
        [NATION_SPAWN_DISTANCE_RELAXED, 300],
        [0, 200],
      ]);
      if (spawned) {
        this.relations.set(id, new Int8Array(1 + config.humans.length + nations + config.bots));
        this.brains.push(new NationBrain(this, nation, (seed + id * 7919) ^ 0x3c6ef372));
      } else {
        nation.alive = false;
      }
    }

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

    this.diplomacy = new Diplomacy(
      this,
      Number.isFinite(config.allianceTicks)
        ? Math.max(0, Math.floor(config.allianceTicks as number))
        : ALLIANCE_TICKS,
      config.donations ?? true,
    );
    this.groveOwners = this.players.filter((p): p is Player => p !== null && p.mods.grove);
    // Calculé une fois ici : à la volée, il provoquait un pic de ~20 ms en cours de partie.
    this.forestDist = this.groveOwners.length > 0 ? this.computeForestDist() : null;
    this.groveStride = coprimeStride(this.map.size);
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
    this.boatAttempts.clear();
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
          const tile =
            intent.tile !== undefined && this.map.isValidRef(intent.tile) ? intent.tile : undefined;
          this.launchAttack(p, intent.target, intent.troops, tile);
        }
        break;
      case "boat":
        if (
          !this.inSpawnPhase &&
          p.alive &&
          this.map.isValidRef(intent.tile) &&
          Number.isFinite(intent.troops)
        ) {
          const troops = p.removeTroops(intent.troops);
          if (troops >= 1 && !this.launchBoat(p, intent.tile, troops)) p.addTroops(troops);
        }
        break;
      case "build":
        if (BUILDING_KINDS.has(intent.building) && this.map.isValidRef(intent.tile)) {
          this.build(p, intent.building, intent.tile);
        }
        break;
      case "allianceRequest": {
        const target = this.player(intent.target);
        this.diplomacyResult(p, target ? this.diplomacy.request(p, target) : "invalidTarget");
        break;
      }
      case "allianceReply":
        this.diplomacyResult(p, this.diplomacy.reply(p, intent.requester, intent.accept === true));
        break;
      case "allianceRenew":
        this.diplomacyResult(p, this.diplomacy.renew(p, intent.ally));
        break;
      case "allianceBreak":
        this.diplomacyResult(p, this.diplomacy.breakAlliance(p, intent.ally));
        break;
      case "donate":
        if (intent.resource === "gold" || intent.resource === "troops") {
          this.diplomacyResult(
            p,
            this.diplomacy.donate(p, intent.target, intent.resource, intent.amount),
          );
        }
        break;
    }
  }

  /** Signale un refus diplomatique au seul joueur humain concerné. */
  private diplomacyResult(p: Player, reason: DiplomacyRejection | null): void {
    if (reason !== null && p.kind === "human") {
      this.events.push({ type: "diplomacyRejected", player: p.id, reason });
    }
  }

  private tick(): void {
    if (this.inSpawnPhase) {
      if (!this.config.singleplayer && this.ticks >= MULTIPLAYER_SPAWN_PHASE_TICKS) {
        this.endSpawnPhase();
      }
    } else {
      this.crownId = this.crownHolder()?.id ?? 0;
      this.updateEconomy();
      this.updateConstructions();
      this.updateCharniers();
      this.updateRamparts();
      this.updateGroves();
      this.updateDiplomacy();
      if (this.warTicks() === TWILIGHT_START_TICKS) this.events.push({ type: "twilight" });
      for (const brain of this.brains) brain.tick(this.ticks);
      this.updateBoats();
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

  /**
   * Déploiement aléatoire par étapes [distance minimale aux autres départs, tentatives] :
   * la contrainte se relâche quand la place manque.
   */
  private spawnRandom(
    p: Player,
    stages: readonly (readonly [number, number])[] = [
      [MIN_SPAWN_DISTANCE, SPAWN_ATTEMPTS_STRICT],
      [0, SPAWN_ATTEMPTS - SPAWN_ATTEMPTS_STRICT],
    ],
  ): boolean {
    for (const [minDistance, attempts] of stages) {
      for (let attempt = 0; attempt < attempts; attempt++) {
        const t = this.rng.nextInt(0, this.map.size);
        if (!this.map.isPassableLand(t) || this.map.owner(t) !== 0) continue;
        if (
          minDistance > 0 &&
          this.spawnCenters.some((c) => this.map.manhattan(c, t) < minDistance)
        ) {
          continue;
        }
        this.claimSpawn(p, t);
        return true;
      }
    }
    return false;
  }

  private endSpawnPhase(): void {
    if (!this.inSpawnPhase) return;
    this.inSpawnPhase = false;
    this.warStartTick = this.ticks;
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

  /**
   * Attaque terrestre ; si la cible n'a aucune frontière commune avec l'attaquant et qu'une
   * tuile est visée, les troupes partent en barge vers cette tuile.
   */
  launchAttack(attacker: Player, targetId: number, requested: number, tile?: number): void {
    if (targetId === attacker.id) return;
    const target = targetId === 0 ? null : this.player(targetId);
    if (targetId !== 0 && (target === null || !target.alive)) return;
    if (targetId !== 0 && this.diplomacy.allied(attacker.id, targetId)) {
      this.diplomacyResult(attacker, "ally");
      return;
    }

    const troops = attacker.removeTroops(requested);
    if (troops < 1) return;
    const leftover = this.commitAttack(attacker, targetId, troops);
    if (leftover < 1) return;
    if (tile !== undefined && this.map.owner(tile) === targetId) {
      if (this.launchBoat(attacker, tile, leftover)) return;
    }
    attacker.addTroops(leftover);
  }

  /**
   * Engage des troupes (déjà retirées à l'attaquant) contre une cible par la terre.
   * Renvoie les troupes non engagées (0 si tout est parti, toutes s'il n'y a pas de front).
   */
  private commitAttack(attacker: Player, targetId: number, troops: number): number {
    const target = targetId === 0 ? null : this.player(targetId);
    let remaining = troops;

    // Deux attaques opposées s'annulent.
    if (target !== null) {
      for (const a of this.attacks) {
        if (a.active && a.attacker.id === targetId && a.targetId === attacker.id) {
          const cancelled = Math.min(a.troops, remaining);
          a.troops -= cancelled;
          remaining -= cancelled;
          if (a.troops < 1) a.active = false;
        }
      }
      if (remaining < 1) return 0;
    }

    // Une nouvelle attaque vers la même cible renforce l'attaque existante.
    const existing = this.attacks.find(
      (a) => a.active && a.attacker === attacker && a.targetId === targetId,
    );
    if (existing) {
      existing.troops += remaining;
      existing.refreshFront();
      return 0;
    }

    const attack = new Attack(this, this.nextAttackId++, attacker, targetId, remaining);
    if (!attack.init()) return remaining;
    this.attacks.push(attack);
    attacker.everAttacked = true;
    this.onAttackLaunched(attacker, targetId);
    if (attacker.kind === "human" || target?.kind === "human") {
      this.events.push({
        type: "attackStarted",
        attacker: attacker.id,
        target: targetId,
        troops: remaining,
      });
    }
    return 0;
  }

  // Naval ---------------------------------------------------------------------------------------

  /** Lance une barge (troupes déjà retirées) vers la côte la plus proche de `dst`. */
  private launchBoat(attacker: Player, dst: number, troops: number): boolean {
    const reject = (reason: BoatRejection): false => {
      if (attacker.kind === "human") {
        this.events.push({ type: "boatRejected", player: attacker.id, reason });
      }
      return false;
    };
    // Plafonne aussi les tentatives par tick : une rafale d'intents refusés ne doit pas faire
    // ramer les autres clients (chaque tentative coûte une recherche de route).
    const attempts = (this.boatAttempts.get(attacker.id) ?? 0) + 1;
    this.boatAttempts.set(attacker.id, attempts);
    if (
      attempts > MAX_BOATS ||
      this.boats.filter((b) => b.owner === attacker).length >= MAX_BOATS
    ) {
      return reject("maxBoats");
    }
    if (!this.map.isPassableLand(dst) || this.map.owner(dst) === attacker.id) {
      return reject("notCoastal");
    }
    const candidates = landingCandidates(this.map, dst, LANDING_CANDIDATES, LANDING_SEARCH_LIMIT);
    if (candidates.length === 0) return reject("notCoastal");

    this.seaScratch ??= new SeaScratch(this.map.size);
    const route = findSeaRoute(this.map, attacker.id, candidates, this.seaScratch);
    if (route === null) return reject("noRoute");
    const target = this.map.owner(route.landing);
    if (target !== 0 && this.diplomacy.allied(attacker.id, target)) return reject("ally");
    this.boats.push({
      id: this.nextBoatId++,
      owner: attacker,
      troops,
      path: route.path,
      step: 0,
      landing: route.landing,
      target,
      done: false,
    });
    attacker.everAttacked = true;
    this.onAttackLaunched(attacker, target);
    if (attacker.kind === "human" || this.player(target)?.kind === "human") {
      this.events.push({ type: "boatLaunched", attacker: attacker.id, target, troops });
    }
    return true;
  }

  private updateBoats(): void {
    for (const boat of this.boats) {
      if (!boat.owner.alive) {
        boat.done = true;
        continue;
      }
      boat.step = Math.min(boat.path.length - 1, boat.step + BOAT_TILES_PER_TICK);
      if (boat.step === boat.path.length - 1) {
        this.landBoat(boat);
        boat.done = true;
      }
    }
    this.boats = this.boats.filter((b) => !b.done);
  }

  /** Débarquement : la plage est prise, puis l'assaut continue depuis cette tête de pont. */
  private landBoat(boat: Boat): void {
    const attacker = boat.owner;
    const owner = this.map.owner(boat.landing);
    // Une plage devenue alliée pendant la traversée : la barge rentre sans perte.
    const allied = owner !== 0 && this.diplomacy.allied(attacker.id, owner);
    if (owner === attacker.id || allied || !this.map.isPassableLand(boat.landing)) {
      attacker.addTroops(boat.troops);
      return;
    }
    this.conquer(boat.landing, attacker.id);
    if (attacker.kind === "human" || this.player(owner)?.kind === "human") {
      this.events.push({ type: "boatLanded", attacker: attacker.id, target: owner });
    }
    attacker.addTroops(this.commitAttack(attacker, owner, boat.troops));
  }

  /** Transfère tout le territoire restant du vaincu et son or au vainqueur. */
  annex(defeated: Player, victor: Player): void {
    for (let t = 0; t < this.map.size; t++) {
      if (this.map.owner(t) === defeated.id) this.conquer(t, victor.id);
    }
    let gold = defeated.gold;
    if (defeated.kind !== "bot") {
      gold = defeated.everAttacked ? Math.floor(defeated.gold / 2) : 0;
    }
    victor.addGold(gold);
    defeated.gold = 0;
    defeated.troops = 0;
    this.eliminate(defeated, victor.id, gold);
  }

  private eliminate(p: Player, by: number, gold: number): void {
    if (!p.alive) return;
    p.alive = false;
    this.diplomacy.onEliminated(p.id);
    this.events.push({ type: "eliminated", player: p.id, by, gold });
  }

  // Mécaniques de race --------------------------------------------------------------------------

  /** Morts gisant sur un charnier (0 s'il n'y en a pas). */
  charnierDead(tile: number): number {
    return this.charniers.get(tile)?.dead ?? 0;
  }

  /**
   * Pose (ou ravive) un charnier après une prise de force. Appelé juste après `conquer` :
   * la tuile figure déjà dans les changements du tick.
   */
  markCharnier(tile: number, dead: number): void {
    const expires = this.ticks + CHARNIER_TICKS;
    this.map.setCharnier(tile, true);
    this.charniers.set(tile, { dead, expires });
    this.charnierQueue.push(tile);
    this.charnierQueueExpiry.push(expires);
  }

  private updateCharniers(): void {
    const queue = this.charnierQueue;
    const expiry = this.charnierQueueExpiry;
    while (
      this.charnierHead < queue.length &&
      (expiry[this.charnierHead] as number) <= this.ticks
    ) {
      const tile = queue[this.charnierHead] as number;
      const expires = expiry[this.charnierHead] as number;
      this.charnierHead++;
      if (this.charniers.get(tile)?.expires !== expires) continue;
      this.charniers.delete(tile);
      this.map.setCharnier(tile, false);
      this.changed.push(tile);
    }
    // Compacte la file quand la partie déjà lue en occupe plus de la moitié.
    if (this.charnierHead > 4096 && this.charnierHead * 2 > queue.length) {
      this.charnierQueue = queue.slice(this.charnierHead);
      this.charnierQueueExpiry = expiry.slice(this.charnierHead);
      this.charnierHead = 0;
    }
  }

  /** Aldoria : à chaque ronde, les tuiles frontière déjà vues à la ronde précédente se fortifient. */
  private updateRamparts(): void {
    if (this.ticks % RAMPART_INTERVAL !== 0) return;
    for (const p of this.players) {
      if (!p || !p.alive || !p.mods.rampart) continue;
      const next = new Set<number>();
      const allies = this.diplomacy.alliesOf(p.id);
      for (const t of p.border) {
        if (this.map.hasMark(t)) continue;
        if (
          allies.length > 0 &&
          this.map.neighbors(t).some((n) => allies.includes(this.map.owner(n)))
        ) {
          continue;
        }
        if (p.rampartCandidates.has(t)) {
          this.map.setMark(t, true);
          p.marks++;
          this.changed.push(t);
        } else {
          next.add(t);
        }
      }
      p.rampartCandidates = next;
    }
  }

  /** Sylvanor : balaie une part de la carte et boise les plaines sylvaines proches d'une forêt. */
  private updateGroves(): void {
    const dist = this.forestDist;
    if (dist === null || !this.groveOwners.some((p) => p.alive)) return;
    const map = this.map;
    const batch = Math.ceil(map.size / GROVE_SWEEP_TICKS);
    for (let i = 0; i < batch; i++) {
      const t = this.groveCursor;
      this.groveCursor = (this.groveCursor + this.groveStride) % map.size;
      if ((dist[t] as number) > GROVE_REACH || map.hasMark(t)) continue;
      const owner = this.players[map.owner(t)];
      if (!owner || !owner.mods.grove || map.kind(t) !== TerrainKind.Plain) continue;
      map.setMark(t, true);
      owner.marks++;
      this.changed.push(t);
    }
  }

  /** Parcours en largeur depuis toutes les forêts, borné à GROVE_REACH, sur la terre praticable. */
  private computeForestDist(): Uint8Array {
    const map = this.map;
    const dist = new Uint8Array(map.size).fill(FAR_FROM_FOREST);
    let frontier: number[] = [];
    for (let t = 0; t < map.size; t++) {
      if (map.isLand(t) && map.kind(t) === TerrainKind.Forest) {
        dist[t] = 0;
        frontier.push(t);
      }
    }
    for (let d = 1; d <= GROVE_REACH; d++) {
      const next: number[] = [];
      for (const t of frontier) {
        for (const n of map.neighbors(t)) {
          if (dist[n] === FAR_FROM_FOREST && map.isPassableLand(n)) {
            dist[n] = d;
            next.push(n);
          }
        }
      }
      frontier = next;
    }
    return dist;
  }

  // Diplomatie ----------------------------------------------------------------------------------

  emit(event: GameEvent): void {
    this.events.push(event);
  }

  isParjure(p: Player): boolean {
    return p.parjureUntil > this.ticks;
  }

  /** Seigneur ou prétendant qui tient au moins CROWN_PERCENT % des terres (le plus grand). */
  crownHolder(): Player | null {
    let holder: Player | null = null;
    for (const p of this.players) {
      if (!p || !p.alive || p.kind === "bot") continue;
      if (p.tiles * 100 < this.map.numLandTiles * CROWN_PERCENT) continue;
      if (holder === null || p.tiles > holder.tiles) holder = p;
    }
    return holder;
  }

  /** Vrai si tous les seigneurs et prétendants encore en vie (au moins deux) sont alliés. */
  onlyAlliesRemain(): boolean {
    const lords = this.players.filter(
      (p): p is Player => p !== null && p.alive && p.spawned && p.kind !== "bot",
    );
    if (lords.length < 2) return false;
    return lords.every((a) => lords.every((b) => a === b || this.diplomacy.allied(a.id, b.id)));
  }

  /** Troupes engagées par chaque attaque visant `p`, par attaquant (ordre des attaques). */
  incomingAttacks(p: Player): Map<number, number> {
    const out = new Map<number, number>();
    for (const a of this.attacks) {
      if (a.active && a.targetId === p.id) {
        out.set(a.attacker.id, (out.get(a.attacker.id) ?? 0) + Math.floor(a.troops));
      }
    }
    return out;
  }

  relation(nationId: number, otherId: number): number {
    return this.relations.get(nationId)?.[otherId] ?? 0;
  }

  private adjustRelation(nationId: number, otherId: number, delta: number, set = false): void {
    const rel = this.relations.get(nationId);
    if (!rel || otherId <= 0 || otherId >= rel.length || nationId === otherId) return;
    const value = set ? delta : (rel[otherId] as number) + delta;
    rel[otherId] = Math.max(-RELATION_MAX, Math.min(RELATION_MAX, value));
  }

  private updateDiplomacy(): void {
    this.diplomacy.update();
    if (this.ticks % RELATION_DECAY_TICKS !== 0) return;
    for (const rel of this.relations.values()) {
      for (let i = 0; i < rel.length; i++) {
        const v = rel[i] as number;
        if (v !== 0) rel[i] = v > 0 ? v - 1 : v + 1;
      }
    }
  }

  /** Une attaque ou une barge contre `targetId` : rancune des prétendants, demande annulée. */
  private onAttackLaunched(attacker: Player, targetId: number): void {
    if (targetId === 0) return;
    this.diplomacy.cancelRequest(attacker.id, targetId);
    const target = this.player(targetId);
    if (target?.kind === "nation") {
      this.adjustRelation(targetId, attacker.id, target.level.attackedRelation);
    }
    for (const ally of this.diplomacy.alliesOf(targetId)) {
      if (ally !== attacker.id) this.adjustRelation(ally, attacker.id, RELATION_ALLY_ATTACKED);
    }
  }

  /** Alliance conclue ou renouvelée : attaques entre eux retirées sans perte, amitié. */
  onAllianceSealed(a: number, b: number): void {
    for (const attack of this.attacks) {
      const between =
        (attack.attacker.id === a && attack.targetId === b) ||
        (attack.attacker.id === b && attack.targetId === a);
      if (attack.active && between) attack.retreat();
    }
    this.adjustRelation(a, b, RELATION_MAX);
    this.adjustRelation(b, a, RELATION_MAX);
  }

  onRequestRefused(requester: number, responder: number): void {
    this.adjustRelation(requester, responder, RELATION_REFUSED);
  }

  onBetrayal(traitor: Player, victim: number): void {
    this.adjustRelation(victim, traitor.id, RELATION_BETRAYED, true);
    for (const neighbor of this.neighborOwners(traitor)) {
      if (neighbor !== victim)
        this.adjustRelation(neighbor, traitor.id, RELATION_NEIGHBOR_BETRAYAL);
    }
  }

  onDonation(from: number, to: number, resource: DonationResource, amount: number): void {
    const steps = Math.floor(amount / RELATION_GIFT_STEP[resource]);
    this.adjustRelation(to, from, Math.min(RELATION_GIFT_MAX, steps * 5));
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
    // La marque (rempart, bosquet) n'a de sens que pour le propriétaire qui l'a posée.
    if (map.hasMark(tile)) {
      map.setMark(tile, false);
      if (previous) previous.marks--;
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
    if (isBorder) {
      p.border.add(t);
      return;
    }
    p.border.delete(t);
    // Un rempart qui n'est plus en lisière est abandonné.
    if (p.mods.rampart && this.map.hasMark(t)) {
      this.map.setMark(t, false);
      p.marks--;
      this.changed.push(t);
    }
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

  /** Construit si les règles le permettent ; renvoie vrai en cas de succès (IA comprises). */
  build(p: Player, kind: BuildingKind, tile: number): boolean {
    const reject = (reason: BuildRejection): false => {
      if (p.kind === "human") this.events.push({ type: "buildingRejected", player: p.id, reason });
      return false;
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
    return true;
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

  /** Ticks écoulés depuis la fin du déploiement (0 pendant le déploiement). */
  warTicks(): number {
    return this.inSpawnPhase ? 0 : this.ticks - this.warStartTick;
  }

  /** Seuil de victoire courant, en % des terres (80, puis il baisse au Crépuscule). */
  winPercent(): number {
    return winPercentAt(this.warTicks());
  }

  private checkWin(): void {
    let leader: Player | null = null;
    let alive = 0;
    let everSpawned = 0;
    for (const p of this.players) {
      // Les tribus sauvages ne peuvent pas gagner et ne comptent pas pour « dernier debout ».
      if (!p || !p.spawned || p.kind === "bot") continue;
      everSpawned++;
      if (!p.alive) continue;
      alive++;
      if (leader === null || p.tiles > leader.tiles) leader = p;
    }
    if (leader === null) return;
    const dominates = leader.tiles * 100 > this.map.numLandTiles * this.winPercent();
    const lastStanding = alive === 1 && everSpawned > 1;
    // À la limite de temps, le plus grand royaume l'emporte (le premier identifiant en cas d'égalité).
    const timeUp = this.warTicks() >= TIME_LIMIT_TICKS;
    if (dominates || lastStanding || timeUp) {
      this.winner = leader.id;
      const reason: WinReason = lastStanding
        ? "lastStanding"
        : dominates
          ? this.winPercent() < WIN_PERCENT
            ? "twilight"
            : "dominion"
          : "timeLimit";
      this.events.push({ type: "win", player: leader.id, reason });
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
      h = mixHash(h, p.marks);
      h = mixHash(h, p.pillaged);
      h = mixHash(h, p.raised);
      h = mixHash(h, p.parjureUntil);
      h = mixHash(h, p.betrayals);
    }
    h = this.diplomacy.hash(h);
    // L'horloge de guerre commande le Crépuscule et la limite de temps.
    h = mixHash(h, this.inSpawnPhase ? -1 : this.warStartTick);
    for (const [id, rel] of this.relations) {
      let sum = 0;
      for (let i = 0; i < rel.length; i++) sum = (sum * 31 + (rel[i] as number)) | 0;
      h = mixHash(mixHash(h, id), sum);
    }
    h = mixHash(h, this.charniers.size);
    h = mixHash(h, this.charnierHead);
    h = mixHash(h, this.groveCursor);
    for (const a of this.attacks) h = mixHash(h, Math.floor(a.troops));
    for (const b of this.boats) {
      h = mixHash(h, b.id);
      h = mixHash(h, b.owner.id);
      h = mixHash(h, b.troops);
      h = mixHash(h, b.path[b.step] as number);
      h = mixHash(h, b.path.length - b.step);
      h = mixHash(h, b.landing);
      h = mixHash(h, b.target);
    }
    // Les compteurs ne voient pas une divergence de propriété à nombre de tuiles égal.
    if (this.ticks % STATE_HASH_INTERVAL === 0) h = mixHash(h, arrayHash(this.map.state));
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
        troopRegen: p.alive && p.spawned && !this.inSpawnPhase ? troopIncrease(p) : 0,
        gold: p.gold,
        bourgs: p.buildingCounts[BuildingKind.Bourg],
        tours: p.buildingCounts[BuildingKind.Tour],
        marks: p.marks,
        pillaged: p.pillaged,
        raised: p.raised,
        allies: this.diplomacy.alliesOf(p.id),
        parjureUntil: p.parjureUntil,
        betrayals: p.betrayals,
        regard:
          p.kind === "nation"
            ? Array.from({ length: this.config.humans.length + 1 }, (_, id) =>
                this.relation(p.id, id),
              )
            : [],
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

  /**
   * Repères d'affichage d'une attaque (comme OpenFront) : la ligne de front (tuiles de
   * l'attaquant qui touchent la cible) est découpée en tronçons connexes ; chaque tronçon
   * assez long donne un repère, la tuile du tronçon la plus proche de son centre. Le repère
   * suit ainsi tout le front, pas les dernières prises : il bouge lentement et régulièrement.
   */
  private updateFrontMarkers(): void {
    // Un seul passage sur la frontière de chaque attaquant, pour toutes ses attaques : chaque
    // tuile est rangée dans la ligne de front de la cible qu'elle touche.
    const byAttacker = new Map<Player, Map<number, Set<number>>>();
    for (const a of this.attacks) {
      if (!a.active || a.targetId === 0) continue;
      let lines = byAttacker.get(a.attacker);
      if (!lines) {
        lines = new Map();
        byAttacker.set(a.attacker, lines);
      }
      lines.set(a.targetId, new Set());
    }
    const map = this.map;
    const w = map.width;
    const size = map.size;
    for (const [attacker, lines] of byAttacker) {
      for (const t of attacker.border) {
        const x = t % w;
        if (t >= w) lines.get(map.owner(t - w))?.add(t);
        if (t + w < size) lines.get(map.owner(t + w))?.add(t);
        if (x > 0) lines.get(map.owner(t - 1))?.add(t);
        if (x < w - 1) lines.get(map.owner(t + 1))?.add(t);
      }
    }
    for (const a of this.attacks) {
      const line = a.targetId === 0 ? undefined : byAttacker.get(a.attacker)?.get(a.targetId);
      if (line) a.fronts = this.frontMarkers(line);
    }
  }

  private frontMarkers(line: ReadonlySet<number>): number[] {
    const map = this.map;
    const seen = new Set<number>();
    const segments: { tile: number; size: number }[] = [];
    const w = map.width;
    for (const start of line) {
      if (seen.has(start)) continue;
      const queue = [start];
      seen.add(start);
      let sumX = 0;
      let sumY = 0;
      for (let i = 0; i < queue.length; i++) {
        const t = queue[i] as number;
        const x = t % w;
        const y = (t - x) / w;
        sumX += x;
        sumY += y;
        // Voisinage à 8 : une ligne de front en escalier reste d'un seul tenant.
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if ((dx === 0 && dy === 0) || nx < 0 || ny < 0 || nx >= w || ny >= map.height) {
              continue;
            }
            const n = ny * w + nx;
            if (line.has(n) && !seen.has(n)) {
              seen.add(n);
              queue.push(n);
            }
          }
        }
      }
      const cx = sumX / queue.length;
      const cy = sumY / queue.length;
      let best = start;
      let bestDist = Infinity;
      for (const t of queue) {
        const dx = (t % w) - cx;
        const dy = Math.floor(t / w) - cy;
        const d = dx * dx + dy * dy;
        if (d < bestDist) {
          bestDist = d;
          best = t;
        }
      }
      segments.push({ tile: best, size: queue.length });
    }
    segments.sort((a, b) => b.size - a.size || a.tile - b.tile);
    const kept = segments.filter((s, i) => i === 0 || s.size >= FRONT_VIEW_MIN_SEGMENT);
    return kept.slice(0, FRONT_VIEW_MAX_SEGMENTS).map((s) => s.tile);
  }

  private collect(): TickResult {
    const changedTiles = new Uint32Array(this.changed.length * 2);
    for (let i = 0; i < this.changed.length; i++) {
      const t = this.changed[i] as number;
      changedTiles[2 * i] = t;
      changedTiles[2 * i + 1] = this.map.state[t] as number;
    }
    if (this.ticks % FRONT_VIEW_INTERVAL === 0) this.updateFrontMarkers();
    const attacks: AttackView[] = this.attacks.map((a) => ({
      id: a.id,
      attacker: a.attacker.id,
      target: a.targetId,
      troops: Math.floor(a.troops),
      fronts: a.fronts,
    }));
    const boats: BoatView[] = this.boats.map((b) => ({
      id: b.id,
      owner: b.owner.id,
      tile: b.path[b.step] as number,
      landing: b.landing,
      target: b.target,
      troops: b.troops,
    }));
    const result: TickResult = {
      tick: this.ticks,
      inSpawnPhase: this.inSpawnPhase,
      changedTiles,
      players: this.playerViews(),
      buildings: this.buildingsDirty ? this.buildingViews() : null,
      attacks,
      boats,
      diplomacy: this.diplomacy.dirty ? this.diplomacy.view() : null,
      events: this.events,
      hash: this.ticks % HASH_INTERVAL === 0 ? this.hash() : null,
      winner: this.winner,
      warTicks: this.warTicks(),
      winPercent: this.winPercent(),
      crown: this.crownId,
    };
    this.changed = [];
    this.events = [];
    this.buildingsDirty = false;
    this.diplomacy.dirty = false;
    return result;
  }
}

/** Plus petit entier impair ≥ 0,618 × n premier avec n : un balayage de ce pas visite toute la carte. */
function coprimeStride(n: number): number {
  let stride = Math.floor(n * 0.618) | 1;
  while (gcd(stride, n) !== 1) stride += 2;
  return stride;
}

function gcd(a: number, b: number): number {
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}
