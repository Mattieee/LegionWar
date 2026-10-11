import { describe, expect, it } from "vitest";
import {
  ALL_RACES,
  BuildingKind,
  Difficulty,
  FRONT_FIRST_EDGE,
  Game,
  NATION_TEMPERS,
  NATION_WEAKEST_EDGE,
  NEUTRAL_TEMPER,
  Race,
  TerrainKind,
  maxTroops,
} from "@legionwar/engine";
import type { Player } from "../src/game/Player";

function play(game: Game) {
  return game.executeTurn({ turn: game.ticks, intents: [] });
}

/**
 * Partie de `cuts.length` prétendants sans tribus, la terre partagée en bandes verticales
 * (`cuts` = parts cumulées), dont le prétendant n° `seat` (à partir de 1) est du peuple voulu.
 */
function bandsWith(race: Race, seat: number, cuts: number[], difficulty = Difficulty.Knight) {
  for (let seed = 1; seed < 400; seed++) {
    const game = new Game({
      seed,
      mapSize: "small",
      bots: 0,
      nations: cuts.length,
      difficulty,
      humans: [],
      singleplayer: false,
    });
    if (game.player(seat)?.race !== race) continue;
    while (game.inSpawnPhase) play(game);
    const w = game.map.width;
    const land: number[] = [];
    for (let t = 0; t < game.map.size; t++) if (game.map.isPassableLand(t)) land.push(t);
    land.sort((x, y) => (x % w) - (y % w) || x - y);
    land.forEach((t, i) => game.conquer(t, cuts.findIndex((c) => i < c * land.length) + 1));
    const lords = cuts.map((_, i) => game.player(i + 1) as Player);
    return { game, lords };
  }
  throw new Error(`aucune graine ne place ${race} au siège ${seat}`);
}

/** Tuiles de `enemy` au contact de `me`. */
function frontOf(game: Game, me: Player, enemy: Player): number[] {
  const out = new Set<number>();
  for (const t of me.border) {
    for (const n of game.map.neighbors(t)) if (game.map.owner(n) === enemy.id) out.add(n);
  }
  return [...out];
}

/**
 * Le prétendant `mid` a FRONT_FIRST_EDGE fois les troupes du plus grand de ses voisins `left` et
 * `right`, de même densité (`denser`, s'il est donné, 10 % plus dense) ; `before` est appelé
 * avant chaque tour. Renvoie la cible de sa première attaque contre un royaume.
 */
function firstTarget(
  game: Game,
  mid: Player,
  left: Player,
  right: Player,
  denser?: Player,
  before?: () => void,
): number | null {
  for (let i = 0; i < 130; i++) {
    mid.troops = Math.floor(maxTroops(mid) * 0.75);
    const density = mid.troops / FRONT_FIRST_EDGE / Math.max(left.tiles, right.tiles);
    for (const p of [left, right]) {
      p.troops = Math.floor(density * p.tiles * (p === denser ? 1.1 : 1));
    }
    before?.();
    for (const a of play(game).attacks) {
      if (a.attacker === mid.id && a.target !== left.id && a.target !== right.id) continue;
      if (a.attacker === mid.id) return a.target;
    }
  }
  return null;
}

