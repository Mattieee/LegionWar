import { raceTincture } from "@legionwar/design-system";
import {
  BUILDINGS,
  BuildingKind,
  RACES,
  costFor,
  modifiersOf,
  type AttackView,
  type PlayerView,
} from "@legionwar/engine";
import { escapeHtml, formatNumber, formatPercent } from "./format";

export interface HudCallbacks {
  onRatioChange(ratio: number): void;
  onBuildMode(kind: BuildingKind | null): void;
  onExit(): void;
}

export interface HudState {
  me: PlayerView | null;
  players: readonly PlayerView[];
  attacks: readonly AttackView[];
  inSpawnPhase: boolean;
  ratio: number;
  buildMode: BuildingKind | null;
  landTiles: number;
  goldPerSecond: number;
}

export type EventTone = "info" | "good" | "bad";

const LOG_SIZE = 7;
const BUILD_KEYS: Record<BuildingKind, string> = {
  [BuildingKind.Bourg]: "1",
  [BuildingKind.Tour]: "2",
};

/** Interface en jeu (DOM superposé au canvas), construite avec les composants du design system. */
export class Hud {
  private readonly el: HTMLElement;
  private readonly $: <T extends HTMLElement>(sel: string) => T;
  private readonly log: { text: string; tone: EventTone }[] = [];
  private ended = false;

  constructor(root: HTMLElement, callbacks: HudCallbacks) {
    this.el = document.createElement("div");
    this.el.className = "hud";
    this.el.innerHTML = `
      <section class="lw-panel lw-panel--translucent hud__me" aria-label="Votre royaume">
        <div class="hud__identity">
          <span class="lw-shield lw-shield--lg" id="hud-shield" aria-hidden="true"><span id="hud-emblem"></span></span>
          <div><h2 class="lw-title-3" id="hud-name"></h2><p class="lw-overline" id="hud-race"></p></div>
        </div>
        <div class="lw-stat"><span class="lw-stat__label">Or</span><span class="lw-stat__value" id="hud-gold"></span></div>
        <div class="lw-stat"><span class="lw-stat__label">Troupes</span><span class="lw-stat__value" id="hud-troops"></span></div>
        <div class="lw-progress" role="presentation"><div class="lw-progress__fill" id="hud-troops-bar"></div></div>
        <div class="lw-stat"><span class="lw-stat__label">Territoire</span><span class="lw-stat__value" id="hud-land"></span></div>
        <hr class="lw-divider" />
        <label class="lw-field">
          <span class="lw-stat__label">Ratio d'attaque <span class="lw-kbd">T</span> <span class="lw-kbd">Y</span> :
            <strong class="lw-text-accent lw-numeric" id="hud-ratio"></strong></span>
          <input class="lw-range" type="range" min="1" max="100" id="hud-ratio-input" aria-label="Ratio d'attaque" />
        </label>
        <ul class="hud__attacks" id="hud-attacks" aria-label="Attaques en cours"></ul>
      </section>
      <section class="lw-panel lw-panel--translucent lw-panel--compact hud__board" aria-label="Classement">
        <div class="lw-panel__header">
          <h2 class="lw-title-3">Classement</h2>
          <button class="lw-button lw-button--ghost lw-button--sm" id="hud-exit">Quitter</button>
        </div>
        <ol class="hud__board-list" id="hud-board"></ol>
      </section>
      <div class="lw-panel lw-panel--compact hud__banner" id="hud-banner" role="status"></div>
      <ul class="hud__log" id="hud-log" aria-live="polite"></ul>
      <nav class="lw-panel lw-panel--translucent lw-panel--compact hud__build" aria-label="Construction">
        ${(Object.values(BuildingKind) as BuildingKind[])
          .map(
            (
              kind,
            ) => `<button class="lw-button hud__build-btn" data-kind="${kind}" aria-pressed="false">
              <span class="lw-kbd">${BUILD_KEYS[kind]}</span>
              <span class="hud__build-name">${BUILDINGS[kind].name}</span>
              <span class="hud__build-cost lw-numeric" data-cost="${kind}"></span></button>`,
          )
          .join("")}
      </nav>
      <div class="hud__hover lw-text-sm" id="hud-hover"></div>
      <div class="lw-modal" id="hud-modal" hidden>
        <div class="lw-panel lw-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="hud-modal-title">
          <h2 class="lw-modal__title" id="hud-modal-title"></h2>
          <p id="hud-modal-text"></p>
          <div class="lw-modal__actions">
            <button class="lw-button lw-button--primary" id="hud-modal-exit">Retour au menu</button>
          </div>
        </div>
      </div>`;
    root.append(this.el);
    this.$ = <T extends HTMLElement>(sel: string): T => this.el.querySelector(sel) as T;

    const ratioInput = this.$<HTMLInputElement>("#hud-ratio-input");
    ratioInput.addEventListener("input", () =>
      callbacks.onRatioChange(Number(ratioInput.value) / 100),
    );
    this.$("#hud-exit").addEventListener("click", () => callbacks.onExit());
    this.$("#hud-modal-exit").addEventListener("click", () => callbacks.onExit());
    for (const button of this.el.querySelectorAll<HTMLButtonElement>(".hud__build-btn")) {
      button.addEventListener("click", () => {
        const kind = button.dataset.kind as BuildingKind;
        callbacks.onBuildMode(button.getAttribute("aria-pressed") === "true" ? null : kind);
      });
    }
  }

