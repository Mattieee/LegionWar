import { maxTroops } from "../config/Rules";
import { PseudoRandom } from "../core/PseudoRandom";
import type { Game } from "./Game";
import type { Player } from "./Player";

/**
 * IA d'une tribu sauvage (GDD §13, comme les « Bots » d'OpenFront) : remplissage passif.
 * Elle s'étend sur les terres libres, riposte contre qui l'attaque, frappe un Parjure voisin,
 * sinon un voisin au hasard (en évitant seigneurs et prétendants une fois sur deux).
 * Elle accepte presque toute alliance, n'en demande jamais et ne construit pas.
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
    this.diplomacy();

    const game = this.game;
    const neighbors = game.neighborOwners(me);
    const max = maxTroops(me);
    if (neighbors.has(0)) {
      if (me.troops > max * 0.2) {
        game.launchAttack(me, 0, Math.floor(me.troops * (0.25 + this.expandRatio)));
      }
      return;
    }
    if (me.troops < max * this.triggerRatio) return;

    const target = this.pickTarget(neighbors);
    if (target === null) return;
    const amount = Math.floor(me.troops - max * this.reserveRatio);
    if (amount > 0) game.launchAttack(me, target.id, amount);
  }

  /**
   * Accepte toute demande, sauf celle d'un royaume qui l'attaque (sinon on récupérerait son
   * attaque sans perte) ; ne renouvelle que si l'allié l'a demandé.
   */
  private diplomacy(): void {
    const game = this.game;
    const me = this.player;
    const attackers = game.incomingAttacks(me);
    for (const r of game.diplomacy.requestsTo(me.id)) {
      game.diplomacy.reply(me, r.from, !attackers.has(r.from));
    }
    for (const ally of game.diplomacy.alliesOf(me.id)) {
      if (
        game.diplomacy.inRenewWindow(me.id, ally) &&
        game.diplomacy.hasRenewed(ally, me.id) &&
        !game.diplomacy.hasRenewed(me.id, ally)
      ) {
        game.diplomacy.renew(me, ally);
      }
    }
  }

  private pickTarget(neighbors: Set<number>): Player | null {
    const game = this.game;
    const me = this.player;

    // 1. Riposte : le voisin qui l'attaque avec le plus de troupes.
    let riposte: Player | null = null;
    let most = 0;
    for (const [id, troops] of game.incomingAttacks(me)) {
      const p = game.player(id);
      if (p && p.alive && troops > most && !game.diplomacy.allied(me.id, id)) {
        riposte = p;
        most = troops;
      }
    }
    if (riposte) return riposte;

    // 2. Un Parjure voisin ; s'il est allié, la tribu rompt une fois sur trois.
    for (const id of neighbors) {
      const p = game.player(id);
      if (!p || !p.alive || id === 0 || !game.isParjure(p)) continue;
      if (!game.diplomacy.allied(me.id, id)) return p;
      if (this.rng.chance(3)) {
        game.diplomacy.breakAlliance(me, id);
        return p;
      }
    }

    // 3. Un voisin non allié au hasard ; seigneurs et prétendants écartés une fois sur deux.
    const candidates: Player[] = [];
    for (const id of neighbors) {
      const p = game.player(id);
      if (p && p.alive && id !== 0 && !game.diplomacy.allied(me.id, id)) candidates.push(p);
    }
    for (let draw = 0; draw < 2 && candidates.length > 0; draw++) {
      const index = this.rng.nextInt(0, candidates.length);
      const p = candidates[index] as Player;
      if (p.kind === "bot" || !this.rng.chance(2)) return p;
      candidates.splice(index, 1);
    }
    return null;
  }
}
