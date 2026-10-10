import { raceTincture } from "@legionwar/design-system";
import {
  BUILDINGS,
  BuildingKind,
  RACES,
  Race,
  TIME_LIMIT_TICKS,
  TWILIGHT_START_TICKS,
  TWILIGHT_STEP_PERCENT,
  costFor,
  modifiersOf,
  type AttackView,
  type BoatView,
  type PlayerView,
} from "@legionwar/engine";
import { ContextMenu } from "./ContextMenu";
import { DealCards } from "./DealCards";
import { escapeHtml, formatClock, formatNumber, formatPercent } from "./format";

export interface HudCallbacks {
  onRatioChange(ratio: number): void;
  onBuildMode(kind: BuildingKind | null): void;
  onExit(): void;
}

export interface HudState {
  me: PlayerView | null;
  players: readonly PlayerView[];
  attacks: readonly AttackView[];
  boats: readonly BoatView[];
  inSpawnPhase: boolean;
  ratio: number;
  buildMode: BuildingKind | null;
  landTiles: number;
  goldPerSecond: number;
  /** Tick courant (statut de Parjure). */
  tick: number;
  /** Porteur de la Couronne (≥ 35 % des terres), ou null. */
  crown: number | null;
  /** Nom du niveau des prétendants (Écuyer…), pour l'infobulle du classement. */
  nationLevel: string;
  /** Horloge de guerre (ticks depuis la fin du déploiement) et seuil de victoire courant. */
  warTicks: number;
  winPercent: number;
}

export type EventTone = "info" | "good" | "bad";

const LOG_SIZE = 7;
const ALERT_COOLDOWN_MS = 15_000;
/** Le compte à rebours du Crépuscule s'affiche 2 min avant. */
const TWILIGHT_WARNING_TICKS = 1200;

