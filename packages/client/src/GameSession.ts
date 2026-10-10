import {
  ALLIANCE_RENEW_WINDOW,
  ALLIANCE_REQUEST_TICKS,
  BUILDINGS,
  BuildingKind,
  CHARNIER_BIT,
  DIFFICULTIES,
  RACES,
  costFor,
  GameMap,
  MARK_BIT,
  Race,
  TERRAIN_NAMES,
  TICK_MS,
  TOWER_RANGE,
  TWILIGHT_STEP_PERCENT,
  modifiersOf,
  type AttackView,
  type BoatRejection,
  type BoatView,
  type BuildRejection,
  type BuildingView,
  type DiplomacyRejection,
  type DiplomacyView,
  type GameConfig,
  type GameEvent,
  type PlayerView,
  type TickResult,
  type WinReason,
} from "@legionwar/engine";
import { Input } from "./input/Input";
import { LocalServer } from "./LocalServer";
import { BattleFx } from "./render/BattleFx";
import { Camera } from "./render/Camera";
import { type RGB, playerColor } from "./render/colors";
import { type Label, computeLabels } from "./render/Labels";
import { SceneRenderer } from "./render/SceneRenderer";
import { placeSeaOrnaments } from "./render/SeaDecor";
import { TerritoryLayer } from "./render/TerritoryLayer";
import { formatClock, formatNumber } from "./ui/format";
import { Hud, type EventTone } from "./ui/Hud";
import type { MenuEntry, MenuModel } from "./ui/ContextMenu";
import type { DealCard } from "./ui/DealCards";
import type { MenuChoice } from "./ui/Menu";
import type { FromWorker, ToWorker } from "./workerProtocol";

const CLIENT_ID = "local";
const LABEL_INTERVAL_MS = 500;
const DEFAULT_RATIO = 0.2;
const RATIO_STEP = 0.1;
const KEY_ZOOM_FACTOR = 1.25;

const REJECTION_TEXT: Record<BuildRejection, string> = {
  spawnPhase: "Impossible de bâtir pendant le déploiement.",
  notOwned: "Vous devez bâtir sur vos propres terres.",
  terrain: "Ce terrain ne peut pas accueillir de bâtiment.",
  tooClose: "Trop près d'un autre bâtiment.",
  gold: "Or insuffisant.",
};

const BOAT_REJECTION_TEXT: Record<BoatRejection, string> = {
  maxBoats: "Toutes vos barges sont déjà en mer (3 au maximum).",
  notCoastal: "Aucune plage où débarquer près de cette terre.",
  noRoute: "Aucune route maritime : il vous faut une côte sur la même mer.",
  ally: "Cette plage appartient à un allié.",
};

const DIPLOMACY_REJECTION_TEXT: Record<DiplomacyRejection, string> = {
  disabled: "Les alliances sont désactivées dans cette partie.",
  invalidTarget: "Impossible de traiter avec ce royaume.",
  ally: "Vous êtes alliés : impossible de l'attaquer.",
  notAlly: "Ce royaume n'est pas votre allié.",
  cooldown: "Patientez avant de renouveler votre demande.",
  maxAlliances: "Trop d'alliances (5 au maximum).",
  noRequest: "Aucune demande en attente de ce royaume.",
  notRenewable: "L'alliance ne peut être renouvelée que dans ses 30 dernières secondes.",
  lastSurvivors:
    "La Couronne ne se partage pas : plus de renouvellement entre derniers survivants.",
};

/** Disposition d'un prétendant d'après sa relation (GDD §12.1). */
function disposition(relation: number): string {
  if (relation < -50) return "Hostile";
  if (relation < 0) return "Méfiant";
  if (relation < 50) return "Neutre";
  return "Amical";
}

/** Cartes de diplomatie visibles en même temps, au plus. */
const MAX_DEALS = 3;

/** Délai pour confirmer une rupture d'alliance par un second appui sur L (ms). */
const BREAK_CONFIRM_MS = 2000;

/** Une partie solo : worker de simulation + horloge locale + rendu + interface. */
export class GameSession {
  private readonly container: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly loading: HTMLElement;
  private readonly worker: Worker;
  private readonly server: LocalServer;
  private readonly camera = new Camera();
  private readonly abort = new AbortController();
  private readonly colors = new Map<number, RGB>();
  /** Second appui attendu sur L pour rompre une alliance : allié visé et instant du premier. */
  private pendingBreak: { ally: number; at: number } | null = null;

