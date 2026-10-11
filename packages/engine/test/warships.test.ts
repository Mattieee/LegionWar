import { describe, expect, it } from "vitest";
import {
  BuildingKind,
  Game,
  OCEAN_BIT,
  Race,
  SHELL_DAMAGE_MAX,
  WARSHIP_FIRE_TICKS,
  WARSHIP_HP,
  WARSHIP_RANGE,
  modifiersOf,
  warshipCost,
  type Intent,
} from "@legionwar/engine";
import { GameMap } from "../src/map/GameMap";
import { TerrainKind, encodeLand } from "../src/map/Terrain";
import { type SeaUnit, type WarshipHost, Warships } from "../src/game/Warships";

const W = 120;
const H = 50;
const at = (x: number, y: number): number => y * W + x;

/** Une bande de terre à gauche (x < 4), l'océan partout ailleurs. */
function seaMap(): GameMap {
  const terrain = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      terrain[at(x, y)] =
        x < 4 ? encodeLand(TerrainKind.Plain, 0) : OCEAN_BIT | Math.min(15, x - 3);
    }
  }
  return new GameMap(W, H, terrain);
}

class Host implements WarshipHost {
  readonly map = seaMap();
  boatList: SeaUnit[] = [];
  nefList: SeaUnit[] = [];
  allies = new Set<string>();
  ports = new Map<number, number[]>([
    [1, [at(3, 10)]],
    [2, [at(3, 40)]],
  ]);
  sunk: [number, number][] = [];
  captured: [number, number][] = [];
  shipsSunk: [number, number][] = [];
  hostile(a: number, b: number): boolean {
    return a !== b && !this.allies.has(`${Math.min(a, b)}:${Math.max(a, b)}`);
  }
  alive(): boolean {
    return true;
  }
  portsOf(owner: number): number[] {
    return this.ports.get(owner) ?? [];
  }
  seaAt(tile: number): number {
    if (this.map.isOcean(tile)) return 0;
    return this.map.neighbors(tile).some((n) => this.map.isOcean(n)) ? 0 : -1;
  }
  boats(): SeaUnit[] {
    return this.boatList;
  }
  nefs(): SeaUnit[] {
    return this.nefList;
  }
  sinkBoat(id: number, by: number): void {
    this.sunk.push([id, by]);
    this.boatList = this.boatList.filter((b) => b.id !== id);
  }
  captureNef(nef: SeaUnit, by: number): void {
    this.captured.push([nef.id, by]);
    this.nefList = this.nefList.filter((n) => n.id !== nef.id);
  }
  warshipSunk(owner: number, by: number): void {
    this.shipsSunk.push([owner, by]);
  }
}

function run(ws: Warships, ticks: number): void {
  for (let i = 0; i < ticks; i++) ws.tick();
}