/** Compteur de la mécanique propre à chaque peuple (GDD §7.3). */
const RACE_STAT: Record<Race, { label: string; hint: string; value: (p: PlayerView) => string }> = {
  [Race.Aldoria]: {
    label: "Remparts",
    hint: "Une frontière tenue 10 à 20 s se fortifie : l'assaillant y perd 1,5× plus de troupes.",
    value: (p) => `${formatNumber(p.marks)} lieues`,
  },
  [Race.Kharag]: {
    label: "Or pillé",
    hint: "15 or par terre prise à un royaume (7 sur une tribu), sauf sur un charnier.",
    value: (p) => formatNumber(p.pillaged),
  },
  [Race.Morvane]: {
    label: "Morts relevés",
    hint: "Prendre un charnier, champ de bataille de moins d'une minute, relève 15 % de ses morts.",
    value: (p) => formatNumber(p.raised),
  },
  [Race.Sylvanor]: {
    label: "Bosquets",
    hint: "Vos plaines proches d'une forêt se boisent et se défendent comme une forêt.",
    value: (p) => formatNumber(p.marks),
  },
};
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
  private lastAlert = -Infinity;
  private skin: Race | null = null;
  /** Menu contextuel (clic droit sur la carte) et cartes de diplomatie. */
  readonly menu: ContextMenu;
  readonly deals: DealCards;

  constructor(root: HTMLElement, callbacks: HudCallbacks) {
    this.el = document.createElement("div");
    this.el.className = "hud";
    // L'habillage du peuple joué couvre tout le HUD sauf la modale de fin, restée sur papier :
    // son cartouche est une gravure à l'encre, illisible sur un fond sombre.
    this.el.innerHTML = `
      <div class="hud__skin" id="hud-skin">
      <section class="lw-panel lw-panel--translucent hud__me" aria-label="Votre royaume">
        <div class="hud__identity">
          <span class="lw-shield lw-shield--lg" id="hud-shield" aria-hidden="true"><span id="hud-emblem"></span></span>
          <div><h2 class="lw-title-3" id="hud-name"></h2><p class="lw-overline" id="hud-race"></p></div>
        </div>
        <div class="lw-stat"><span class="lw-stat__label">Or</span><span class="lw-stat__value" id="hud-gold"></span></div>
        <div class="lw-stat"><span class="lw-stat__label">Troupes</span><span class="lw-stat__value" id="hud-troops"></span></div>
        <div class="lw-progress" role="presentation"><div class="lw-progress__fill" id="hud-troops-bar"></div></div>
        <div class="lw-stat"><span class="lw-stat__label">Territoire</span><span class="lw-stat__value" id="hud-land"></span></div>
        <div class="lw-stat" id="hud-race-stat" hidden><span class="lw-stat__label" id="hud-race-label"></span><span class="lw-stat__value" id="hud-race-value"></span></div>
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
        <p class="hud__clock lw-text-sm" id="hud-clock" aria-live="off"></p>
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
              <img class="hud__build-icon" src="/art/buildings/${kind}.webp" alt="" width="256" height="256" />
              <span class="hud__build-name">${BUILDINGS[kind].name}</span>
              <span class="hud__build-cost lw-numeric" data-cost="${kind}"></span></button>`,
          )
          .join("")}
      </nav>
      <div class="hud__hover lw-text-sm" id="hud-hover"></div>
      <div class="hud__deals" id="hud-deals" aria-live="polite"></div>
      </div>
      <div class="hud__alert" id="hud-alert" aria-hidden="true"></div>
      <div class="lw-modal" id="hud-modal" hidden>
        <div class="lw-panel lw-modal__dialog hud__end" role="dialog" aria-modal="true" aria-labelledby="hud-modal-title">
          <div class="hud__end-cartouche" id="hud-modal-cartouche">
            <h2 class="lw-modal__title hud__end-title" id="hud-modal-title"></h2>
          </div>
          <p id="hud-modal-text"></p>
          <div class="lw-modal__actions">
            <button class="lw-button lw-button--primary" id="hud-modal-exit">Retour au menu</button>
          </div>
        </div>
      </div>`;
    root.append(this.el);
    this.$ = <T extends HTMLElement>(sel: string): T => this.el.querySelector(sel) as T;
    this.menu = new ContextMenu(this.$("#hud-skin"));
    this.deals = new DealCards(this.$("#hud-deals"));

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
      if (me.race !== this.skin) {
        this.skin = me.race;
        this.$("#hud-skin").className = me.race
          ? `hud__skin lw-skin lw-skin--${me.race}`
          : "hud__skin";
      }
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
      const stat = me.race ? RACE_STAT[me.race] : null;
      const statRow = this.$("#hud-race-stat");
      statRow.hidden = stat === null;
      if (stat) {
        const label = this.$("#hud-race-label");
        label.textContent = stat.label;
        label.dataset.tooltip = stat.hint;
        this.$("#hud-race-value").textContent = stat.value(me);
      }
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
    this.renderClock(state);
  }

  /**
   * Horloge de guerre et seuil de victoire : « 12:40 · Victoire à 80 % », puis le compte à
   * rebours du Crépuscule, puis le seuil qui baisse et l'heure du sacre (GDD §14).
   */
  private renderClock(state: HudState): void {
    const el = this.$("#hud-clock");
    if (state.inSpawnPhase) {
      el.textContent = "";
      return;
    }
    const t = state.warTicks;
    let text = `⌛ ${formatClock(t)} · Victoire à ${state.winPercent} %`;
    if (t >= TWILIGHT_START_TICKS) {
      text = `⌛ ${formatClock(t)} · Crépuscule : victoire à ${state.winPercent} % (−${TWILIGHT_STEP_PERCENT}/min) · sacre dans ${formatClock(TIME_LIMIT_TICKS - t)}`;
    } else if (t >= TWILIGHT_START_TICKS - TWILIGHT_WARNING_TICKS) {
      text += ` · Crépuscule dans ${formatClock(TWILIGHT_START_TICKS - t)}`;
    }
    el.textContent = text;
    el.classList.toggle("hud__clock--twilight", t >= TWILIGHT_START_TICKS);
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

  /** Fin de partie : titre dans le cartouche de victoire (trompettes et lauriers) ou, en cas
   * de défaite, dans le cartouche sobre du titre. */
  /** Cadre d'alerte sur les bords de l'écran quand on vous attaque (au plus une fois par 15 s). */
  alert(): void {
    const now = performance.now();
    if (now - this.lastAlert < ALERT_COOLDOWN_MS) return;
    this.lastAlert = now;
    const frame = this.$("#hud-alert");
    frame.classList.remove("hud__alert--on");
    // Relance l'animation CSS : la lecture de la mise en page force le redémarrage.
    void frame.offsetWidth;
    frame.classList.add("hud__alert--on");
  }

  showEnd(title: string, text: string, victory: boolean): void {
    if (this.ended) return;
    this.ended = true;
    this.$("#hud-modal-cartouche").dataset.outcome = victory ? "victory" : "defeat";
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
    const row = (outgoing: boolean, icon: string, otherId: number, troops: number): string => {
      const other = otherId === 0 ? "Terres libres" : (names.get(otherId) ?? "?");
      return `<li class="hud__attack hud__attack--${outgoing ? "out" : "in"}">
          <span>${icon} ${outgoing ? "→" : "←"} ${escapeHtml(other)}</span>
          <span class="lw-numeric">${formatNumber(troops)}</span></li>`;
    };
    const land = state.attacks
      .filter((a) => a.attacker === me.id || a.target === me.id)
      .map((a) => {
        const outgoing = a.attacker === me.id;
        return row(outgoing, outgoing ? "⚔" : "⚠", outgoing ? a.target : a.attacker, a.troops);
      });
    const sea = state.boats
      .filter((b) => b.owner === me.id || b.target === me.id)
      .map((b) => {
        const outgoing = b.owner === me.id;
        return row(outgoing, "⛵", outgoing ? b.target : b.owner, b.troops);
      });
    this.$("#hud-attacks").innerHTML = [...sea, ...land].slice(0, 7).join("");
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
    const ally = state.me?.allies.includes(p.id) ?? false;
    const parjure = p.parjureUntil > state.tick;
    const classes = ["hud__board-row"];
    if (mine) classes.push("hud__board-row--me");
    if (ally) classes.push("hud__board-row--ally");
    if (parjure) classes.push("hud__board-row--parjure");
    // Infobulle : type de joueur, alliance, trahisons.
    const kind =
      p.kind === "human"
        ? "Seigneur"
        : p.kind === "nation"
          ? `Prétendant (${state.nationLevel})`
          : "Tribu";
    const tip = [
      kind,
      ally ? "votre allié" : "",
      p.id === state.crown
        ? "porte la Couronne : ses conquêtes coûtent 50 % de troupes en plus"
        : "",
      parjure ? "Parjure" : "",
      p.betrayals > 0 ? `${p.betrayals} trahison${p.betrayals > 1 ? "s" : ""}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    const marks = `${p.id === state.crown ? "♛ " : ""}${parjure ? "✗ " : ""}`;
    return `<li class="${classes.join(" ")}" data-tooltip="${escapeHtml(tip)}">
      <span class="hud__board-rank">${index + 1}</span>
      <span class="hud__board-name">${marks}${p.race ? RACES[p.race].emblem + " " : ""}${escapeHtml(p.name)}</span>
      <span class="lw-numeric">${share}</span>
      <span class="hud__board-troops lw-numeric">${formatNumber(p.troops)}</span></li>`;
  }
}
