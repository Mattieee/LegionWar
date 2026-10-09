import {
  ALL_RACES,
  BuildingKind,
  type GameConfig,
  type Intent,
  type Race,
  type Turn,
} from "@legionwar/engine";

/**
 * Protocole client ↔ serveur (JSON sur WebSocket).
 * Le serveur ne simule rien : il horodate les intents, les regroupe en tours de 100 ms
 * et diffuse ces tours à tous les clients, qui exécutent chacun la simulation.
 */

export const NAME_MIN_LENGTH = 2;
export const NAME_MAX_LENGTH = 20;
export const ROOM_ID_PATTERN = /^[A-Za-z0-9_-]{3,24}$/;

export interface LobbyPlayer {
  clientId: string;
  name: string;
  race: Race;
  host: boolean;
}

export type ClientMessage =
  | { type: "join"; roomId: string; name: string; race: Race; version: string }
  | { type: "rejoin"; roomId: string; clientId: string; lastTurn: number; version: string }
  | { type: "start" }
  | { type: "intent"; intent: Intent }
  | { type: "ping"; sentAt: number };

export type ErrorCode =
  "bad_message" | "version_mismatch" | "room_full" | "game_started" | "not_host" | "unknown_client";

export type ServerMessage =
  | { type: "lobby"; roomId: string; you: string; players: LobbyPlayer[] }
  | { type: "start"; you: string; config: GameConfig; turns: Turn[] }
  | { type: "turn"; turn: Turn }
  | { type: "pong"; sentAt: number }
  | { type: "error"; code: ErrorCode; message: string };

const BUILDING_KINDS = new Set<string>(Object.values(BuildingKind));
const RACES = new Set<string>(ALL_RACES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidTroops(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/** Nettoie un pseudo : caractères de contrôle retirés, espaces normalisés, longueur bornée. */
export function sanitizeName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  // eslint-disable-next-line no-control-regex
  const withoutControls = raw.replace(/[\u0000-\u001f\u007f]/g, "");
  const name = withoutControls.replace(/\s+/g, " ").trim();
  if (name.length < NAME_MIN_LENGTH || name.length > NAME_MAX_LENGTH) return null;
  return name;
}

export function isValidIntent(value: unknown): value is Intent {
  if (!isRecord(value)) return false;
  switch (value.type) {
    case "spawn":
      return isNonNegativeInt(value.tile);
    case "attack":
      return (
        isNonNegativeInt(value.target) &&
        isValidTroops(value.troops) &&
        (value.tile === undefined || isNonNegativeInt(value.tile))
      );
    case "boat":
      return isNonNegativeInt(value.tile) && isValidTroops(value.troops);
    case "build":
      return (
        isNonNegativeInt(value.tile) &&
        typeof value.building === "string" &&
        BUILDING_KINDS.has(value.building)
      );
    default:
      return false;
  }
}

/** Analyse et valide un message brut. Renvoie null si le message est invalide. */
export function parseClientMessage(raw: string): ClientMessage | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(data)) return null;
  switch (data.type) {
    case "join": {
      const name = sanitizeName(data.name);
      if (
        name === null ||
        typeof data.roomId !== "string" ||
        !ROOM_ID_PATTERN.test(data.roomId) ||
        typeof data.race !== "string" ||
        !RACES.has(data.race) ||
        typeof data.version !== "string"
      ) {
        return null;
      }
      return {
        type: "join",
        roomId: data.roomId,
        name,
        race: data.race as Race,
        version: data.version,
      };
    }
    case "rejoin":
      if (
        typeof data.roomId !== "string" ||
        !ROOM_ID_PATTERN.test(data.roomId) ||
        typeof data.clientId !== "string" ||
        !isNonNegativeInt(data.lastTurn) ||
        typeof data.version !== "string"
      ) {
        return null;
      }
      return {
        type: "rejoin",
        roomId: data.roomId,
        clientId: data.clientId,
        lastTurn: data.lastTurn,
        version: data.version,
      };
    case "start":
      return { type: "start" };
    case "intent":
      return isValidIntent(data.intent) ? { type: "intent", intent: data.intent } : null;
    case "ping":
      return typeof data.sentAt === "number" && Number.isFinite(data.sentAt)
        ? { type: "ping", sentAt: data.sentAt }
        : null;
    default:
      return null;
  }
}
