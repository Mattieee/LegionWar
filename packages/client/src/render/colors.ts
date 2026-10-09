import {
  playerColor as dsPlayerColor,
  rgbCss,
  tokenRgb,
  tokens,
  type RGB,
} from "@legionwar/design-system";
import {
  LAND_BIT,
  LOW_MASK,
  OCEAN_BIT,
  SHORE_BIT,
  TerrainKind,
  VARIANT_SHIFT,
  terrainKindOf,
} from "@legionwar/engine";

export { rgbCss, type RGB };

/** Couleurs du terrain, issues des tokens `map.terrain.*` du design system. */
const TERRAIN = {
  plain: tokenRgb("map.terrain.plain"),
  coast: tokenRgb("map.terrain.coast"),
  forest: tokenRgb("map.terrain.forest"),
  hills: tokenRgb("map.terrain.hills"),
  mountain: tokenRgb("map.terrain.mountain"),
  peaks: tokenRgb("map.terrain.peaks"),
  sea: tokenRgb("map.terrain.sea"),
  seaDeep: tokenRgb("map.terrain.seaDeep"),
  lake: tokenRgb("map.terrain.lake"),
};
const COAST_LINE = tokenRgb("map.coastLine");
const COAST_STRENGTH = tokens.map.coastLineStrength;

/**
 * Hachures côtières des cartes gravées : des lignes d'encre suivent la côte à distances
 * croissantes et s'estompent vers le large. Clé = profondeur (distance à la côte en tuiles).
 */
const COAST_RIPPLES: Record<number, number> = { 1: 1.6, 3: 1, 5: 0.65, 8: 0.35 };

export const TABLE: RGB = tokenRgb("map.table");

const LAND_COLORS: Record<number, RGB> = {
  [TerrainKind.Plain]: TERRAIN.plain,
  [TerrainKind.Forest]: TERRAIN.forest,
  [TerrainKind.Hills]: TERRAIN.hills,
  [TerrainKind.Mountain]: TERRAIN.mountain,
  [TerrainKind.Impassable]: TERRAIN.peaks,
};

export function playerColor(id: number, isBot: boolean): RGB {
  return dsPlayerColor(id, isBot);
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Grain du papier : bruit stable par tuile (purement visuel, hors simulation). */
function grain(tile: number): number {
  let h = Math.imul(tile ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return ((h >>> 0) / 4294967296 - 0.5) * 0.06;
}

/** Couleur d'une tuile non possédée, d'après son octet de terrain. */
export function terrainColor(byte: number, tile: number): RGB {
  let color: RGB;
  if ((byte & LAND_BIT) === 0) {
    const depth = byte & LOW_MASK;
    const isOcean = (byte & OCEAN_BIT) !== 0;
    color = isOcean ? mix(TERRAIN.sea, TERRAIN.seaDeep, Math.min(depth, 20) / 20) : TERRAIN.lake;
    const ripple = COAST_RIPPLES[depth];
    if (ripple !== undefined) color = mix(color, COAST_LINE, Math.min(1, COAST_STRENGTH * ripple));
  } else {
    const kind = terrainKindOf(byte);
    const variant = (byte >> VARIANT_SHIFT) & 0x3;
    const base =
      kind === TerrainKind.Plain && (byte & SHORE_BIT) !== 0
        ? TERRAIN.coast
        : (LAND_COLORS[kind] ?? TERRAIN.plain);
    const shade = 1 + (variant - 1.5) * 0.02;
    color = [base[0] * shade, base[1] * shade, base[2] * shade];
  }
  const g = 1 + grain(tile);
  return [color[0] * g, color[1] * g, color[2] * g];
}
