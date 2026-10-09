import { tokenRgb, tokens } from "@legionwar/design-system";
import { OWNER_MASK } from "@legionwar/engine";
import { type RGB, terrainColor } from "./colors";

const WASH_INTERIOR = tokens.map.washInterior;
const WASH_EDGE = tokens.map.washEdge;
const BORDER_INK = tokens.map.borderInk;
const INK = tokenRgb("map.ink");

/**
 * Image de la carte (1 pixel par tuile), rendue comme un atlas : papier, lavis d'aquarelle
 * plus soutenu près des bords (l'eau du pinceau « bave » vers la frontière), frontière à l'encre.
 * Mise à jour incrémentale : seules les tuiles modifiées et leur voisinage (rayon 2) sont
 * repeintes, puis seul le rectangle modifié est renvoyé au canvas.
 */
export class TerritoryLayer {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly image: ImageData;
  private readonly base: Float32Array;
  private minX = Infinity;
  private minY = Infinity;
  private maxX = -1;
  private maxY = -1;

  constructor(
    readonly width: number,
    readonly height: number,
    terrain: Uint8Array,
    readonly state: Uint16Array,
    private readonly colorOf: (owner: number) => RGB,
  ) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = width;
    this.canvas.height = height;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D indisponible");
    this.ctx = ctx;
    this.image = ctx.createImageData(width, height);
    this.base = new Float32Array(width * height * 3);
    for (let t = 0; t < width * height; t++) {
      const c = terrainColor(terrain[t] as number, t);
      this.base[t * 3] = c[0];
      this.base[t * 3 + 1] = c[1];
      this.base[t * 3 + 2] = c[2];
    }
    for (let t = 0; t < width * height; t++) this.paint(t);
    this.ctx.putImageData(this.image, 0, 0);
  }

  owner(t: number): number {
    return (this.state[t] as number) & OWNER_MASK;
  }

  /** Applique des paires [tuile, état] reçues de la simulation. */
  applyChanges(packed: Uint32Array): void {
    const w = this.width;
    const h = this.height;
    for (let i = 0; i < packed.length; i += 2) {
      const t = packed[i] as number;
      this.state[t] = packed[i + 1] as number;
      const x = t % w;
      const y = (t - x) / w;
      // Rayon 2 : le lavis de bord dépend des tuiles à distance 2.
      for (let dy = -2; dy <= 2; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        const span = 2 - Math.abs(dy);
        for (let dx = -span; dx <= span; dx++) {
          const nx = x + dx;
          if (nx >= 0 && nx < w) this.touch(ny * w + nx, nx, ny);
        }
      }
    }
  }

  flush(): void {
    if (this.maxX < 0) return;
    this.ctx.putImageData(
      this.image,
      0,
      0,
      this.minX,
      this.minY,
      this.maxX - this.minX + 1,
      this.maxY - this.minY + 1,
    );
    this.minX = this.minY = Infinity;
    this.maxX = this.maxY = -1;
  }

  private touch(t: number, x: number, y: number): void {
    this.paint(t);
    if (x < this.minX) this.minX = x;
    if (y < this.minY) this.minY = y;
    if (x > this.maxX) this.maxX = x;
    if (y > this.maxY) this.maxY = y;
  }

  /** Vrai si une tuile à distance de Manhattan ≤ `radius` appartient à un autre propriétaire. */
  private differsWithin(t: number, owner: number, radius: 1 | 2): boolean {
    const w = this.width;
    const x = t % w;
    const y = (t - x) / w;
    for (let dy = -radius; dy <= radius; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny >= this.height) continue;
      const span = radius - Math.abs(dy);
      for (let dx = -span; dx <= span; dx++) {
        const nx = x + dx;
        if ((dx !== 0 || dy !== 0) && nx >= 0 && nx < w && this.owner(ny * w + nx) !== owner) {
          return true;
        }
      }
    }
    return false;
  }

  private paint(t: number): void {
    const data = this.image.data;
    const i = t * 4;
    const b = t * 3;
    const owner = this.owner(t);
    const r = this.base[b] as number;
    const g = this.base[b + 1] as number;
    const bl = this.base[b + 2] as number;
    if (owner === 0) {
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = bl;
    } else {
      const c = this.colorOf(owner);
      if (this.differsWithin(t, owner, 1)) {
        // Frontière : trait d'encre teinté de la couleur du royaume.
        data[i] = c[0] * (1 - BORDER_INK) + INK[0] * BORDER_INK;
        data[i + 1] = c[1] * (1 - BORDER_INK) + INK[1] * BORDER_INK;
        data[i + 2] = c[2] * (1 - BORDER_INK) + INK[2] * BORDER_INK;
      } else {
        // Lavis : multiplication papier × pigment, plus dense près du bord.
        const a = this.differsWithin(t, owner, 2) ? WASH_EDGE : WASH_INTERIOR;
        data[i] = r * (1 - a + (a * c[0]) / 255);
        data[i + 1] = g * (1 - a + (a * c[1]) / 255);
        data[i + 2] = bl * (1 - a + (a * c[2]) / 255);
      }
    }
    data[i + 3] = 255;
  }
}
