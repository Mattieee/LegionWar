/**
 * Agrandissement ×2 « Scale2x » (EPX, Andrea Mazzoleni) : chaque case devient 2 × 2 sous-pixels ;
 * un coin prend la couleur de deux voisines qui s'y rejoignent, si elles sont égales. Les
 * frontières et les côtes en escalier deviennent des diagonales, sans flou ni couleur inventée.
 *
 * `src` : une couleur par case (largeur `w`, hauteur `h`) ; `dst` : image 2w × 2h. Seul le
 * rectangle de cases [x0, x1] × [y0, y1] (bornes incluses) est recalculé.
 */
export function scale2x(
  src: Uint32Array,
  w: number,
  h: number,
  dst: Uint32Array,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): void {
  const dw = w * 2;
  for (let y = Math.max(0, y0); y <= Math.min(h - 1, y1); y++) {
    for (let x = Math.max(0, x0); x <= Math.min(w - 1, x1); x++) {
      const t = y * w + x;
      const p = src[t] as number;
      // Hors carte, la voisine vaut la case elle-même.
      const a = y > 0 ? (src[t - w] as number) : p; // haut
      const b = x < w - 1 ? (src[t + 1] as number) : p; // droite
      const c = x > 0 ? (src[t - 1] as number) : p; // gauche
      const d = y < h - 1 ? (src[t + w] as number) : p; // bas
      const i = y * 2 * dw + x * 2;
      dst[i] = c === a && c !== d && a !== b ? a : p;
      dst[i + 1] = a === b && a !== c && b !== d ? b : p;
      dst[i + dw] = d === c && d !== b && c !== a ? c : p;
      dst[i + dw + 1] = b === d && b !== a && d !== c ? d : p;
    }
  }
}
