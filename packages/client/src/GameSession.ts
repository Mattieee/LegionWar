import {
  BUILDINGS,
  BuildingKind,
  GameMap,
  TERRAIN_NAMES,
  TICK_MS,
  TOWER_RANGE,
  modifiersOf,
  type AttackView,
  type BoatRejection,
  type BoatView,
  type BuildRejection,
  type BuildingView,
  type GameConfig,
  type GameEvent,
  type PlayerView,
  type TickResult,
} from "@legionwar/engine";
import { Input } from "./input/Input";
import { LocalServer } from "./LocalServer";
import { Camera } from "./render/Camera";
import { type RGB, playerColor } from "./render/colors";
import { type Label, computeLabels } from "./render/Labels";
import { SceneRenderer } from "./render/SceneRenderer";
import { placeSeaOrnaments } from "./render/SeaDecor";
import { TerritoryLayer } from "./render/TerritoryLayer";
import { formatNumber } from "./ui/format";
import { Hud, type EventTone } from "./ui/Hud";
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
};

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
  private readonly humanCount: number;

  private map: GameMap | null = null;
  private territory: TerritoryLayer | null = null;
  private scene: SceneRenderer | null = null;
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
      singleplayer: true,
      humans: [{ clientId: CLIENT_ID, name: choice.name, race: choice.race }],
    };
    this.humanCount = config.humans.length;

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
    this.mines = mines;
    this.territory = new TerritoryLayer(width, height, terrain, state, (owner) =>
      this.colorOf(owner),
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
    this.territory?.applyChanges(result.changedTiles);
    this.playerList = result.players;
    this.players = new Map(result.players.map((p) => [p.id, p]));
    this.myId = result.players.find((p) => p.clientId === CLIENT_ID)?.id ?? null;
    if (result.buildings) this.buildings = result.buildings;
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
    });
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
        victory
          ? "Le continent de Valdren s'incline devant votre bannière."
          : `${this.nameOf(event.player)} règne désormais sur Valdren.`,
        victory,
      );
      return;
    }
    if (event.type === "eliminated" && event.player === this.myId) {
      hud.showEnd("Défaite", `Votre royaume est tombé face à ${this.nameOf(event.by)}.`, false);
    }
    const described = this.describe(event);
    if (described) hud.pushEvent(described[0], described[1]);
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
    if (button === 2) {
      this.buildMode = null;
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
    if (owner === me.id) return;
    const troops = Math.floor(me.troops * this.ratio);
    // La tuile visée permet au moteur de lancer une barge si la cible n'a pas de frontière commune.
    if (troops >= 1) this.server.submit({ type: "attack", target: owner, troops, tile });
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
    parts.push(owner === 0 ? "Terres libres" : this.nameOf(owner));
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
    if (this.disposed || !this.scene || !this.territory || !this.map) return;
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
      color = playerColor(owner, owner > this.humanCount);
      this.colors.set(owner, color);
    }
    return color;
  }
}
