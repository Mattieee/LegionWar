import { OWNER_MASK } from "@legionwar/engine";

export interface Label {
  owner: number;
  /** Position en tuiles (centre de la tuile la plus proche du barycentre du territoire). */
  x: number;
  y: number;
  /** Racine carrée du nombre de tuiles : sert à dimensionner le texte. */
  size: number;
}

/**
 * Calcule l'emplacement des noms : barycentre de chaque territoire, ramené sur la tuile possédée
 * la plus proche (pour éviter qu'un nom flotte hors d'un territoire en croissant).
 */
export function computeLabels(state: Uint16Array, width: number, maxOwner: number): Label[] {
  const n = maxOwner + 1;
  const sumX = new Float64Array(n);
  const sumY = new Float64Array(n);
  const count = new Uint32Array(n);
  for (let t = 0; t < state.length; t++) {
    const o = (state[t] as number) & OWNER_MASK;
    if (o === 0 || o > maxOwner) continue;
    const x = t % width;
    sumX[o] = (sumX[o] as number) + x;
    sumY[o] = (sumY[o] as number) + (t - x) / width;
    count[o] = (count[o] as number) + 1;
  }
  const cx = new Float64Array(n);
  const cy = new Float64Array(n);
  for (let o = 1; o < n; o++) {
    const c = count[o] as number;
    if (c > 0) {
      cx[o] = (sumX[o] as number) / c;
      cy[o] = (sumY[o] as number) / c;
    }
  }
  const bestDist = new Float64Array(n).fill(Infinity);
  const bestTile = new Int32Array(n).fill(-1);
  for (let t = 0; t < state.length; t++) {
    const o = (state[t] as number) & OWNER_MASK;
    if (o === 0 || o > maxOwner) continue;
    const x = t % width;
    const y = (t - x) / width;
    const dx = x - (cx[o] as number);
    const dy = y - (cy[o] as number);
    const d = dx * dx + dy * dy;
    if (d < (bestDist[o] as number)) {
      bestDist[o] = d;
      bestTile[o] = t;
    }
  }
  const labels: Label[] = [];
  for (let o = 1; o < n; o++) {
    const t = bestTile[o] as number;
    if (t < 0) continue;
    labels.push({
      owner: o,
      x: t % width,
      y: Math.floor(t / width),
      size: Math.sqrt(count[o] as number),
    });
  }
  return labels;
}
