import { describe, expect, it } from "vitest";
import {
  BuildingKind,
  CARAVAN_RULES,
  Game,
  Race,
  costFor,
  modifiersOf,
  type GameEvent,
} from "@legionwar/engine";
import { Caravans, type CaravanHost, type StopInfo } from "../src/game/Caravans";
import { GameMap } from "../src/map/GameMap";
import { TerrainKind, encodeLand } from "../src/map/Terrain";

/** Carte de plaine ; `water(x, y)` creuse de l'eau. */
function plain(width: number, height: number, water?: (x: number, y: number) => boolean): GameMap {
  const terrain = new Uint8Array(width * height).fill(encodeLand(TerrainKind.Plain, 0));
  if (water) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) if (water(x, y)) terrain[y * width + x] = 0;
    }
  }
  return new GameMap(width, height, terrain);
}

class Host implements CaravanHost {
  ticks = 0;
  now(): number {
    return this.ticks;
  }
  traders = new Set([1, 2, 3]);
  allies = new Set<string>();
  embargo = new Set<string>();
  paid: [number, number][] = [];
  constructor(readonly map: GameMap) {}
  trader(id: number): boolean {
    return this.traders.has(id);
  }
  allied(a: number, b: number): boolean {
    return this.allies.has(`${a}:${b}`) || this.allies.has(`${b}:${a}`);
  }
  blocked(a: number, b: number): boolean {
    return this.embargo.has(`${a}:${b}`) || this.embargo.has(`${b}:${a}`);
  }
  pay(owner: number, gold: number): void {
    this.paid.push([owner, gold]);
  }
  goldOf(owner: number): number {
    return this.paid.filter(([o]) => o === owner).reduce((s, [, g]) => s + g, 0);
  }
}

const W = 120;
const H = 40;
const at = (x: number, y = 20): number => y * W + x;

function run(host: Host, car: Caravans, stops: StopInfo[], ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    host.ticks++;
    car.tick(stops);
  }
}