describe("Tempéraments des prétendants (GDD §13.3)", () => {
  it("seuils cohérents et personnalités lisibles", () => {
    for (const race of ALL_RACES) {
      const t = NATION_TEMPERS[race];
      expect(t.trigger[0]).toBeLessThan(t.trigger[1]);
      expect(t.reserve[0]).toBeLessThan(t.reserve[1]);
      // On ne garde jamais en réserve plus qu'on n'exige pour attaquer.
      expect(t.reserve[1]).toBeLessThanOrEqual(t.trigger[0]);
      expect(t.towerThreshold).toBeGreaterThan(0);
      expect(t.towerThreshold).toBeLessThan(1);
    }
    // Fondre sur son front de prédilection exige plus que l'attaque du voisin le moins dense.
    expect(FRONT_FIRST_EDGE).toBeGreaterThan(NATION_WEAKEST_EDGE);
    const { aldoria, kharag, morvane, sylvanor } = NATION_TEMPERS;
    expect(kharag.trigger[0]).toBeLessThan(NEUTRAL_TEMPER.trigger[0]);
    expect(aldoria.trigger[0]).toBeGreaterThan(NEUTRAL_TEMPER.trigger[0]);
    expect(aldoria.towerThreshold).toBeLessThan(NEUTRAL_TEMPER.towerThreshold);
    expect(kharag.towerThreshold).toBeGreaterThan(NEUTRAL_TEMPER.towerThreshold);
    expect(aldoria.bourgFirst).toBe(true);
    expect(kharag.front).toBe("pillage");
    expect(morvane.front).toBe("battle");
    expect(sylvanor.front).toBe("forest");
  });

  it.each([
    [Race.Morvane, "charniers"],
    [Race.Kharag, "intact"],
  ])("entre deux voisins égaux, %s choisit le front %s", (race, wants) => {
    for (const side of ["left", "right"] as const) {
      const {
        game,
        lords: [left, mid, right],
      } = bandsWith(race, 2, [1 / 3, 2 / 3, 1]);
      if (!left || !mid || !right) throw new Error("prétendants introuvables");
      const scarred = side === "left" ? left : right;
      for (const t of frontOf(game, mid, scarred)) game.markCharnier(t, 1000);
      const expected = wants === "charniers" ? scarred : scarred === left ? right : left;
      expect(firstTarget(game, mid, left, right)).toBe(expected.id);
    }
  });

  it("Morvane attaque le voisin déjà en guerre contre un tiers, même 10 % plus dense", () => {
    // Bandes : le voisin de droite touche aussi le quatrième prétendant, qui l'attaque.
    const {
      game,
      lords: [left, mid, right, far],
    } = bandsWith(Race.Morvane, 2, [0.25, 0.5, 0.75, 1]);
    if (!left || !mid || !right || !far) throw new Error("prétendants introuvables");
    const target = firstTarget(game, mid, left, right, right, () => {
      // Assez de troupes pour que la riposte de la victime n'annule pas cette guerre.
      far.troops = 1_000_000;
      if ((game.incomingAttacks(right).get(far.id) ?? 0) < 50_000) {
        game.launchAttack(far, right.id, 300_000);
      }
    });
    expect(target).toBe(right.id);
  });

  it("Sylvanor attaque le voisin au front le plus boisé, même 10 % plus dense", () => {
    const {
      game,
      lords: [left, mid, right],
    } = bandsWith(Race.Sylvanor, 2, [1 / 3, 2 / 3, 1]);
    if (!left || !mid || !right) throw new Error("prétendants introuvables");
    const forest = (p: Player) => {
      const front = frontOf(game, mid, p);
      return front.filter((t) => game.map.kind(t) === TerrainKind.Forest).length / front.length;
    };
    // Écart net de boisement : sans tempérament, il attaquerait le voisin le moins dense.
    expect(Math.abs(forest(left) - forest(right))).toBeGreaterThan(0.15);
    const expected = forest(left) > forest(right) ? left : right;
    expect(firstTarget(game, mid, left, right, expected)).toBe(expected.id);
  });

  // Assaut d'environ 28 % puis 40 % de ses troupes (les pertes rognent l'appoint entre deux
  // tours) : le prétendant neutre (35 %) bâtirait au second, pas au premier.
  it.each([
    [Race.Aldoria, 64_000, true],
    [Race.Kharag, 90_000, false],
  ])("%s assailli par %i troupes sur 200 000 bâtit une Tour : %s", (race, assault, builds) => {
    const {
      game,
      lords: [me, foe],
    } = bandsWith(race, 1, [0.5, 1]);
    if (!me || !foe) throw new Error("prétendants introuvables");
    let towers = 0;
    for (let i = 0; i < 130; i++) {
      me.troops = 200_000;
      me.gold = 5_000_000;
      foe.troops = 150_000;
      const incoming = game.incomingAttacks(me).get(foe.id) ?? 0;
      if (incoming < assault) game.launchAttack(foe, me.id, assault - incoming);
      play(game);
      // Une Tour peut tomber pendant l'assaut : on retient le maximum.
      towers = Math.max(towers, me.buildingCounts[BuildingKind.Tour]);
    }
    expect(towers > 0).toBe(builds);
  });
});