describe("Navires de guerre (GDD §10)", () => {
  it("sortent du port le plus proche, sur la même mer", () => {
    const host = new Host();
    const ws = new Warships(host, 1);
    expect(ws.launchPort(1, at(60, 12))).toBe(at(3, 10));
    expect(ws.launchPort(3, at(60, 12))).toBeNull(); // sans port
    const id = ws.launch(1, at(3, 10), at(60, 12));
    expect(id).not.toBeNull();
    expect(ws.views()[0]).toMatchObject({ owner: 1, hp: WARSHIP_HP, tile: at(4, 10) });
  });

  it("coulent une barge ennemie à portée, pas celle d'un allié", () => {
    const host = new Host();
    const ws = new Warships(host, 1);
    ws.launch(1, at(3, 10), at(10, 10));
    host.boatList = [
      { id: 7, owner: 2, tile: at(10 + WARSHIP_RANGE - 10, 10) },
      { id: 8, owner: 3, tile: at(20, 12) },
    ];
    host.allies.add("1:3");
    run(ws, 60);
    expect(host.sunk).toEqual([[7, 1]]);
    expect(host.boatList.map((b) => b.id)).toEqual([8]);
  });

  it("ignorent une barge hors de portée", () => {
    const host = new Host();
    const ws = new Warships(host, 1);
    ws.launch(1, at(3, 10), at(5, 10));
    host.boatList = [{ id: 7, owner: 2, tile: at(4 + WARSHIP_RANGE + 40, 10) }];
    run(ws, 5);
    expect(host.sunk).toEqual([]);
  });

  it("se canonnent entre ennemis jusqu'à couler l'un d'eux", () => {
    const host = new Host();
    const ws = new Warships(host, 3);
    ws.launch(1, at(3, 10), at(30, 25));
    ws.launch(2, at(3, 40), at(32, 25));
    // Assez de salves pour couler 1 000 PV à 200–300 par boulet, un tir toutes les 2 s.
    run(ws, Math.ceil(WARSHIP_HP / 200 + 2) * WARSHIP_FIRE_TICKS + 200);
    expect(host.shipsSunk.length).toBeGreaterThanOrEqual(1);
    expect(ws.total).toBe(1);
  });

  it("capturent une nef ennemie qui passe près d'eux (piraterie)", () => {
    const host = new Host();
    const ws = new Warships(host, 1);
    ws.launch(1, at(3, 10), at(5, 10));
    host.nefList = [
      { id: 4, owner: 2, tile: at(6, 11) },
      { id: 5, owner: 1, tile: at(6, 9) },
    ];
    run(ws, 1);
    expect(host.captured).toEqual([[4, 1]]);
  });

  it("rentrent se réparer au port sous 75 % de PV", () => {
    const host = new Host();
    const ws = new Warships(host, 5);
    ws.launch(1, at(3, 10), at(60, 10));
    run(ws, 100); // loin du port
    // Un ennemi le blesse : on le laisse tirer jusqu'à passer sous 75 %.
    ws.launch(2, at(3, 40), at(60, 14));
    let repairing = false;
    for (let i = 0; i < 400 && !repairing; i++) {
      ws.tick();
      repairing = ws.views().some((v) => v.owner === 1 && v.repairing);
    }
    expect(repairing).toBe(true);
    const ship = ws.views().find((v) => v.owner === 1);
    expect(ship && ship.hp * 100 < WARSHIP_HP * 75 + SHELL_DAMAGE_MAX * 100).toBe(true);
  });

  it("envoyé trop loin pour une seule recherche, il avance par étapes au lieu de rester bloqué", () => {
    const host = new Host();
    const ws = new Warships(host, 1);
    const id = ws.launch(1, at(3, 10), at(5, 10)) as number;
    const start = ws.views()[0]?.tile;
    expect(ws.move(1, id, at(W - 2, H - 2))).toBe(true);
    run(ws, 50);
    expect(ws.views()[0]?.tile).not.toBe(start);
  });

  it("ne se répare qu'à quai, pas en pleine mer", () => {
    const host = new Host();
    const ws = new Warships(host, 7);
    ws.launch(1, at(3, 10), at(100, 30));
    run(ws, 150); // au large
    // Un ennemi l'endommage sous 75 %, puis disparaît : le navire doit rentrer au port.
    ws.launch(2, at(3, 40), at(100, 32));
    for (let i = 0; i < 600 && !ws.views().some((v) => v.owner === 1 && v.repairing); i++) {
      ws.tick();
    }
    const hurt = ws.views().find((v) => v.owner === 1);
    if (!hurt) return; // coulé : rien à vérifier
    host.ports.set(2, []);
    // Tant qu'il n'est pas à quai (eau au pied de son port), ses PV ne remontent pas de plus de 1/tick.
    const dock = at(4, 10);
    let previous = hurt.hp;
    for (let i = 0; i < 200; i++) {
      ws.tick();
      const v = ws.views().find((x) => x.owner === 1);
      if (!v || v.tile === dock) break;
      expect(v.hp - previous).toBeLessThanOrEqual(1);
      previous = v.hp;
    }
  });

  it("est déterministe : mêmes ordres ⇒ même hash", () => {
    const hashes = [1, 2].map(() => {
      const host = new Host();
      const ws = new Warships(host, 42);
      ws.launch(1, at(3, 10), at(40, 20));
      ws.launch(2, at(3, 40), at(45, 30));
      host.boatList = [{ id: 1, owner: 2, tile: at(30, 20) }];
      run(ws, 800);
      return ws.hash(17);
    });
    expect(hashes[0]).toBe(hashes[1]);
  });
});

