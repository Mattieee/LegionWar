import { describe, expect, it } from "vitest";
import {
  BuildingKind,
  Game,
  Race,
  maxTroops,
  type GameConfig,
  type Intent,
  type TickResult,
} from "@legionwar/engine";

const CLIENT = "joueur";

function makeGame(overrides: Partial<GameConfig> = {}): Game {
  return new Game({
    seed: 2026,
    mapSize: "small",
    bots: 20,
    humans: [{ clientId: CLIENT, name: "Testeur", race: Race.Aldoria }],
    singleplayer: true,
    ...overrides,
  });
}

/** Trouve une tuile de déploiement libre, entourée de terre libre. */
function freeSpawnTile(game: Game): number {
  const map = game.map;
  for (let t = 0; t < map.size; t++) {
    const x = map.x(t);
    const y = map.y(t);
    if (x < 10 || y < 10 || x > map.width - 10 || y > map.height - 10) continue;
    let ok = true;
    for (let dy = -6; dy <= 6 && ok; dy++) {
      for (let dx = -6; dx <= 6 && ok; dx++) {
        const n = map.ref(x + dx, y + dy);
        if (!map.isPassableLand(n) || map.owner(n) !== 0) ok = false;
      }
    }
    if (ok) return t;
  }
  throw new Error("Aucune tuile de déploiement libre");
}

function step(game: Game, turn: number, intents: Intent[] = []): TickResult {
  return game.executeTurn({
    turn,
    intents: intents.map((intent) => ({ clientId: CLIENT, intent })),
  });
}

function me(game: Game) {
  const p = game.playerByClient(CLIENT);
  if (!p) throw new Error("joueur introuvable");
  return p;
}

describe("Game", () => {
  it("déploie le joueur et termine la phase de déploiement en solo", () => {
    const game = makeGame();
    expect(game.inSpawnPhase).toBe(true);
    const result = step(game, 0, [{ type: "spawn", tile: freeSpawnTile(game) }]);
    expect(game.inSpawnPhase).toBe(false);
    expect(me(game).tiles).toBeGreaterThan(30);
    expect(result.events.some((e) => e.type === "spawnPhaseEnd")).toBe(true);
    expect(result.changedTiles.length).toBeGreaterThan(0);
  });

  it("refuse un déploiement dans l'eau", () => {
    const game = makeGame();
    const result = step(game, 0, [{ type: "spawn", tile: 0 }]);
    expect(game.inSpawnPhase).toBe(true);
    expect(result.events).toContainEqual({ type: "spawnRejected", player: me(game).id });
  });

  it("conquiert des terres libres et consomme des troupes", () => {
    const game = makeGame({ bots: 0 });
    step(game, 0, [{ type: "spawn", tile: freeSpawnTile(game) }]);
    const startTiles = me(game).tiles;
    const startTroops = me(game).troops;
    step(game, 1, [{ type: "attack", target: 0, troops: 8000 }]);
    expect(me(game).troops).toBeLessThan(startTroops);
    for (let i = 2; i < 60; i++) step(game, i);
    expect(me(game).tiles).toBeGreaterThan(startTiles * 2);
  });

  it("régénère les troupes sans dépasser le plafond", () => {
    const game = makeGame({ bots: 0 });
    step(game, 0, [{ type: "spawn", tile: freeSpawnTile(game) }]);
    const before = me(game).troops;
    for (let i = 1; i < 30; i++) step(game, i);
    expect(me(game).troops).toBeGreaterThan(before);
    expect(me(game).troops).toBeLessThanOrEqual(maxTroops(me(game)));
  });

  it("construit un bourg qui augmente le plafond de troupes", () => {
    const game = makeGame({ bots: 0 });
    const spawn = freeSpawnTile(game);
    step(game, 0, [{ type: "spawn", tile: spawn }]);
    const player = me(game);
    player.gold = 1_000_000;
    const maxBefore = maxTroops(player);
    const result = step(game, 1, [{ type: "build", building: BuildingKind.Bourg, tile: spawn }]);
    expect(player.gold).toBeLessThan(1_000_000);
    expect(result.buildings?.length).toBe(1);
    for (let i = 2; i < 30; i++) step(game, i);
    expect(player.completedBourgs).toBe(1);
    expect(maxTroops(player)).toBeGreaterThan(maxBefore + 200_000);
  });

  it("refuse une construction sans or", () => {
    const game = makeGame({ bots: 0 });
    const spawn = freeSpawnTile(game);
    step(game, 0, [{ type: "spawn", tile: spawn }]);
    me(game).gold = 0;
    const result = step(game, 1, [{ type: "build", building: BuildingKind.Tour, tile: spawn }]);
    expect(result.events).toContainEqual({
      type: "buildingRejected",
      player: me(game).id,
      reason: "gold",
    });
  });

  it("est déterministe : mêmes tours ⇒ mêmes hashes", () => {
    const run = (): number[] => {
      const game = makeGame({ bots: 40 });
      const hashes: number[] = [];
      const spawn = freeSpawnTile(game);
      for (let i = 0; i < 600; i++) {
        const intents: Intent[] = [];
        if (i === 0) intents.push({ type: "spawn", tile: spawn });
        if (i % 50 === 1) intents.push({ type: "attack", target: 0, troops: 3000 });
        const result = step(game, i, intents);
        if (result.hash !== null) hashes.push(result.hash);
      }
      return hashes;
    };
    const a = run();
    const b = run();
    expect(a.length).toBe(60);
    expect(a).toEqual(b);
  });

  it("les tribus s'étendent seules", () => {
    const game = makeGame({ bots: 10 });
    step(game, 0, [{ type: "spawn", tile: freeSpawnTile(game) }]);
    const tilesOf = (r: TickResult): number =>
      r.players.filter((p) => p.kind === "bot").reduce((sum, p) => sum + p.tiles, 0);
    const first = step(game, 1);
    let last = first;
    for (let i = 2; i < 400; i++) last = step(game, i);
    expect(tilesOf(last)).toBeGreaterThan(tilesOf(first));
  });
});
