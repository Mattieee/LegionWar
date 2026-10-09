import { maxTroops } from "../config/Rules";
import { PseudoRandom } from "../core/PseudoRandom";
import type { Game } from "./Game";
import type { Player } from "./Player";

/**
 * IA d'une tribu sauvage : s'étend sur les terres libres, puis attaque un voisin quand elle
 * a assez de troupes. Ne construit pas et ne fait pas de diplomatie.
 */
export class BotBrain {
  private readonly rng: PseudoRandom;
  private readonly actionInterval: number;
  private readonly actionOffset: number;
  private readonly triggerRatio: number;
  private readonly reserveRatio: number;
  private readonly expandRatio: number;

  constructor(
    private readonly game: Game,
    readonly player: Player,
    seed: number,
  ) {
    this.rng = new PseudoRandom(seed);
    this.actionInterval = this.rng.nextInt(40, 80);
    this.actionOffset = this.rng.nextInt(0, this.actionInterval);
    this.triggerRatio = this.rng.nextInt(50, 60) / 100;
    this.reserveRatio = this.rng.nextInt(30, 40) / 100;
    this.expandRatio = this.rng.nextInt(10, 20) / 100;
  }

  tick(ticks: number): void {
    const me = this.player;
    if (!me.alive || ticks % this.actionInterval !== this.actionOffset) return;

    const neighbors = this.game.neighborOwners(me);
    const max = maxTroops(me);
    if (neighbors.has(0)) {
      if (me.troops > max * 0.2) {
        this.game.launchAttack(me, 0, Math.floor(me.troops * (0.25 + this.expandRatio)));
      }
      return;
    }
    if (me.troops < max * this.triggerRatio) return;

    const targets: Player[] = [];
    for (const id of neighbors) {
      const p = this.game.player(id);
      if (p === null || !p.alive) continue;
      // Les tribus évitent les seigneurs (humains) une fois sur deux.
      if (p.kind === "human" && this.rng.chance(2)) continue;
      targets.push(p);
    }
    if (targets.length === 0) return;
    // Préfère la cible la moins dense en troupes.
    targets.sort((a, b) => a.troops / Math.max(1, a.tiles) - b.troops / Math.max(1, b.tiles));
    const target = targets[0] as Player;
    const amount = Math.floor(me.troops - max * this.reserveRatio);
    if (amount > 0) this.game.launchAttack(me, target.id, amount);
  }
}
