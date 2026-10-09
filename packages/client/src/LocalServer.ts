import { TICK_MS, type Intent, type StampedIntent, type Turn } from "@legionwar/engine";

/** Nombre maximal de tours envoyés au worker sans accusé de traitement. */
const MAX_IN_FLIGHT = 3;

/**
 * Remplace le serveur en solo : même protocole (un tour toutes les 100 ms),
 * pour que le passage au multijoueur ne change pas la simulation.
 */
export class LocalServer {
  private queue: StampedIntent[] = [];
  private turn = 0;
  private inFlight = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly clientId: string,
    private readonly sendTurn: (turn: Turn) => void,
  ) {}

  start(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => this.emit(), TICK_MS);
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  submit(intent: Intent): void {
    this.queue.push({ clientId: this.clientId, intent });
  }

  /** À appeler quand le worker a traité un tour. */
  acknowledge(): void {
    this.inFlight = Math.max(0, this.inFlight - 1);
  }

  private emit(): void {
    // Si le worker prend du retard, on suspend l'horloge plutôt que d'empiler des tours.
    if (this.inFlight >= MAX_IN_FLIGHT) return;
    this.inFlight++;
    const intents = this.queue;
    this.queue = [];
    this.sendTurn({ turn: this.turn++, intents });
  }
}
