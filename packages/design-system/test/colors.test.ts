import { describe, expect, it } from "vitest";
import { ALL_RACES, Race } from "@legionwar/engine";
import {
  TINCTURE_HATCHING,
  hatchHit,
  hexToRgb,
  lordColor,
  raceColor,
  raceTincture,
  rgbToHsl,
  tokenRgb,
  tokens,
  tribeColor,
  type RGB,
} from "@legionwar/design-system";

const TERRAINS = ["plain", "coast", "forest", "hills", "mountain"].map((k) =>
  tokenRgb(`map.terrain.${k}`),
);
const FILL = tokens.map.territoryFill;

const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const distance = (a: RGB, b: RGB): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/** Écart de teinte sur le cercle, en degrés (0 à 180). */
const hueGap = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};
/** Plus petit écart entre un territoire de cette couleur et le terrain nu. */
const terrainGap = (color: RGB): number =>
  Math.min(...TERRAINS.map((t) => distance(mix(t, color, FILL), t)));

const RANKS = Object.keys(tokens.map.lordVariants).length;

describe("couleurs des joueurs", () => {
  it.each(ALL_RACES)("un seigneur de %s porte la teinte de l'émail de son peuple", (race) => {
    const [raceHue] = rgbToHsl(hexToRgb(raceColor(race)));
    for (let rank = 0; rank < RANKS; rank++) {
      const [hue] = rgbToHsl(lordColor(race, rank));
      expect(hueGap(hue, raceHue), `${race} rang ${rank}`).toBeLessThanOrEqual(25);
    }
  });

  it("un seigneur Kharag est rouge, jamais vert", () => {
    for (let rank = 0; rank < RANKS; rank++) {
      const [hue] = rgbToHsl(lordColor(Race.Kharag, rank));
      expect(hueGap(hue, 0), `rang ${rank}`).toBeLessThanOrEqual(25);
    }
  });

  it("deux seigneurs d'un même peuple se distinguent", () => {
    for (const race of ALL_RACES) {
      for (let a = 0; a < RANKS; a++) {
        for (let b = a + 1; b < RANKS; b++) {
          expect(
            distance(lordColor(race, a), lordColor(race, b)),
            `${race} ${a}/${b}`,
          ).toBeGreaterThanOrEqual(20);
        }
      }
    }
  });

  it("les seigneurs de peuples différents ne se confondent pas", () => {
    for (const a of ALL_RACES) {
      for (const b of ALL_RACES) {
        if (a >= b) continue;
        for (let ra = 0; ra < RANKS; ra++) {
          for (let rb = 0; rb < RANKS; rb++) {
            const [ha] = rgbToHsl(lordColor(a, ra));
            const [hb] = rgbToHsl(lordColor(b, rb));
            expect(hueGap(ha, hb), `${a} ${ra} / ${b} ${rb}`).toBeGreaterThanOrEqual(25);
          }
        }
      }
    }
  });

  it("les tribus sont nettement plus sourdes que les seigneurs", () => {
    const lordSaturation = Math.min(
      ...ALL_RACES.flatMap((race) =>
        Array.from({ length: RANKS }, (_, r) => rgbToHsl(lordColor(race, r))[1]),
      ),
    );
    for (let id = 1; id < 300; id++) {
      const [, saturation] = rgbToHsl(tribeColor(id));
      expect(saturation, `tribu ${id}`).toBeLessThanOrEqual(lordSaturation / 2);
    }
  });

  it("chaque territoire se détache du terrain (seigneurs et tribus)", () => {
    for (const race of ALL_RACES) {
      for (let rank = 0; rank < RANKS; rank++) {
        expect(terrainGap(lordColor(race, rank)), `${race} ${rank}`).toBeGreaterThanOrEqual(35);
      }
    }
    for (let id = 1; id < 300; id++) {
      expect(terrainGap(tribeColor(id)), `tribu ${id}`).toBeGreaterThanOrEqual(30);
    }
  });
});

describe("hachures héraldiques (daltoniens)", () => {
  it("chaque peuple a un motif, et quatre motifs différents", () => {
    const motifs = ALL_RACES.map((race) => TINCTURE_HATCHING[raceTincture(race)]);
    expect(motifs).not.toContain("plain");
    expect(new Set(motifs).size).toBe(ALL_RACES.length);
  });

  it("gueules en traits verticaux, azur en traits horizontaux (Petra Sancta)", () => {
    const s = tokens.map.hatching.spacing;
    expect(hatchHit("vertical", 0, 3, s)).toBe(true);
    expect(hatchHit("vertical", 1, 0, s)).toBe(false);
    expect(hatchHit("horizontal", 3, 0, s)).toBe(true);
    expect(hatchHit("horizontal", 0, 1, s)).toBe(false);
    expect(hatchHit("bend", 2, 2, s)).toBe(true);
    expect(hatchHit("bendSinister", 3, 1, s)).toBe(true);
    // Coordonnées négatives (bend : x − y) traitées comme les autres.
    expect(hatchHit("bend", 0, s, s)).toBe(true);
  });
});
