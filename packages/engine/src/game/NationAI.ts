import { NATION_WEAKEST_EDGE, buildingCost, maxTroops } from "../config/Rules";
import { PseudoRandom } from "../core/PseudoRandom";
import type { Game } from "./Game";
import type { Player } from "./Player";
import { BuildingKind } from "./Types";

/** Une alliance doit durer au moins ce temps avant qu'un prétendant envisage de la trahir. */
const BETRAYAL_MIN_TICKS = 600;
/** Un voisin est une menace quand ses troupes valent au moins 1,5 fois les nôtres. */
const THREAT_RATIO = 1.5;
/** Fenêtre « début de partie » où un prétendant accepte volontiers une alliance (3 min). */
const EARLY_GAME_TICKS = 1800;
/** Placement des bâtiments : tuiles frontière tirées et profondeur de recherche vers l'intérieur. */
const BUILD_SAMPLES = 25;
const BUILD_DEPTH = 8;
const TOWER_DEPTH = 5;
/** Part des troupes engagées contre lui au-delà de laquelle il bâtit une tour. */
const TOWER_THRESHOLD = 0.35;

/**
 * IA d'un prétendant (GDD §13, comme les « Nations » d'OpenFront), version 1 : à chaque cycle,
 * il répond aux demandes d'alliance, trahit éventuellement un allié faible, propose une
 * alliance, construit, puis attaque selon une liste de stratégies. Son niveau (Écuyer à
 * Empereur) règle ses troupes, son rythme, sa prudence et sa propension à trahir ; son peuple
 * ne change pas son caractère (GDD §13.3).
 */
export class NationBrain {
  private readonly rng: PseudoRandom;
  private readonly interval: number;
  private readonly offset: number;
  private readonly triggerRatio: number;
  private readonly reserveRatio: number;
  private readonly prudence: number;
  /** Propriétaires voisins, calculés une fois par cycle (le territoire ne bouge pas pendant le cycle). */
  private neighbors: Set<number> = new Set();

  constructor(
    private readonly game: Game,
    readonly player: Player,
    seed: number,
  ) {
    this.rng = new PseudoRandom(seed);
    const level = player.level;
    this.interval = this.rng.nextInt(level.interval[0], level.interval[1]);
    this.offset = this.rng.nextInt(0, this.interval);
    // Pas de nuance de peuple : mesurées, elles portaient Kharag à 38–41 % des parties menées.
    this.triggerRatio = this.rng.nextInt(45, 55) / 100;
    this.reserveRatio = this.rng.nextInt(25, 35) / 100;
    this.prudence = level.prudence;
  }

  tick(ticks: number): void {
    const me = this.player;
    if (!me.alive || ticks % this.interval !== this.offset) return;
    this.neighbors = this.game.neighborOwners(me);
    this.answerRequests();
    const betrayed = this.scheduledBetrayal();
    // Pas de demande le cycle d'une trahison : il se re-proposerait à sa victime.
    if (betrayed === null) this.proposeAlliance();
    this.buildSomething();
    if (betrayed === null) this.attack();
    else this.strike(betrayed, this.engageable());
  }

  // Diplomatie ----------------------------------------------------------------------------------

  private answerRequests(): void {
    const game = this.game;
    const me = this.player;
    for (const r of game.diplomacy.requestsTo(me.id)) {
      const requester = game.player(r.from);
      if (!requester) continue;
      let accept = this.wouldAccept(requester);
      // Confusion : une réponse sur N est inversée (jamais pour un Empereur).
      if (me.level.confusion > 0 && this.rng.chance(me.level.confusion)) accept = !accept;
      game.diplomacy.reply(me, r.from, accept);
    }
    const crown = game.crownHolder();
    // Enfermé par ses alliances, il laisse expirer celle de son allié voisin le plus faible.
    const boxed = this.weakestAllyIfBoxed();
    for (const ally of game.diplomacy.alliesOf(me.id)) {
      if (!game.diplomacy.inRenewWindow(me.id, ally) || game.diplomacy.hasRenewed(me.id, ally)) {
        continue;
      }
      const other = game.player(ally);
      if (
        other &&
        game.relation(me.id, ally) >= 0 &&
        crown?.id !== ally &&
        ally !== boxed &&
        !this.wouldBetray(other)
      ) {
        game.diplomacy.renew(me, ally);
      }
    }
  }

