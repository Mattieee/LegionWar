import { raceColor, tokenRgb, tokens } from "@legionwar/design-system";
import {
  BuildingKind,
  RACES,
  STRUCTURE_MIN_DIST,
  TOWER_RANGE,
  type BuildingView,
  type PlayerView,
} from "@legionwar/engine";
import type { BattleFx } from "./BattleFx";
import type { Camera } from "./Camera";
import { TABLE, type RGB, rgbCss } from "./colors";
import type { Label } from "./Labels";
import type { SeaOrnament } from "./SeaDecor";
import { type Sprite, sprite } from "./Sprites";
import type { TerritoryLayer } from "./TerritoryLayer";
import { formatNumber } from "../ui/format";

/** Barge prête à dessiner : position interpolée en coordonnées monde (tuiles). */
export interface BoatSprite {
  owner: number;
  troops: number;
  landing: number;
  x: number;
  y: number;
}

export interface SceneState {
  players: ReadonlyMap<number, PlayerView>;
  buildings: readonly BuildingView[];
  boats: readonly BoatSprite[];
  mines: readonly number[];
  labels: readonly Label[];
  myId: number | null;
  hoverTile: number | null;
  buildMode: BuildingKind | null;
  /** Portée effective des tours du joueur local (bonus de race inclus). */
  towerRange: number;
  colorOf: (owner: number) => RGB;
  /** Tick courant (statut de Parjure) et porteur de la Couronne (≥ 35 % des terres). */
  tick: number;
  crown: number | null;
  /** Effets de bataille (étincelles, fronts) et instant de l'image, en ms. */
  battle: BattleFx;
  now: number;
}

/** Couleurs Canvas issues des tokens `map.*` et `heraldry.*` du design system. */
const PALETTE = {
  table: rgbCss(TABLE),
  paper: rgbCss(tokenRgb("map.terrain.plain")),
  mine: rgbCss(tokenRgb("map.mine")),
  ink: rgbCss(tokenRgb("map.ink")),
  inkSoft: rgbCss(tokenRgb("map.ink"), 0.55),
  hover: rgbCss(tokenRgb("map.hover"), 0.85),
  buildValid: rgbCss(tokenRgb("map.buildValid"), 0.9),
  buildInvalid: rgbCss(tokenRgb("map.buildInvalid"), 0.9),
  towerRange: rgbCss(tokenRgb("map.towerRange"), 0.85),
  label: rgbCss(tokenRgb("map.label")),
  labelSelf: rgbCss(tokenRgb("map.labelSelf")),
  labelHalo: rgbCss(tokenRgb("map.labelHalo"), 0.9),
  vignette: tokenRgb("map.vignette"),
  sheetShadow: rgbCss(tokenRgb("map.vignette"), 0.6),
  battleCapture: rgbCss(tokenRgb("map.battle.capture")),
  parjure: rgbCss(tokenRgb("map.parjure")),
  crown: rgbCss(tokenRgb("map.crown")),
  battleIncoming: rgbCss(tokenRgb("map.battle.incoming")),
  battleOutgoing: rgbCss(tokenRgb("map.battle.outgoing")),
  sable: rgbCss(tokenRgb("heraldry.sable")),
  argent: rgbCss(tokenRgb("heraldry.argent")),
};
const FONT_DISPLAY = tokens.font.family.display;
const FONT_FLAVOR = tokens.font.family.flavor;
/** Taille des noms sur la carte, en pixels CSS : discrets comme sur un atlas. */
const LABEL_MAX_PX = 17;
const LABEL_MIN_PX = 9;
/** Zoom (px par tuile) à partir duquel on voit aussi les fronts des autres seigneurs. */
const OTHER_FRONTS_MIN_ZOOM = 2.5;
/** Les seigneurs signent dans la police de leur peuple, dès que la taille la rend lisible. */
const RACE_LABEL_MIN_PX = 13;
/** Largeur des bâtiments gravés : 4,2 tuiles, et jamais moins de 16 px à l'écran. */
const BUILDING_TILES = 4.2;
const BUILDING_MIN_PX = 16;
/** Opacité des ornements marins : un décor de cartographe, en retrait du jeu. */
const ORNAMENT_ALPHA = 0.5;
/** En dessous de cette largeur à l'écran (px CSS), un ornement n'est plus qu'une tache. */
const ORNAMENT_MIN_PX = 28;

