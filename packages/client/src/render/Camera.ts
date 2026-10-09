const MIN_ZOOM = 0.5;
const MAX_ZOOM = 40;

/** Caméra 2D : (x, y) = centre de la vue en tuiles, zoom = pixels CSS par tuile. */
export class Camera {
  x = 0;
  y = 0;
  zoom = 2;
  viewWidth = 1;
  viewHeight = 1;

  resize(width: number, height: number): void {
    this.viewWidth = Math.max(1, width);
    this.viewHeight = Math.max(1, height);
  }

  fit(mapWidth: number, mapHeight: number): void {
    this.x = mapWidth / 2;
    this.y = mapHeight / 2;
    this.zoom = this.clampZoom(
      Math.min(this.viewWidth / mapWidth, this.viewHeight / mapHeight) * 0.95,
    );
  }

  worldToScreen(wx: number, wy: number): [number, number] {
    return [
      (wx - this.x) * this.zoom + this.viewWidth / 2,
      (wy - this.y) * this.zoom + this.viewHeight / 2,
    ];
  }

  screenToWorld(sx: number, sy: number): [number, number] {
    return [
      (sx - this.viewWidth / 2) / this.zoom + this.x,
      (sy - this.viewHeight / 2) / this.zoom + this.y,
    ];
  }

  pan(dxScreen: number, dyScreen: number): void {
    this.x -= dxScreen / this.zoom;
    this.y -= dyScreen / this.zoom;
  }

  /** Zoome en gardant fixe le point du monde situé sous (sx, sy). */
  zoomAt(sx: number, sy: number, factor: number): void {
    const [wx, wy] = this.screenToWorld(sx, sy);
    this.zoom = this.clampZoom(this.zoom * factor);
    const [nx, ny] = this.screenToWorld(sx, sy);
    this.x += wx - nx;
    this.y += wy - ny;
  }

  centerOn(wx: number, wy: number, zoom?: number): void {
    this.x = wx;
    this.y = wy;
    if (zoom !== undefined) this.zoom = this.clampZoom(zoom);
  }

  /** Applique la transformation monde → écran (pixels physiques). */
  apply(ctx: CanvasRenderingContext2D, dpr: number): void {
    const z = this.zoom * dpr;
    ctx.setTransform(
      z,
      0,
      0,
      z,
      dpr * (this.viewWidth / 2 - this.x * this.zoom),
      dpr * (this.viewHeight / 2 - this.y * this.zoom),
    );
  }

  private clampZoom(zoom: number): number {
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
  }
}
