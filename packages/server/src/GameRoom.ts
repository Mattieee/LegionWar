import type { GameConfig, Intent, MapSize, Race, StampedIntent, Turn } from "@legionwar/engine";
import type { ErrorCode, LobbyPlayer, ServerMessage } from "@legionwar/shared";

/** Abstraction d'une connexion (WebSocket en production, faux objet en test). */
export interface Connection {
  send(data: string): void;
}

export interface RoomOptions {
  maxPlayers: number;
  bots: number;
  mapSize: MapSize;
  seed: number;
  generateClientId: () => string;
}

interface Member {
  clientId: string;
  name: string;
  race: Race;
  host: boolean;
  conn: Connection | null;
}

export type RoomStatus = "lobby" | "started";

/**
 * Une partie côté serveur. Ne simule rien : collecte les intents, les horodate avec l'identité
 * de l'émetteur (impossible à usurper côté client) et publie un tour toutes les 100 ms.
 */
export class GameRoom {
  status: RoomStatus = "lobby";
  private readonly members = new Map<string, Member>();
  private readonly turns: Turn[] = [];
  private pending: StampedIntent[] = [];
  private config: GameConfig | null = null;

  constructor(
    readonly id: string,
    private readonly options: RoomOptions,
  ) {}

  get playerCount(): number {
    return this.members.size;
  }

  get connectedCount(): number {
    let n = 0;
    for (const m of this.members.values()) if (m.conn) n++;
    return n;
  }

  get turnCount(): number {
    return this.turns.length;
  }

  join(conn: Connection, name: string, race: Race): string | ErrorCode {
    if (this.status !== "lobby") return "game_started";
    if (this.members.size >= this.options.maxPlayers) return "room_full";
    const clientId = this.options.generateClientId();
    this.members.set(clientId, { clientId, name, race, host: this.members.size === 0, conn });
    this.broadcastLobby();
    return clientId;
  }

  /** Reconnexion : renvoie l'historique des tours manquants. */
  rejoin(conn: Connection, clientId: string, lastTurn: number): ErrorCode | null {
    const member = this.members.get(clientId);
    if (!member) return "unknown_client";
    member.conn = conn;
    if (this.status === "lobby") {
      this.broadcastLobby();
    } else if (this.config) {
      this.send(member, {
        type: "start",
        you: clientId,
        config: this.config,
        turns: this.turns.slice(Math.min(lastTurn, this.turns.length)),
      });
    }
    return null;
  }

  leave(clientId: string): void {
    const member = this.members.get(clientId);
    if (!member) return;
    if (this.status === "lobby") {
      this.members.delete(clientId);
      if (member.host) {
        const next = this.members.values().next();
        if (!next.done) next.value.host = true;
      }
      this.broadcastLobby();
    } else {
      // En partie, le joueur reste dans la simulation ; il peut revenir via rejoin.
      member.conn = null;
    }
  }

  start(clientId: string): ErrorCode | null {
    const member = this.members.get(clientId);
    if (!member) return "unknown_client";
    if (!member.host) return "not_host";
    if (this.status !== "lobby") return "game_started";
    this.config = {
      seed: this.options.seed,
      mapSize: this.options.mapSize,
      bots: this.options.bots,
      singleplayer: false,
      humans: [...this.members.values()].map((m) => ({
        clientId: m.clientId,
        name: m.name,
        race: m.race,
      })),
    };
    this.status = "started";
    for (const m of this.members.values()) {
      this.send(m, { type: "start", you: m.clientId, config: this.config, turns: [] });
    }
    return null;
  }

  submit(clientId: string, intent: Intent): void {
    if (this.status !== "started" || !this.members.has(clientId)) return;
    this.pending.push({ clientId, intent });
  }

  /** Clôt le tour courant et le diffuse. Appelé toutes les TICK_MS par le serveur. */
  endTurn(): void {
    if (this.status !== "started") return;
    const turn: Turn = { turn: this.turns.length, intents: this.pending };
    this.pending = [];
    this.turns.push(turn);
    const payload = JSON.stringify({ type: "turn", turn } satisfies ServerMessage);
    for (const m of this.members.values()) m.conn?.send(payload);
  }

  private broadcastLobby(): void {
    const players: LobbyPlayer[] = [...this.members.values()].map((m) => ({
      clientId: m.clientId,
      name: m.name,
      race: m.race,
      host: m.host,
    }));
    for (const m of this.members.values()) {
      this.send(m, { type: "lobby", roomId: this.id, you: m.clientId, players });
    }
  }

  private send(member: Member, message: ServerMessage): void {
    member.conn?.send(JSON.stringify(message));
  }
}