  /** Arbre de décision d'une demande d'alliance (GDD §13.4). */
  private wouldAccept(requester: Player): boolean {
    const game = this.game;
    const me = this.player;
    if (game.isParjure(requester) && !this.rng.chance(10)) return false;
    if (requester.betrayals >= 2 && this.rng.chance(2)) return false;
    if (this.lordAlliances(requester) >= 3) return false;
    if (game.crownHolder()?.id === requester.id) return false;
    if (this.neighbors.has(requester.id) && requester.troops >= me.troops * THREAT_RATIO)
      return true;
    const relation = game.relation(me.id, requester.id);
    if (relation < 0) return false;
    if (relation >= 50) return true;
    if (this.lordAlliances(me) >= 2) return false;
    if (game.ticks < EARLY_GAME_TICKS) return true;
    const ratio = requester.troops / Math.max(1, me.troops);
    return ratio >= 0.5 && ratio <= 2;
  }

  /**
   * Trahit un allié voisin bien plus faible, si rien ne le menace et que l'alliance a duré ; le
   * rapport exigé baisse quand il est enfermé et que cet allié est le plus faible de ses voisins.
   */
  private wouldBetray(ally: Player): boolean {
    const game = this.game;
    const me = this.player;
    const level = me.level;
    const formed = game.diplomacy.formedAt(me.id, ally.id);
    if (
      formed === null ||
      game.ticks - formed < BETRAYAL_MIN_TICKS ||
      !this.neighbors.has(ally.id) ||
      game.incomingAttacks(me).size > 0
    ) {
      return false;
    }
    if (me.troops >= ally.troops * level.betrayRatio) return true;
    return (
      level.boxedBetrayRatio > 0 &&
      me.troops >= ally.troops * level.boxedBetrayRatio &&
      this.weakestAllyIfBoxed() === ally.id
    );
  }

  /**
   * Enfermé : ni terre libre ni voisin non allié (tribu ou royaume) à sa frontière. Renvoie alors
   * l'allié voisin (seigneur ou prétendant) qui a le moins de troupes, sinon null.
   */
  private weakestAllyIfBoxed(): number | null {
    const game = this.game;
    let weakest: Player | null = null;
    for (const id of this.neighbors) {
      if (id === 0 || !game.diplomacy.allied(this.player.id, id)) return null;
      const p = game.player(id);
      if (!p || !p.alive || p.kind === "bot") continue;
      if (weakest === null || p.troops < weakest.troops) weakest = p;
    }
    return weakest?.id ?? null;
  }

  private scheduledBetrayal(): Player | null {
    const game = this.game;
    for (const id of game.diplomacy.alliesOf(this.player.id)) {
      const ally = game.player(id);
      if (ally && ally.alive && this.wouldBetray(ally)) {
        game.diplomacy.breakAlliance(this.player, id);
        return ally;
      }
    }
    return null;
  }

  /** Au plus une demande en attente : à un voisin ami, ou à un voisin de la menace. */
  private proposeAlliance(): void {
    const game = this.game;
    const me = this.player;
    if (game.diplomacy.requestsFrom(me.id).length > 0 || this.lordAlliances(me) >= 3) return;
    const crown = game.crownHolder();
    const eligible = (p: Player): boolean =>
      p.alive &&
      p.kind !== "bot" &&
      !game.isParjure(p) &&
      crown?.id !== p.id &&
      !game.diplomacy.allied(me.id, p.id);
    const neighbors = [...this.neighbors]
      .map((id) => game.player(id))
      .filter((p): p is Player => p !== null && p.id !== me.id);

    const friend = neighbors.find((p) => eligible(p) && game.relation(me.id, p.id) >= 50);
    if (friend) {
      game.diplomacy.request(me, friend);
      return;
    }
    const threat = neighbors.find((p) => p.kind !== "bot" && p.troops >= me.troops * THREAT_RATIO);
    if (!threat) return;
    const partner = [...game.neighborOwners(threat)]
      .map((id) => game.player(id))
      .find((p) => p && p.id !== me.id && eligible(p) && game.relation(me.id, p.id) >= 0);
    if (partner) game.diplomacy.request(me, partner);
  }

  /** Alliances avec des seigneurs ou des prétendants (les tribus ne comptent pas). */
  private lordAlliances(p: Player): number {
    return this.game.diplomacy.alliesOf(p.id).filter((id) => this.game.player(id)?.kind !== "bot")
      .length;
  }

