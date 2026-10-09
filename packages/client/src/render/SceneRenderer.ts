import {
  BuildingKind,
  STRUCTURE_MIN_DIST,
  TOWER_RANGE,
  type BuildingView,
  type PlayerView,
} from "@legionwar/engine";
import type { Camera } from "./Camera";
import { DEEP_WATER, type RGB, rgbCss } from "./colors";
import type { Label } from "./Labels";
import type { TerritoryLayer } from "./TerritoryLayer";
import { formatNumber } from "../ui/format";

export interface SceneState {
  players: ReadonlyMap<number, PlayerView>;
  buildings: readonly BuildingView[];
  mines: readonly number[];
  labels: readonly Label[];
  myId: number | null;
  hoverTile: number | null;
  buildMode: BuildingKind | null;
  /** Portée effective des tours du joueur local (bonus de race inclus). */
  towerRange: number;
  colorOf: (owner: number) => RGB;
}

const GOLD: RGB = [232, 194, 90];
const INK = "rgba(28, 18, 10, 0.9)";

/** Dessine la carte, les mines, les bâtiments, le fantôme de construction et les noms. */
export class SceneRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private dpr = 1;

  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly camera: Camera,
    private readonly territory: TerritoryLayer,
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
  }

  draw(state: SceneState): void {
    const ctx = this.ctx;
    const width = this.territory.width;
    this.territory.flush();

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = rgbCss(DEEP_WATER);
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.camera.apply(ctx, this.dpr);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.territory.canvas, 0, 0);

    for (const mine of state.mines) {
      const owner = this.territory.owner(mine);
      this.drawMine(
        (mine % width) + 0.5,
        Math.floor(mine / width) + 0.5,
        owner ? state.colorOf(owner) : null,
      );
    }
    for (const b of state.buildings) {
      this.drawBuilding(b, state.colorOf(b.owner));
    }
    if (state.hoverTile !== null) this.drawHover(state, width);

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawLabels(state);
  }

  private drawMine(x: number, y: number, ownerColor: RGB | null): void {
    const ctx = this.ctx;
    const r = 1.6;
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r, y);
    ctx.closePath();
    ctx.fillStyle = rgbCss(GOLD);
    ctx.fill();
    ctx.lineWidth = 0.35;
    ctx.strokeStyle = ownerColor ? rgbCss(ownerColor) : INK;
    ctx.stroke();
  }

  private drawBuilding(b: BuildingView, color: RGB): void {
    const ctx = this.ctx;
    const x = (b.tile % this.territory.width) + 0.5;
    const y = Math.floor(b.tile / this.territory.width) + 0.5;
    ctx.save();
    ctx.globalAlpha = b.done ? 1 : 0.5;
    ctx.translate(x, y);
    ctx.lineWidth = 0.3;
    ctx.strokeStyle = INK;
    ctx.fillStyle = rgbCss(color);
    ctx.beginPath();
    if (b.kind === BuildingKind.Bourg) {
      // Maison à toit pointu.
      ctx.moveTo(-1.6, 1.4);
      ctx.lineTo(-1.6, -0.2);
      ctx.lineTo(0, -1.8);
      ctx.lineTo(1.6, -0.2);
      ctx.lineTo(1.6, 1.4);
    } else {
      // Tour crénelée.
      ctx.moveTo(-1, 1.6);
      ctx.lineTo(-1, -1.2);
      ctx.lineTo(-1.4, -1.2);
      ctx.lineTo(-1.4, -2);
      ctx.lineTo(-0.5, -2);
      ctx.lineTo(-0.5, -1.6);
      ctx.lineTo(0.5, -1.6);
      ctx.lineTo(0.5, -2);
      ctx.lineTo(1.4, -2);
      ctx.lineTo(1.4, -1.2);
      ctx.lineTo(1, -1.2);
      ctx.lineTo(1, 1.6);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private drawHover(state: SceneState, width: number): void {
    const ctx = this.ctx;
    const tile = state.hoverTile as number;
    const x = tile % width;
    const y = Math.floor(tile / width);
    ctx.lineWidth = Math.max(0.15, 1.5 / this.camera.zoom);
    if (state.buildMode !== null) {
      const valid = state.myId !== null && this.territory.owner(tile) === state.myId;
      const tone = valid ? "rgba(240, 210, 120, 0.9)" : "rgba(220, 60, 50, 0.9)";
      ctx.strokeStyle = tone;
      ctx.setLineDash([0.8, 0.6]);
      ctx.beginPath();
      ctx.arc(x + 0.5, y + 0.5, STRUCTURE_MIN_DIST, 0, Math.PI * 2);
      ctx.stroke();
      if (state.buildMode === BuildingKind.Tour) {
        ctx.strokeStyle = "rgba(120, 190, 255, 0.85)";
        ctx.beginPath();
        ctx.arc(x + 0.5, y + 0.5, state.towerRange || TOWER_RANGE, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
    ctx.strokeRect(x, y, 1, 1);
  }

  private drawLabels(state: SceneState): void {
    const ctx = this.ctx;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    for (const label of state.labels) {
      const player = state.players.get(label.owner);
      if (!player || !player.alive) continue;
      const fontPx = Math.min(30, label.size * this.camera.zoom * 0.32);
      if (fontPx < 8) continue;
      const [sx, sy] = this.camera.worldToScreen(label.x + 0.5, label.y + 0.5);
      if (
        sx < -200 ||
        sy < -50 ||
        sx > this.camera.viewWidth + 200 ||
        sy > this.camera.viewHeight + 50
      ) {
        continue;
      }
      const mine = player.id === state.myId;
      ctx.font = `600 ${fontPx}px "Palatino Linotype", "Book Antiqua", Georgia, serif`;
      ctx.lineWidth = Math.max(2, fontPx / 5);
      ctx.strokeStyle = "rgba(15, 10, 6, 0.85)";
      ctx.fillStyle = mine ? "#f3d27a" : "#f4ecdc";
      ctx.strokeText(player.name, sx, sy - fontPx * 0.45);
      ctx.fillText(player.name, sx, sy - fontPx * 0.45);
      const troopsPx = fontPx * 0.8;
      ctx.font = `${troopsPx}px Georgia, serif`;
      const troops = formatNumber(player.troops);
      ctx.strokeText(troops, sx, sy + fontPx * 0.5);
      ctx.fillText(troops, sx, sy + fontPx * 0.5);
    }
  }
}
