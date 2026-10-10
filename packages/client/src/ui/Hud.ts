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
import { RadialMenu } from "./RadialMenu";
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
  /** Commerce : vos nefs en mer, vos caravanes en route et l'or gagné pendant la dernière minute. */
  trade: { nefs: number; caravans: number; perMinute: number };
}

/** Fiche du royaume survolé, affichée en haut de l'écran (comme OpenFront). */
export type InfoModel =
  | {
      kind: "player";
      player: PlayerView;
      /** Troupes engagées dans ses attaques et barges en cours. */
      committed: number;
      typeLabel: string;
      /** État du commerce avec vous (ports, embargo), null pour vous-même ou une tribu. */
      trade: string | null;
      /** Disposition d'un prétendant envers vous. */
      disposition: { label: string; tone: "hostile" | "wary" | "neutral" | "friendly" } | null;
      self: boolean;
      ally: boolean;
      /** Temps restant (ticks) d'une alliance avec vous, d'un statut de Parjure. */
      allyLeft: number | null;
      parjureLeft: number | null;
      crown: boolean;
      /** Demande d'alliance en attente : de sa part, ou de la vôtre. */
      requested: "fromThem" | "fromMe" | null;
      landShare: number;
      /** Terrain survolé et marques (Rempart, Charnier…). */
      detail: string;
      actions: { label: string; key: string; danger?: boolean; run: () => void }[];
    }
  | { kind: "land"; title: string; detail: string };

export type EventTone = "info" | "good" | "bad";

const LOG_SIZE = 6;
const ALERT_COOLDOWN_MS = 15_000;
/** Le compte à rebours du Crépuscule s'affiche 2 min avant. */
const TWILIGHT_WARNING_TICKS = 1200;
/** Un gain d'or ponctuel reste affiché 2 s au-dessus de la case d'or. */
const GOLD_GAIN_MS = 2000;

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
  [BuildingKind.Port]: "3",
  [BuildingKind.Marche]: "4",
};

const BUILD_HELP: Record<BuildingKind, string> = {
  [BuildingKind.Bourg]: "Augmente le plafond de troupes de 250 k.",
  [BuildingKind.Tour]: "Ralentit et saigne les assaillants à portée.",
  [BuildingKind.Port]:
    "Sur une côte de mer. Arme une nef marchande toutes les 15 s : 40 or par lieue de mer, jusqu'à 20 000, pour chacun des deux ports.",
  [BuildingKind.Marche]:
    "Envoie une caravane toutes les 10 s vers vos Bourgs et Ports et ceux des voisins à 40 cases : 2 000 or par étape chez vous, 6 000 chez un voisin (à vous deux), 8 000 chez un allié.",
};

/** « 1 port », « 3 ports ». */
function plural(n: number, word: string): string {
  return `${n} ${word}${n > 1 ? "s" : ""}`;
}

/** Bâtiments possédés d'un type (chantiers compris). */
export function ownedOf(p: PlayerView, kind: BuildingKind): number {
  switch (kind) {
    case BuildingKind.Bourg:
      return p.bourgs;
    case BuildingKind.Tour:
      return p.tours;
    case BuildingKind.Port:
      return p.ports;
    case BuildingKind.Marche:
      return p.marches;
  }
}

/**
 * Interface en jeu (DOM superposé au canvas), construite avec les composants du design system
 * et disposée comme OpenFront : panneau de contrôle en bas (régénération, troupes, or, ratio,
 * bâtiments), fiche du royaume survolé en haut, classement à droite, menu radial au clic droit.
 */
export class Hud {
  private readonly el: HTMLElement;
  private readonly $: <T extends HTMLElement>(sel: string) => T;
  private readonly log: { text: string; tone: EventTone }[] = [];
  private ended = false;
  private lastAlert = -Infinity;
  private skin: Race | null = null;
  private lastRegen = 0;
  private goldGainTimer = 0;
  /** Menu radial (clic droit), menu de confirmation et cartes de diplomatie. */
  readonly radial: RadialMenu;
  readonly menu: ContextMenu;
  readonly deals: DealCards;