  private map: GameMap | null = null;
  private territory: TerritoryLayer | null = null;
  private scene: SceneRenderer | null = null;
  private battle: BattleFx | null = null;
  private diplomacy: DiplomacyView | null = null;
  /** Tick courant de la simulation (échéances des alliances, Parjures). */
  private tick = 0;
  /** Horloge de guerre, seuil de victoire et porteur de la Couronne, tels que le moteur les applique. */
  private warTicks = 0;
  private winPercent = 80;
  private crown = 0;
  /** Alliés du joueur local : quand ils changent, les frontières concernées sont repeintes. */
  private myAllies = new Set<number>();
  /** Cartes de diplomatie déjà traitées par le joueur, masquées jusqu'à ce qu'elles disparaissent. */
  private readonly dismissedDeals = new Set<string>();
  private readonly nationLevel: string;
  private hud: Hud | null = null;
  private input: Input | null = null;

  private players = new Map<number, PlayerView>();
  private playerList: PlayerView[] = [];
  private buildings: BuildingView[] = [];
  private attacks: AttackView[] = [];
  private boats: BoatView[] = [];
  /** Tuile précédente de chaque barge, pour interpoler son déplacement entre deux ticks. */
  private boatFrom = new Map<number, number>();
  private lastTickTime = 0;
  private mines: number[] = [];
  private labels: Label[] = [];
  private lastLabelTime = -Infinity;
  private myId: number | null = null;
  private inSpawnPhase = true;
  private ratio = DEFAULT_RATIO;
  private buildMode: BuildingKind | null = null;
  private hoverTile: number | null = null;
  private goldPerSecond = 0;
  private lastGold: number | null = null;
  private centeredOnSpawn = false;
  private frame = 0;
  private disposed = false;