/** Dessine la carte, les mines, les bâtiments, l'aperçu de construction et les noms. */
export class SceneRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private vignette: CanvasGradient | null = null;

  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly camera: Camera,
    private readonly territory: TerritoryLayer,
    private readonly ornaments: readonly SeaOrnament[] = [],
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D indisponible");
    this.ctx = ctx;
  }

  resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);
    this.camera.resize(rect.width, rect.height);
    // Vignettage du papier : bords de l'écran assombris, calculé une fois par taille.
    const w = this.canvas.width;
    const h = this.canvas.height;
    const [r, g, b] = PALETTE.vignette;
    this.vignette = this.ctx.createRadialGradient(
      w / 2,
      h / 2,
      Math.min(w, h) * 0.35,
      w / 2,
      h / 2,
      Math.hypot(w, h) * 0.6,
    );
    this.vignette.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0)`);
    this.vignette.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0.38)`);
  }

  draw(state: SceneState): void {
    const ctx = this.ctx;
    const width = this.territory.width;
    this.territory.flush();

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PALETTE.table;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.camera.apply(ctx, this.dpr);
    // Ombre portée de la feuille sur la table.
    ctx.shadowColor = PALETTE.sheetShadow;
    ctx.shadowBlur = 18 * this.camera.zoom * this.dpr;
    ctx.fillStyle = PALETTE.paper;
    ctx.fillRect(0, 0, width, this.territory.height);
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.territory.canvas, 0, 0);
    ctx.lineWidth = Math.max(0.25, 1.2 / this.camera.zoom);
    ctx.strokeStyle = PALETTE.ink;
    ctx.strokeRect(0, 0, width, this.territory.height);
    ctx.imageSmoothingEnabled = true;
    this.drawOrnaments();
    this.drawCaptures(state);

    for (const mine of state.mines) {
      this.drawMine((mine % width) + 0.5, Math.floor(mine / width) + 0.5);
    }
    for (const b of state.buildings) this.drawBuilding(b, state.colorOf(b.owner));
    for (const boat of state.boats) {
      if (boat.owner === state.myId) this.drawRoute(boat, width);
    }
    for (const boat of state.boats) this.drawBoat(boat, state.colorOf(boat.owner));
    if (state.hoverTile !== null) this.drawHover(state, width);

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawLabels(state);
    this.drawFronts(state);
    this.drawBoatTroops(state);

    if (this.vignette) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = this.vignette;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  /**
   * Tuiles prises de force : la ligne de front. Sur vos fronts elle dit qui gagne (vert, rouge) ;
   * ailleurs, une ombre d'encre brève.
   */
  private drawCaptures(state: SceneState): void {
    const ctx = this.ctx;
    const width = this.territory.width;
    const me = state.myId;
    // Un léger débord garde la ligne visible quand la carte est dézoomée.
    const pad = Math.max(0, 1.2 / this.camera.zoom - 0.5);
    ctx.save();
    state.battle.forEachSpark(state.now, (tile, age, winner, loser) => {
      const x = tile % width;
      const y = (tile - x) / width;
      if (winner === me || loser === me) {
        // Vos fronts : vert là où vous gagnez du terrain, rouge là où vous en perdez.
        ctx.fillStyle = winner === me ? PALETTE.battleOutgoing : PALETTE.battleIncoming;
        ctx.globalAlpha = (1 - age) * 0.85;
        ctx.fillRect(x - pad, y - pad, 1 + 2 * pad, 1 + 2 * pad);
      } else {
        ctx.fillStyle = PALETTE.battleCapture;
        ctx.globalAlpha = (1 - age) * 0.3;
        ctx.fillRect(x, y, 1, 1);
      }
    });
    ctx.restore();
  }

  /**
   * Chiffre de chaque front (coordonnées écran) : ⚔ et troupes engagées, vert pour vos attaques,
   * rouge quand on vous attaque, encre pour les autres, qui n'apparaissent qu'en zoomant.
   */
  private drawFronts(state: SceneState): void {
    const ctx = this.ctx;
    const fronts = state.battle.activeFronts(state.now);
    if (fronts.length === 0) return;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `600 13px ${tokens.font.family.body}`;
    for (const f of fronts) {
      const mine = f.attacker === state.myId;
      const incoming = f.target === state.myId;
      if (!mine && !incoming && this.camera.zoom < OTHER_FRONTS_MIN_ZOOM) continue;
      // Sans cadre : l'icône de guerre et le chiffre, sur un halo de papier, un par tronçon de front.
      const text = `⚔ ${formatNumber(f.troops)}`;
      ctx.fillStyle = incoming
        ? PALETTE.battleIncoming
        : mine
          ? PALETTE.battleOutgoing
          : PALETTE.ink;
      ctx.lineWidth = 3;
      ctx.lineJoin = "round";
      ctx.strokeStyle = PALETTE.labelHalo;
      for (const p of f.positions) {
        const [sx, sy] = this.camera.worldToScreen(p.x, p.y);
        const offscreen =
          sx < -60 ||
          sy < -30 ||
          sx > this.camera.viewWidth + 60 ||
          sy > this.camera.viewHeight + 30;
        if (offscreen) continue;
        ctx.strokeText(text, sx, sy);
        ctx.fillText(text, sx, sy);
      }
    }
    ctx.restore();
  }

  /** Rose des vents, monstres et navires gravés au large. */
  private drawOrnaments(): void {
    const ctx = this.ctx;
    const zoom = this.camera.zoom;
    ctx.save();
    ctx.globalAlpha = ORNAMENT_ALPHA;
    for (const o of this.ornaments) {
      if (o.size * zoom < ORNAMENT_MIN_PX) continue;
      const art = sprite(o.sprite === "compass" ? "compass-rose" : `sea/${o.sprite}`);
      const level = art.pick(o.size * zoom * this.dpr);
      if (!level) continue;
      const h = o.size * art.aspect;
      ctx.save();
      ctx.translate(o.x, o.y);
      if (o.mirror && o.sprite !== "compass") ctx.scale(-1, 1);
      ctx.drawImage(level, -o.size / 2, -h / 2, o.size, h);
      ctx.restore();
    }
    ctx.restore();
  }

  /** Route d'une de ses barges : trait de cartographe en pointillés jusqu'à la plage. */
  private drawRoute(boat: BoatSprite, width: number): void {
    const ctx = this.ctx;
    const lx = (boat.landing % width) + 0.5;
    const ly = Math.floor(boat.landing / width) + 0.5;
    const unit = 1 / this.camera.zoom;
    ctx.save();
    ctx.strokeStyle = PALETTE.inkSoft;
    ctx.lineWidth = 1.2 * unit;
    ctx.setLineDash([5 * unit, 4 * unit]);
    ctx.beginPath();
    ctx.moveTo(boat.x, boat.y);
    ctx.lineTo(lx, ly);
    ctx.stroke();
    ctx.setLineDash([]);
    // Croix de débarquement.
    const s = Math.max(1.2, 5 * unit);
    ctx.lineWidth = 1.6 * unit;
    ctx.strokeStyle = PALETTE.ink;
    ctx.beginPath();
    ctx.moveTo(lx - s, ly - s);
    ctx.lineTo(lx + s, ly + s);
    ctx.moveTo(lx + s, ly - s);
    ctx.lineTo(lx - s, ly + s);
    ctx.stroke();
    ctx.restore();
  }

  /** Barge gravée : coque, mât et voile aux couleurs du propriétaire. Taille lisible à tout zoom. */
  private drawBoat(boat: BoatSprite, color: RGB): void {
    const ctx = this.ctx;
    const scale = Math.max(1.4, 9 / this.camera.zoom);
    ctx.save();
    ctx.translate(boat.x, boat.y);
    ctx.scale(scale, scale);
    ctx.lineWidth = 0.16;
    ctx.lineJoin = "round";
    ctx.strokeStyle = PALETTE.ink;
    // Coque.
    ctx.beginPath();
    ctx.moveTo(-1.3, 0.2);
    ctx.lineTo(1.3, 0.2);
    ctx.quadraticCurveTo(1, 0.9, 0, 0.9);
    ctx.quadraticCurveTo(-1, 0.9, -1.3, 0.2);
    ctx.closePath();
    ctx.fillStyle = PALETTE.paper;
    ctx.fill();
    ctx.stroke();
    // Mât.
    ctx.beginPath();
    ctx.moveTo(0, 0.2);
    ctx.lineTo(0, -1.4);
    ctx.stroke();
    // Voile.
    ctx.beginPath();
    ctx.moveTo(0.08, -1.3);
    ctx.quadraticCurveTo(0.9, -0.65, 0.08, 0.05);
    ctx.closePath();
    ctx.fillStyle = rgbCss(color);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  /** Effectif embarqué, en italique sous la barge (coordonnées écran). */
  private drawBoatTroops(state: SceneState): void {
    if (this.camera.zoom < 3) return;
    const ctx = this.ctx;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = `italic 11px ${FONT_FLAVOR}`;
    ctx.lineJoin = "round";
    for (const boat of state.boats) {
      const [sx, sy] = this.camera.worldToScreen(boat.x, boat.y);
      const text = formatNumber(boat.troops);
      ctx.lineWidth = 3;
      ctx.strokeStyle = PALETTE.labelHalo;
      ctx.strokeText(text, sx, sy + 10);
      ctx.fillStyle = PALETTE.ink;
      ctx.fillText(text, sx, sy + 10);
    }
  }

  /** Mine d'or : petit tertre gravé. */
  private drawMine(x: number, y: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x - 1.7, y + 1.2);
    ctx.lineTo(x, y - 1.7);
    ctx.lineTo(x + 1.7, y + 1.2);
    ctx.closePath();
    ctx.fillStyle = PALETTE.mine;
    ctx.fill();
    ctx.lineWidth = 0.3;
    ctx.strokeStyle = PALETTE.ink;
    ctx.stroke();
  }

  /** Bâtiment gravé, marqué d'un petit écu aux couleurs du propriétaire. */
  private drawBuilding(b: BuildingView, color: RGB): void {
    const art = sprite(`buildings/${b.kind}`);
    if (!art.ready) {
      this.drawBuildingShape(b, color);
      return;
    }
    const ctx = this.ctx;
    const x = (b.tile % this.territory.width) + 0.5;
    const y = Math.floor(b.tile / this.territory.width) + 0.5;
    const w = Math.max(BUILDING_TILES, BUILDING_MIN_PX / this.camera.zoom);
    const h = w * art.aspect;
    ctx.save();
    ctx.globalAlpha = b.done ? 1 : 0.45;
    this.drawEngraving(art, x - w / 2, y - h * 0.6, w, h);
    this.drawOwnerShield(x + w * 0.36, y + h * 0.28, w * 0.34, color);
    ctx.restore();
  }

  private drawEngraving(art: Sprite, x: number, y: number, w: number, h: number): void {
    const level = art.pick(w * this.camera.zoom * this.dpr);
    if (level) this.ctx.drawImage(level, x, y, w, h);
  }

  /** Écu du propriétaire en coordonnées monde : émail de sa couleur, bordure à l'encre. */
  private drawOwnerShield(cx: number, cy: number, w: number, color: RGB): void {
    const ctx = this.ctx;
    const h = w * 1.2;
    const x = cx - w / 2;
    const y = cy - h / 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + h * 0.55);
    ctx.quadraticCurveTo(x + w, y + h * 0.85, cx, y + h);
    ctx.quadraticCurveTo(x, y + h * 0.85, x, y + h * 0.55);
    ctx.closePath();
    ctx.fillStyle = rgbCss(color);
    ctx.fill();
    ctx.lineWidth = w * 0.1;
    ctx.strokeStyle = PALETTE.ink;
    ctx.stroke();
  }

  /** Repli : bâtiment tracé à l'encre, avec un fanion aux couleurs du propriétaire. */
  private drawBuildingShape(b: BuildingView, color: RGB): void {
    const ctx = this.ctx;
    const x = (b.tile % this.territory.width) + 0.5;
    const y = Math.floor(b.tile / this.territory.width) + 0.5;
    ctx.save();
    ctx.globalAlpha = b.done ? 1 : 0.45;
    ctx.translate(x, y);
    ctx.lineWidth = 0.3;
    ctx.strokeStyle = PALETTE.ink;
    ctx.fillStyle = PALETTE.paper;
    ctx.beginPath();
    if (b.kind === BuildingKind.Bourg) {
      // Symbole de ville des cartes anciennes : enceinte ronde et clocher.
      ctx.arc(0, 0.4, 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-0.6, 0.4);
      ctx.lineTo(-0.6, -1.2);
      ctx.lineTo(0, -2);
      ctx.lineTo(0.6, -1.2);
      ctx.lineTo(0.6, 0.4);
    } else {
      // Tour crénelée.
      ctx.moveTo(-0.9, 1.6);
      ctx.lineTo(-0.9, -1.1);
      ctx.lineTo(-1.2, -1.1);
      ctx.lineTo(-1.2, -1.8);
      ctx.lineTo(-0.4, -1.8);
      ctx.lineTo(-0.4, -1.4);
      ctx.lineTo(0.4, -1.4);
      ctx.lineTo(0.4, -1.8);
      ctx.lineTo(1.2, -1.8);
      ctx.lineTo(1.2, -1.1);
      ctx.lineTo(0.9, -1.1);
      ctx.lineTo(0.9, 1.6);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Fanion du propriétaire.
    ctx.beginPath();
    ctx.moveTo(0, -2);
    ctx.lineTo(0, -3.6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -3.6);
    ctx.lineTo(1.8, -3.25);
    ctx.lineTo(0, -2.9);
    ctx.closePath();
    ctx.fillStyle = rgbCss(color);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private drawHover(state: SceneState, width: number): void {
    const ctx = this.ctx;
    const tile = state.hoverTile as number;
    const x = tile % width;
    const y = Math.floor(tile / width);
    ctx.lineWidth = Math.max(0.15, 1.4 / this.camera.zoom);
    if (state.buildMode !== null) {
      const valid = state.myId !== null && this.territory.owner(tile) === state.myId;
      ctx.strokeStyle = valid ? PALETTE.buildValid : PALETTE.buildInvalid;
      ctx.setLineDash([0.8, 0.6]);
      ctx.beginPath();
      ctx.arc(x + 0.5, y + 0.5, STRUCTURE_MIN_DIST, 0, Math.PI * 2);
      ctx.stroke();
      if (state.buildMode === BuildingKind.Tour) {
        ctx.strokeStyle = PALETTE.towerRange;
        ctx.setLineDash([2, 0.8, 0.3, 0.8]);
        ctx.beginPath();
        ctx.arc(x + 0.5, y + 0.5, state.towerRange || TOWER_RANGE, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    ctx.strokeStyle = PALETTE.hover;
    ctx.strokeRect(x, y, 1, 1);
  }

  /** Écu brisé du Parjure : une fêlure d'encre en travers de l'écu. */
  private drawShieldCrack(cx: number, cy: number, size: number): void {
    const ctx = this.ctx;
    const w = size * 0.84;
    ctx.beginPath();
    ctx.moveTo(cx + w * 0.45, cy - size * 0.5);
    ctx.lineTo(cx + w * 0.05, cy - size * 0.1);
    ctx.lineTo(cx + w * 0.15, cy + size * 0.05);
    ctx.lineTo(cx - w * 0.35, cy + size * 0.4);
    ctx.lineWidth = Math.max(1.5, size / 8);
    ctx.strokeStyle = PALETTE.labelHalo;
    ctx.stroke();
    ctx.lineWidth = Math.max(1, size / 14);
    ctx.strokeStyle = PALETTE.parjure;
    ctx.stroke();
  }

  /** Écu héraldique dessiné en coordonnées écran. */
  private drawShield(cx: number, cy: number, size: number, fill: string, glyph: string): void {
    const ctx = this.ctx;
    const w = size * 0.84;
    const h = size;
    const x = cx - w / 2;
    const y = cy - h / 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + h * 0.55);
    ctx.quadraticCurveTo(x + w, y + h * 0.85, cx, y + h);
    ctx.quadraticCurveTo(x, y + h * 0.85, x, y + h * 0.55);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = Math.max(1, size / 14);
    ctx.strokeStyle = PALETTE.sable;
    ctx.stroke();
    if (glyph) {
      ctx.font = `${size * 0.55}px serif`;
      ctx.fillStyle = PALETTE.argent;
      ctx.fillText(glyph, cx, cy + size * 0.02);
    }
  }

  /**
   * Noms des royaumes, à la manière d'un atlas : discrets, jamais superposés.
   * Les plus grands royaumes (et le sien) sont placés en priorité ; un nom qui chevaucherait
   * un nom déjà placé n'est pas dessiné à cette échelle (il apparaît en zoomant).
   */
  private drawLabels(state: SceneState): void {
    const ctx = this.ctx;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    const zoom = this.camera.zoom;
    const ordered = [...state.labels].sort((a, b) => {
      if (a.owner === state.myId) return -1;
      if (b.owner === state.myId) return 1;
      return b.size - a.size;
    });
    const placed: [number, number, number, number][] = [];
    const overlaps = (x0: number, y0: number, x1: number, y1: number): boolean =>
      placed.some(([a0, b0, a1, b1]) => x0 < a1 && x1 > a0 && y0 < b1 && y1 > b0);

    for (const label of ordered) {
      const player = state.players.get(label.owner);
      if (!player || !player.alive) continue;
      const span = label.size * zoom; // largeur approximative du territoire à l'écran
      let fontPx = Math.min(LABEL_MAX_PX, span * 0.17);
      if (fontPx < LABEL_MIN_PX) continue;
      const [sx, sy] = this.camera.worldToScreen(label.x + 0.5, label.y + 0.5);
      if (
        sx < -150 ||
        sy < -40 ||
        sx > this.camera.viewWidth + 150 ||
        sy > this.camera.viewHeight + 40
      ) {
        continue;
      }
      const race = player.race;
      const family = (px: number): string =>
        race && px >= RACE_LABEL_MIN_PX ? tokens.skin[race].font : FONT_DISPLAY;
      // Le nom ne doit pas déborder largement de son territoire.
      ctx.font = `${fontPx}px ${family(fontPx)}`;
      const fit = (span * 1.4) / Math.max(1, ctx.measureText(player.name).width);
      if (fit < 1) {
        fontPx *= fit;
        if (fontPx < LABEL_MIN_PX) continue;
        ctx.font = `${fontPx}px ${family(fontPx)}`;
      }
      const withShield = player.race !== null && fontPx >= 12;
      const nameWidth = ctx.measureText(player.name).width;
      const shieldWidth = withShield ? fontPx * 1.3 : 0;
      const half = (nameWidth + shieldWidth) / 2 + 3;
      const top = sy - fontPx * 1.05;
      const bottom = sy + fontPx * 0.95;
      if (overlaps(sx - half, top, sx + half, bottom)) continue;
      placed.push([sx - half, top, sx + half, bottom]);

      const mine = player.id === state.myId;
      const parjure = player.parjureUntil > state.tick;
      const nameX = sx + shieldWidth / 2;
      const nameY = sy - fontPx * 0.4;
      ctx.lineWidth = Math.max(2, fontPx / 5);
      ctx.strokeStyle = PALETTE.labelHalo;
      ctx.fillStyle = parjure ? PALETTE.parjure : mine ? PALETTE.labelSelf : PALETTE.label;
      ctx.strokeText(player.name, nameX, nameY);
      ctx.fillText(player.name, nameX, nameY);
      if (withShield && player.race) {
        this.drawShield(
          nameX - nameWidth / 2 - fontPx * 0.65,
          nameY,
          fontPx * 1.05,
          raceColor(player.race),
          RACES[player.race].emblem,
        );
        if (parjure)
          this.drawShieldCrack(nameX - nameWidth / 2 - fontPx * 0.65, nameY, fontPx * 1.05);
      }
      if (player.id === state.crown) {
        // La Couronne d'Astre au-dessus du nom du meneur.
        ctx.font = `${fontPx * 0.95}px serif`;
        ctx.lineWidth = Math.max(2, fontPx / 5);
        ctx.strokeStyle = PALETTE.labelHalo;
        ctx.strokeText("♛", nameX, nameY - fontPx * 0.95);
        ctx.fillStyle = PALETTE.crown;
        ctx.fillText("♛", nameX, nameY - fontPx * 0.95);
      }
      const troopsPx = fontPx * 0.72;
      ctx.font = `italic ${troopsPx}px ${FONT_FLAVOR}`;
      ctx.lineWidth = Math.max(1.5, troopsPx / 5);
      ctx.strokeStyle = PALETTE.labelHalo;
      const troops = formatNumber(player.troops);
      ctx.strokeText(troops, sx, sy + fontPx * 0.45);
      ctx.fillStyle = PALETTE.ink;
      ctx.fillText(troops, sx, sy + fontPx * 0.45);
    }
  }
}