  // Construction --------------------------------------------------------------------------------

  private buildSomething(): void {
    const game = this.game;
    const me = this.player;
    const level = me.level;
    // Tour : quand les attaques entrantes pèsent trop, derrière la frontière la plus menacée.
    if (level.towers) {
      let worst = 0;
      let worstId = 0;
      for (const [id, troops] of game.incomingAttacks(me)) {
        if (troops > worst) {
          worst = troops;
          worstId = id;
        }
      }
      if (worst > me.troops * TOWER_THRESHOLD && me.gold >= buildingCost(BuildingKind.Tour, me)) {
        const front = this.frontTile(worstId);
        if (front !== null) {
          const tile = this.inward(front, TOWER_DEPTH);
          if (!game.hasTowerCover(me, tile) && game.build(me, BuildingKind.Tour, tile)) return;
        }
      }
    }
    // Bourg : dès que l'or le permet (avec une marge pour les petits niveaux), au cœur du royaume.
    const margin = level.prudence > 0 ? 1 : 1.5;
    if (me.gold >= buildingCost(BuildingKind.Bourg, me) * margin) {
      for (const tile of this.innerTiles()) {
        if (game.build(me, BuildingKind.Bourg, tile)) return;
      }
    }
  }

  /** Tuiles candidates au cœur du royaume, les plus profondes d'abord. */
  private innerTiles(): number[] {
    const border = [...this.player.border];
    if (border.length === 0) return [];
    const scored: { tile: number; depth: number }[] = [];
    for (let i = 0; i < BUILD_SAMPLES; i++) {
      const start = border[this.rng.nextInt(0, border.length)] as number;
      let tile = start;
      let depth = 0;
      while (depth < BUILD_DEPTH) {
        const next = this.deeper(tile);
        if (next === null) break;
        tile = next;
        depth++;
      }
      scored.push({ tile, depth });
    }
    scored.sort((a, b) => b.depth - a.depth || a.tile - b.tile);
    return scored.map((s) => s.tile);
  }

  /** Avance de `steps` tuiles vers l'intérieur depuis `tile`. */
  private inward(tile: number, steps: number): number {
    for (let i = 0; i < steps; i++) {
      const next = this.deeper(tile);
      if (next === null) break;
      tile = next;
    }
    return tile;
  }

  /** Voisin possédé qui n'est pas en lisière (null s'il n'y en a pas). */
  private deeper(tile: number): number | null {
    const map = this.game.map;
    for (const n of map.neighbors(tile)) {
      if (map.owner(n) === this.player.id && !this.player.border.has(n)) return n;
    }
    return null;
  }

  /** Une de nos tuiles frontière qui touche les terres de `enemy`. */
  private frontTile(enemy: number): number | null {
    const map = this.game.map;
    for (const t of this.player.border) {
      if (map.neighbors(t).some((n) => map.owner(n) === enemy)) return t;
    }
    return null;
  }

  // Attaque -------------------------------------------------------------------------------------

  /** Troupes engageables : au-delà de la réserve et de la prudence face au plus fort voisin. */
  private engageable(): number {
    const game = this.game;
    const me = this.player;
    let strongest = 0;
    for (const id of this.neighbors) {
      const p = game.player(id);
      if (p && id !== 0 && !game.diplomacy.allied(me.id, id))
        strongest = Math.max(strongest, p.troops);
    }
    const reserve = Math.max(maxTroops(me) * this.reserveRatio, this.prudence * strongest);
    return Math.floor(me.troops - reserve);
  }

  private attack(): void {
    const game = this.game;
    const me = this.player;
    const max = maxTroops(me);
    const neighbors = this.neighbors;

    // Priorité absolue : les terres libres, par la terre puis en barge (dès Chevalier).
    if (neighbors.has(0)) {
      if (me.troops > max * 0.15) game.launchAttack(me, 0, Math.floor(me.troops * 0.4));
      return;
    }
    if (me.level.boats !== "none" && me.troops > max * 0.3) {
      const free = this.freeLandOverseas();
      if (free !== null) {
        game.launchAttack(me, 0, Math.floor(me.troops * 0.3), free);
        return;
      }
    }
    if (me.troops < max * this.triggerRatio) return;
    const amount = this.engageable();
    if (amount < 1) return;
    const target = this.pickTarget(neighbors);
    if (target === null) return;
    if (target.player.kind === "human" && this.rng.next() < me.level.humanGiveUp) return;
    this.strike(target.player, amount, target.byBoat);
  }