  constructor(
    root: HTMLElement,
    choice: MenuChoice,
    private readonly onExit: () => void,
  ) {
    this.nationLevel = DIFFICULTIES[choice.difficulty].name;
    this.container = document.createElement("div");
    this.container.className = "game";
    this.canvas = document.createElement("canvas");
    this.canvas.className = "game__canvas";
    this.loading = document.createElement("div");
    this.loading.className = "game__loading";
    this.loading.textContent = "Les cartographes tracent le continent…";
    this.container.append(this.canvas, this.loading);
    root.append(this.container);

    const config: GameConfig = {
      seed: choice.seed,
      mapSize: choice.mapSize,
      bots: choice.bots,
      nations: choice.nations,
      difficulty: choice.difficulty,
      singleplayer: true,
      humans: [{ clientId: CLIENT_ID, name: choice.name, race: choice.race }],
    };

    this.worker = new Worker(new URL("./sim.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (event: MessageEvent<FromWorker>) => this.onWorkerMessage(event.data);
    this.worker.onerror = (event) => this.fail(event.message || "Erreur du moteur de simulation");
    this.server = new LocalServer(CLIENT_ID, (turn) => this.post({ type: "turn", turn }));
    this.post({ type: "init", config });
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.server.stop();
    this.worker.terminate();
    this.abort.abort();
    this.input?.dispose();
    this.hud?.dispose();
    this.container.remove();
  }

  // Worker --------------------------------------------------------------------------------------

  private post(message: ToWorker): void {
    this.worker.postMessage(message);
  }

  private onWorkerMessage(msg: FromWorker): void {
    if (this.disposed) return;
    switch (msg.type) {
      case "ready":
        this.onReady(msg.width, msg.height, msg.terrain, msg.state, msg.mines);
        break;
      case "tick":
        this.onTick(msg.result);
        break;
      case "error":
        this.fail(msg.message);
        break;
    }
  }

  private onReady(
    width: number,
    height: number,
    terrain: Uint8Array,
    state: Uint16Array,
    mines: number[],
  ): void {
    this.map = new GameMap(width, height, terrain);
    this.battle = new BattleFx(width);
    this.mines = mines;
    this.territory = new TerritoryLayer(
      width,
      height,
      terrain,
      state,
      (owner) => this.colorOf(owner),
      (owner) => this.players.get(owner)?.race ?? null,
      (a, b) =>
        this.myId !== null &&
        ((a === this.myId && this.myAllies.has(b)) || (b === this.myId && this.myAllies.has(a))),
    );
    this.scene = new SceneRenderer(
      this.canvas,
      this.camera,
      this.territory,
      placeSeaOrnaments(this.map),
    );
    this.scene.resize();
    this.camera.fit(width, height);
    this.loading.remove();

    this.hud = new Hud(this.container, {
      onRatioChange: (ratio) => (this.ratio = ratio),
      onBuildMode: (kind) => (this.buildMode = kind),
      onExit: () => this.onExit(),
    });
    this.input = new Input(this.canvas, {
      onClick: (x, y, button) => this.onClick(x, y, button),
      onHover: (x, y) => this.onHover(x, y),
      onPan: (dx, dy) => this.camera.pan(dx, dy),
      onZoom: (x, y, factor) => this.camera.zoomAt(x, y, factor),
      onKey: (e) => this.onKey(e),
    });
    window.addEventListener("resize", () => this.scene?.resize(), { signal: this.abort.signal });

    this.server.start();
    this.frame = requestAnimationFrame(this.loop);
  }

  private onTick(result: TickResult): void {
    this.server.acknowledge();
    // Les joueurs d'abord : la peinture d'une tuile dépend de la race de son propriétaire.
    this.playerList = result.players;
    this.players = new Map(result.players.map((p) => [p.id, p]));
    // Avant d'appliquer les changements : les effets de bataille comparent à l'ancien propriétaire.
    if (this.territory) {
      const territory = this.territory;
      this.battle?.record(
        result.changedTiles,
        (t) => territory.owner(t),
        result.attacks,
        performance.now(),
      );
    }
    this.territory?.applyChanges(result.changedTiles);
    this.myId = result.players.find((p) => p.clientId === CLIENT_ID)?.id ?? null;
    if (result.buildings) this.buildings = result.buildings;
    if (result.diplomacy) this.diplomacy = result.diplomacy;
    this.tick = result.tick;
    this.warTicks = result.warTicks;
    this.winPercent = result.winPercent;
    const previousCrown = this.crown;
    this.crown = result.crown;
    this.attacks = result.attacks;
    const previous = new Map(this.boats.map((b) => [b.id, b.tile]));
    this.boatFrom = new Map(result.boats.map((b) => [b.id, previous.get(b.id) ?? b.tile]));
    this.boats = result.boats;
    this.lastTickTime = performance.now();
    this.inSpawnPhase = result.inSpawnPhase;

    const me = this.me();
    if (me) {
      if (this.lastGold !== null && me.gold >= this.lastGold) {
        this.goldPerSecond = this.goldPerSecond * 0.9 + (me.gold - this.lastGold) * 10 * 0.1;
      }
      this.lastGold = me.gold;
    }

    for (const event of result.events) this.handleEvent(event);
    if (this.crown !== previousCrown) this.announceCrown(previousCrown);
    this.syncAllies(me);
    this.hud?.deals.render(this.dealCards(me));
    this.hud?.update({
      me,
      players: this.playerList,
      attacks: this.attacks,
      boats: this.boats,
      inSpawnPhase: this.inSpawnPhase,
      ratio: this.ratio,
      buildMode: this.buildMode,
      landTiles: this.map?.numLandTiles ?? 1,
      goldPerSecond: this.goldPerSecond,
      tick: this.tick,
      crown: this.crown || null,
      nationLevel: this.nationLevel,
      warTicks: this.warTicks,
      winPercent: this.winPercent,
    });
  }

  /** Journal : la Couronne change de tête (GDD §6, « la Couronne se paie en sang »). */
  private announceCrown(previous: number): void {
    const me = this.myId;
    if (this.crown === me) {
      this.hud?.pushEvent(
        "Vous portez la Couronne : vos attaques contre les royaumes coûtent 50 % de troupes en plus, et les Ducs et Empereurs se liguent contre vous.",
        "bad",
      );
    } else if (previous === me && me !== null) {
      this.hud?.pushEvent("Vous perdez la Couronne.", "info");
    } else if (this.crown !== 0) {
      this.hud?.pushEvent(
        `${this.nameOf(this.crown)} porte la Couronne : ses conquêtes lui coûtent 50 % de troupes en plus.`,
        "info",
      );
    }
  }

  /** Repeint les frontières quand les alliés du joueur changent (liseré allié). */
  private syncAllies(me: PlayerView | null): void {
    const next = new Set(me?.allies ?? []);
    const changed = new Set<number>();
    for (const id of next) if (!this.myAllies.has(id)) changed.add(id);
    for (const id of this.myAllies) if (!next.has(id)) changed.add(id);
    this.myAllies = next;
    if (changed.size > 0 && me) {
      changed.add(me.id);
      this.territory?.repaintOwners(changed);
    }
  }

  /** Cartes actionnables : demandes d'alliance reçues, alliances à renouveler. */
  private dealCards(me: PlayerView | null): DealCard[] {
    const view = this.diplomacy;
    if (!me || !me.alive || !view) return [];
    const cards: DealCard[] = [];
    for (const r of view.requests) {
      if (r.to !== me.id) continue;
      const key = `req:${r.from}`;
      cards.push({
        key,
        title: "Proposition d'alliance",
        text: `${this.nameOf(r.from)} vous propose une alliance de 5 minutes.`,
        remaining: (r.expires - this.tick) / ALLIANCE_REQUEST_TICKS,
        actions: [
          { label: "Refuser", run: () => this.answer(key, r.from, false) },
          { label: "Accepter", primary: true, run: () => this.answer(key, r.from, true) },
        ],
      });
    }
    for (const al of view.alliances) {
      const ally = al.a === me.id ? al.b : al.b === me.id ? al.a : null;
      const left = al.expires - this.tick;
      if (ally === null || left > ALLIANCE_RENEW_WINDOW || al.renew.includes(me.id)) continue;
      const key = `renew:${ally}`;
      cards.push({
        key,
        title: "Alliance à renouveler",
        text: `L'alliance avec ${this.nameOf(ally)} expire dans ${formatClock(left)}.${al.renew.includes(ally) ? " Votre allié l'a déjà renouvelée." : ""}`,
        remaining: left / ALLIANCE_RENEW_WINDOW,
        actions: [
          { label: "Laisser expirer", run: () => this.dismissedDeals.add(key) },
          {
            label: "Renouveler",
            primary: true,
            run: () => {
              this.dismissedDeals.add(key);
              this.server.submit({ type: "allianceRenew", ally });
            },
          },
        ],
      });
    }
    // Une carte traitée reste masquée tant qu'elle existe ; elle peut revenir ensuite.
    const keys = new Set(cards.map((c) => c.key));
    for (const key of this.dismissedDeals) if (!keys.has(key)) this.dismissedDeals.delete(key);
    return cards.filter((c) => !this.dismissedDeals.has(c.key)).slice(0, MAX_DEALS);
  }

  private answer(key: string, requester: number, accept: boolean): void {
    this.dismissedDeals.add(key);
    this.server.submit({ type: "allianceReply", requester, accept });
  }

  private fail(message: string): void {
    this.server.stop();
    this.loading.textContent = `Erreur : ${message}`;
    if (!this.loading.isConnected) this.container.append(this.loading);
  }

  // Événements ----------------------------------------------------------------------------------

  private handleEvent(event: GameEvent): void {
    const hud = this.hud;
    if (!hud) return;
    if (event.type === "win") {
      this.server.stop();
      const victory = event.player === this.myId;
      hud.showEnd(
        victory ? "Victoire !" : "Défaite",
        `${victory ? "Le continent de Valdren s'incline devant votre bannière" : `${this.nameOf(event.player)} règne désormais sur Valdren`} : ${this.winCause(event.reason, event.player)}`,
        victory,
      );
      return;
    }
    if (event.type === "eliminated" && event.player === this.myId) {
      hud.showEnd("Défaite", `Votre royaume est tombé face à ${this.nameOf(event.by)}.`, false);
    }
    const targetsMe =
      (event.type === "attackStarted" || event.type === "boatLaunched") &&
      event.target === this.myId &&
      event.attacker !== this.myId;
    const betrayed = event.type === "allianceBroken" && event.victim === this.myId;
    if (targetsMe || betrayed) hud.alert();
    const described = this.describe(event);
    if (described) hud.pushEvent(described[0], described[1]);
  }

  /** Cause de la victoire, pour l'écran de fin (sinon une victoire sous 80 % paraît arbitraire). */
  private winCause(reason: WinReason, winner: number): string {
    const share = Math.round(
      ((this.players.get(winner)?.tiles ?? 0) * 100) / Math.max(1, this.map?.numLandTiles ?? 1),
    );
    switch (reason) {
      case "dominion":
        return `${share} % des terres sous une seule bannière.`;
      case "twilight":
        return `au Crépuscule, ${share} % des terres ont suffi (seuil : ${this.winPercent} %).`;
      case "lastStanding":
        return "dernier royaume debout.";
      case "timeLimit":
        return `plus grand royaume quand sonna la 35e minute (${share} % des terres).`;
    }
  }

  private describe(e: GameEvent): [string, EventTone] | null {
    const me = this.myId;
    switch (e.type) {
      case "spawnPhaseEnd":
        return ["La guerre commence !", "info"];
      case "spawnRejected":
        return e.player === me ? ["Terre indisponible : choisissez une terre libre.", "bad"] : null;
      case "attackStarted":
        return e.target === me && e.attacker !== me
          ? [
              `${this.nameOf(e.attacker)} vous attaque avec ${formatNumber(e.troops)} troupes !`,
              "bad",
            ]
          : null;
      case "eliminated":
        if (e.player === me) return ["Votre royaume est tombé.", "bad"];
        if (e.by === me)
          return [
            `Vous avez anéanti ${this.nameOf(e.player)} (+${formatNumber(e.gold)} or).`,
            "good",
          ];
        return null;
      case "buildingDone":
        return e.player === me ? [`${BUILDINGS[e.building].name} achevé.`, "good"] : null;
      case "buildingCaptured":
        if (e.player === me)
          return [`Vous capturez un ${BUILDINGS[e.building].name.toLowerCase()}.`, "good"];
        if (e.from === me)
          return [`Un de vos bâtiments (${BUILDINGS[e.building].name}) est tombé.`, "bad"];
        return null;
      case "buildingRejected":
        return e.player === me ? [REJECTION_TEXT[e.reason], "bad"] : null;
      case "boatLaunched":
        if (e.attacker === me) {
          return [`Vos barges prennent la mer avec ${formatNumber(e.troops)} troupes.`, "info"];
        }
        return e.target === me
          ? [`Des barges de ${this.nameOf(e.attacker)} font voile vers vos côtes !`, "bad"]
          : null;
      case "boatLanded":
        if (e.attacker === me)
          return ["Débarquement réussi : la tête de pont est établie.", "good"];
        return e.target === me
          ? [`${this.nameOf(e.attacker)} débarque sur vos côtes !`, "bad"]
          : null;
      case "boatRejected":
        return e.player === me ? [BOAT_REJECTION_TEXT[e.reason], "bad"] : null;
      case "win":
        return null;
      case "twilight":
        return [
          `Le Crépuscule tombe sur Valdren : le seuil de victoire baisse de ${TWILIGHT_STEP_PERCENT} points par minute.`,
          "info",
        ];
      case "allianceRequested":
        if (e.to === me)
          return [`${this.nameOf(e.from)} vous propose une alliance (K pour accepter).`, "info"];
        return e.from === me
          ? [`Proposition d'alliance envoyée à ${this.nameOf(e.to)}.`, "info"]
          : null;
      case "allianceRejected":
        if (e.from !== me) return null;
        return e.expired
          ? [`${this.nameOf(e.to)} n'a pas répondu à votre proposition.`, "info"]
          : [`${this.nameOf(e.to)} refuse votre alliance.`, "bad"];
      case "allianceFormed": {
        const other = e.a === me ? e.b : e.b === me ? e.a : null;
        return other === null ? null : [`Alliance scellée avec ${this.nameOf(other)}.`, "good"];
      }
      case "allianceRenewWindow": {
        const other = e.a === me ? e.b : e.b === me ? e.a : null;
        return other === null
          ? null
          : [
              `L'alliance avec ${this.nameOf(other)} expire bientôt (K pour la renouveler).`,
              "info",
            ];
      }
      case "allianceRenewed": {
        const other = e.a === me ? e.b : e.b === me ? e.a : null;
        return other === null ? null : [`Alliance avec ${this.nameOf(other)} renouvelée.`, "good"];
      }
      case "allianceExpired": {
        const other = e.a === me ? e.b : e.b === me ? e.a : null;
        return other === null ? null : [`L'alliance avec ${this.nameOf(other)} a expiré.`, "info"];
      }
      case "allianceBroken":
        if (e.victim === me) {
          return [
            `${this.nameOf(e.traitor)} rompt votre alliance${e.parjure ? " : c'est un Parjure !" : "."}`,
            "bad",
          ];
        }
        if (e.traitor === me) {
          return [
            `Vous rompez l'alliance avec ${this.nameOf(e.victim)}${e.parjure ? " : vous êtes Parjure pendant 60 s." : "."}`,
            "bad",
          ];
        }
        return e.parjure
          ? [
              `${this.nameOf(e.traitor)} trahit ${this.nameOf(e.victim)} et devient Parjure.`,
              "info",
            ]
          : null;
      case "donation": {
        const what = e.resource === "gold" ? "or" : "troupes";
        if (e.to === me)
          return [`${this.nameOf(e.from)} vous offre ${formatNumber(e.amount)} ${what}.`, "good"];
        return e.from === me
          ? [`Don de ${formatNumber(e.amount)} ${what} à ${this.nameOf(e.to)}.`, "info"]
          : null;
      }
      case "diplomacyRejected":
        return e.player === me ? [DIPLOMACY_REJECTION_TEXT[e.reason], "bad"] : null;
    }
  }

  // Entrées -------------------------------------------------------------------------------------

  private tileAt(sx: number, sy: number): number | null {
    if (!this.map) return null;
    const [wx, wy] = this.camera.screenToWorld(sx, sy);
    const x = Math.floor(wx);
    const y = Math.floor(wy);
    if (x < 0 || y < 0 || x >= this.map.width || y >= this.map.height) return null;
    return this.map.ref(x, y);
  }

  private onClick(sx: number, sy: number, button: number): void {
    const tile = this.tileAt(sx, sy);
    if (tile === null || !this.map || !this.territory) return;
    if (this.hud?.menu.consumedClick()) return;
    if (button === 2) {
      if (this.buildMode !== null) this.buildMode = null;
      else if (!this.inSpawnPhase) this.openMenu(sx, sy, tile);
      return;
    }
    if (this.inSpawnPhase) {
      this.server.submit({ type: "spawn", tile });
      return;
    }
    const me = this.me();
    if (!me || !me.alive) return;
    if (this.buildMode !== null) {
      this.server.submit({ type: "build", building: this.buildMode, tile });
      this.buildMode = null;
      return;
    }
    if (!this.map.isPassableLand(tile)) return;
    const owner = this.territory.owner(tile);
    if (owner === me.id || me.allies.includes(owner)) return;
    const troops = Math.floor(me.troops * this.ratio);
    // La tuile visée permet au moteur de lancer une barge si la cible n'a pas de frontière commune.
    if (troops >= 1) this.server.submit({ type: "attack", target: owner, troops, tile });
  }

  /**
   * Touche K sur un royaume survolé : accepte sa demande s'il en a fait une, renouvelle
   * l'alliance pendant sa fenêtre, sinon propose une alliance.
   */
  private allianceAtHover(): void {
    const me = this.me();
    const tile = this.hoverTile;
    if (!me || !me.alive || this.inSpawnPhase || tile === null || !this.territory) return;
    const owner = this.territory.owner(tile);
    if (owner === 0 || owner === me.id) return;
    if (me.allies.includes(owner)) {
      this.server.submit({ type: "allianceRenew", ally: owner });
      return;
    }
    const pending = this.diplomacy?.requests.some((r) => r.from === owner && r.to === me.id);
    this.server.submit(
      pending
        ? { type: "allianceReply", requester: owner, accept: true }
        : { type: "allianceRequest", target: owner },
    );
  }

  /** Touche L, deux fois en moins de 2 s sur un allié survolé : rompt l'alliance. */
  private breakAtHover(): void {
    const me = this.me();
    const tile = this.hoverTile;
    if (!me || !me.alive || tile === null || !this.territory) return;
    const owner = this.territory.owner(tile);
    if (!me.allies.includes(owner)) return;
    const now = performance.now();
    if (this.pendingBreak?.ally === owner && now - this.pendingBreak.at < BREAK_CONFIRM_MS) {
      this.pendingBreak = null;
      this.server.submit({ type: "allianceBreak", ally: owner });
      return;
    }
    this.pendingBreak = { ally: owner, at: now };
    this.hud?.pushEvent(
      `Appuyez encore sur L pour rompre avec ${this.nameOf(owner)} : vous serez Parjure 60 s.`,
      "bad",
    );
  }

  /** Menu contextuel d'une tuile, selon son propriétaire (GDD §17). */
  private openMenu(sx: number, sy: number, tile: number): void {
    const me = this.me();
    if (!me || !me.alive || !this.territory || !this.map || !this.hud) return;
    const rect = this.canvas.getBoundingClientRect();
    const model = this.menuFor(me, tile);
    if (model) this.hud.menu.open(rect.left + sx, rect.top + sy, model);
  }

  private menuFor(me: PlayerView, tile: number): MenuModel | null {
    const territory = this.territory;
    if (!territory || !this.map) return null;
    const owner = territory.owner(tile);
    const troops = Math.floor(me.troops * this.ratio);
    const ratio = `${Math.round(this.ratio * 100)} % · ${formatNumber(troops)}`;
    const mods = modifiersOf(me.race);

    if (owner === me.id) {
      const build = (kind: BuildingKind): MenuEntry => {
        const owned = kind === BuildingKind.Bourg ? me.bourgs : me.tours;
        const cost = costFor(kind, owned, mods);
        return {
          label: `Bâtir : ${BUILDINGS[kind].name}`,
          hint: `${formatNumber(cost)} or`,
          disabled: me.gold < cost,
          run: () => this.server.submit({ type: "build", building: kind, tile }),
        };
      };
      return {
        title: "Vos terres",
        subtitle: TERRAIN_NAMES[this.map.kind(tile)],
        entries: [build(BuildingKind.Bourg), build(BuildingKind.Tour)],
      };
    }
    if (owner === 0) {
      return {
        title: "Terres libres",
        subtitle: TERRAIN_NAMES[this.map.kind(tile)],
        entries: [
          {
            label: "S'étendre",
            hint: ratio,
            disabled: !this.map.isPassableLand(tile) || troops < 1,
            run: () => this.server.submit({ type: "attack", target: 0, troops, tile }),
          },
        ],
      };
    }

    const other = this.players.get(owner);
    if (!other) return null;
    const subtitle = this.describePlayer(other);
    if (me.allies.includes(owner)) {
      const al = this.diplomacy?.alliances.find(
        (x) => (x.a === me.id && x.b === owner) || (x.b === me.id && x.a === owner),
      );
      const left = al ? al.expires - this.tick : 0;
      const inWindow = al !== undefined && left <= ALLIANCE_RENEW_WINDOW;
      const renewed = al?.renew.includes(me.id) ?? false;
      const giftGold = Math.floor(me.gold / 3);
      const giftTroops = Math.floor(me.troops / 3);
      return {
        title: other.name,
        subtitle: `${subtitle} · allié encore ${formatClock(left)}`,
        entries: [
          {
            label: "Donner de l'or",
            hint: `⅓ · ${formatNumber(giftGold)}`,
            disabled: giftGold < 1,
            run: () =>
              this.server.submit({
                type: "donate",
                target: owner,
                resource: "gold",
                amount: giftGold,
              }),
          },
          {
            label: "Donner des troupes",
            hint: `⅓ · ${formatNumber(giftTroops)}`,
            disabled: giftTroops < 1,
            run: () =>
              this.server.submit({
                type: "donate",
                target: owner,
                resource: "troops",
                amount: giftTroops,
              }),
          },
          {
            label: renewed ? "Renouvellement demandé" : "Renouveler l'alliance",
            hint: inWindow ? "K" : "30 dernières s",
            disabled: !inWindow || renewed,
            run: () => this.server.submit({ type: "allianceRenew", ally: owner }),
          },
          "separator",
          {
            label: "Rompre l'alliance…",
            hint: "L L",
            danger: true,
            run: () => this.confirmBreak(owner),
          },
        ],
      };
    }

    const theyAsked =
      this.diplomacy?.requests.some((r) => r.from === owner && r.to === me.id) ?? false;
    const iAsked =
      this.diplomacy?.requests.some((r) => r.from === me.id && r.to === owner) ?? false;
    const diplomacy: MenuEntry = theyAsked
      ? {
          label: "Accepter son alliance",
          hint: "K",
          run: () => this.server.submit({ type: "allianceReply", requester: owner, accept: true }),
        }
      : iAsked
        ? { label: "Proposition envoyée", disabled: true }
        : {
            label: "Proposer une alliance",
            hint: "K",
            run: () => this.server.submit({ type: "allianceRequest", target: owner }),
          };
    return {
      title: other.name,
      subtitle,
      entries: [
        {
          label: "Attaquer",
          hint: ratio,
          disabled: troops < 1 || !this.map.isPassableLand(tile),
          run: () => this.server.submit({ type: "attack", target: owner, troops, tile }),
        },
        {
          label: "Débarquer",
          hint: "B",
          disabled: troops < 1 || !this.map.isPassableLand(tile),
          run: () => this.server.submit({ type: "boat", tile, troops }),
        },
        "separator",
        diplomacy,
      ],
    };
  }

  /** « Prétendant (Chevalier) · Kharag · Méfiant · Parjure ». */
  private describePlayer(p: PlayerView): string {
    const parts: string[] = [];
    if (p.kind === "human") parts.push("Seigneur");
    else if (p.kind === "nation") parts.push(`Prétendant (${this.nationLevel})`);
    else parts.push("Tribu sauvage");
    if (p.race) parts.push(RACES[p.race].name);
    if (p.kind === "nation" && this.myId !== null)
      parts.push(disposition(p.regard[this.myId] ?? 0));
    if (p.parjureUntil > this.tick) parts.push("Parjure");
    return parts.join(" · ");
  }

  /** Rupture d'alliance : confirmation explicite, car on devient Parjure. */
  private confirmBreak(ally: number): void {
    const me = this.me();
    if (!me || !this.hud) return;
    const rect = this.canvas.getBoundingClientRect();
    this.hud.menu.open(rect.left + rect.width / 2 - 120, rect.top + rect.height / 3, {
      title: `Rompre avec ${this.nameOf(ally)} ?`,
      subtitle: "Vous serez Parjure 60 s : vos ennemis perdront moitié moins contre vous.",
      entries: [
        { label: "Annuler", run: () => undefined },
        {
          label: "Rompre l'alliance",
          danger: true,
          run: () => this.server.submit({ type: "allianceBreak", ally }),
        },
      ],
    });
  }

  /** Débarquement forcé sur la tuile survolée (touche B). */
  private launchBoatAtHover(): void {
    const me = this.me();
    const tile = this.hoverTile;
    if (!me || !me.alive || this.inSpawnPhase || tile === null || !this.map) return;
    if (!this.map.isPassableLand(tile) || this.territory?.owner(tile) === me.id) return;
    const troops = Math.floor(me.troops * this.ratio);
    if (troops >= 1) this.server.submit({ type: "boat", tile, troops });
  }

  private onHover(sx: number, sy: number): void {
    this.hoverTile = this.tileAt(sx, sy);
    if (this.hoverTile === null || !this.map || !this.territory) {
      this.hud?.setHover("");
      return;
    }
    const t = this.hoverTile;
    const owner = this.territory.owner(t);
    const parts = [TERRAIN_NAMES[this.map.kind(t)]];
    if (this.mines.includes(t)) parts.push("Mine d'or");
    // L'état des tuiles (marques, charniers) vit dans la couche de territoire, pas dans this.map.
    const state = this.territory.state[t] as number;
    const race = this.players.get(owner)?.race;
    if (state & MARK_BIT && race === Race.Aldoria) parts.push("Rempart");
    if (state & MARK_BIT && race === Race.Sylvanor) parts.push("Bosquet");
    if (state & CHARNIER_BIT) parts.push("Charnier");
    parts.push(owner === 0 ? "Terres libres" : this.nameOf(owner));
    const player = owner === 0 ? null : this.players.get(owner);
    if (player && owner !== this.myId) {
      if (this.myAllies.has(owner)) parts.push("Allié — clic droit pour les dons");
      else if (player.kind === "nation" && this.myId !== null) {
        parts.push(`Prétendant, ${disposition(player.regard[this.myId] ?? 0).toLowerCase()}`);
      } else if (player.kind === "bot") parts.push("Tribu");
      if (player.parjureUntil > this.tick) parts.push("Parjure");
    }
    this.hud?.setHover(parts.join(" · "));
  }

  private onKey(e: KeyboardEvent): void {
    switch (e.key.toLowerCase()) {
      case "1":
        this.buildMode = BuildingKind.Bourg;
        break;
      case "2":
        this.buildMode = BuildingKind.Tour;
        break;
      case "escape":
        this.buildMode = null;
        this.hud?.menu.close();
        break;
      case "k":
        this.allianceAtHover();
        break;
      case "l":
        this.breakAtHover();
        break;
      case "t":
        this.ratio = Math.max(0.01, Math.round((this.ratio - RATIO_STEP) * 100) / 100);
        break;
      case "y":
        this.ratio =
          this.ratio < RATIO_STEP
            ? RATIO_STEP
            : Math.min(1, Math.round((this.ratio + RATIO_STEP) * 100) / 100);
        break;
      case "c":
        this.centerOnMe();
        break;
      case "b":
        this.launchBoatAtHover();
        break;
      case "+":
      case "=":
        this.camera.zoomAt(this.camera.viewWidth / 2, this.camera.viewHeight / 2, KEY_ZOOM_FACTOR);
        break;
      case "-":
        this.camera.zoomAt(
          this.camera.viewWidth / 2,
          this.camera.viewHeight / 2,
          1 / KEY_ZOOM_FACTOR,
        );
        break;
      default:
        return;
    }
    e.preventDefault();
  }

  // Rendu ---------------------------------------------------------------------------------------

  private readonly loop = (time: number): void => {
    if (this.disposed || !this.scene || !this.territory || !this.map || !this.battle) return;
    if (time - this.lastLabelTime > LABEL_INTERVAL_MS) {
      this.labels = computeLabels(this.territory.state, this.map.width, this.playerList.length);
      this.lastLabelTime = time;
    }
    if (!this.centeredOnSpawn && !this.inSpawnPhase && this.myId !== null) {
      this.centeredOnSpawn = this.centerOnMe(8);
    }
    const me = this.me();
    const width = this.map.width;
    const progress = Math.min(1, (performance.now() - this.lastTickTime) / TICK_MS);
    const boats = this.boats.map((b) => {
      const from = this.boatFrom.get(b.id) ?? b.tile;
      const fx = from % width;
      const fy = Math.floor(from / width);
      return {
        owner: b.owner,
        troops: b.troops,
        landing: b.landing,
        x: fx + ((b.tile % width) - fx) * progress + 0.5,
        y: fy + (Math.floor(b.tile / width) - fy) * progress + 0.5,
      };
    });
    this.scene.draw({
      players: this.players,
      buildings: this.buildings,
      boats,
      mines: this.mines,
      labels: this.labels,
      myId: this.myId,
      hoverTile: this.hoverTile,
      buildMode: this.buildMode,
      towerRange: TOWER_RANGE * modifiersOf(me?.race ?? null).towerRangeMult,
      colorOf: (owner) => this.colorOf(owner),
      battle: this.battle,
      tick: this.tick,
      crown: this.crown || null,
      now: performance.now(),
    });
    this.frame = requestAnimationFrame(this.loop);
  };

  private centerOnMe(zoom?: number): boolean {
    const label = this.labels.find((l) => l.owner === this.myId);
    if (!label) return false;
    this.camera.centerOn(label.x + 0.5, label.y + 0.5, zoom);
    return true;
  }

  // Utilitaires ---------------------------------------------------------------------------------

  private me(): PlayerView | null {
    return this.myId === null ? null : (this.players.get(this.myId) ?? null);
  }

  private nameOf(id: number): string {
    if (id === 0) return "les terres libres";
    return this.players.get(id)?.name ?? "un inconnu";
  }

  private colorOf(owner: number): RGB {
    let color = this.colors.get(owner);
    if (!color) {
      // Tribus en couleurs sourdes, seigneurs et prétendants en couleurs franches.
      const player = this.players.get(owner);
      color = playerColor(owner, player?.kind === "bot");
      // On ne garde la couleur qu'une fois le joueur connu (avant le premier tick, il ne l'est pas).
      if (player) this.colors.set(owner, color);
    }
    return color;
  }
}
