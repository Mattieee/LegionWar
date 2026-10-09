import { OWNER_MASK } from "@legionwar/engine";
import { type RGB, terrainColor } from "./colors";

const TERRITORY_BLEND = 0.55;
const BORDER_DARKEN = 0.62;

/**
 * Image de la carte (1 pixel par tuile) mise à jour de façon incrémentale :
 * seules les tuiles modifiées et leurs voisines sont repeintes, puis seul le rectangle
 * modifié est renvoyé au canvas.
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
      const c = terrainColor(terrain[t] as number);
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
    for (let i = 0; i < packed.length; i += 2) {
      const t = packed[i] as number;
      this.state[t] = packed[i + 1] as number;
      this.touch(t);
      if (t >= w) this.touch(t - w);
      if (t + w < this.state.length) this.touch(t + w);
      if (t % w > 0) this.touch(t - 1);
      if (t % w < w - 1) this.touch(t + 1);
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

  private touch(t: number): void {
    this.paint(t);
    const x = t % this.width;
    const y = (t - x) / this.width;
    if (x < this.minX) this.minX = x;
    if (y < this.minY) this.minY = y;
    if (x > this.maxX) this.maxX = x;
    if (y > this.maxY) this.maxY = y;
  }

  private isBorder(t: number, owner: number): boolean {
    const w = this.width;
    return (
      (t >= w && this.owner(t - w) !== owner) ||
      (t + w < this.state.length && this.owner(t + w) !== owner) ||
      (t % w > 0 && this.owner(t - 1) !== owner) ||
      (t % w < w - 1 && this.owner(t + 1) !== owner)
    );
  }

  private paint(t: number): void {
    const data = this.image.data;
    const i = t * 4;
    const b = t * 3;
    const owner = this.owner(t);
    if (owner === 0) {
      data[i] = this.base[b] as number;
      data[i + 1] = this.base[b + 1] as number;
      data[i + 2] = this.base[b + 2] as number;
    } else {
      const c = this.colorOf(owner);
      if (this.isBorder(t, owner)) {
        data[i] = c[0] * BORDER_DARKEN;
        data[i + 1] = c[1] * BORDER_DARKEN;
        data[i + 2] = c[2] * BORDER_DARKEN;
      } else {
        data[i] = (this.base[b] as number) * (1 - TERRITORY_BLEND) + c[0] * TERRITORY_BLEND;
        data[i + 1] = (this.base[b + 1] as number) * (1 - TERRITORY_BLEND) + c[1] * TERRITORY_BLEND;
        data[i + 2] = (this.base[b + 2] as number) * (1 - TERRITORY_BLEND) + c[2] * TERRITORY_BLEND;
      }
    }
    data[i + 3] = 255;
  }
}
