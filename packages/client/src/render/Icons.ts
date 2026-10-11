import { tokenRgb } from "@legionwar/design-system";
import { BuildingKind } from "@legionwar/engine";
import { type RGB, rgbCss } from "./colors";

/**
 * Icônes plates des bâtiments, comme les structures d'OpenFront : une forme à la couleur du
 * maître (cercle, carré, hexagone, octogone : on reconnaît le type de loin), cernée d'encre,
 * et un pictogramme simple dessiné dans une boîte de 24 × 24.
 */
type Shape = "circle" | "square" | "hexagon" | "octagon";

interface IconSpec {
  shape: Shape;
  /** Tracé SVG du pictogramme (boîte 24 × 24). */
  glyph: string;
  /** Pictogramme plein (sinon tracé au trait). */
  filled: boolean;
}

const ICONS: Record<BuildingKind, IconSpec> = {
  // Maison : toit et porte.
  [BuildingKind.Bourg]: {
    shape: "circle",
    glyph: "M12 4L20.5 11.5H18V20H6V11.5H3.5ZM10.25 20V15.5H13.75V20Z",
    filled: true,
  },
  // Tour crénelée.
  [BuildingKind.Tour]: {
    shape: "square",
    glyph:
      "M6 4H8.75V6.25H10.6V4H13.4V6.25H15.25V4H18V9.5L16.5 11V20H7.5V11L6 9.5ZM10.5 20V16.5A1.5 1.5 0 0 1 13.5 16.5V20Z",
    filled: true,
  },
  // Ancre.
  [BuildingKind.Port]: {
    shape: "hexagon",
    glyph:
      "M12 3.5A2 2 0 1 1 12 7.5A2 2 0 1 1 12 3.5ZM12 7.5V20M8 10.5H16M4.5 14Q5 20 12 20Q19 20 19.5 14",
    filled: false,
  },
  // Balance du marchand.
  [BuildingKind.Marche]: {
    shape: "octagon",
    glyph:
      "M12 4V19.5M8 19.5H16M5 7H19M5 7L2.5 13M5 7L7.5 13M19 7L16.5 13M19 7L21.5 13M2.5 13Q5 16 7.5 13M16.5 13Q19 16 21.5 13",
    filled: false,
  },
};

const INK = tokenRgb("map.ink");
const LIGHT = tokenRgb("heraldry.argent");
const DARK = tokenRgb("heraldry.sable");

const shapes = new Map<Shape, Path2D>();
const glyphs = new Map<BuildingKind, Path2D>();

/** Forme dans la boîte −1..1. */
function shapePath(shape: Shape): Path2D {
  let path = shapes.get(shape);
  if (path) return path;
  path = new Path2D();
  if (shape === "circle") {
    path.arc(0, 0, 1, 0, Math.PI * 2);
  } else if (shape === "square") {
    path.rect(-0.88, -0.88, 1.76, 1.76);
  } else {
    const n = shape === "hexagon" ? 6 : 8;
    const offset = shape === "hexagon" ? 0 : Math.PI / 8;
    for (let i = 0; i < n; i++) {
      const a = offset + (i * 2 * Math.PI) / n;
      if (i === 0) path.moveTo(Math.cos(a), Math.sin(a));
      else path.lineTo(Math.cos(a), Math.sin(a));
    }
    path.closePath();
  }
  shapes.set(shape, path);
  return path;
}

function glyphPath(kind: BuildingKind): Path2D {
  let path = glyphs.get(kind);
  if (!path) {
    path = new Path2D(ICONS[kind].glyph);
    glyphs.set(kind, path);
  }
  return path;
}

/** Pictogramme clair sur une couleur sombre, sombre sur une couleur claire. */
export function glyphColorFor(color: RGB): RGB {
  const lum = (0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2]) / 255;
  return lum > 0.6 ? DARK : LIGHT;
}

/**
 * Dessine l'icône d'un bâtiment centrée en (x, y), de diamètre `size` (unités du contexte).
 * Un chantier est translucide.
 */
