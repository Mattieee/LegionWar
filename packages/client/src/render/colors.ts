import {
  LAND_BIT,
  LOW_MASK,
  OCEAN_BIT,
  SHORE_BIT,
  TerrainKind,
  VARIANT_SHIFT,
  terrainKindOf,
} from "@legionwar/engine";

export type RGB = readonly [number, number, number];

export const DEEP_WATER: RGB = [24, 46, 70];

function hslToRgb(h: number, s: number, l: number): RGB {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): number => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}

/** Couleur stable et bien répartie par joueur ; les tribus sont plus ternes. */
export function playerColor(id: number, isBot: boolean): RGB {
  const hue = (id * 137.508) % 360;
  return isBot ? hslToRgb(hue, 0.3, 0.42) : hslToRgb(hue, 0.75, 0.52);
}

const LAND_COLORS: Record<number, RGB> = {
  [TerrainKind.Plain]: [150, 166, 92],
  [TerrainKind.Forest]: [70, 104, 52],
  [TerrainKind.Hills]: [164, 140, 92],
  [TerrainKind.Mountain]: [138, 130, 120],
  [TerrainKind.Impassable]: [228, 230, 236],
};
const SAND: RGB = [200, 182, 128];
const SHALLOW: RGB = [70, 122, 152];
const LAKE: RGB = [78, 136, 160];

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Couleur d'une tuile non possédée, d'après son octet de terrain. */
export function terrainColor(byte: number): RGB {
  if ((byte & LAND_BIT) === 0) {
    const depth = byte & LOW_MASK;
    if ((byte & OCEAN_BIT) === 0) return mix(LAKE, DEEP_WATER, Math.min(depth, 10) / 20);
    return mix(SHALLOW, DEEP_WATER, Math.min(depth, 16) / 16);
  }
  const kind = terrainKindOf(byte);
  const variant = (byte >> VARIANT_SHIFT) & 0x3;
  const base =
    kind === TerrainKind.Plain && (byte & SHORE_BIT) !== 0 ? SAND : (LAND_COLORS[kind] ?? SAND);
  const shade = 1 + (variant - 1.5) * 0.035;
  return [base[0] * shade, base[1] * shade, base[2] * shade];
}

export function rgbCss(c: RGB, alpha = 1): string {
  return `rgba(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])}, ${alpha})`;
}