describe("Navire de guerre dans une partie", () => {
  it("coûte 250 k puis 500 k, et exige un port sur la mer visée", () => {
    const mods = modifiersOf(Race.Kharag);
    expect(warshipCost(0, mods)).toBe(Math.floor(250_000 * mods.buildCostMult));
    expect(warshipCost(1, mods)).toBe(Math.floor(500_000 * mods.buildCostMult));
    expect(warshipCost(9, mods)).toBe(Math.floor(1_000_000 * mods.buildCostMult));

    const game = new Game({
      seed: 4242,
      mapSize: "small",
      bots: 0,
      humans: [{ clientId: "a", name: "Alpha", race: Race.Kharag }],
      singleplayer: false,
    });
    const a = game.playerByClient("a");
    if (!a) throw new Error("joueur introuvable");
    while (game.inSpawnPhase) game.executeTurn({ turn: game.ticks, intents: [] });
    // Un rivage d'océan libre, conquis par le seigneur.
    const map = game.map;
    let shore = -1;
    for (let t = 0; t < map.size && shore < 0; t++) {
      if (
        map.isPassableLand(t) &&
        map.owner(t) === 0 &&
        map.neighbors(t).some((n) => map.isOcean(n))
      )
        shore = t;
    }
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = map.x(shore) + dx;
        const y = map.y(shore) + dy;
        if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
        const t = map.ref(x, y);
        if (map.isPassableLand(t) && map.owner(t) === 0) game.conquer(t, a.id);
      }
    }
    a.gold = 5_000_000;
    const sea = map.neighbors(shore).find((n) => map.isOcean(n)) as number;
    expect(game.launchWarship(a, sea)).toBe(false); // pas encore de port
    expect(game.build(a, BuildingKind.Port, shore)).toBe(true);
    for (let i = 0; i < 60; i++) game.executeTurn({ turn: game.ticks, intents: [] });
    const gold = a.gold;
    expect(game.launchWarship(a, sea)).toBe(true);
    expect(gold - a.gold).toBe(warshipCost(0, a.mods));
    const r = game.executeTurn({ turn: game.ticks, intents: [] });
    expect(r.warships.filter((w) => w.owner === a.id)).toHaveLength(1);
    expect(r.players.find((p) => p.id === a.id)?.warships).toBe(1);
  });
});

describe("Combat naval dans une partie", () => {
  /** Deux seigneurs, chacun maître d'un rivage sur le plus grand océan, un port chacun. */
  function navalGame() {
    const game = new Game({
      seed: 4242,
      mapSize: "small",
      bots: 0,
      humans: [
        { clientId: "a", name: "Alpha", race: Race.Kharag },
        { clientId: "b", name: "Bêta", race: Race.Sylvanor },
      ],
      singleplayer: false,
    });
    const a = game.playerByClient("a");
    const b = game.playerByClient("b");
    if (!a || !b) throw new Error("joueurs introuvables");
    while (game.inSpawnPhase) game.executeTurn({ turn: game.ticks, intents: [] });
    const map = game.map;
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
    a.gold = 5_000_000;
    b.gold = 5_000_000;
    expect(game.build(a, BuildingKind.Port, first)).toBe(true);
    expect(game.build(b, BuildingKind.Port, second)).toBe(true);
    for (let i = 0; i < 60; i++) game.executeTurn({ turn: game.ticks, intents: [] });
    // Point de rencontre : l'océan le plus proche du milieu des deux ports.
    const mx = Math.round((map.x(first) + map.x(second)) / 2);
    const my = Math.round((map.y(first) + map.y(second)) / 2);
    let middle = -1;
    let best = Infinity;
    for (const t of sea) {
      const d = (map.x(t) - mx) ** 2 + (map.y(t) - my) ** 2;
      if (d < best) {
        best = d;
        middle = t;
      }
    }
    return { game, a, b, first, second, middle };
  }

  it("barges et navire coulés, nefs en mer : mêmes tours ⇒ mêmes hashes", () => {
    const runs = [1, 2].map(() => {
      const { game, a, b, first, middle } = navalGame();
      const counts = { boatSunk: 0, nefCaptured: 0, warshipSunk: 0 };
      const hashes: number[] = [];
      for (let i = 0; i < 2500; i++) {
        const intents: { clientId: string; intent: Intent }[] = [];
        if (i === 0) {
          intents.push({ clientId: "a", intent: { type: "warship", tile: middle } });
          intents.push({ clientId: "b", intent: { type: "warship", tile: middle } });
        }
        if (i === 300) intents.push({ clientId: "a", intent: { type: "warship", tile: middle } });
        if (i % 150 === 75) {
          b.troops = Math.max(b.troops, 50_000);
          intents.push({ clientId: "b", intent: { type: "boat", tile: first, troops: 5000 } });
        }
        if (i % 500 === 0) {
          a.gold = Math.max(a.gold, 3_000_000);
          b.gold = Math.max(b.gold, 3_000_000);
        }
        const r = game.executeTurn({ turn: game.ticks, intents });
        if (r.hash !== null) hashes.push(r.hash);
        for (const e of r.events) {
          if (e.type === "boatSunk" || e.type === "nefCaptured" || e.type === "warshipSunk") {
            counts[e.type]++;
          }
        }
      }
      return { hashes, counts };
    });
    expect(runs[0]?.hashes).toEqual(runs[1]?.hashes);
    expect(runs[0]?.counts.boatSunk).toBeGreaterThan(0);
    expect(runs[0]?.counts.warshipSunk).toBeGreaterThan(0);
    // Les nefs : capturées si leur route croise une patrouille ; on rapporte le compte.
    expect(runs[0]?.counts).toEqual(runs[1]?.counts);
  });
});
