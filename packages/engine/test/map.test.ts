import { describe, expect, it } from "vitest";
import { MAP_DIMENSIONS, TerrainKind, generateMap } from "@legionwar/engine";

describe("generateMap", () => {
  it("est déterministe", () => {
    const a = generateMap(1234, "small");
    const b = generateMap(1234, "small");
    expect(a.map.terrain).toEqual(b.map.terrain);
    expect(a.mines).toEqual(b.mines);
  });

  it("varie avec la graine", () => {
    const a = generateMap(1, "small");
    const b = generateMap(2, "small");
    expect(a.map.terrain).not.toEqual(b.map.terrain);
  });

  it("respecte les dimensions et une part de terre plausible", () => {
    const { map } = generateMap(99, "medium");
    expect(map.width).toBe(MAP_DIMENSIONS.medium.width);
    expect(map.height).toBe(MAP_DIMENSIONS.medium.height);
    const landShare = map.numLandTiles / map.size;
    expect(landShare).toBeGreaterThan(0.3);
    expect(landShare).toBeLessThan(0.6);
  });

  it("entoure la carte d'eau et place des mines sur la terre", () => {
    const { map, mines } = generateMap(5, "small");
    for (let x = 0; x < map.width; x++) {
      expect(map.isWater(map.ref(x, 0))).toBe(true);
      expect(map.isWater(map.ref(x, map.height - 1))).toBe(true);
    }
    expect(mines.length).toBeGreaterThanOrEqual(4);
    for (const m of mines) {
      expect([TerrainKind.Plain, TerrainKind.Hills]).toContain(map.kind(m));
    }
  });

  it("contient tous les types de terrain", () => {
    const { map } = generateMap(2026, "medium");
    const kinds = new Set<TerrainKind>();
    for (let t = 0; t < map.size; t++) kinds.add(map.kind(t));
    for (const k of [
      TerrainKind.Plain,
      TerrainKind.Forest,
      TerrainKind.Hills,
      TerrainKind.Mountain,
      TerrainKind.Water,
    ]) {
      expect(kinds.has(k)).toBe(true);
    }
  });
});
