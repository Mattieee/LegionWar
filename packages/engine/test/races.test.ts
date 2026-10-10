import { describe, expect, it } from "vitest";
import {
  CHARNIER_TICKS,
  Game,
  PILLAGE_TRIBE_RATIO,
  RACES,
  RAMPART_COST_MULT,
  RAMPART_INTERVAL,
  RAMPART_LOSS_MULT,
  Race,
  TerrainKind,
  attackLogic,
  type GameConfig,
  type Intent,
} from "@legionwar/engine";

const CLIENT = "joueur";

function makeGame(race: Race, overrides: Partial<GameConfig> = {}): Game {
  return new Game({
    seed: 2026,
    mapSize: "small",
    bots: 0,
    humans: [{ clientId: CLIENT, name: "Testeur", race }],
    singleplayer: true,
    ...overrides,
  });
}

function step(game: Game, intents: Intent[] = []): void {
  game.executeTurn({
    turn: game.ticks,
    intents: intents.map((intent) => ({ clientId: CLIENT, intent })),
  });
}

function run(game: Game, ticks: number): void {
  for (let i = 0; i < ticks; i++) step(game);
}

function me(game: Game) {
  const p = game.playerByClient(CLIENT);
  if (!p) throw new Error("joueur introuvable");
  return p;
}

/** Tuile de déploiement entourée de terre libre (rayon 6), qui vérifie `accept` si fourni. */
function freeSpawnTile(game: Game, accept: (t: number) => boolean = () => true): number {
  const map = game.map;
  for (let t = 0; t < map.size; t++) {
    const x = map.x(t);
    const y = map.y(t);
    if (x < 14 || y < 14 || x > map.width - 14 || y > map.height - 14) continue;
    let ok = true;
    for (let dy = -6; dy <= 6 && ok; dy++) {
      for (let dx = -6; dx <= 6 && ok; dx++) {
        const n = map.ref(x + dx, y + dy);
        if (!map.isPassableLand(n) || map.owner(n) !== 0) ok = false;
      }
    }
    if (ok && accept(t)) return t;
  }
  throw new Error("Aucune tuile de déploiement libre");
}

function spawn(game: Game, tile = freeSpawnTile(game)): number {
  step(game, [{ type: "spawn", tile }]);
  return tile;
}

/** Tuiles possédées par `owner` portant la marque de race. */
function markedTiles(game: Game, owner: number): number[] {
  const out: number[] = [];
  for (let t = 0; t < game.map.size; t++) {
    if (game.map.owner(t) === owner && game.map.hasMark(t)) out.push(t);
  }
  return out;
}

/**
 * Donne à la tribu `botId` l'anneau de terres libres autour du joueur (distance 5 à 12 du centre)
 * pour provoquer une bataille entre deux royaumes ; renvoie les tuiles données.
 */
function ringForBot(game: Game, center: number, botId: number): number[] {
  const map = game.map;
  const given: number[] = [];
  for (let dy = -12; dy <= 12; dy++) {
    for (let dx = -12; dx <= 12; dx++) {
      const d = Math.abs(dx) + Math.abs(dy);
      if (d < 5 || d > 12) continue;
      const t = map.ref(map.x(center) + dx, map.y(center) + dy);
      if (map.isPassableLand(t) && map.owner(t) === 0) {
        game.conquer(t, botId);
        given.push(t);
      }
    }
  }
  return given;
}

