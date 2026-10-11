import { hexToRgb, hslToRgb, rgbToHsl, type RGB } from "./color";
import { token } from "./resolve";
import { tokens } from "./tokens";

export { tokens, type Tokens } from "./tokens";
export { token, cssVarName, flatten, generateTokensCss, resolveValue } from "./resolve";
export {
  contrastRatio,
  hexToRgb,
  hslToRgb,
  relativeLuminance,
  rgbCss,
  rgbToHsl,
  type RGB,
} from "./color";

/** Couleur d'un token (résolue) au format RGB, pour le rendu Canvas. */
export function tokenRgb(path: string): RGB {
  const value = token(path);
  if (typeof value !== "string") throw new Error(`Le token ${path} n'est pas une couleur`);
  return hexToRgb(value);
}

export type RaceId = keyof typeof tokens.race;

/** Émail héraldique d'une race (couleur hexadécimale résolue). */
export function raceColor(race: RaceId): string {
  return String(token(`race.${race}`));
}

export type Tincture = keyof typeof tokens.heraldry;

/** Les huit émaux, dans l'ordre d'attribution des armoiries. */
export const TINCTURES = Object.keys(tokens.heraldry) as Tincture[];

/** Émail d'une race (ex. "azure"), pour les classes CSS `.lw-tincture-*`. */
export function raceTincture(race: RaceId): Tincture {
  const match = /^\{heraldry\.(\w+)\}$/.exec(tokens.race[race]);
  if (!match || !TINCTURES.includes(match[1] as Tincture)) {
    throw new Error(`La race ${race} doit pointer vers un émail héraldique`);
  }
  return match[1] as Tincture;
}

/**
 * Couleur de territoire d'un seigneur ou d'un prétendant : il porte les armoiries de son peuple.
 * `rank` = son rang (0, 1, 2…) parmi les seigneurs de ce peuple, par identifiant croissant ; au-delà
 * des déclinaisons prévues, on les reprend dans l'ordre.
 */
export function lordColor(race: RaceId, rank: number): RGB {
  const [hue, saturation] = rgbToHsl(hexToRgb(raceColor(race)));
  const variants = Object.values(tokens.map.lordVariants);
  const variant = variants[((rank % variants.length) + variants.length) % variants.length];
  const { minSaturation, lightness } = tokens.map.lord;
  return hslToRgb(
    (hue + (variant?.hue ?? 0) + 360) % 360,
    Math.max(saturation, minSaturation),
    lightness + (variant?.lightness ?? 0),
  );
}

/**
 * Couleur d'une tribu sauvage : teintes réparties par l'angle d'or (137,5°) pour que deux
 * tribus voisines diffèrent, mais très sourdes, pour ne jamais passer pour un seigneur.
 */
export function tribeColor(id: number): RGB {
  const { saturation, lightness } = tokens.map.tribe;
  return hslToRgb((id * 137.508) % 360, saturation, lightness);
}

/** Motifs héraldiques des émaux (convention de Petra Sancta, 1638). */
export type Hatching =
  "plain" | "dots" | "vertical" | "horizontal" | "bend" | "bendSinister" | "cross" | "bendCross";

export const TINCTURE_HATCHING: Record<Tincture, Hatching> = {
  or: "dots",
  argent: "plain",
  gules: "vertical",
  azure: "horizontal",
  vert: "bend",
  purpure: "bendSinister",
  sable: "cross",
  tenne: "bendCross",
};

/** Vrai si la tuile (x, y) porte un trait du motif, tracé toutes les `spacing` tuiles. */
export function hatchHit(hatching: Hatching, x: number, y: number, spacing: number): boolean {
  const on = (v: number): boolean => ((v % spacing) + spacing) % spacing === 0;
  switch (hatching) {
    case "plain":
      return false;
    case "dots":
      return on(x) && on(y);
    case "vertical":
      return on(x);
    case "horizontal":
      return on(y);
    case "bend":
      return on(x - y);
    case "bendSinister":
      return on(x + y);
    case "cross":
      return on(x) || on(y);
    case "bendCross":
      return on(x - y) || on(x + y);
  }
}
