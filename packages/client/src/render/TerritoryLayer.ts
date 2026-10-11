import {
  type Hatching,
  TINCTURE_HATCHING,
  hatchHit,
  raceTincture,
  tokenRgb,
  tokens,
} from "@legionwar/design-system";
import { CHARNIER_BIT, MARK_BIT, OWNER_MASK, Race } from "@legionwar/engine";
import { type RGB, terrainColor } from "./colors";

const FILL = tokens.map.territoryFill;
const BORDER_SHADE = tokens.map.borderShade;
const HATCH = tokens.map.hatching;
const INK = tokenRgb("map.ink");
const ALLY = tokenRgb("map.ally");

/** Marques des mécaniques de race (remparts, bosquets, charniers, terres mortes). */
const MARKS = {
  rampartInk: tokenRgb("map.marks.rampartInk"),
  rampartStone: tokenRgb("map.marks.rampartStone"),
  grove: tokenRgb("map.marks.grove"),
  groveStrength: tokens.map.marks.groveStrength,
  ash: tokenRgb("map.marks.ash"),
  ashStrength: tokens.map.marks.ashStrength,
  bone: tokenRgb("map.marks.bone"),
  ember: tokenRgb("map.marks.ember"),
  deadland: tokenRgb("map.marks.deadland"),
  deadlandStrength: tokens.map.marks.deadlandStrength,
};

/** Luminance de la teinte des terres mortes : la teinte garde la clarté du papier. */
const DEADLAND_LUM = 0.3 * MARKS.deadland[0] + 0.59 * MARKS.deadland[1] + 0.11 * MARKS.deadland[2];

/** Bruit stable par tuile, pour semer arbres, ossements et braises (rendu seulement). */
function speckle(t: number): number {
  let h = Math.imul(t ^ 0x27d4eb2d, 0x165667b1);
  h ^= h >>> 15;
  return (h >>> 0) % 97;
}

