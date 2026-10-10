import { describe, expect, it } from "vitest";
import {
  BuildingKind,
  Difficulty,
  EMBARGO_TICKS,
  Game,
  Race,
  TRADE_GOLD_MAX,
  TRADE_GOLD_MIN,
  costFor,
  modifiersOf,
  type GameEvent,
  type Intent,
} from "@legionwar/engine";
import { tradeGold } from "../src/game/Trade";

const A = "alpha";
const B = "beta";

/** Deux seigneurs en multijoueur, chacun maître d'un rivage sur le plus grand océan, loin l'un de l'autre. */
function twoHarbours() {
  const game = new Game({
    seed: 4242,
    mapSize: "small",
    bots: 0,
    humans: [
      { clientId: A, name: "Alpha", race: Race.Kharag },
      { clientId: B, name: "Bêta", race: Race.Sylvanor },
    ],
    singleplayer: false,
  });
  const a = game.playerByClient(A);
  const b = game.playerByClient(B);
  if (!a || !b) throw new Error("joueurs introuvables");
  while (game.inSpawnPhase) play(game);
  const map = game.map;
  // Le plus grand océan : parcours depuis la tuile la plus profonde.
  let deepest = 0;
  for (let t = 0; t < map.size; t++)
    if (map.isOcean(t) && map.waterDepth(t) > map.waterDepth(deepest)) deepest = t;
  const sea = new Set<number>([deepest]);
  const queue = [deepest];
  for (let i = 0; i < queue.length; i++) {
    for (const n of map.neighbors(queue[i] as number)) {
      if (!sea.has(n) && map.isOcean(n)) {
        sea.add(n);
        queue.push(n);
      }
    }
  }
  const coast: number[] = [];
  for (let t = 0; t < map.size; t++) {
    if (map.isPassableLand(t) && map.owner(t) === 0 && map.neighbors(t).some((n) => sea.has(n)))
      coast.push(t);
  }
  const first = coast[0] as number;
  const second = coast.find((t) => map.manhattan(t, first) > 80) as number;
  // Chaque seigneur reçoit un petit domaine autour de son rivage.
  const claim = (center: number, owner: number) => {
    for (let dy = -6; dy <= 6; dy++) {
      for (let dx = -6; dx <= 6; dx++) {
        const x = map.x(center) + dx;
        const y = map.y(center) + dy;
        if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
        const t = map.ref(x, y);
        if (map.isPassableLand(t) && map.owner(t) === 0) game.conquer(t, owner);
      }
    }
  };
  claim(first, a.id);
  claim(second, b.id);
  return { game, a, b, harbourA: first, harbourB: second };
}

function play(game: Game, intents: { clientId: string; intent: Intent }[] = []) {
  return game.executeTurn({ turn: game.ticks, intents });
}

function run(game: Game, ticks: number): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < ticks; i++) events.push(...play(game).events);
  return events;
}

/** Les deux seigneurs bâtissent un port sur leur rivage ; renvoie après la construction. */
function withPorts() {
  const s = twoHarbours();
  s.a.gold = 2_000_000;
  s.b.gold = 2_000_000;
  expect(s.game.build(s.a, BuildingKind.Port, s.harbourA)).toBe(true);
  expect(s.game.build(s.b, BuildingKind.Port, s.harbourB)).toBe(true);
  run(s.game, 51);
  return s;
}

describe("Port (GDD §9)", () => {
  it("se pose sur une côte de mer (un clic proche suffit), jamais loin du rivage", () => {
    const { game, a, harbourA } = twoHarbours();
    a.gold = 2_000_000;
    // Tuile à soi au cœur des terres (sans côte à 20 tuiles) : refusée.
    const map = game.map;
    let inland = -1;
    for (let t = 0; t < map.size && inland < 0; t++) {
      if (map.owner(t) !== a.id) continue;
      let far = true;
      for (let u = 0; u < map.size && far; u++) {
        if (map.isOcean(u) && map.euclidSq(t, u) <= 21 * 21) far = false;
      }
      if (far) inland = t;
    }
    if (inland >= 0) {
      const result = play(game, [
        { clientId: A, intent: { type: "build", building: BuildingKind.Port, tile: inland } },
      ]);
      expect(result.events).toContainEqual({
        type: "buildingRejected",
        player: a.id,
        reason: "coast",
      });
    }
    // Un clic à côté du rivage pose le port sur la côte.
    const near = map.neighbors(harbourA).find((n) => map.owner(n) === a.id) ?? harbourA;
    expect(game.build(a, BuildingKind.Port, near)).toBe(true);
    const port = game.buildingViews().find((b) => b.kind === BuildingKind.Port);
    expect(port && map.neighbors(port.tile).some((n) => map.isOcean(n))).toBe(true);
  });

  it("coûte 125 k, puis 250 k, 500 k et 1 M ; Aldoria −15 %", () => {
    const neutral = modifiersOf(null);
    expect([0, 1, 2, 3, 4].map((n) => costFor(BuildingKind.Port, n, neutral))).toEqual([
      125_000, 250_000, 500_000, 1_000_000, 1_000_000,
    ]);
    expect(costFor(BuildingKind.Port, 0, modifiersOf(Race.Aldoria))).toBe(106_250);
  });
});