export function drawBuildingIcon(
  ctx: CanvasRenderingContext2D,
  kind: BuildingKind,
  x: number,
  y: number,
  size: number,
  color: RGB,
  done = true,
): void {
  const spec = ICONS[kind];
  const r = size / 2;
  ctx.save();
  ctx.globalAlpha = done ? 1 : 0.5;
  ctx.translate(x, y);
  ctx.scale(r, r);
  const shape = shapePath(spec.shape);
  ctx.fillStyle = rgbCss(color);
  ctx.fill(shape);
  ctx.lineWidth = 0.14;
  ctx.lineJoin = "round";
  ctx.strokeStyle = rgbCss(INK);
  ctx.stroke(shape);
  // Pictogramme : boîte 24 × 24 ramenée à 1,2 de large, centrée.
  ctx.scale(1.2 / 24, 1.2 / 24);
  ctx.translate(-12, -12);
  const glyph = glyphPath(kind);
  const ink = rgbCss(glyphColorFor(color));
  if (spec.filled) {
    ctx.fillStyle = ink;
    ctx.fill(glyph, "evenodd");
  } else {
    ctx.strokeStyle = ink;
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.stroke(glyph);
  }
  ctx.restore();
}

const MINE = tokenRgb("map.mine");
/** Pioche, dans la boîte 24 × 24 : fer courbe et manche. */
let pickaxe: Path2D | null = null;

/**
 * Mine d'or : disque d'or cerné d'encre, marqué d'une pioche à l'encre (sans légende, l'icône
 * dit ce qu'elle est). Centrée en (x, y), de diamètre `size`.
 */
export function drawMineIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
): void {
  const r = size / 2;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(r, r);
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, Math.PI * 2);
  ctx.fillStyle = rgbCss(MINE);
  ctx.fill();
  ctx.lineWidth = 0.14;
  ctx.strokeStyle = rgbCss(INK);
  ctx.stroke();
  ctx.scale(1.25 / 24, 1.25 / 24);
  ctx.translate(-12, -12);
  pickaxe ??= new Path2D("M3.5 9.5Q12 2 20.5 9.5M12 5.8V21");
  ctx.lineWidth = 2.6;
  ctx.lineCap = "round";
  ctx.stroke(pickaxe);
  ctx.restore();
}

const urls = new Map<BuildingKind, string>();

/** Icône du bâtiment en SVG (panneau du bas, menu radial) : forme à l'encre, pictogramme clair. */
export function buildingIconUrl(kind: BuildingKind): string {
  const cached = urls.get(kind);
  if (cached) return cached;
  const spec = ICONS[kind];
  const fill = rgbCss(INK);
  const light = rgbCss(LIGHT);
  let shape: string;
  if (spec.shape === "circle") {
    shape = `<circle cx="12" cy="12" r="11" fill="${fill}"/>`;
  } else if (spec.shape === "square") {
    shape = `<rect x="2" y="2" width="20" height="20" fill="${fill}"/>`;
  } else {
    const n = spec.shape === "hexagon" ? 6 : 8;
    const offset = spec.shape === "hexagon" ? 0 : Math.PI / 8;
    const points = Array.from({ length: n }, (_, i) => {
      const a = offset + (i * 2 * Math.PI) / n;
      return `${(12 + 11 * Math.cos(a)).toFixed(2)},${(12 + 11 * Math.sin(a)).toFixed(2)}`;
    }).join(" ");
    shape = `<polygon points="${points}" fill="${fill}"/>`;
  }
  const glyph = spec.filled
    ? `<path d="${spec.glyph}" fill="${light}" fill-rule="evenodd"/>`
    : `<path d="${spec.glyph}" fill="none" stroke="${light}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${shape}<g transform="translate(4.8 4.8) scale(0.6)">${glyph}</g></svg>`;
  const url = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  urls.set(kind, url);
  return url;
}