/**
 * Image de la carte (1 pixel par tuile), en aplats comme OpenFront : terrain uni, royaumes
 * teintés de leur couleur, frontière de leur couleur assombrie.
 * Mise à jour incrémentale : seules les tuiles modifiées et leurs voisines sont repeintes, puis
 * seul le rectangle modifié est renvoyé au canvas.
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
    private readonly raceOf: (owner: number) => Race | null,
    /** Vrai si a et b sont alliés et que l'un des deux est le joueur local (liseré allié). */
    private readonly alliedWithMe: (a: number, b: number) => boolean,
    /** Hachures héraldiques sur les territoires des seigneurs (aide aux daltoniens). */
    private readonly hatching = false,
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
    const h = this.height;
    for (let i = 0; i < packed.length; i += 2) {
      const t = packed[i] as number;
      this.state[t] = packed[i + 1] as number;
      const x = t % w;
      const y = (t - x) / w;
      // Rayon 1 : une tuile devient frontière selon ses voisines directes.
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        const span = 1 - Math.abs(dy);
        for (let dx = -span; dx <= span; dx++) {
          const nx = x + dx;
          if (nx >= 0 && nx < w) this.touch(ny * w + nx, nx, ny);
        }
      }
    }
  }

  /**
   * Repeint toutes les tuiles des royaumes donnés (alliance conclue ou rompue : leurs
   * frontières changent d'allure). Rare, donc un parcours complet suffit.
   */
  repaintOwners(owners: ReadonlySet<number>): void {
    if (owners.size === 0) return;
    for (let t = 0; t < this.width * this.height; t++) {
      if (owners.has(this.owner(t))) this.paint(t);
    }
    this.minX = 0;
    this.minY = 0;
    this.maxX = this.width - 1;
    this.maxY = this.height - 1;
  }

  /** Vrai si un voisin direct appartient à un allié (du joueur local) du propriétaire. */
  private allyAcross(t: number, owner: number): boolean {
    const w = this.width;
    const x = t % w;
    const check = (n: number): boolean => {
      const other = this.owner(n);
      return other !== owner && other !== 0 && this.alliedWithMe(owner, other);
    };
    return (
      (t >= w && check(t - w)) ||
      (t + w < w * this.height && check(t + w)) ||
      (x > 0 && check(t - 1)) ||
      (x < w - 1 && check(t + 1))
    );
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

  /** Vrai si une voisine directe appartient à un autre propriétaire (tuile de frontière). */
  private isBorder(t: number, owner: number): boolean {
    const w = this.width;
    const x = t % w;
    return (
      (t >= w && this.owner(t - w) !== owner) ||
      (t + w < w * this.height && this.owner(t + w) !== owner) ||
      (x > 0 && this.owner(t - 1) !== owner) ||
      (x < w - 1 && this.owner(t + 1) !== owner)
    );
  }

  private paint(t: number): void {
    const data = this.image.data;
    const i = t * 4;
    const b = t * 3;
    const state = this.state[t] as number;
    const owner = state & OWNER_MASK;
    let r = this.base[b] as number;
    let g = this.base[b + 1] as number;
    let bl = this.base[b + 2] as number;
    let out: RGB;
    if (owner === 0) {
      out = [r, g, bl];
    } else {
      const c = this.colorOf(owner);
      const race = this.raceOf(owner);
      const marked = (state & MARK_BIT) !== 0;
      if (race === Race.Morvane) {
        // Terres mortes : le papier perd sa couleur et vire au violacé.
        const lum = 0.3 * r + 0.59 * g + 0.11 * bl;
        const k = MARKS.deadlandStrength;
        r = lerp(r, Math.min(255, (lum * MARKS.deadland[0]) / DEADLAND_LUM), k);
        g = lerp(g, Math.min(255, (lum * MARKS.deadland[1]) / DEADLAND_LUM), k);
        bl = lerp(bl, Math.min(255, (lum * MARKS.deadland[2]) / DEADLAND_LUM), k);
      } else if (marked && race === Race.Sylvanor) {
        // Bosquet : le terrain prend la teinte du feuillage.
        r = lerp(r, MARKS.grove[0], MARKS.groveStrength);
        g = lerp(g, MARKS.grove[1], MARKS.groveStrength);
        bl = lerp(bl, MARKS.grove[2], MARKS.groveStrength);
      }
      const border = mixRgb(c, INK, BORDER_SHADE);
      if (this.isBorder(t, owner)) {
        if (this.allyAcross(t, owner)) {
          // Frontière alliée : liseré vert en pointillé, alterné avec l'encre du royaume.
          const x = t % this.width;
          const y = (t - x) / this.width;
          out = (x + y) % 2 === 0 ? ALLY : border;
        } else if (marked && race === Race.Aldoria) {
          // Rempart : créneaux, encre et pierre en alternance, la pierre teintée du blason.
          const x = t % this.width;
          const y = (t - x) / this.width;
          out = (x + y) % 2 === 0 ? MARKS.rampartInk : mixRgb(MARKS.rampartStone, c, 0.3);
        } else {
          out = border;
        }
      } else {
        // Aplat : la couleur du royaume posée sur le terrain.
        out = mixRgb([r, g, bl], c, FILL);
        const motif = this.hatching && race !== null ? hatchingOf(race) : "plain";
        if (motif !== "plain") {
          const x = t % this.width;
          if (hatchHit(motif, x, (t - x) / this.width, HATCH.spacing)) {
            out = mixRgb(out, border, HATCH.strength);
          }
        }
      }
      if ((state & CHARNIER_BIT) !== 0) out = this.charnier(t, out, race);
    }
    data[i] = out[0];
    data[i + 1] = out[1];
    data[i + 2] = out[2];
    data[i + 3] = 255;
  }

  /** Charnier : cendre et ossements épars ; braises quand les Clans de Kharag tiennent la terre. */
  private charnier(t: number, color: RGB, race: Race | null): RGB {
    const s = speckle(t);
    if (race === Race.Kharag && s < 14) return MARKS.ember;
    if (s > 88) return mixRgb(color, MARKS.bone, 0.6);
    return mixRgb(color, MARKS.ash, MARKS.ashStrength);
  }
}

/** Motif héraldique de l'émail d'un peuple. */
function hatchingOf(race: Race): Hatching {
  return TINCTURE_HATCHING[raceTincture(race)];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function mixRgb(a: RGB, b: RGB, t: number): RGB {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}
