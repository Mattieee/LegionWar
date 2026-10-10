/** Carte actionnable : demande d'alliance, renouvellement… (3 visibles au plus). */
export interface DealCard {
  key: string;
  title: string;
  text: string;
  /** Temps restant, de 1 (plein) à 0 (expiré). */
  remaining: number;
  actions: { label: string; primary?: boolean; run: () => void }[];
}

interface Mounted {
  el: HTMLElement;
  text: HTMLElement;
  bar: HTMLElement;
}

/**
 * Pile de cartes en haut de l'écran. Les cartes sont créées une fois puis mises à jour à
 * chaque tick (texte, barre de temps) : survol et focus restent stables sous la souris.
 */
export class DealCards {
  private readonly mounted = new Map<string, Mounted>();

  constructor(private readonly host: HTMLElement) {}

  render(cards: readonly DealCard[]): void {
    const keys = new Set(cards.map((c) => c.key));
    for (const [key, m] of this.mounted) {
      if (!keys.has(key)) {
        m.el.remove();
        this.mounted.delete(key);
      }
    }
    for (const card of cards) {
      const m = this.mounted.get(card.key) ?? this.mount(card);
      m.text.textContent = card.text;
      m.bar.style.width = `${Math.max(0, Math.min(1, card.remaining)) * 100}%`;
    }
  }

  private mount(card: DealCard): Mounted {
    const el = document.createElement("section");
    el.className = "lw-panel lw-panel--compact hud__deal";
    el.setAttribute("aria-label", card.title);
    const title = document.createElement("h3");
    title.className = "lw-title-3";
    title.textContent = card.title;
    const text = document.createElement("p");
    text.className = "hud__deal-text";
    const progress = document.createElement("div");
    progress.className = "lw-progress";
    progress.setAttribute("role", "presentation");
    const bar = document.createElement("div");
    bar.className = "lw-progress__fill";
    progress.append(bar);
    const actions = document.createElement("div");
    actions.className = "hud__deal-actions";
    for (const action of card.actions) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = action.primary
        ? "lw-button lw-button--primary lw-button--sm"
        : "lw-button lw-button--sm";
      button.textContent = action.label;
      button.addEventListener("click", () => action.run());
      actions.append(button);
    }
    el.append(title, text, progress, actions);
    this.host.append(el);
    const mounted = { el, text, bar };
    this.mounted.set(card.key, mounted);
    return mounted;
  }
}