describe("Remparts (Aldoria)", () => {
  it("une frontière tenue deux rondes de suite se fortifie, pas avant", () => {
    const game = makeGame(Race.Aldoria);
    spawn(game);
    const p = me(game);
    run(game, RAMPART_INTERVAL - 1);
    expect(p.marks).toBe(0);
    run(game, 2);
    expect(p.marks).toBeGreaterThan(0);
    expect(p.marks).toBe(p.border.size);
    for (const t of markedTiles(game, p.id)) expect(p.border.has(t)).toBe(true);
  });

  it("un rempart disparaît quand il est pris ou quand il n'est plus en lisière", () => {
    const game = makeGame(Race.Aldoria);
    spawn(game);
    run(game, RAMPART_INTERVAL + 1);
    const p = me(game);
    const map = game.map;
    const before = p.marks;

    const [taken] = markedTiles(game, p.id);
    game.conquer(taken as number, 0);
    expect(map.hasMark(taken as number)).toBe(false);
    expect(p.marks).toBe(before - 1);

    // Un rempart dont tous les voisins deviennent siens passe à l'intérieur.
    const inner = markedTiles(game, p.id).find((t) =>
      map.neighbors(t).every((n) => map.isPassableLand(n)),
    ) as number;
    for (const n of map.neighbors(inner)) game.conquer(n, p.id);
    expect(map.hasMark(inner)).toBe(false);
    expect(p.marks).toBe(markedTiles(game, p.id).length);
  });

  it("pertes et progression ralenties (RAMPART_*), sans cumul avec une tour", () => {
    const game = makeGame(Race.Aldoria, { bots: 1 });
    spawn(game);
    const defender = me(game);
    const attacker = game.player(2);
    if (!attacker) throw new Error("tribu introuvable");
    const base = {
      kind: TerrainKind.Plain,
      attacker,
      defender,
      attackTroops: 5000,
      borderSize: 10,
      parjure: false,
      landTiles: game.map.numLandTiles,
    };
    const open = attackLogic({ ...base, towerCover: false, rampart: false });
    const walled = attackLogic({ ...base, towerCover: false, rampart: true });
    expect(walled.attackerLoss).toBeCloseTo(open.attackerLoss * RAMPART_LOSS_MULT);
    expect(walled.tickFraction).toBeCloseTo(open.tickFraction * RAMPART_COST_MULT);
    const tower = attackLogic({ ...base, towerCover: true, rampart: false });
    const both = attackLogic({ ...base, towerCover: true, rampart: true });
    expect(both).toEqual(tower);
  });
});

describe("Bosquets (Sylvanor)", () => {
  const nearForest = (game: Game) => (t: number) => {
    const map = game.map;
    let forest = 0;
    let plain = 0;
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const kind = map.kind(map.ref(map.x(t) + dx, map.y(t) + dy));
        if (kind === TerrainKind.Forest) forest++;
        if (kind === TerrainKind.Plain) plain++;
      }
    }
    return forest > 5 && plain > 10;
  };

  it("les plaines sylvaines proches d'une forêt se boisent en un balayage", () => {
    const game = makeGame(Race.Sylvanor);
    spawn(game, freeSpawnTile(game, nearForest(game)));
    const p = me(game);
    run(game, 201);
    const groves = markedTiles(game, p.id);
    expect(groves.length).toBeGreaterThan(0);
    expect(p.marks).toBe(groves.length);
    for (const t of groves) expect(game.map.kind(t)).toBe(TerrainKind.Plain);
  });

  it("aucun bosquet chez les autres peuples, et la prise efface la marque", () => {
    const other = makeGame(Race.Kharag);
    spawn(other, freeSpawnTile(other, nearForest(other)));
    run(other, 201);
    expect(markedTiles(other, me(other).id)).toEqual([]);

    const game = makeGame(Race.Sylvanor);
    spawn(game, freeSpawnTile(game, nearForest(game)));
    run(game, 201);
    const p = me(game);
    const [grove] = markedTiles(game, p.id);
    const before = p.marks;
    game.conquer(grove as number, 0);
    expect(game.map.hasMark(grove as number)).toBe(false);
    expect(p.marks).toBe(before - 1);
  });
});

describe("Charniers", () => {
  it("expire exactement après CHARNIER_TICKS, et une nouvelle bataille le ravive", () => {
    const game = makeGame(Race.Morvane);
    const center = spawn(game);
    const t = game.map.ref(game.map.x(center) + 20, game.map.y(center));
    game.markCharnier(t, 400);
    expect(game.map.hasCharnier(t)).toBe(true);
    expect(game.charnierDead(t)).toBe(400);
    run(game, CHARNIER_TICKS / 2);
    game.markCharnier(t, 900);
    run(game, CHARNIER_TICKS);
    expect(game.map.hasCharnier(t)).toBe(true);
    run(game, 1);
    expect(game.map.hasCharnier(t)).toBe(false);
    expect(game.charnierDead(t)).toBe(0);
  });

  it("aucun charnier sur des terres libres conquises", () => {
    const game = makeGame(Race.Kharag);
    spawn(game);
    step(game, [{ type: "attack", target: 0, troops: 10_000 }]);
    run(game, 60);
    let charniers = 0;
    for (let t = 0; t < game.map.size; t++) if (game.map.hasCharnier(t)) charniers++;
    expect(charniers).toBe(0);
    expect(me(game).pillaged).toBe(0);
  });
});

