import { describe, expect, it } from "vitest";
import {
  Game,
  MAX_BOATS,
  Race,
  type GameMap,
  type Intent,
  type TickResult,
} from "@legionwar/engine";

const CLIENT = "marin";

/** Composantes 4-connexes de terre conquérable (étiquette par tuile, -1 pour l'eau). */
function landComponents(map: GameMap): { labels: Int32Array; sizes: number[] } {
  const labels = new Int32Array(map.size).fill(-1);
  const sizes: number[] = [];
  for (let start = 0; start < map.size; start++) {
    if (labels[start] !== -1 || !map.isPassableLand(start)) continue;
    const label = sizes.length;
    const queue = [start];
    labels[start] = label;
    for (let head = 0; head < queue.length; head++) {
      for (const n of map.neighbors(queue[head] as number)) {
        if (labels[n] === -1 && map.isPassableLand(n)) {
          labels[n] = label;
          queue.push(n);
        }
      }
    }
    sizes.push(queue.length);
  }
  return { labels, sizes };
}

interface Scenario {
  game: Game;
  spawn: number;
  island: number;
  islandLabel: number;
  labels: Int32Array;
}

/** Trouve une graine dont la carte a un continent et au moins une île séparée. */
function islandScenario(): Scenario {
  for (let seed = 1; seed < 60; seed++) {
    const game = new Game({
      seed,
      mapSize: "small",
      bots: 0,
      humans: [{ clientId: CLIENT, name: "Amiral", race: Race.Aldoria }],
      singleplayer: true,
    });
    const { labels, sizes } = landComponents(game.map);
    if (sizes.length < 2) continue;
    const main = sizes.indexOf(Math.max(...sizes));
    const map = game.map;
    let spawn = -1;
    let island = -1;
    for (let t = 0; t < map.size && (spawn < 0 || island < 0); t++) {
      if (labels[t] === main && spawn < 0) {
        const x = map.x(t);
        const y = map.y(t);
        if (x < 8 || y < 8 || x > map.width - 8 || y > map.height - 8) continue;
        let inland = true;
        for (let dy = -6; dy <= 6 && inland; dy++) {
          for (let dx = -6; dx <= 6 && inland; dx++) {
            if (labels[map.ref(x + dx, y + dy)] !== main) inland = false;
          }
        }
        if (inland) spawn = t;
      } else if (labels[t] !== main && labels[t] !== -1 && island < 0) {
        island = t;
      }
    }
    if (spawn >= 0 && island >= 0) {
      return { game, spawn, island, islandLabel: labels[island] as number, labels };
    }
  }
  throw new Error("Aucune carte avec île trouvée");
}

function step(game: Game, turn: number, intents: Intent[] = []): TickResult {
  return game.executeTurn({
    turn,
    intents: intents.map((intent) => ({ clientId: CLIENT, intent })),
  });
}

/** Étend le joueur jusqu'à ce qu'il possède une tuile côtière (attaques sur les terres libres). */
function reachCoast(s: Scenario, startTurn: number): number {
  const map = s.game.map;
  const me = s.game.playerByClient(CLIENT);
  let turn = startTurn;
  const coastal = (): boolean => {
    for (let t = 0; t < map.size; t++) {
      if (map.owner(t) === me?.id && map.neighbors(t).some((n) => map.isWater(n))) return true;
    }
    return false;
  };
  while (!coastal() && turn < startTurn + 3000) {
    const troops = Math.floor((me?.troops ?? 0) * 0.5);
    const intents: Intent[] = turn % 20 === 0 ? [{ type: "attack", target: 0, troops }] : [];
    step(s.game, turn++, intents);
  }
  if (!coastal()) throw new Error("Le joueur n'a jamais atteint la côte");
  // Laisse les troupes se reformer avant les manœuvres navales.
  for (let i = 0; i < 50; i++) step(s.game, turn++);
  return turn;
}

