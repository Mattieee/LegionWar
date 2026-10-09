import type { GameMap } from "@legionwar/engine";
import { SEA_SPRITES, type SeaSpriteId } from "./Sprites";

/** Ornement de haute mer, comme sur les cartes anciennes : rose des vents, monstres, navires. */
export interface SeaOrnament {
  sprite: SeaSpriteId;
  /** Centre, en tuiles. */
  x: number;
  y: number;
  /** Largeur, en tuiles. */
  size: number;
  /** Retourné horizontalement (les monstres ne nagent pas tous dans le même sens). */
  mirror: boolean;
}

/** Distance minimale à la côte (en tuiles) pour poser un ornement. */
const MIN_DEPTH = 9;
/** Pas d'échantillonnage des emplacements candidats. */
const STRIDE = 3;
/** Un ornement pour environ cette surface de haute mer (en tuiles). */
const OCEAN_PER_ORNAMENT = 30_000;
const MAX_ORNAMENTS = 8;

/**
 * Place les ornements au large, loin des côtes, sans chevauchement. Purement décoratif (rendu
 * client uniquement) mais stable : une même carte donne toujours le même décor.
 */
export function placeSeaOrnaments(map: GameMap): SeaOrnament[] {
  const candidates: { t: number; depth: number; order: number }[] = [];
  let ocean = 0;
  for (let y = 0; y < map.height; y += STRIDE) {
    for (let x = 0; x < map.width; x += STRIDE) {
      const t = map.ref(x, y);
      if (!map.isOcean(t)) continue;
      ocean += STRIDE * STRIDE;
      const depth = map.waterDepth(t);
      if (depth >= MIN_DEPTH) candidates.push({ t, depth, order: hash(t) });
    }
  }
  if (candidates.length === 0) return [];

  const placed: SeaOrnament[] = [];
  const fits = (x: number, y: number, radius: number): boolean =>
    placed.every((o) => Math.hypot(o.x - x, o.y - y) > (o.size / 2 + radius) * 1.15);
  const place = (sprite: SeaSpriteId, t: number, depth: number, scale: number): boolean => {
    const x = map.x(t) + 0.5;
    const y = map.y(t) + 0.5;
    // La gravure tient dans le disque de haute mer autour du point.
    const size = Math.min(depth, 26) * scale;
    if (!fits(x, y, size / 2)) return false;
    placed.push({ sprite, x, y, size, mirror: (hash(t + 1) & 1) === 1 });
    return true;
  };

  // La rose des vents au point le plus au large.
  const deepest = candidates.reduce((a, b) => (b.depth > a.depth ? b : a));
  place("compass", deepest.t, deepest.depth, 1.8);

  // Puis monstres et navires, dans un ordre pseudo-aléatoire propre à la carte.
  const count = Math.min(MAX_ORNAMENTS, Math.max(2, Math.round(ocean / OCEAN_PER_ORNAMENT)));
  candidates.sort((a, b) => a.order - b.order);
  let next = hash(candidates.length * 7919 + ocean) % SEA_SPRITES.length;
  for (const c of candidates) {
    if (placed.length > count) break;
    const kind = SEA_SPRITES[next % SEA_SPRITES.length] as SeaSpriteId;
    if (place(kind, c.t, c.depth, 1.6)) next++;
  }
  return placed;
}

/** Mélange entier (xorshift-multiply) : ordre stable et bien réparti. */
function hash(n: number): number {
  let h = (n ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
