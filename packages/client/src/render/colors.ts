import { rgbCss, tokenRgb, type RGB } from "@legionwar/design-system";
import {
  LAND_BIT,
  LOW_MASK,
  OCEAN_BIT,
  SHORE_BIT,
  TerrainKind,
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

export const TABLE: RGB = tokenRgb("map.table");

const LAND_COLORS: Record<number, RGB> = {
  [TerrainKind.Plain]: TERRAIN.plain,
  [TerrainKind.Forest]: TERRAIN.forest,
  [TerrainKind.Hills]: TERRAIN.hills,
  [TerrainKind.Mountain]: TERRAIN.mountain,
  [TerrainKind.Impassable]: TERRAIN.peaks,
};

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/**
 * Couleur d'une tuile non possédée, d'après son octet de terrain : aplats comme OpenFront, la
 * mer seule s'assombrit vers le large.
 */
export function terrainColor(byte: number): RGB {
  if ((byte & LAND_BIT) === 0) {
    const depth = byte & LOW_MASK;
    const isOcean = (byte & OCEAN_BIT) !== 0;
    return isOcean ? mix(TERRAIN.sea, TERRAIN.seaDeep, Math.min(depth, 20) / 20) : TERRAIN.lake;
  }
  const kind = terrainKindOf(byte);
  if (kind === TerrainKind.Plain && (byte & SHORE_BIT) !== 0) return TERRAIN.coast;
  return LAND_COLORS[kind] ?? TERRAIN.plain;
}