  update(state: HudState): void {
    const { me } = state;
    this.$("#hud-banner").textContent = state.inSpawnPhase
      ? "Choisissez votre terre de départ : cliquez sur une terre libre"
      : "";

    if (me) {
      const race = me.race ? RACES[me.race] : null;
      this.$("#hud-emblem").textContent = race?.emblem ?? "";
      this.$("#hud-shield").className = me.race
        ? `lw-shield lw-shield--lg lw-shield--hatched lw-tincture-${raceTincture(me.race)}`
        : "lw-shield lw-shield--lg";
      this.$("#hud-name").textContent = me.name;
      this.$("#hud-race").textContent = race?.name ?? "";
      this.$("#hud-gold").textContent =
        `${formatNumber(me.gold)}  (+${formatNumber(state.goldPerSecond)}/s)`;
      this.$("#hud-troops").textContent =
        `${formatNumber(me.troops)} / ${formatNumber(me.maxTroops)}`;
      this.$("#hud-troops-bar").style.width =
        `${Math.min(100, (me.troops / Math.max(1, me.maxTroops)) * 100)}%`;
      this.$("#hud-land").textContent = formatPercent(
        (me.tiles / Math.max(1, state.landTiles)) * 100,
      );
      this.$("#hud-ratio").textContent =
        `${Math.round(state.ratio * 100)} % (${formatNumber(me.troops * state.ratio)})`;
      const ratioInput = this.$<HTMLInputElement>("#hud-ratio-input");
      if (document.activeElement !== ratioInput) {
        ratioInput.value = String(Math.round(state.ratio * 100));
      }

      const mods = modifiersOf(me.race);
      for (const kind of Object.values(BuildingKind) as BuildingKind[]) {
        const owned = kind === BuildingKind.Bourg ? me.bourgs : me.tours;
        const cost = costFor(kind, owned, mods);
        const button = this.$<HTMLButtonElement>(`.hud__build-btn[data-kind="${kind}"]`);
        this.$(`[data-cost="${kind}"]`).textContent = formatNumber(cost);
        button.disabled = state.inSpawnPhase || !me.alive || me.gold < cost;
        button.setAttribute("aria-pressed", String(state.buildMode === kind));
      }
      this.renderAttacks(state);
    }
    this.renderBoard(state);
  }

  setHover(text: string): void {
    this.$("#hud-hover").textContent = text;
  }

  pushEvent(text: string, tone: EventTone = "info"): void {
    this.log.unshift({ text, tone });
    this.log.length = Math.min(this.log.length, LOG_SIZE);
    this.$("#hud-log").innerHTML = this.log
      .map((e) => `<li class="lw-toast lw-toast--${e.tone}">${escapeHtml(e.text)}</li>`)
      .join("");
  }

  showEnd(title: string, text: string): void {
    if (this.ended) return;
    this.ended = true;
    this.$("#hud-modal-title").textContent = title;
    this.$("#hud-modal-text").textContent = text;
    this.$("#hud-modal").hidden = false;
    this.$<HTMLButtonElement>("#hud-modal-exit").focus();
  }

  dispose(): void {
    this.el.remove();
  }

  private renderAttacks(state: HudState): void {
    const me = state.me as PlayerView;
    const names = new Map(state.players.map((p) => [p.id, p.name]));
    const rows = state.attacks
      .filter((a) => a.attacker === me.id || a.target === me.id)
      .slice(0, 6)
      .map((a) => {
        const outgoing = a.attacker === me.id;
        const other = outgoing
          ? a.target === 0
            ? "Terres libres"
            : names.get(a.target)
          : names.get(a.attacker);
        return `<li class="hud__attack hud__attack--${outgoing ? "out" : "in"}">
          <span>${outgoing ? "⚔ →" : "⚠ ←"} ${escapeHtml(other ?? "?")}</span>
          <span class="lw-numeric">${formatNumber(a.troops)}</span></li>`;
      });
    this.$("#hud-attacks").innerHTML = rows.join("");
  }

  private renderBoard(state: HudState): void {
    const ranked = state.players
      .filter((p) => p.alive && p.spawned)
      .sort((a, b) => b.tiles - a.tiles);
    const myIndex = state.me ? ranked.findIndex((p) => p.id === state.me?.id) : -1;
    const rows = ranked.slice(0, 10).map((p, i) => this.boardRow(p, i, state));
    if (myIndex >= 10 && state.me) {
      rows.push(this.boardRow(ranked[myIndex] as PlayerView, myIndex, state));
    }
    this.$("#hud-board").innerHTML = rows.join("");
  }

  private boardRow(p: PlayerView, index: number, state: HudState): string {
    const mine = p.id === state.me?.id;
    const share = formatPercent((p.tiles / Math.max(1, state.landTiles)) * 100);
    return `<li class="hud__board-row${mine ? " hud__board-row--me" : ""}">
      <span class="hud__board-rank">${index + 1}</span>
      <span class="hud__board-name">${p.race ? RACES[p.race].emblem + " " : ""}${escapeHtml(p.name)}</span>
      <span class="lw-numeric">${share}</span>
      <span class="hud__board-troops lw-numeric">${formatNumber(p.troops)}</span></li>`;
  }
}
