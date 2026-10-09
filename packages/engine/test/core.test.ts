import { describe, expect, it } from "vitest";
import { DetMath, PseudoRandom, simpleHash } from "@legionwar/engine";

describe("PseudoRandom", () => {
  it("produit la même suite pour la même graine", () => {
    const a = new PseudoRandom(42);
    const b = new PseudoRandom(42);
    for (let i = 0; i < 1000; i++) expect(a.nextUint32()).toBe(b.nextUint32());
  });

  it("produit des suites différentes pour des graines différentes", () => {
    const a = new PseudoRandom(1);
    const b = new PseudoRandom(2);
    const same = Array.from({ length: 50 }, () => a.nextUint32() === b.nextUint32());
    expect(same.every(Boolean)).toBe(false);
  });

  it("respecte les bornes de nextInt (max exclu)", () => {
    const rng = new PseudoRandom(7);
    for (let i = 0; i < 5000; i++) {
      const v = rng.nextInt(3, 9);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThan(9);
      expect(Number.isInteger(v)).toBe(true);
    }
  });
});

describe("DetMath", () => {
  const close = (actual: number, expected: number): void => {
    expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.abs(expected) * 1e-12 + 1e-300);
  };

  it("exp est précis", () => {
    for (const x of [-700, -20, -1, -1e-8, 0, 1e-8, 0.5, 1, 2.5, 10, 300, 700]) {
      close(DetMath.exp(x), Math.exp(x));
    }
  });

  it("log est précis", () => {
    for (const x of [1e-300, 1e-5, 0.1, 0.5, 1, 1.41, 2, 10, 12345.678, 1e100]) {
      close(DetMath.log(x), Math.log(x));
    }
  });

  it("pow couvre les cas du jeu", () => {
    for (const [x, y] of [
      [25_000, 0.73],
      [10_000, 0.6],
      [1, 0.6],
      [0.5, 2.5],
      [12_000, 2.5],
    ] as const) {
      close(DetMath.pow(x, y), Math.pow(x, y));
    }
    expect(DetMath.pow(0, 0.6)).toBe(0);
    expect(DetMath.pow(5, 0)).toBe(1);
  });
});

describe("simpleHash", () => {
  it("est stable", () => {
    expect(simpleHash("LegionWar")).toBe(simpleHash("LegionWar"));
    expect(simpleHash("a")).not.toBe(simpleHash("b"));
  });
});