describe("Barges de débarquement", () => {
  it("refuse un débarquement depuis un royaume sans côte", () => {
    const s = islandScenario();
    step(s.game, 0, [{ type: "spawn", tile: s.spawn }]);
    const result = step(s.game, 1, [{ type: "boat", tile: s.island, troops: 1000 }]);
    const me = s.game.playerByClient(CLIENT);
    expect(result.events).toContainEqual({
      type: "boatRejected",
      player: me?.id,
      reason: "noRoute",
    });
    expect(result.boats).toHaveLength(0);
  });

  it("traverse la mer et prend pied sur une île", () => {
    const s = islandScenario();
    step(s.game, 0, [{ type: "spawn", tile: s.spawn }]);
    let turn = reachCoast(s, 1);
    const me = s.game.playerByClient(CLIENT);
    if (!me) throw new Error("joueur introuvable");
    const troopsBefore = me.troops;
    const launch = step(s.game, turn++, [{ type: "boat", tile: s.island, troops: 5000 }]);
    expect(launch.events.some((e) => e.type === "boatLaunched")).toBe(true);
    expect(me.troops).toBeLessThan(troopsBefore);

    const ownsIslandTile = (): boolean => {
      for (let t = 0; t < s.game.map.size; t++) {
        if (s.labels[t] === s.islandLabel && s.game.map.owner(t) === me.id) return true;
      }
      return false;
    };
    let landed = false;
    for (let i = 0; i < 1500 && !ownsIslandTile(); i++) {
      const r = step(s.game, turn++);
      if (r.events.some((e) => e.type === "boatLanded")) landed = true;
    }
    expect(landed).toBe(true);
    expect(ownsIslandTile()).toBe(true);
  });

  it(`limite à ${MAX_BOATS} barges en mer par seigneur`, () => {
    const s = islandScenario();
    step(s.game, 0, [{ type: "spawn", tile: s.spawn }]);
    const turn = reachCoast(s, 1);
    const launches: Intent[] = Array.from({ length: MAX_BOATS + 1 }, () => ({
      type: "boat",
      tile: s.island,
      troops: 100,
    }));
    const result = step(s.game, turn, launches);
    // Une île proche peut être atteinte dans le tick même : on compte les lancements, pas les
    // barges encore en mer.
    expect(result.events.filter((e) => e.type === "boatLaunched")).toHaveLength(MAX_BOATS);
    expect(result.events.some((e) => e.type === "boatRejected" && e.reason === "maxBoats")).toBe(
      true,
    );
  });

  it("attaquer un seigneur sans frontière commune lance automatiquement une barge", () => {
    const base = islandScenario();
    const map = base.game.map;
    const main = base.labels[base.spawn] as number;
    // Seigneur 1 sur une côte du continent, seigneur 2 sur l'île (partie multijoueur).
    let coast = -1;
    for (let t = 0; t < map.size && coast < 0; t++) {
      if (base.labels[t] === main && map.neighbors(t).some((n) => map.isWater(n))) coast = t;
    }
    const game = new Game({
      ...base.game.config,
      humans: [
        { clientId: CLIENT, name: "Amiral", race: Race.Aldoria },
        { clientId: "insulaire", name: "Insulaire", race: Race.Sylvanor },
      ],
      singleplayer: false,
    });
    game.executeTurn({
      turn: 0,
      intents: [
        { clientId: CLIENT, intent: { type: "spawn", tile: coast } },
        { clientId: "insulaire", intent: { type: "spawn", tile: base.island } },
      ],
    });
    let turn = 1;
    while (game.inSpawnPhase) game.executeTurn({ turn: turn++, intents: [] });
    const islander = game.playerByClient("insulaire");
    if (!islander) throw new Error("insulaire introuvable");
    const result = game.executeTurn({
      turn,
      intents: [
        {
          clientId: CLIENT,
          intent: { type: "attack", target: islander.id, troops: 5000, tile: base.island },
        },
      ],
    });
    expect(result.events).toContainEqual(
      expect.objectContaining({ type: "boatLaunched", target: islander.id }),
    );
  });

  it("reste déterministe avec des barges en mer", () => {
    const run = (): number[] => {
      const s = islandScenario();
      const hashes: number[] = [];
      step(s.game, 0, [{ type: "spawn", tile: s.spawn }]);
      let turn = reachCoast(s, 1);
      for (let i = 0; i < 300; i++) {
        const intents: Intent[] = i === 0 ? [{ type: "boat", tile: s.island, troops: 2000 }] : [];
        const r = step(s.game, turn++, intents);
        if (r.hash !== null) hashes.push(r.hash);
      }
      return hashes;
    };
    expect(run()).toEqual(run());
  });
});
