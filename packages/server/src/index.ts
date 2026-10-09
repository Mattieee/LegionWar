import { randomInt, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { ENGINE_VERSION, TICK_MS } from "@legionwar/engine";
import { parseClientMessage, type ErrorCode, type ServerMessage } from "@legionwar/shared";
import { WebSocketServer, type WebSocket } from "ws";
import { GameRoom } from "./GameRoom";

const PORT = Number(process.env.PORT ?? 3001);
const MAX_PLAYERS = Number(process.env.MAX_PLAYERS ?? 16);
const BOTS = Number(process.env.BOTS ?? 60);
const MAX_MESSAGE_BYTES = 4 * 1024;
const MAX_MESSAGES_PER_SECOND = 20;

const rooms = new Map<string, GameRoom>();

function sendError(ws: WebSocket, code: ErrorCode, message: string): void {
  ws.send(JSON.stringify({ type: "error", code, message } satisfies ServerMessage));
}

const http = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size, version: ENGINE_VERSION }));
    return;
  }
  res.writeHead(404).end();
});

const wss = new WebSocketServer({ server: http, maxPayload: MAX_MESSAGE_BYTES });

wss.on("connection", (ws) => {
  let room: GameRoom | null = null;
  let clientId: string | null = null;
  let windowStart = Date.now();
  let messagesInWindow = 0;

  ws.on("message", (data, isBinary) => {
    const now = Date.now();
    if (now - windowStart >= 1000) {
      windowStart = now;
      messagesInWindow = 0;
    }
    if (++messagesInWindow > MAX_MESSAGES_PER_SECOND) return;

    const msg = isBinary ? null : parseClientMessage(data.toString());
    if (msg === null) return sendError(ws, "bad_message", "Message invalide");

    switch (msg.type) {
      case "join":
      case "rejoin": {
        if (msg.version !== ENGINE_VERSION) {
          return sendError(ws, "version_mismatch", `Version serveur : ${ENGINE_VERSION}`);
        }
        let target = rooms.get(msg.roomId);
        if (!target) {
          target = new GameRoom(msg.roomId, {
            maxPlayers: MAX_PLAYERS,
            bots: BOTS,
            mapSize: "medium",
            seed: randomInt(0, 2 ** 31),
            generateClientId: randomUUID,
          });
          rooms.set(msg.roomId, target);
        }
        if (msg.type === "join") {
          const result = target.join(ws, msg.name, msg.race);
          if (result === "game_started" || result === "room_full") {
            return sendError(ws, result, "Impossible de rejoindre cette partie");
          }
          clientId = result;
        } else {
          const error = target.rejoin(ws, msg.clientId, msg.lastTurn);
          if (error) return sendError(ws, error, "Reconnexion refusée");
          clientId = msg.clientId;
        }
        room = target;
        return;
      }
      case "start": {
        if (!room || !clientId)
          return sendError(ws, "unknown_client", "Rejoignez d'abord une partie");
        const error = room.start(clientId);
        if (error) sendError(ws, error, "Démarrage refusé");
        return;
      }
      case "intent":
        if (room && clientId) room.submit(clientId, msg.intent);
        return;
      case "ping":
        ws.send(JSON.stringify({ type: "pong", sentAt: msg.sentAt } satisfies ServerMessage));
        return;
    }
  });

  ws.on("close", () => {
    if (room && clientId) room.leave(clientId);
  });
});

setInterval(() => {
  for (const [id, room] of rooms) {
    if (room.connectedCount === 0) {
      rooms.delete(id);
      continue;
    }
    room.endTurn();
  }
}, TICK_MS);

http.listen(PORT, () => {
  console.log(`LegionWar — serveur relais v${ENGINE_VERSION} sur le port ${PORT}`);
});
