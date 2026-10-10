import { describe, expect, it } from "vitest";
import {
  CROWN_LOSS_MULT,
  CROWN_PERCENT,
  Game,
  Race,
  TerrainKind,
  TIME_LIMIT_TICKS,
  TWILIGHT_START_TICKS,
  WIN_PERCENT,
  attackLogic,
  winPercentAt,
  type GameConfig,
  type GameEvent,
  type Intent,
  type TickResult,
} from "@legionwar/engine";

type Lord = NonNullable<ReturnType<Game["player"]>>;

const A = "alpha";
const B = "beta";

/** Deux seigneurs humains en partie multijoueur, déployés au hasard. */
function twoLords(overrides: Partial<GameConfig> = {}) {
  const game = new Game({
    seed: 4242,
    mapSize: "small",
    bots: 0,
    humans: [
      { clientId: A, name: "Alpha", race: Race.Aldoria },
      { clientId: B, name: "Bêta", race: Race.Kharag },
    ],
    singleplayer: false,
    ...overrides,
  });
  const a = game.playerByClient(A);
  const b = game.playerByClient(B);
  if (!a || !b) throw new Error("joueurs introuvables");
  while (game.inSpawnPhase) play(game);
  return { game, a, b };
}

function play(game: Game, intents: { clientId: string; intent: Intent }[] = []): TickResult {
  return game.executeTurn({ turn: game.ticks, intents });
}

function run(game: Game, ticks: number): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < ticks; i++) events.push(...play(game).events);
  return events;
}

/** Donne à `to` des tuiles prises à `from` (ou aux terres libres) jusqu'à `percent` % des terres. */
function grow(game: Game, toId: number, percent: number, fromId = 0): void {
  const target = Math.ceil((game.map.numLandTiles * percent) / 100);
  const to = game.player(toId);
  for (let t = 0; t < game.map.size && to && to.tiles < target; t++) {
    if (game.map.isPassableLand(t) && game.map.owner(t) === fromId) game.conquer(t, toId);
  }
}

/** Fait comme si la guerre durait depuis `ticks` (l'horloge du Crépuscule part de la fin du déploiement). */
function warFor(game: Game, ticks: number): void {
  game.warStartTick = game.ticks - ticks;
}

describe("Crépuscule (GDD §14)", () => {
  it("le seuil reste à 80 % jusqu'à 21 min, puis perd 3 points par minute", () => {
    expect(winPercentAt(0)).toBe(WIN_PERCENT);
    expect(winPercentAt(TWILIGHT_START_TICKS + 599)).toBe(80);
    expect(winPercentAt(TWILIGHT_START_TICKS + 600)).toBe(77);
    expect(winPercentAt(18_000)).toBe(50);
    expect(winPercentAt(21_000)).toBe(35);
  });

  it("annonce le Crépuscule une seule fois, à 20 min de guerre", () => {
    const { game } = twoLords();
    warFor(game, TWILIGHT_START_TICKS - 5);
    const events = run(game, 10).filter((e) => e.type === "twilight");
    expect(events).toHaveLength(1);
    expect(play(game).winPercent).toBe(80);
  });

  it("à 30 min, 60 % des terres suffisent ; avant le Crépuscule, non", () => {
    const { game, a } = twoLords();
    grow(game, a.id, 60);
    run(game, 20);
    expect(game.winner).toBeNull();
    warFor(game, 18_000);
    const events = run(game, 20);
    expect(game.winner).toBe(a.id);
    expect(events).toContainEqual({ type: "win", player: a.id, reason: "twilight" });
  });

  it("deux alliés ne gagnent pas ensemble : seul le plus grand l'emporte quand le seuil passe sous sa part", () => {
    const { game, a, b } = twoLords();
    grow(game, a.id, 45);
    grow(game, b.id, 40);
    play(game, [{ clientId: A, intent: { type: "allianceRequest", target: b.id } }]);
    play(game, [{ clientId: B, intent: { type: "allianceRequest", target: a.id } }]);
    warFor(game, 18_000); // seuil 50 % : ni l'un ni l'autre, et leurs terres ne s'additionnent pas
    run(game, 20);
    expect(game.winner).toBeNull();
    warFor(game, 20_400); // seuil 80 − 3 × 14 = 38 %
    run(game, 20);
    expect(game.winner).toBe(a.id);
  });

  it("à 35 min, le plus grand royaume l'emporte même sous le seuil", () => {
    const { game, a, b } = twoLords();
    grow(game, a.id, 20);
    grow(game, b.id, 25);
    warFor(game, TIME_LIMIT_TICKS - 30);
    run(game, 20);
    expect(game.winner).toBeNull();
    const events = run(game, 20);
    expect(game.winner).toBe(b.id);
    expect(events).toContainEqual({ type: "win", player: b.id, reason: "timeLimit" });
  });
});