describe("Nefs marchandes", () => {
  it("l'or d'une traversée vaut 40 par case, borné à 4 000–20 000", () => {
    expect(tradeGold(10)).toBe(TRADE_GOLD_MIN);
    expect(tradeGold(250)).toBe(10_000);
    expect(tradeGold(5000)).toBe(TRADE_GOLD_MAX);
  });

  it("une nef paie le maître du port de départ et celui du port d'arrivée", () => {
    const { game, a, b } = withPorts();
    const events = run(game, 900);
    const gains = events.filter((e) => e.type === "tradeGold");
    expect(gains.some((e) => e.type === "tradeGold" && e.player === a.id)).toBe(true);
    expect(gains.some((e) => e.type === "tradeGold" && e.player === b.id)).toBe(true);
    expect(a.tradeGold).toBeGreaterThan(0);
    expect(b.tradeGold).toBeGreaterThan(0);
  });

  it("pas de nef sans partenaire : un seul royaume portuaire ne commerce avec personne", () => {
    const { game, a, harbourA } = twoHarbours();
    a.gold = 2_000_000;
    game.build(a, BuildingKind.Port, harbourA);
    let nefs = 0;
    for (let i = 0; i < 600; i++) nefs += play(game).nefs.length;
    expect(nefs).toBe(0);
    expect(a.tradeGold).toBe(0);
  });
});

describe("Embargo", () => {
  it("fermer ses ports coule les nefs en route et bloque les départs", () => {
    const { game, a, b } = withPorts();
    // On attend qu'une nef soit en mer, puis Alpha ferme ses ports à Bêta.
    for (let i = 0; i < 400 && play(game).nefs.length === 0; i++);
    const before = { a: a.tradeGold, b: b.tradeGold };
    const closed = play(game, [
      { clientId: A, intent: { type: "embargo", target: b.id, on: true } },
    ]);
    expect(closed.events).toContainEqual({
      type: "embargo",
      from: a.id,
      to: b.id,
      on: true,
      auto: false,
    });
    let nefs = 0;
    for (let i = 0; i < 900; i++) nefs += play(game).nefs.length;
    expect(nefs).toBe(0);
    expect(a.tradeGold).toBe(before.a);
    expect(b.tradeGold).toBe(before.b);
    // Rouvrir ses ports relance le commerce.
    play(game, [{ clientId: A, intent: { type: "embargo", target: b.id, on: false } }]);
    run(game, 900);
    expect(a.tradeGold).toBeGreaterThan(before.a);
  });

  it("l'embargo après une attaque dure 3 min, et une alliance le lève", () => {
    const { game, a, b } = twoHarbours();
    game.trade.closeAfterAttack(b.id, a.id);
    expect(game.trade.blocked(a.id, b.id)).toBe(true);
    run(game, EMBARGO_TICKS);
    expect(game.trade.blocked(a.id, b.id)).toBe(false);
    game.trade.closeAfterAttack(b.id, a.id);
    game.diplomacy.request(a, b);
    game.diplomacy.reply(b, a.id, true);
    expect(game.trade.blocked(a.id, b.id)).toBe(false);
  });

  it("un embargo durable résiste à une alliance", () => {
    const { game, a, b } = twoHarbours();
    game.setEmbargo(a, b, true);
    game.diplomacy.request(a, b);
    game.diplomacy.reply(b, a.id, true);
    expect(game.trade.embargo(a.id, b.id)).toBe(-1);
  });
});

describe("Déterminisme du commerce", () => {
  it("mêmes tours ⇒ mêmes hashes, avec des prétendants qui bâtissent des ports", () => {
    const playOnce = () => {
      const game = new Game({
        seed: 31,
        mapSize: "medium",
        bots: 30,
        nations: 4,
        difficulty: Difficulty.Duke,
        humans: [],
        singleplayer: false,
      });
      const hashes: number[] = [];
      let nefs = 0;
      for (let turn = 0; turn < 4000; turn++) {
        const result = game.executeTurn({ turn, intents: [] });
        if (result.hash !== null) hashes.push(result.hash);
        nefs = Math.max(nefs, result.nefs.length);
      }
      return { hashes, nefs };
    };
    const first = playOnce();
    const second = playOnce();
    expect(first.hashes).toEqual(second.hashes);
    // Garde-fou de couverture : des nefs ont bien navigué.
    expect(first.nefs).toBeGreaterThan(0);
  });
});
