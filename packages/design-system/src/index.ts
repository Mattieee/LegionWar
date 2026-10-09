import { hexToRgb, hslToRgb, type RGB } from "./color";
import { token } from "./resolve";
import { tokens } from "./tokens";

export { tokens, type Tokens } from "./tokens";
export { token, cssVarName, flatten, generateTokensCss, resolveValue } from "./resolve";
export { contrastRatio, hexToRgb, hslToRgb, relativeLuminance, rgbCss, type RGB } from "./color";

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
 * Couleur stable d'un joueur : teintes réparties par l'angle d'or (137,5°) pour que deux
 * identifiants voisins soient bien distincts. Les tribus sauvages sont plus ternes.
 */
export function playerColor(id: number, isBot: boolean): RGB {
  const { saturation, lightness } = isBot ? tokens.map.playerBot : tokens.map.playerHuman;
  return hslToRgb((id * 137.508) % 360, saturation, lightness);
}
