/**
 * Gravures dessinées sur la carte (bâtiments, décor marin), chargées depuis /art.
 *
 * Une gravure de 256 à 384 px est souvent affichée à quelques pixels : réduite d'un coup,
 * elle scintille (le canvas n'a pas de mipmaps). On prépare donc une chaîne de réductions
 * successives par moitié, et l'on dessine le niveau juste supérieur à la taille voulue.
 */
export class Sprite {
  private levels: HTMLCanvasElement[] = [];

  constructor(src: string) {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => this.build(image);
    image.src = src;
  }

  get ready(): boolean {
    return this.levels.length > 0;
  }

  /** Rapport hauteur / largeur de la gravure (1 tant qu'elle n'est pas chargée). */
  get aspect(): number {
    const base = this.levels[0];
    return base ? base.height / base.width : 1;
  }

  /** Niveau le plus petit dont la largeur reste ≥ `pixels` (largeur affichée, pixels physiques). */
  pick(pixels: number): HTMLCanvasElement | null {
    let chosen: HTMLCanvasElement | null = null;
    for (const level of this.levels) {
      if (level.width < pixels && chosen) break;
      chosen = level;
    }
    return chosen;
  }

  private build(image: HTMLImageElement): void {
    const levels: HTMLCanvasElement[] = [];
    let width = image.naturalWidth;
    let height = image.naturalHeight;
    let source: CanvasImageSource = image;
    while (width >= 8 && height >= 8) {
      const level = document.createElement("canvas");
      level.width = width;
      level.height = height;
      const ctx = level.getContext("2d");
      if (!ctx) return;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(source, 0, 0, width, height);
      levels.push(level);
      source = level;
      width = Math.round(width / 2);
      height = Math.round(height / 2);
    }
    this.levels = levels;
  }
}

// Monstres et navires alternés, pour qu'une petite carte ait des deux.
export const SEA_SPRITES = ["serpent", "galleon", "kraken", "longship", "whale", "cog"] as const;
export type SeaSpriteId = (typeof SEA_SPRITES)[number] | "compass";

/** Chargement paresseux : les gravures ne sont demandées qu'à l'ouverture de la première partie. */
let cache: Map<string, Sprite> | null = null;

export function sprite(path: string): Sprite {
  cache ??= new Map();
  let s = cache.get(path);
  if (!s) {
    s = new Sprite(`/art/${path}.webp`);
    cache.set(path, s);
  }
  return s;
}