describe("Pillage (Kharag) et levée (Morvane)", () => {
  /** Bataille contre une tribu sur un anneau de terres ; renvoie les tuiles prises. */
  function battle(race: Race, prepare?: (game: Game, ring: number[]) => void) {
    const game = makeGame(race, { bots: 1 });
    const center = spawn(game);
    const bot = game.player(2);
    if (!bot) throw new Error("tribu introuvable");
    const ring = ringForBot(game, center, bot.id);
    bot.troops = 1000;
    prepare?.(game, ring);
    step(game, [{ type: "attack", target: bot.id, troops: 20_000 }]);
    run(game, 30);
    const taken = ring.filter((t) => game.map.owner(t) === me(game).id);
    expect(taken.length).toBeGreaterThan(5);
    return { game, taken, p: me(game) };
  }

  it("Kharag pille chaque terre prise à une tribu, et la tuile devient un charnier", () => {
    const { game, taken, p } = battle(Race.Kharag);
    expect(p.pillaged).toBe(taken.length * Math.floor(15 * PILLAGE_TRIBE_RATIO));
    for (const t of taken) expect(game.map.hasCharnier(t)).toBe(true);
  });

  it("Kharag ne pille pas une terre déjà ravagée", () => {
    const { p } = battle(Race.Kharag, (game, ring) => {
      for (const t of ring) game.markCharnier(t, 100);
    });
    expect(p.pillaged).toBe(0);
  });

  it("Morvane relève une part des morts d'un charnier, et rien sur une terre neuve", () => {
    const raise = RACES[Race.Morvane].modifiers.charnierRaise;
    const fresh = battle(Race.Morvane);
    expect(fresh.p.raised).toBe(0);
    const { p, taken } = battle(Race.Morvane, (game, ring) => {
      for (const t of ring) game.markCharnier(t, 1000);
    });
    expect(p.raised).toBe(taken.length * Math.floor(1000 * raise));
    expect(p.pillaged).toBe(0);
  });
});

describe("Déterminisme des mécaniques de race", () => {
  it("quatre peuples, mêmes tours ⇒ mêmes hashes, et l'invariant des marques tient", () => {
    const humans = [Race.Aldoria, Race.Kharag, Race.Morvane, Race.Sylvanor].map((race, i) => ({
      clientId: `j${i}`,
      name: `Seigneur ${i}`,
      race,
    }));
    /** Une tuile du seigneur `id` : cible d'une attaque (par barge s'il n'y a pas de frontière). */
    const tileOf = (game: Game, id: number): number | undefined => {
      for (let t = 0; t < game.map.size; t++) if (game.map.owner(t) === id) return t;
      return undefined;
    };
    // Expansion sur les terres libres, puis guerres entre peuples (chacun attaque le suivant)
    // assez tôt pour que des charniers expirent avant la fin (au rythme du §6 : régénération lente).
    const play = (): { hashes: number[]; game: Game } => {
      const game = new Game({ seed: 77, mapSize: "small", bots: 30, humans, singleplayer: false });
      const hashes: number[] = [];
      for (let turn = 0; turn < 3000; turn++) {
        const intents: { clientId: string; intent: Intent }[] = [];
        if (turn > 200 && turn < 800 && turn % 50 === 0) {
          for (const h of humans) {
            intents.push({
              clientId: h.clientId,
              intent: { type: "attack", target: 0, troops: 5000 },
            });
          }
        } else if (turn >= 800 && turn < 2400 && turn % 100 === 0) {
          humans.forEach((h, i) => {
            const me = game.playerByClient(h.clientId);
            const foe = game.playerByClient((humans[(i + 1) % humans.length] as typeof h).clientId);
            if (!me || !foe || !me.alive || !foe.alive) return;
            const troops = Math.floor(me.troops * 0.6);
            intents.push({
              clientId: h.clientId,
              intent: { type: "attack", target: foe.id, troops, tile: tileOf(game, foe.id) },
            });
          });
        }
        const result = game.executeTurn({ turn, intents });
        if (result.hash !== null) hashes.push(result.hash);
      }
      return { hashes, game };
    };
    const a = play();
    const b = play();
    expect(a.hashes).toEqual(b.hashes);
    for (const h of humans) {
      const p = a.game.playerByClient(h.clientId);
      if (p) expect(p.marks).toBe(markedTiles(a.game, p.id).length);
    }
    // Garde-fou de couverture : les guerres ont bien fait tourner charniers, levée et remparts.
    const lord = (race: Race) =>
      a.game.playerByClient(humans.find((h) => h.race === race)?.clientId ?? "");
    expect(lord(Race.Morvane)?.raised).toBeGreaterThan(0);
    expect(lord(Race.Aldoria)?.marks).toBeGreaterThan(0);
  });
});