  constructor(root: HTMLElement, callbacks: HudCallbacks) {
    this.el = document.createElement("div");
    this.el.className = "hud";
    // L'habillage du peuple joué couvre tout le HUD sauf la modale de fin, restée sur papier :
    // son cartouche est une gravure à l'encre, illisible sur un fond sombre.
    this.el.innerHTML = `
      <div class="hud__skin" id="hud-skin">
      <section class="lw-panel lw-panel--translucent lw-panel--compact hud__board" aria-label="Classement">
        <div class="lw-panel__header">
          <h2 class="lw-title-3">Classement</h2>
          <button class="lw-button lw-button--ghost lw-button--sm" id="hud-exit">Quitter</button>
        </div>
        <p class="hud__clock lw-text-sm" id="hud-clock" aria-live="off"></p>
        <ol class="hud__board-list" id="hud-board"></ol>
      </section>
      <div class="lw-panel lw-panel--compact hud__banner" id="hud-banner" role="status"></div>
      <section class="lw-panel lw-panel--translucent lw-panel--compact hud__info" id="hud-info" hidden aria-live="off"></section>
      <div class="hud__deals" id="hud-deals" aria-live="polite"></div>
      <ul class="hud__log" id="hud-log" aria-live="polite"></ul>
      <div class="hud__bottom">
        <ul class="hud__attacks" id="hud-attacks" aria-label="Attaques en cours"></ul>
        <section class="lw-panel lw-panel--translucent lw-panel--compact hud__control" id="hud-control" aria-label="Votre royaume" hidden>
          <div class="hud__control-row">
            <span class="hud__pill hud__pill--regen lw-numeric" id="hud-regen" data-tooltip="Troupes régénérées par seconde"></span>
            <div class="hud__bar" id="hud-troops-bar">
              <div class="hud__bar-home" id="hud-troops-home"></div>
              <div class="hud__bar-out" id="hud-troops-out"></div>
              <span class="hud__bar-text lw-numeric" id="hud-troops"></span>
            </div>
            <span class="hud__pill hud__pill--gold lw-numeric" id="hud-gold">
              <span id="hud-gold-value"></span><span class="hud__gold-gain" id="hud-gold-gain" aria-hidden="true"></span>
            </span>
          </div>
          <div class="hud__control-row">
            <span class="hud__pill hud__pill--ratio lw-numeric" id="hud-ratio" data-tooltip="Ratio d'attaque : T / Y, ou Maj + molette"></span>
            <input class="lw-range hud__ratio-range" type="range" min="1" max="100" id="hud-ratio-input" aria-label="Ratio d'attaque" />
            <span class="hud__pill hud__pill--race lw-numeric" id="hud-race-stat" hidden></span>
          </div>
          <p class="hud__trade lw-numeric" id="hud-trade" hidden></p>
          <div class="hud__hotbar" role="toolbar" aria-label="Construction">
            ${(Object.values(BuildingKind) as BuildingKind[])
              .map(
                (
                  kind,
                ) => `<button type="button" class="hud__slot" data-kind="${kind}" aria-pressed="false" aria-label="${BUILDINGS[kind].name}">
                  <span class="hud__slot-key">${BUILD_KEYS[kind]}</span>
                  <img class="hud__slot-icon" src="/art/buildings/${kind}.webp" alt="" width="256" height="256" />
                  <span class="hud__slot-count lw-numeric" data-count="${kind}">0</span>
                </button>`,
              )
              .join("")}
          </div>
        </section>
      </div>
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
    const skin = this.$("#hud-skin");
    this.radial = new RadialMenu(skin);
    this.menu = new ContextMenu(skin);
    this.deals = new DealCards(this.$("#hud-deals"));

    const ratioInput = this.$<HTMLInputElement>("#hud-ratio-input");
    ratioInput.addEventListener("input", () =>
      callbacks.onRatioChange(Number(ratioInput.value) / 100),
    );
    // Le curseur rend le focus au relâchement : les raccourcis clavier restent actifs.
    ratioInput.addEventListener("change", () => ratioInput.blur());
    this.$("#hud-exit").addEventListener("click", () => callbacks.onExit());
    this.$("#hud-modal-exit").addEventListener("click", () => callbacks.onExit());
    this.$("#hud-control").addEventListener("contextmenu", (e) => e.preventDefault());
    for (const button of this.el.querySelectorAll<HTMLButtonElement>(".hud__slot")) {
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
    // Comme sur OpenFront : pas de panneau de contrôle pendant le déploiement ni une fois mort.
    const control = this.$("#hud-control");
    control.hidden = state.inSpawnPhase || !me || !me.alive;

    if (me) {
      if (me.race !== this.skin) {
        this.skin = me.race;
        this.$("#hud-skin").className = me.race
          ? `hud__skin lw-skin lw-skin--${me.race}`
          : "hud__skin";
      }
      this.renderControl(me, state);
      this.renderAttacks(state);
    }
    this.renderBoard(state);
    this.renderClock(state);
  }

  /** Panneau du bas : régénération, troupes (à la maison et engagées), or, ratio, bâtiments. */
  private renderControl(me: PlayerView, state: HudState): void {
    const perSecond = me.troopRegen * 10;
    const regen = this.$("#hud-regen");
    regen.textContent = `+${formatNumber(perSecond)}/s`;
    regen.classList.toggle("hud__pill--falling", perSecond < this.lastRegen);
    this.lastRegen = perSecond;

    // Troupes engagées : attaques et barges en cours.
    let committed = 0;
    for (const a of state.attacks) if (a.attacker === me.id) committed += a.troops;
    for (const b of state.boats) if (b.owner === me.id) committed += b.troops;
    const max = Math.max(1, me.maxTroops);
    const home = Math.min(100, (me.troops / max) * 100);
    this.$("#hud-troops-home").style.width = `${home}%`;
    this.$("#hud-troops-out").style.width = `${Math.min(100 - home, (committed / max) * 100)}%`;
    this.$("#hud-troops").textContent =
      `${formatNumber(me.troops)} / ${formatNumber(me.maxTroops)}`;
    this.$("#hud-troops-bar").dataset.tooltip = committed
      ? `${formatNumber(me.troops)} à la maison, ${formatNumber(committed)} engagées au combat`
      : `${formatNumber(me.troops)} à la maison`;

    this.$("#hud-gold-value").textContent = `◉ ${formatNumber(me.gold)}`;
    this.$("#hud-gold").dataset.tooltip = `Or : +${formatNumber(state.goldPerSecond)}/s`;

    this.$("#hud-ratio").textContent =
      `⚔ ${Math.round(state.ratio * 100)} % (${formatNumber(me.troops * state.ratio)})`;
    const ratioInput = this.$<HTMLInputElement>("#hud-ratio-input");
    if (document.activeElement !== ratioInput) {
      ratioInput.value = String(Math.round(state.ratio * 100));
    }

    const stat = me.race ? RACE_STAT[me.race] : null;
    const statPill = this.$("#hud-race-stat");
    statPill.hidden = stat === null;
    if (stat) {
      statPill.textContent = `${stat.label} : ${stat.value(me)}`;
      statPill.dataset.tooltip = stat.hint;
    }

    const trade = this.$("#hud-trade");
    trade.hidden = me.ports === 0 && me.marches === 0;
    const parts: string[] = [];
    if (me.ports > 0)
      parts.push(`⚓ ${plural(me.ports, "port")} · ${plural(state.trade.nefs, "nef")} en mer`);
    if (me.marches > 0) {
      parts.push(`⚖ ${plural(me.marches, "marché")} · ${plural(state.trade.caravans, "caravane")}`);
    }
    parts.push(`+${formatNumber(state.trade.perMinute)} or/min`);
    trade.textContent = parts.join(" · ");

    const mods = modifiersOf(me.race);
    for (const kind of Object.values(BuildingKind) as BuildingKind[]) {
      const owned = ownedOf(me, kind);
      const cost = costFor(kind, owned, mods);
      const button = this.$<HTMLButtonElement>(`.hud__slot[data-kind="${kind}"]`);
      this.$(`[data-count="${kind}"]`).textContent = String(owned);
      button.disabled = state.inSpawnPhase || !me.alive || me.gold < cost;
      button.setAttribute("aria-pressed", String(state.buildMode === kind));
      button.dataset.tooltip = `${BUILDINGS[kind].name} [${BUILD_KEYS[kind]}] — ${BUILD_HELP[kind]} ${formatNumber(cost)} or`;
    }
  }

  /** Gain d'or ponctuel (conquête, don…) : « +X » au-dessus de la case d'or pendant 2 s. */
  goldGain(amount: number): void {
    if (amount < 1) return;
    const el = this.$("#hud-gold-gain");
    el.textContent = `+${formatNumber(amount)}`;
    el.classList.remove("hud__gold-gain--on");
    void el.offsetWidth;
    el.classList.add("hud__gold-gain--on");
    window.clearTimeout(this.goldGainTimer);
    this.goldGainTimer = window.setTimeout(
      () => el.classList.remove("hud__gold-gain--on"),
      GOLD_GAIN_MS,
    );
  }

  /** Fiche du royaume survolé, en haut de l'écran ; null la cache. */
  showInfo(model: InfoModel | null): void {
    const el = this.$("#hud-info");
    if (!model) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.replaceChildren();
    if (model.kind === "land") {
      const id = node("div", "hud__info-id");
      id.append(
        node("strong", "hud__info-name", model.title),
        node("span", "hud__info-sub", model.detail),
      );
      el.append(id);
      return;
    }
    const p = model.player;

    // Bloc chiffres : or, troupes engagées, barre de troupes.
    const stats = node("div", "hud__info-stats");
    const top = node("div", "hud__info-top");
    top.append(
      node("span", "hud__pill hud__pill--gold lw-numeric", `◉ ${formatNumber(p.gold)}`),
      node(
        "span",
        `hud__info-attack lw-numeric${model.committed > 0 ? " hud__info-attack--on" : ""}`,
        `⚔↑ ${formatNumber(model.committed)}`,
      ),
    );
    const bar = node("div", "hud__bar hud__bar--small");
    const max = Math.max(1, p.maxTroops);
    const home = node("div", "hud__bar-home");
    home.style.width = `${Math.min(100, (p.troops / max) * 100)}%`;
    const out = node("div", "hud__bar-out");
    out.style.width = `${Math.min(100 - Math.min(100, (p.troops / max) * 100), (model.committed / max) * 100)}%`;
    bar.append(home, out, node("span", "hud__bar-text hud__bar-text--split lw-numeric", ""));
    const text = bar.lastElementChild as HTMLElement;
    text.append(
      node("span", "", formatNumber(p.troops)),
      node("span", "", formatNumber(p.maxTroops)),
    );
    stats.append(top, bar);

    // Bloc identité : écu, nom, disposition, type, statuts, bâtiments.
    const id = node("div", "hud__info-id");
    const nameRow = node("div", "hud__info-name-row");
    if (p.race) {
      const shield = node(
        "span",
        `lw-shield lw-shield--hatched lw-tincture-${raceTincture(p.race)}`,
      );
      shield.setAttribute("aria-hidden", "true");
      shield.append(node("span", "", RACES[p.race].emblem));
      nameRow.append(shield);
    }
    nameRow.append(
      node("strong", `hud__info-name${model.ally ? " hud__info-name--ally" : ""}`, p.name),
    );
    if (model.disposition) {
      nameRow.append(
        node(
          "span",
          `hud__info-mood hud__info-mood--${model.disposition.tone}`,
          model.disposition.label,
        ),
      );
    }
    const race = p.race ? RACES[p.race].name : "";
    id.append(
      nameRow,
      node(
        "span",
        "hud__info-sub",
        [model.typeLabel, race, formatPercent(model.landShare)].filter(Boolean).join(" · "),
      ),
    );
    const statuses: [string, string][] = [];
    if (model.crown) statuses.push(["hud__status--crown", "♛ Couronne"]);
    if (model.parjureLeft !== null) {
      statuses.push(["hud__status--parjure", `✗ Parjure ${formatClock(model.parjureLeft)}`]);
    }
    if (model.allyLeft !== null) {
      statuses.push(["hud__status--ally", `⚭ Allié ${formatClock(model.allyLeft)}`]);
    }
    if (model.requested === "fromThem")
      statuses.push(["hud__status--ally", "✉ Vous propose une alliance"]);
    if (model.requested === "fromMe") statuses.push(["", "✉ Demande envoyée"]);
    if (p.betrayals > 0) {
      statuses.push([
        "hud__status--parjure",
        `${p.betrayals} trahison${p.betrayals > 1 ? "s" : ""}`,
      ]);
    }
    if (model.trade) statuses.push(["hud__status--trade", model.trade]);
    if (statuses.length > 0) {
      const row = node("div", "hud__info-status");
      for (const [cls, label] of statuses) row.append(node("span", `hud__status ${cls}`, label));
      id.append(row);
    }
    id.append(
      node(
        "span",
        "hud__info-detail",
        [
          `Bourgs ${p.bourgs}`,
          `Tours ${p.tours}`,
          `Ports ${p.ports}`,
          `Marchés ${p.marches}`,
          model.detail,
        ]
          .filter(Boolean)
          .join(" · "),
      ),
    );
    el.append(stats, id);

    // Raccourcis (écran large) : alliance [K], rupture [L], barge [B].
    if (model.actions.length > 0) {
      const actions = node("div", "hud__info-actions");
      for (const action of model.actions) {
        const button = node(
          "button",
          `lw-button lw-button--sm${action.danger ? " lw-button--danger" : ""}`,
          action.label,
        ) as HTMLButtonElement;
        button.type = "button";
        const kbd = node("span", "lw-kbd", action.key);
        button.append(" ", kbd);
        button.addEventListener("click", () => action.run());
        actions.append(button);
      }
      el.append(actions);
    }
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

  pushEvent(text: string, tone: EventTone = "info"): void {
    this.log.unshift({ text, tone });
    this.log.length = Math.min(this.log.length, LOG_SIZE);
    this.$("#hud-log").innerHTML = this.log
      .map((e) => `<li class="lw-toast lw-toast--${e.tone}">${escapeHtml(e.text)}</li>`)
      .join("");
  }

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

  /** Fin de partie : titre dans le cartouche de victoire (trompettes et lauriers) ou, en cas
   * de défaite, dans le cartouche sobre du titre. */
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
    window.clearTimeout(this.goldGainTimer);
    this.radial.close();
    this.menu.close();
    this.el.remove();
  }

  /** Attaques en cours au-dessus du panneau de contrôle (comme OpenFront). */
  private renderAttacks(state: HudState): void {
    const me = state.me as PlayerView;
    const names = new Map(state.players.map((p) => [p.id, p.name]));
    const row = (outgoing: boolean, icon: string, otherId: number, troops: number): string => {
      const other = otherId === 0 ? "Terres libres" : (names.get(otherId) ?? "?");
      return `<li class="lw-toast hud__attack hud__attack--${outgoing ? "out" : "in"}">
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
    this.$("#hud-attacks").innerHTML = [...sea, ...land].slice(0, 5).join("");
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

/** Élément DOM avec classes et texte (jamais de HTML : les noms de joueurs restent du texte). */
function node(tag: string, className: string, text?: string): HTMLElement {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}