describe("Marchés et caravanes", () => {
  it("un Marché relie les Bourgs à portée, et eux seuls", () => {
    const host = new Host(plain(W, H));
    const car = new Caravans(host, 1);
    const stops: StopInfo[] = [
      { id: 1, kind: "marche", owner: 1, tile: at(10) },
      { id: 2, kind: "bourg", owner: 1, tile: at(10 + CARAVAN_RULES.range - 5) },
      { id: 3, kind: "bourg", owner: 1, tile: at(10 + CARAVAN_RULES.range + 30) },
    ];
    run(host, car, stops, 1);
    expect(car.counts()).toMatchObject({ stations: 2, routes: 1 });
  });

  it("une route ne passe que par la terre", () => {
    const host = new Host(plain(W, H, (x) => x === 30));
    const car = new Caravans(host, 1);
    run(
      host,
      car,
      [
        { id: 1, kind: "marche", owner: 1, tile: at(10) },
        { id: 2, kind: "bourg", owner: 1, tile: at(40) },
      ],
      1,
    );
    expect(car.counts()).toMatchObject({ stations: 2, routes: 0 });
  });

  it("chez soi, une caravane paie l'or « chez soi » à son maître", () => {
    const host = new Host(plain(W, H));
    const car = new Caravans(host, 1);
    run(
      host,
      car,
      [
        { id: 1, kind: "marche", owner: 1, tile: at(10) },
        { id: 2, kind: "bourg", owner: 1, tile: at(40) },
      ],
      3 * CARAVAN_RULES.interval,
    );
    expect(host.paid.length).toBeGreaterThan(0);
    expect(host.paid.every(([o, g]) => o === 1 && g === CARAVAN_RULES.gold.self)).toBe(true);
  });

  it("chez un autre, les deux maîtres sont payés ; davantage entre alliés", () => {
    const stops: StopInfo[] = [
      { id: 1, kind: "marche", owner: 1, tile: at(10) },
      { id: 2, kind: "bourg", owner: 2, tile: at(40) },
    ];
    const host = new Host(plain(W, H));
    run(host, new Caravans(host, 1), stops, 3 * CARAVAN_RULES.interval);
    expect(host.goldOf(1)).toBeGreaterThan(0);
    expect(host.goldOf(1)).toBe(host.goldOf(2));
    expect(host.paid[0]?.[1]).toBe(CARAVAN_RULES.gold.other);

    const allied = new Host(plain(W, H));
    allied.allies.add("1:2");
    run(allied, new Caravans(allied, 1), stops, 3 * CARAVAN_RULES.interval);
    expect(allied.paid[0]?.[1]).toBe(CARAVAN_RULES.gold.ally);
  });

  it("l'embargo ferme la route : aucun or", () => {
    const host = new Host(plain(W, H));
    host.embargo.add("2:1");
    run(
      host,
      new Caravans(host, 1),
      [
        { id: 1, kind: "marche", owner: 1, tile: at(10) },
        { id: 2, kind: "bourg", owner: 2, tile: at(40) },
      ],
      3 * CARAVAN_RULES.interval,
    );
    expect(host.paid).toEqual([]);
  });

  it("une étape tribale se traverse sans payer, sans route en double", () => {
    const host = new Host(plain(W, H));
    const car = new Caravans(host, 1);
    run(
      host,
      car,
      [
        { id: 1, kind: "marche", owner: 1, tile: at(10) },
        { id: 2, kind: "bourg", owner: 9, tile: at(40) }, // tribu (pas commerçante)
        { id: 3, kind: "bourg", owner: 1, tile: at(48) },
      ],
      3 * CARAVAN_RULES.interval,
    );
    expect(car.counts().routes).toBe(2); // Marché–tribu et tribu–Bourg, pas Marché–Bourg
    expect(host.paid.length).toBeGreaterThan(0);
    expect(host.paid.every(([o, g]) => o === 1 && g === CARAVAN_RULES.gold.self)).toBe(true);
  });

  it("une capture garde la route ; une destruction l'efface", () => {
    const host = new Host(plain(W, H));
    const car = new Caravans(host, 1);
    const stops: StopInfo[] = [
      { id: 1, kind: "marche", owner: 1, tile: at(10) },
      { id: 2, kind: "bourg", owner: 1, tile: at(40) },
    ];
    run(host, car, stops, 1);
    (stops[1] as StopInfo).owner = 2;
    run(host, car, stops, 3 * CARAVAN_RULES.interval);
    expect(car.counts().routes).toBe(1);
    expect(host.goldOf(2)).toBeGreaterThan(0);
    run(host, car, stops.slice(0, 1), 1);
    expect(car.counts()).toMatchObject({ stations: 1, routes: 0, caravans: 0 });
  });

  it("est déterministe : mêmes étapes ⇒ même hash", () => {
    const hashes = [1, 2].map(() => {
      const host = new Host(plain(W, H, (x, y) => x === 60 && y < 30));
      const car = new Caravans(host, 42);
      const stops: StopInfo[] = [
        { id: 1, kind: "marche", owner: 1, tile: at(30) },
        { id: 2, kind: "bourg", owner: 1, tile: at(10, 5) },
        { id: 3, kind: "bourg", owner: 2, tile: at(55, 35) },
        { id: 4, kind: "marche", owner: 2, tile: at(80, 10) },
        { id: 5, kind: "bourg", owner: 3, tile: at(100, 30) },
      ];
      run(host, car, stops, 1000);
      return [car.hash(17), host.paid.length];
    });
    expect(hashes[0]).toEqual(hashes[1]);
    expect(hashes[0]?.[1]).toBeGreaterThan(0);
  });
});

