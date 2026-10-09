const DRAG_THRESHOLD_PX = 6;

export interface InputHandlers {
  onClick(x: number, y: number, button: number): void;
  onHover(x: number, y: number): void;
  onPan(dx: number, dy: number): void;
  onZoom(x: number, y: number, factor: number): void;
  onKey(event: KeyboardEvent): void;
}

/** Souris, tactile (Pointer Events) et clavier. Coordonnées en pixels CSS relatifs au canvas. */
export class Input {
  private pointerId: number | null = null;
  private startX = 0;
  private startY = 0;
  private lastX = 0;
  private lastY = 0;
  private dragging = false;
  private button = 0;
  private readonly abort = new AbortController();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly handlers: InputHandlers,
  ) {
    const signal = this.abort.signal;
    canvas.addEventListener("pointerdown", (e) => this.down(e), { signal });
    canvas.addEventListener("pointermove", (e) => this.move(e), { signal });
    canvas.addEventListener("pointerup", (e) => this.up(e), { signal });
    canvas.addEventListener("pointercancel", () => (this.pointerId = null), { signal });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault(), { signal });
    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const [x, y] = this.local(e);
        this.handlers.onZoom(x, y, Math.exp(-e.deltaY * 0.0015));
      },
      { signal, passive: false },
    );
    window.addEventListener(
      "keydown",
      (e) => {
        const target = e.target as HTMLElement | null;
        if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
        this.handlers.onKey(e);
      },
      { signal },
    );
  }

  dispose(): void {
    this.abort.abort();
  }

  private local(e: MouseEvent): [number, number] {
    const rect = this.canvas.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }

  private down(e: PointerEvent): void {
    if (this.pointerId !== null) return;
    this.pointerId = e.pointerId;
    this.button = e.button;
    this.dragging = false;
    [this.startX, this.startY] = this.local(e);
    [this.lastX, this.lastY] = [this.startX, this.startY];
    this.canvas.setPointerCapture(e.pointerId);
  }

  private move(e: PointerEvent): void {
    const [x, y] = this.local(e);
    this.handlers.onHover(x, y);
    if (e.pointerId !== this.pointerId) return;
    if (!this.dragging && Math.hypot(x - this.startX, y - this.startY) > DRAG_THRESHOLD_PX) {
      this.dragging = true;
    }
    if (this.dragging) this.handlers.onPan(x - this.lastX, y - this.lastY);
    [this.lastX, this.lastY] = [x, y];
  }

  private up(e: PointerEvent): void {
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = null;
    if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
    if (!this.dragging) {
      const [x, y] = this.local(e);
      this.handlers.onClick(x, y, this.button);
    }
  }
}
