/** Une action du menu contextuel, ou un séparateur. */
export type MenuEntry =
  | {
      label: string;
      /** Indication à droite : raccourci, montant, temps restant. */
      hint?: string;
      danger?: boolean;
      disabled?: boolean;
      run?: () => void;
    }
  | "separator";

export interface MenuModel {
  title: string;
  subtitle?: string;
  entries: MenuEntry[];
}

/** Marge entre le menu et les bords de l'écran (px). */
const EDGE = 8;

/**
 * Menu contextuel du design system (`.lw-menu`), ouvert au clic droit sur la carte.
 * Accessible au clavier : flèches pour se déplacer, Entrée pour agir, Échap pour fermer.
 * Les textes passent par `textContent` : les noms de joueurs n'atteignent jamais `innerHTML`.
 */
export class ContextMenu {
  private el: HTMLElement | null = null;
  private listeners: AbortController | null = null;
  /** Instant (ms) de la dernière fermeture par un clic à l'extérieur. */
  private closedByOutsideAt = -Infinity;

  constructor(private readonly host: HTMLElement) {}

  get isOpen(): boolean {
    return this.el !== null;
  }

  open(x: number, y: number, model: MenuModel): void {
    this.close();
    const el = document.createElement("div");
    el.className = "lw-menu";
    el.setAttribute("role", "menu");
    el.setAttribute("aria-label", model.title);

    const header = document.createElement("div");
    header.className = "lw-menu__header";
    const title = document.createElement("span");
    title.className = "lw-menu__title";
    title.textContent = model.title;
    header.append(title);
    if (model.subtitle) {
      const subtitle = document.createElement("span");
      subtitle.className = "lw-menu__subtitle";
      subtitle.textContent = model.subtitle;
      header.append(subtitle);
    }
    el.append(header);

    for (const entry of model.entries) {
      if (entry === "separator") {
        const hr = document.createElement("hr");
        hr.className = "lw-menu__separator";
        el.append(hr);
        continue;
      }
      const item = document.createElement("button");
      item.type = "button";
      item.className = entry.danger ? "lw-menu__item lw-menu__item--danger" : "lw-menu__item";
      item.setAttribute("role", "menuitem");
      item.disabled = entry.disabled === true || !entry.run;
      const label = document.createElement("span");
      label.textContent = entry.label;
      item.append(label);
      if (entry.hint) {
        const hint = document.createElement("span");
        hint.className = "lw-menu__hint";
        hint.textContent = entry.hint;
        item.append(hint);
      }
      item.addEventListener("click", () => {
        this.close();
        entry.run?.();
      });
      el.append(item);
    }

    this.host.append(el);
    this.el = el;
    // Placé près du curseur, sans déborder de l'écran.
    const rect = el.getBoundingClientRect();
    el.style.left = `${Math.max(EDGE, Math.min(x + 4, window.innerWidth - rect.width - EDGE))}px`;
    el.style.top = `${Math.max(EDGE, Math.min(y + 4, window.innerHeight - rect.height - EDGE))}px`;

    const items = (): HTMLButtonElement[] =>
      [...el.querySelectorAll<HTMLButtonElement>(".lw-menu__item")].filter((b) => !b.disabled);
    items()[0]?.focus();

    this.listeners = new AbortController();
    const signal = this.listeners.signal;
    el.addEventListener(
      "keydown",
      (e) => {
        const list = items();
        const index = list.indexOf(document.activeElement as HTMLButtonElement);
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          const step = e.key === "ArrowDown" ? 1 : -1;
          list[(index + step + list.length) % list.length]?.focus();
          e.preventDefault();
        } else if (e.key === "Escape") {
          this.close();
          e.stopPropagation();
        }
      },
      { signal },
    );
    // Un clic ailleurs ferme le menu (phase de capture : avant que la carte ne le traite).
    window.addEventListener(
      "pointerdown",
      (e) => {
        if (!el.contains(e.target as Node)) {
          this.closedByOutsideAt = performance.now();
          this.close();
        }
      },
      { signal, capture: true },
    );
  }

  /**
   * Vrai si le clic en cours vient de fermer le menu : ce clic ne doit pas agir sur la carte
   * (sinon fermer le menu lancerait une attaque).
   */
  consumedClick(): boolean {
    // Un seul clic est absorbé : les suivants agissent normalement.
    const consumed = performance.now() - this.closedByOutsideAt < 1000;
    this.closedByOutsideAt = -Infinity;
    return consumed;
  }

  close(): void {
    this.listeners?.abort();
    this.listeners = null;
    this.el?.remove();
    this.el = null;
  }
}
