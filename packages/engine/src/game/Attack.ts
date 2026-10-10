import { ANNEX_THRESHOLD, PILLAGE_TRIBE_RATIO, TERRAIN_COMBAT, attackLogic } from "../config/Rules";
import { MinHeap } from "../core/MinHeap";
import { TerrainKind } from "../map/Terrain";
import type { Game } from "./Game";
import type { Player } from "./Player";

/**
 * Une attaque terrestre. Elle n'a pas de direction : elle progresse sur toute la frontière
 * commune avec la cible, tuile par tuile, via un tas de priorité.
 */
export class Attack {
  active = true;
  /** Repères du front pour l'affichage, recalculés tous les FRONT_VIEW_INTERVAL ticks. */
  fronts: number[] = [];
  private readonly front = new MinHeap();

  constructor(
    private readonly game: Game,
    readonly id: number,
    readonly attacker: Player,
    /** 0 = terres libres. */
    readonly targetId: number,
    public troops: number,
  ) {}

  /** Construit le front initial. Renvoie false si aucune tuile cible n'est adjacente. */
  init(): boolean {
    this.refreshFront();
    return this.front.size > 0;
  }

  refreshFront(): void {
    const map = this.game.map;
    for (const tile of this.attacker.border) {
      for (const n of map.neighbors(tile)) {
        if (map.owner(n) === this.targetId && map.isPassableLand(n)) this.pushCandidate(n);
      }
    }
  }

  tick(): void {
    if (!this.active) return;
    const game = this.game;
    const map = game.map;
    const defender = this.targetId === 0 ? null : game.player(this.targetId);
    if (!this.attacker.alive || (defender !== null && !defender.alive)) {
      this.retreat();
      return;
    }

    const borderSize = this.front.size + game.rng.nextInt(0, 5);
    let budget = 1;
    while (budget > 0) {
      if (this.troops < 1) {
        this.active = false;
        return;
      }
      if (this.front.size === 0) {
        this.retreat();
        return;
      }
      const tile = this.front.pop();
      if (map.owner(tile) !== this.targetId || !game.touchesOwner(tile, this.attacker.id)) continue;

      // La marque de la tuile appartient au défenseur : bosquet sylvain ou rempart d'Aldoria.
      const mark = defender !== null && map.hasMark(tile) ? defender.mods : null;
      const wasCharnier = map.hasCharnier(tile);
      const result = attackLogic({
        kind: mark?.grove ? TerrainKind.Forest : map.kind(tile),
        attacker: this.attacker,
        defender,
        attackTroops: this.troops,
        borderSize,
        towerCover: defender !== null && game.hasTowerCover(defender, tile),
        rampart: mark?.rampart ?? false,
        parjure: defender !== null && game.isParjure(defender),
        landTiles: map.numLandTiles,
        crowned: this.attacker.id === game.crownId,
      });
      budget -= result.tickFraction;
      this.troops -= result.attackerLoss;
      let killed = 0;
      if (defender !== null) {
        killed = defender.removeTroops(result.defenderLoss);
        this.troops += killed * this.attacker.mods.harvestRatio;
        this.spoils(defender, tile, wasCharnier);
      }
      game.conquer(tile, this.attacker.id);
      // Toute prise de force entre deux royaumes laisse un charnier (pas les terres libres).
      if (defender !== null) game.markCharnier(tile, Math.floor(result.attackerLoss + killed));

      if (defender !== null && defender.tiles < ANNEX_THRESHOLD) {
        game.annex(defender, this.attacker);
        this.retreat();
        return;
      }
      this.addNeighbors(tile);
    }
  }

  /**
   * Butin de race sur une tuile prise à un royaume : Kharag pille ce qui n'a pas encore été
   * ravagé, Morvane relève les morts d'un charnier.
   */
  private spoils(defender: Player, tile: number, wasCharnier: boolean): void {
    const attacker = this.attacker;
    const mods = attacker.mods;
    if (wasCharnier) {
      if (mods.charnierRaise > 0) {
        const raised = Math.floor(this.game.charnierDead(tile) * mods.charnierRaise);
        this.troops += raised;
        attacker.raised += raised;
      }
    } else if (mods.pillageGold > 0) {
      const ratio = defender.kind === "bot" ? PILLAGE_TRIBE_RATIO : 1;
      const gold = Math.floor(mods.pillageGold * ratio);
      attacker.addGold(gold);
      attacker.pillaged += gold;
    }
  }

  /** Rend les troupes restantes à l'attaquant et termine l'attaque. */
  retreat(): void {
    if (!this.active) return;
    this.active = false;
    if (this.attacker.alive) this.attacker.addTroops(this.troops);
    this.troops = 0;
  }

  private addNeighbors(tile: number): void {
    const map = this.game.map;
    for (const n of map.neighbors(tile)) {
      if (map.owner(n) === this.targetId && map.isPassableLand(n)) this.pushCandidate(n);
    }
  }

  private pushCandidate(tile: number): void {
    const game = this.game;
    const map = game.map;
    let ownedNeighbors = 0;
    for (const n of map.neighbors(tile)) if (map.owner(n) === this.attacker.id) ownedNeighbors++;
    const weight = TERRAIN_COMBAT[map.kind(tile)]?.frontWeight ?? 1;
    // Priorité basse = prise en premier : terrain plat, tuile déjà encerclée, entrée ancienne.
    const priority =
      (game.rng.nextInt(0, 7) + 10) * (1 - 0.5 * ownedNeighbors + weight / 2) + game.ticks;
    this.front.push(priority, tile);
  }
}
