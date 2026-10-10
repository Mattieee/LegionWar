/** Teinte d'une action du menu radial (tokens du design system, voir `.lw-radial`). */
export type RadialTone = "attack" | "boat" | "ally" | "build" | "gold" | "danger" | "neutral";

export interface RadialAction {
  label: string;
  /** Précision affichée dans l'infobulle : coût, troupes engagées, temps restant… */
  hint?: string;
  /** Glyphe (⚔, ⛵…) ou image (gravure d'un bâtiment). */
  icon: string | { image: string };
  tone: RadialTone;
  disabled?: boolean;
  run?: () => void;
}

export interface RadialModel {
  /** Action principale au centre (attaquer, s'étendre, donner des troupes…). */
  center: RadialAction | null;
  /** Actions de l'anneau, la première en haut puis dans le sens horaire. */
  ring: RadialAction[];
}

const SVG = "http://www.w3.org/2000/svg";
/** Géométrie de l'anneau (px), proche d'OpenFront : intérieur 40, extérieur 95, centre 30. */
const INNER = 40;
const OUTER = 95;
const CENTER = 30;
const PAD = 0.03;
const ICON = 32;

/**
 * Menu radial du clic droit, centré sur le point cliqué (comme OpenFront) : une action
 * principale au centre et un anneau d'actions autour. Se ferme par un clic ailleurs, un clic
 * droit, Échap, ou après une action. Infobulle qui suit la souris.
 */
export class RadialMenu {
  private el: HTMLElement | null = null;
  private tooltip: HTMLElement | null = null;
  private listeners: AbortController | null = null;
  private closedByOutsideAt = -Infinity;

  constructor(private readonly host: HTMLElement) {}

  get isOpen(): boolean {
    return this.el !== null;
  }

  open(x: number, y: number, model: RadialModel): void {
    this.close();
    const size = (OUTER + 6) * 2;
    const el = document.createElement("div");
    el.className = "lw-radial";
    el.setAttribute("role", "menu");
    // Centré sur le clic, sans déborder de l'écran.
    const margin = OUTER + 10;
    const cx = Math.max(margin, Math.min(x, window.innerWidth - margin));
    const cy = Math.max(margin, Math.min(y, window.innerHeight - margin));
    el.style.left = `${cx - size / 2}px`;
    el.style.top = `${cy - size / 2}px`;
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;

    const svg = document.createElementNS(SVG, "svg");
    svg.setAttribute("viewBox", `${-size / 2} ${-size / 2} ${size} ${size}`);
    svg.setAttribute("width", String(size));
    svg.setAttribute("height", String(size));

    const n = model.ring.length;
    model.ring.forEach((action, i) => {
      const span = (Math.PI * 2) / n;
      // Le premier secteur est centré en haut.
      const start = -Math.PI / 2 - span / 2 + i * span + (n > 1 ? PAD / 2 : 0);
      const end = start + span - (n > 1 ? PAD : 0);
      const group = this.item(action, "lw-radial__sector");
      const path = document.createElementNS(SVG, "path");
      path.setAttribute("d", annulus(start, end));
      path.setAttribute("class", "lw-radial__shape");
      group.append(path);
      const mid = (start + end) / 2;
      const r = (INNER + OUTER) / 2;
      group.append(icon(action.icon, Math.cos(mid) * r, Math.sin(mid) * r, ICON));
      svg.append(group);
    });

    if (model.center) {
      const group = this.item(model.center, "lw-radial__center");
      const circle = document.createElementNS(SVG, "circle");
      circle.setAttribute("r", String(CENTER));
      circle.setAttribute("class", "lw-radial__shape");
      group.append(circle, icon(model.center.icon, 0, 0, ICON + 4));
      svg.append(group);
    }
    el.append(svg);

    const tooltip = document.createElement("div");
    tooltip.className = "lw-radial__tooltip";
    tooltip.hidden = true;
    this.host.append(el, tooltip);
    this.el = el;
    this.tooltip = tooltip;

    this.listeners = new AbortController();
    const signal = this.listeners.signal;
    window.addEventListener(
      "pointerdown",
      (e) => {
        if (!(e.target instanceof Element) || !e.target.closest(".lw-radial__item")) {
          this.closedByOutsideAt = performance.now();
          this.close();
        }
      },
      { signal, capture: true },
    );
    window.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Escape") this.close();
      },
      { signal },
    );
    window.addEventListener("contextmenu", (e) => e.preventDefault(), { signal });
  }

  /** Vrai si le clic en cours vient de fermer le menu : il ne doit pas agir sur la carte. */
  consumedClick(): boolean {
    const consumed = performance.now() - this.closedByOutsideAt < 1000;
    this.closedByOutsideAt = -Infinity;
    return consumed;
  }

  close(): void {
    this.listeners?.abort();
    this.listeners = null;
    this.el?.remove();
    this.tooltip?.remove();
    this.el = null;
    this.tooltip = null;
  }

  /** Groupe SVG cliquable d'une action, avec son infobulle et son état. */
  private item(action: RadialAction, kind: string): SVGGElement {
    const group = document.createElementNS(SVG, "g");
    const disabled = action.disabled === true || !action.run;
    group.setAttribute(
      "class",
      `lw-radial__item ${kind} lw-radial__item--${action.tone}${disabled ? " lw-radial__item--disabled" : ""}`,
    );
    group.setAttribute("role", "menuitem");
    group.setAttribute(
      "aria-label",
      action.hint ? `${action.label} (${action.hint})` : action.label,
    );
    group.setAttribute("aria-disabled", String(disabled));
    group.addEventListener("pointerenter", () => this.showTooltip(action));
    group.addEventListener("pointermove", (e) => this.moveTooltip(e.clientX, e.clientY));
    group.addEventListener("pointerleave", () => {
      if (this.tooltip) this.tooltip.hidden = true;
    });
    group.addEventListener("click", () => {
      if (disabled) return;
      this.close();
      action.run?.();
    });
    return group;
  }

  private showTooltip(action: RadialAction): void {
    const tip = this.tooltip;
    if (!tip) return;
    tip.replaceChildren();
    const title = document.createElement("strong");
    title.textContent = action.label;
    tip.append(title);
    if (action.hint) {
      const hint = document.createElement("span");
      hint.textContent = action.hint;
      tip.append(hint);
    }
    tip.hidden = false;
  }

  private moveTooltip(x: number, y: number): void {
    if (!this.tooltip) return;
    this.tooltip.style.left = `${x + 12}px`;
    this.tooltip.style.top = `${y + 12}px`;
  }
}