  private strike(target: Player, amount: number, byBoat = false): void {
    if (amount < 1 || !target.alive) return;
    const tile = byBoat ? this.anyTileOf(target) : undefined;
    this.game.launchAttack(this.player, target.id, amount, tile ?? undefined);
  }

  /** Stratégies essayées dans l'ordre (GDD §13.4). */
  private pickTarget(neighbors: Set<number>): { player: Player; byBoat: boolean } | null {
    const game = this.game;
    const me = this.player;
    const isNeighbor = (p: Player): boolean => neighbors.has(p.id);
    const hostile = (p: Player | null): p is Player =>
      p !== null && p.alive && p.id !== me.id && !game.diplomacy.allied(me.id, p.id);
    const around = [...neighbors]
      .filter((id) => id !== 0)
      .map((id) => game.player(id))
      .filter(hostile);

    // 1. Riposte contre le plus gros attaquant (en barge s'il n'est pas voisin).
    let riposte: Player | null = null;
    let most = 0;
    for (const [id, troops] of game.incomingAttacks(me)) {
      const p = game.player(id);
      if (hostile(p) && troops > most) {
        riposte = p;
        most = troops;
      }
    }
    if (riposte && isNeighbor(riposte)) return { player: riposte, byBoat: false };
    if (riposte && me.level.boats === "all") return { player: riposte, byBoat: true };

    // 2. Ligue contre la Couronne.
    const crown = game.crownHolder();
    if (me.level.league && hostile(crown)) {
      if (isNeighbor(crown)) return { player: crown, byBoat: false };
      if (me.level.boats === "all") return { player: crown, byBoat: true };
    }

    // 3. Aide à un allié : son attaquant, s'il est voisin.
    for (const ally of game.diplomacy.alliesOf(me.id)) {
      const allyPlayer = game.player(ally);
      if (!allyPlayer) continue;
      for (const id of game.incomingAttacks(allyPlayer).keys()) {
        const p = game.player(id);
        if (hostile(p) && isNeighbor(p)) return { player: p, byBoat: false };
      }
    }

    // 4. Un Parjure voisin.
    const parjure = around.find((p) => game.isParjure(p));
    if (parjure) return { player: parjure, byBoat: false };

    // 6. La tribu voisine la moins dense.
    const density = (p: Player): number => p.troops / Math.max(1, p.tiles);
    const tribes = around.filter((p) => p.kind === "bot").sort((a, b) => density(a) - density(b));
    if (tribes[0]) return { player: tribes[0], byBoat: false };

    // 7. Le voisin le plus haï.
    let hated: Player | null = null;
    for (const p of around) {
      const rel = game.relation(me.id, p.id);
      if (rel < -50 && (hated === null || rel < game.relation(me.id, hated.id))) hated = p;
    }
    if (hated) return { player: hated, byBoat: false };

    // 8. Le voisin le moins dense, si nos troupes valent au moins 1,25 fois les siennes.
    const weakest = [...around].sort((a, b) => density(a) - density(b))[0];
    if (weakest && me.troops >= weakest.troops * NATION_WEAKEST_EDGE) {
      return { player: weakest, byBoat: false };
    }

    // 9. Île : sans aucun voisin à attaquer, une barge vers le royaume non allié le plus faible.
    if (around.length === 0 && me.level.boats !== "none") {
      let prey: Player | null = null;
      for (let id = 1; ; id++) {
        const p = game.player(id);
        if (p === null) break;
        if (p.kind === "bot" || !p.spawned || !hostile(p)) continue;
        if (prey === null || p.troops < prey.troops) prey = p;
      }
      if (prey && me.troops >= prey.troops * NATION_WEAKEST_EDGE)
        return { player: prey, byBoat: true };
    }
    return null;
  }

  /** Une tuile de terre libre outre-mer, tirée au hasard (null si on n'en trouve pas). */
  private freeLandOverseas(): number | null {
    const map = this.game.map;
    for (let i = 0; i < 64; i++) {
      const t = this.rng.nextInt(0, map.size);
      if (map.isPassableLand(t) && map.owner(t) === 0) return t;
    }
    return null;
  }

  private anyTileOf(p: Player): number | null {
    for (const t of p.border) return t;
    return null;
  }
}
