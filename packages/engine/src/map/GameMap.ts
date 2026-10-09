import {
  BLIGHT_BIT,
  LAND_BIT,
  LOW_MASK,
  OCEAN_BIT,
  OWNER_MASK,
  SHORE_BIT,
  TerrainKind,
  VARIANT_SHIFT,
  terrainKindOf,
} from "./Terrain";

/** Grille de tuiles. Une tuile est un entier `ref = y * width + x` (origine en haut à gauche). */
export class GameMap {
  readonly size: number;
  readonly state: Uint16Array;
  readonly numLandTiles: number;

  constructor(
    readonly width: number,
    readonly height: number,
    readonly terrain: Uint8Array,
  ) {
    this.size = width * height;
    if (terrain.length !== this.size) {
      throw new Error(`Terrain invalide : ${terrain.length} octets pour ${this.size} tuiles`);
    }
    this.state = new Uint16Array(this.size);
    let land = 0;
    for (let t = 0; t < this.size; t++) if (this.isPassableLand(t)) land++;
    this.numLandTiles = land;
  }

  ref(x: number, y: number): number {
    return y * this.width + x;
  }

  x(ref: number): number {
    return ref % this.width;
  }

  y(ref: number): number {
    return Math.floor(ref / this.width);
  }

  isValidRef(ref: number): boolean {
    return Number.isInteger(ref) && ref >= 0 && ref < this.size;
  }

  isLand(t: number): boolean {
    return ((this.terrain[t] as number) & LAND_BIT) !== 0;
  }

  isWater(t: number): boolean {
    return !this.isLand(t);
  }

  isShore(t: number): boolean {
    return ((this.terrain[t] as number) & SHORE_BIT) !== 0;
  }

  isOcean(t: number): boolean {
    return ((this.terrain[t] as number) & OCEAN_BIT) !== 0;
  }

  kind(t: number): TerrainKind {
    return terrainKindOf(this.terrain[t] as number);
  }

  /** Terre conquérable (ni eau, ni pics infranchissables). */
  isPassableLand(t: number): boolean {
    const byte = this.terrain[t] as number;
    return (byte & LAND_BIT) !== 0 && terrainKindOf(byte) !== TerrainKind.Impassable;
  }

  variant(t: number): number {
    return ((this.terrain[t] as number) >> VARIANT_SHIFT) & 0x3;
  }

  waterDepth(t: number): number {
    return (this.terrain[t] as number) & LOW_MASK;
  }

  owner(t: number): number {
    return (this.state[t] as number) & OWNER_MASK;
  }

  setOwner(t: number, owner: number): void {
    this.state[t] = ((this.state[t] as number) & ~OWNER_MASK) | (owner & OWNER_MASK);
  }

  hasBlight(t: number): boolean {
    return ((this.state[t] as number) & BLIGHT_BIT) !== 0;
  }

  setBlight(t: number, blight: boolean): void {
    const s = this.state[t] as number;
    this.state[t] = blight ? s | BLIGHT_BIT : s & ~BLIGHT_BIT;
  }

  /** Voisins orthogonaux (N, S, O, E) dans les limites de la carte. */
  neighbors(t: number): number[] {
    const out: number[] = [];
    const x = t % this.width;
    if (t >= this.width) out.push(t - this.width);
    if (t + this.width < this.size) out.push(t + this.width);
    if (x > 0) out.push(t - 1);
    if (x < this.width - 1) out.push(t + 1);
    return out;
  }

  manhattan(a: number, b: number): number {
    return Math.abs(this.x(a) - this.x(b)) + Math.abs(this.y(a) - this.y(b));
  }

  euclidSq(a: number, b: number): number {
    const dx = this.x(a) - this.x(b);
    const dy = this.y(a) - this.y(b);
    return dx * dx + dy * dy;
  }
}
