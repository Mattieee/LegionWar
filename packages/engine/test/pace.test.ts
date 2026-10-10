import { describe, expect, it } from "vitest";
import {
  EXPANSION_PACE,
  Game,
  REGEN_PACE,
  Race,
  TerrainKind,
  attackLogic,
  maxTroops,
  troopIncrease,
} from "@legionwar/engine";

/** Un seigneur déployé sur une petite carte sans tribus. */
function lord(race: Race) {
  const game = new Game({
    seed: 2026,
    mapSize: "small",
    bots: 0,
    humans: [{ clientId: "j", name: "Testeur", race }],
    singleplayer: true,
  });
  const map = game.map;
  let spawn = -1;
  for (let t = 0; t < map.size && spawn < 0; t++) {
    if (map.isPassableLand(t) && map.x(t) > 10 && map.y(t) > 10) spawn = t;
  }
  game.executeTurn({
    turn: 0,
    intents: [{ clientId: "j", intent: { type: "spawn", tile: spawn } }],
  });
  const p = game.playerByClient("j");
  if (!p) throw new Error("joueur introuvable");
  return { game, p };
}

describe("Rythme (GDD §6)", () => {
  it("l'expansion sur les terres libres est ralentie par EXPANSION_PACE", () => {
    const { game, p } = lord(Race.Aldoria);
    const result = attackLogic({
      kind: TerrainKind.Plain,
      attacker: p,
      defender: null,
      attackTroops: 5000,
      borderSize: 10,
      towerCover: false,
      rampart: false,
      parjure: false,
      landTiles: game.map.numLandTiles,
    });
    // Formule du genre : clamp(2000 × coût / troupes, 5, 100) / (2 × front), coût plaine = 16,5.
    const genre = Math.min(100, Math.max(5, (2000 * 16.5) / 5000)) / (2 * 10);
    expect(result.tickFraction).toBeCloseTo(genre / EXPANSION_PACE);
  });

  it("la régénération des troupes suit REGEN_PACE", () => {
    const { p } = lord(Race.Aldoria);
    p.troops = 40_000;
    const max = maxTroops(p);
    const genre = (10 + Math.pow(p.troops, 0.73) / 4) * (1 - p.troops / max);
    // DetMath.pow et Math.pow diffèrent au dernier chiffre, et le moteur arrondit à l'entier.
    expect(Math.abs(troopIncrease(p) - genre * REGEN_PACE)).toBeLessThanOrEqual(1);
  });
});
