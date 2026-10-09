import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ALL_RACES } from "@legionwar/engine";
import {
  contrastRatio,
  flatten,
  generateTokensCss,
  raceColor,
  raceTincture,
  resolveValue,
  TINCTURES,
  token,
  tokens,
} from "@legionwar/design-system";

const read = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

const color = (path: string): string => {
  const value = token(path);
  if (typeof value !== "string") throw new Error(`${path} n'est pas une couleur`);
  return value;
};

describe("tokens", () => {
  it("tokens.css est à jour (sinon : npm run tokens)", () => {
    expect(read("../src/css/tokens.css")).toBe(generateTokensCss());
  });

  it("tous les alias se résolvent", () => {
    for (const [path, value] of flatten()) {
      expect(() => resolveValue(value), path.join(".")).not.toThrow();
    }
  });

  it("chaque race du moteur porte un émail héraldique", () => {
    for (const race of ALL_RACES) {
      expect(TINCTURES).toContain(raceTincture(race));
      expect(raceColor(race)).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("chaque émail se distingue du papier (≥ 3:1), sauf l'argent qui est cerné de sable", () => {
    for (const t of TINCTURES.filter((t) => t !== "argent" && t !== "or")) {
      expect(contrastRatio(tokens.heraldry[t], color("bg.surface")), t).toBeGreaterThanOrEqual(3);
    }
  });

  it("composants et styles du jeu n'utilisent pas de couleur primitive", () => {
    for (const file of [
      "../src/css/base.css",
      "../src/css/components.css",
      "../../client/src/styles.css",
    ]) {
      expect(read(file), file).not.toMatch(/--lw-color-/);
      expect(read(file), file).not.toMatch(/#[0-9a-f]{3,6}\b/i);
    }
  });
});

describe("accessibilité (WCAG 2.1 AA)", () => {
  // Le texte courant est posé sur le papier (cartouches) ; la table (bg.app) n'en reçoit jamais.
  const surfaces = ["bg.surface", "bg.raised", "bg.inset", "bg.hover"];

  it("le texte inversé est lisible sur la table (≥ 4,5:1)", () => {
    expect(contrastRatio(color("text.inverse"), color("bg.app"))).toBeGreaterThanOrEqual(4.5);
  });

  it("les étiquettes de la carte sont lisibles sur le papier et sur un lavis", () => {
    for (const label of ["map.label", "map.labelSelf"]) {
      for (const bg of ["map.terrain.plain", "map.terrain.mountain", "map.labelHalo"]) {
        expect(contrastRatio(color(label), color(bg)), `${label} / ${bg}`).toBeGreaterThanOrEqual(
          4.5,
        );
      }
    }
  });

  it.each([
    "text.primary",
    "text.secondary",
    "text.accent",
    "text.danger",
    "text.success",
    "text.info",
  ])("%s est lisible (≥ 4,5:1) sur toutes les surfaces", (text) => {
    for (const surface of surfaces) {
      expect(
        contrastRatio(color(text), color(surface)),
        `${text} / ${surface}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(["primary", "secondary", "danger"])("le texte des boutons %s est lisible", (variant) => {
    const text = color(`action.${variant}.text`);
    for (const bg of [`action.${variant}.bg`, `action.${variant}.bgHover`]) {
      expect(contrastRatio(text, color(bg)), bg).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("l'anneau de focus et les bordures se distinguent du fond (≥ 3:1)", () => {
    for (const path of ["focus.ring", "border.default", "feedback.danger", "feedback.success"]) {
      expect(contrastRatio(color(path), color("bg.surface")), path).toBeGreaterThanOrEqual(3);
    }
  });
});