describe("Marché dans une partie", () => {
  /** Un seigneur reçoit une plaine sans eau de 33 × 33 et y bâtit un Marché et un Bourg. */
  function marketGame() {
    const game = new Game({
      seed: 777,
      mapSize: "small",
      bots: 0,
      humans: [
        { clientId: "a", name: "Alpha", race: Race.Kharag },
        { clientId: "b", name: "Bêta", race: Race.Aldoria },
      ],
      singleplayer: false,
    });
    const a = game.playerByClient("a");
    if (!a) throw new Error("joueur introuvable");
    while (game.inSpawnPhase) game.executeTurn({ turn: game.ticks, intents: [] });
    const map = game.map;
    const R = 16;
    const square = (c: number) => {
      const out: number[] = [];
      for (let dy = -R; dy <= R; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          const x = map.x(c) + dx;
          const y = map.y(c) + dy;
          if (x < 0 || y < 0 || x >= map.width || y >= map.height) return null;
          out.push(map.ref(x, y));
        }
      }
      return out;
    };
    let center = -1;
    for (let t = 0; t < map.size && center < 0; t += 7) {
      const tiles = square(t);
      if (tiles?.every((n) => map.isPassableLand(n) && map.owner(n) === 0)) center = t;
    }
    expect(center).toBeGreaterThanOrEqual(0);
    for (const t of square(center) as number[]) game.conquer(t, a.id);
    a.gold = 2_000_000;
    const market = map.ref(map.x(center) - 8, map.y(center));
    const bourg = map.ref(map.x(center) + 8, map.y(center));
    expect(game.build(a, BuildingKind.Marche, market)).toBe(true);
    expect(game.build(a, BuildingKind.Bourg, bourg)).toBe(true);
    return { game, a, market, bourg };
  }

  it("coûte 125 k puis double, avec son propre compteur", () => {
    const mods = modifiersOf(Race.Kharag);
    expect(costFor(BuildingKind.Marche, 0, mods)).toBe(Math.floor(125_000 * mods.buildCostMult));
    expect(costFor(BuildingKind.Marche, 3, mods)).toBe(Math.floor(1_000_000 * mods.buildCostMult));
    const { a } = marketGame();
    expect(a.buildingCounts[BuildingKind.Marche]).toBe(1);
    expect(a.buildingCounts[BuildingKind.Port]).toBe(0);
  });

  it("ses caravanes versent l'or à son maître et l'annoncent", () => {
    const { game, a } = marketGame();
    const events: GameEvent[] = [];
    for (let i = 0; i < 400; i++) {
      events.push(...game.executeTurn({ turn: game.ticks, intents: [] }).events);
    }
    expect(a.caravanGold).toBeGreaterThanOrEqual(CARAVAN_RULES.gold.self);
    expect(a.caravanGold % CARAVAN_RULES.gold.self).toBe(0);
    const gains = events.filter((e) => e.type === "tradeGold" && e.source === "caravane");
    expect(gains.length).toBe(a.caravanGold / CARAVAN_RULES.gold.self);
  });

  it("est déterministe : mêmes tours ⇒ même hash, routes et caravanes comprises", () => {
    const hashes = [1, 2].map(() => {
      const { game } = marketGame();
      let last: number | null = null;
      let routes = 0;
      for (let i = 0; i < 300; i++) {
        const r = game.executeTurn({ turn: game.ticks, intents: [] });
        if (r.hash !== null) last = r.hash;
        if (r.routes) routes = r.routes.length;
      }
      return [last, routes];
    });
    expect(hashes[0]).toEqual(hashes[1]);
    expect(hashes[0]?.[1]).toBe(1);
  });

  it("capture puis destruction : mêmes hashes, routes effacées", () => {
    const runs = [1, 2].map(() => {
      const { game, market, bourg } = marketGame();
      const b = game.playerByClient("b");
      if (!b) throw new Error("joueur introuvable");
      const hashes: (number | null)[] = [];
      let routes = -1;
      for (let i = 0; i < 450; i++) {
        if (i === 150) game.conquer(market, b.id);
        if (i === 300) game.conquer(bourg, 0);
        const r = game.executeTurn({ turn: game.ticks, intents: [] });
        if (r.hash !== null) hashes.push(r.hash);
        if (r.routes) routes = r.routes.length;
      }
      return { hashes, routes, gold: b.caravanGold };
    });
    expect(runs[0]).toEqual(runs[1]);
    expect(runs[0]?.routes).toBe(0);
    expect(runs[0]?.gold).toBeGreaterThan(0);
  });
});