describe("Anti-boule de neige (GDD §6)", () => {
  const input = (game: Game, attacker: Lord, defender: Lord, crowned: boolean) => ({
    kind: TerrainKind.Plain,
    attacker,
    defender,
    attackTroops: 50_000,
    borderSize: 20,
    towerCover: false,
    rampart: false,
    parjure: false,
    landTiles: game.map.numLandTiles,
    crowned,
  });

  it("poids de la Couronne : son porteur perd 50 % de troupes en plus contre un royaume", () => {
    const { game, a, b } = twoLords();
    const plain = attackLogic(input(game, a, b, false));
    const crowned = attackLogic(input(game, a, b, true));
    expect(crowned.attackerLoss).toBeCloseTo(plain.attackerLoss * CROWN_LOSS_MULT);
    // La progression n'est pas ralentie : seul le prix du sang change.
    expect(crowned.tickFraction).toBeCloseTo(plain.tickFraction);
  });

  it("une tribu n'y est pas soumise et ne le fait pas payer", () => {
    const { game, a } = twoLords({ bots: 3 });
    const tribe = game.player(3);
    if (!tribe || tribe.kind !== "bot") throw new Error("tribu introuvable");
    const plain = attackLogic(input(game, a, tribe, false));
    expect(attackLogic(input(game, a, tribe, true)).attackerLoss).toBeCloseTo(plain.attackerLoss);
  });

  it("le porteur est figé au début du tick : le plus grand royaume au-delà de 35 %", () => {
    const { game, a, b } = twoLords();
    grow(game, a.id, CROWN_PERCENT + 5);
    grow(game, b.id, 10);
    play(game);
    expect(game.crownId).toBe(a.id);
    // Il la perd dès qu'il repasse sous le seuil, au tick suivant.
    for (let t = 0; t < game.map.size && a.tiles * 100 >= game.map.numLandTiles * 30; t++) {
      if (game.map.owner(t) === a.id) game.conquer(t, 0);
    }
    play(game);
    expect(game.crownId).toBe(0);
  });

  it("le porteur ne change pas au milieu d'un tick, même si un royaume franchit le seuil pendant ses combats", () => {
    const { game, a } = twoLords();
    const land = game.map.numLandTiles;
    const need = Math.ceil((land * CROWN_PERCENT) / 100);
    // Juste sous le seuil, avec des terres libres à prendre tout de suite.
    for (let t = 0; t < game.map.size && a.tiles < need - 5; t++) {
      if (game.map.isPassableLand(t) && game.map.owner(t) === 0) game.conquer(t, a.id);
    }
    a.troops = 2_000_000;
    let crossed: TickResult | null = null;
    for (let i = 0; i < 50 && crossed === null; i++) {
      const before = a.tiles;
      const intents: { clientId: string; intent: Intent }[] =
        i === 0 ? [{ clientId: A, intent: { type: "attack", target: 0, troops: 1_500_000 } }] : [];
      const result = play(game, intents);
      if (before * 100 < land * CROWN_PERCENT && a.tiles * 100 >= land * CROWN_PERCENT) {
        crossed = result;
      }
    }
    // Le tick où il franchit le seuil, la Couronne reste celle du début du tick : personne.
    expect(crossed).not.toBeNull();
    expect(crossed?.crown).toBe(0);
    expect(play(game).crown).toBe(a.id);
  });

  it("un grand empire n'attaque plus à moindre coût (le bonus « grand territoire » ne joue qu'en défense)", () => {
    const { game, a, b } = twoLords();
    const land = game.map.numLandTiles;
    b.tiles = Math.floor(land * 0.6);
    a.tiles = 100;
    const small = attackLogic(input(game, a, b, false));
    a.tiles = Math.floor(land * 0.6);
    const huge = attackLogic(input(game, a, b, false));
    expect(huge.attackerLoss).toBeCloseTo(small.attackerLoss);
    expect(huge.tickFraction).toBeCloseTo(small.tickFraction);
  });
});