/** Chemin SVG d'un secteur d'anneau entre deux angles (radians). */
function annulus(start: number, end: number): string {
  const p = (r: number, a: number): string =>
    `${(Math.cos(a) * r).toFixed(2)} ${(Math.sin(a) * r).toFixed(2)}`;
  if (end - start >= Math.PI * 2 - 1e-6) {
    // Anneau complet (une seule action) : deux demi-cercles par rayon.
    return [
      `M ${p(OUTER, 0)} A ${OUTER} ${OUTER} 0 1 1 ${p(OUTER, Math.PI)} A ${OUTER} ${OUTER} 0 1 1 ${p(OUTER, 0)} Z`,
      `M ${p(INNER, 0)} A ${INNER} ${INNER} 0 1 0 ${p(INNER, Math.PI)} A ${INNER} ${INNER} 0 1 0 ${p(INNER, 0)} Z`,
    ].join(" ");
  }
  const large = end - start > Math.PI ? 1 : 0;
  return [
    `M ${p(OUTER, start)}`,
    `A ${OUTER} ${OUTER} 0 ${large} 1 ${p(OUTER, end)}`,
    `L ${p(INNER, end)}`,
    `A ${INNER} ${INNER} 0 ${large} 0 ${p(INNER, start)}`,
    "Z",
  ].join(" ");
}

/** Glyphe ou gravure centré en (x, y). */
function icon(source: string | { image: string }, x: number, y: number, size: number): SVGElement {
  if (typeof source === "string") {
    const text = document.createElementNS(SVG, "text");
    text.setAttribute("x", String(x));
    text.setAttribute("y", String(y));
    text.setAttribute("class", "lw-radial__glyph");
    text.setAttribute("font-size", String(size * 0.7));
    text.textContent = source;
    return text;
  }
  const image = document.createElementNS(SVG, "image");
  image.setAttribute("href", source.image);
  image.setAttribute("x", String(x - size / 2));
  image.setAttribute("y", String(y - size / 2));
  image.setAttribute("width", String(size));
  image.setAttribute("height", String(size));
  image.setAttribute("class", "lw-radial__image");
  return image;
}
