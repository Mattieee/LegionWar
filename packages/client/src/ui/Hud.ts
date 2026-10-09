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

/** Interface en jeu (DOM superposé au canvas). */
export class Hud {
  private readonly el: HTMLElement;
  private readonly $: <T extends HTMLElement>(sel: string) => T;
  private readonly log: { text: string; tone: EventTone }[] = [];
  private ended = false;

  constructor(root: HTMLElement, callbacks: HudCallbacks) {
    this.el = document.createElement("div");
    this.el.className = "hud";
    this.el.innerHTML = `
      <section class="panel hud__me" aria-label="Votre royaume">
        <div class="hud__identity"><span class="hud__emblem" id="hud-emblem"></span>
          <div><div class="hud__name" id="hud-name"></div><div class="hud__race" id="hud-race"></div></div>
        </div>
        <div class="stat"><span class="stat__label">Or</span><span class="stat__value" id="hud-gold"></span></div>
        <div class="stat"><span class="stat__label">Troupes</span><span class="stat__value" id="hud-troops"></span></div>
        <div class="bar"><div class="bar__fill" id="hud-troops-bar"></div></div>
        <div class="stat"><span class="stat__label">Territoire</span><span class="stat__value" id="hud-land"></span></div>
        <label class="ratio">
          <span class="stat__label">Ratio d'attaque <kbd>T</kbd>/<kbd>Y</kbd> : <strong id="hud-ratio"></strong></span>
          <input type="range" min="1" max="100" id="hud-ratio-input" />
        </label>
        <ul class="hud__attacks" id="hud-attacks" aria-label="Attaques en cours"></ul>
      </section>
      <section class="panel hud__board" aria-label="Classement">
        <div class="hud__board-head"><h2>Classement</h2>
          <button class="button button--small" id="hud-exit">Quitter</button></div>
        <ol id="hud-board"></ol>
      </section>
      <div class="hud__banner" id="hud-banner" role="status"></div>
      <ul class="hud__log" id="hud-log" aria-live="polite"></ul>
      <nav class="panel hud__build" aria-label="Construction">
        ${(Object.values(BuildingKind) as BuildingKind[])
          .map(
            (kind) => `<button class="build" data-kind="${kind}" aria-pressed="false">
              <kbd>${BUILD_KEYS[kind]}</kbd><span class="build__name">${BUILDINGS[kind].name}</span>
              <span class="build__cost" data-cost="${kind}"></span></button>`,
          )
          .join("")}
      </nav>
      <div class="hud__hover" id="hud-hover"></div>
      <div class="modal" id="hud-modal" hidden>
        <div class="panel modal__box">
          <h2 class="modal__title" id="hud-modal-title"></h2>
          <p id="hud-modal-text"></p>
          <button class="button button--primary" id="hud-modal-exit">Retour au menu</button>
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
    for (const button of this.el.querySelectorAll<HTMLButtonElement>(".build")) {
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
      this.$("#hud-emblem").style.color = race?.heraldry ?? "";
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
      if (document.activeElement !== ratioInput)
        ratioInput.value = String(Math.round(state.ratio * 100));

      const mods = modifiersOf(me.race);
      for (const kind of Object.values(BuildingKind) as BuildingKind[]) {
        const owned = kind === BuildingKind.Bourg ? me.bourgs : me.tours;
        const cost = costFor(kind, owned, mods);
        const button = this.$<HTMLButtonElement>(`.build[data-kind="${kind}"]`);
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
      .map((e) => `<li class="log log--${e.tone}">${escapeHtml(e.text)}</li>`)
      .join("");
  }

  showEnd(title: string, text: string): void {
    if (this.ended) return;
    this.ended = true;
    this.$("#hud-modal-title").textContent = title;
    this.$("#hud-modal-text").textContent = text;
    this.$("#hud-modal").hidden = false;
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
        return `<li class="attack attack--${outgoing ? "out" : "in"}">${outgoing ? "⚔ →" : "⚠ ←"} ${escapeHtml(other ?? "?")} <span>${formatNumber(a.troops)}</span></li>`;
      });
    this.$("#hud-attacks").innerHTML = rows.join("");
  }

  private renderBoard(state: HudState): void {
    const ranked = state.players
      .filter((p) => p.alive && p.spawned)
      .sort((a, b) => b.tiles - a.tiles);
    const myIndex = state.me ? ranked.findIndex((p) => p.id === state.me?.id) : -1;
    const rows = ranked.slice(0, 10).map((p, i) => this.boardRow(p, i, state));
    if (myIndex >= 10 && state.me)
      rows.push(this.boardRow(ranked[myIndex] as PlayerView, myIndex, state));
    this.$("#hud-board").innerHTML = rows.join("");
  }

  private boardRow(p: PlayerView, index: number, state: HudState): string {
    const mine = p.id === state.me?.id;
    const share = formatPercent((p.tiles / Math.max(1, state.landTiles)) * 100);
    return `<li class="board__row${mine ? " board__row--me" : ""}">
      <span class="board__rank">${index + 1}</span>
      <span class="board__name">${p.race ? RACES[p.race].emblem + " " : ""}${escapeHtml(p.name)}</span>
      <span class="board__share">${share}</span>
      <span class="board__troops">${formatNumber(p.troops)}</span></li>`;
  }
}
