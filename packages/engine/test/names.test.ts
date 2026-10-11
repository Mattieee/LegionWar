import { describe, expect, it } from "vitest";
import { ALL_RACES } from "@legionwar/engine";
import { PseudoRandom } from "../src/core/PseudoRandom";
import { nationName, tribeName } from "../src/game/Names";

/** Familles de mots qu'un nom ne doit jamais répéter (vérification indépendante du code). */
const FAMILIES = [
  ["marais", "marecage", "tourbiere"],
  ["foret", "bois", "sylve", "ronce"],
  ["colline", "mont", "montagne"],
  ["val", "vallee", "gouffre"],
];
const ARTICLES = new Set(["des", "les", "aux", "une", "de", "du", "la", "le"]);

/** Racines des mots d'un nom : minuscules, sans accents ni pluriel, familles regroupées. */
function roots(name: string): string[] {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 3 && !ARTICLES.has(w))
    .map((w) => w.replace(/(s|x)$/, ""))
    .map((w) => {
      const family = FAMILIES.findIndex((f) => f.includes(w));
      return family >= 0 ? `famille ${family}` : w;
    });
}

function repeats(name: string): string | null {
  const seen = new Set<string>();
  for (const root of roots(name)) {
    if (seen.has(root)) return root;
    seen.add(root);
  }
  return null;
}

describe("noms des tribus et des prétendants", () => {
  it("aucun nom de tribu ne répète un mot clé (5 000 noms)", () => {
    const names: string[] = [];
    for (let seed = 1; names.length < 5000; seed++) {
      const rng = new PseudoRandom(seed);
      const used = new Set<string>();
      for (let i = 0; i < 40; i++) names.push(tribeName(rng, used));
    }
    const bad = names.filter((n) => repeats(n) !== null);
    expect(bad.slice(0, 5)).toEqual([]);
    expect(names.some((n) => n.startsWith("Trolls des marais"))).toBe(true);
  });

  it("aucun nom de prétendant ne répète un mot", () => {
    for (let seed = 1; seed < 200; seed++) {
      const rng = new PseudoRandom(seed);
      const used = new Set<string>();
      for (const race of ALL_RACES) {
        for (let i = 0; i < 3; i++) {
          const name = nationName(race, rng, used);
          expect(repeats(name), name).toBeNull();
        }
      }
    }
  });

  it("deux tirages par nom : la même graine donne les mêmes noms", () => {
    const draw = (): string[] => {
      const rng = new PseudoRandom(42);
      const used = new Set<string>();
      return Array.from({ length: 60 }, () => tribeName(rng, used));
    };
    expect(draw()).toEqual(draw());
  });
});
