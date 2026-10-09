import { describe, expect, it } from "vitest";
import { Race } from "@legionwar/engine";
import { parseClientMessage, type ServerMessage } from "@legionwar/shared";
import { GameRoom, type Connection } from "../src/GameRoom";

class FakeConnection implements Connection {
  readonly received: ServerMessage[] = [];
  send(data: string): void {
    this.received.push(JSON.parse(data) as ServerMessage);
  }
  last<T extends ServerMessage["type"]>(type: T): Extract<ServerMessage, { type: T }> | undefined {
    return [...this.received].reverse().find((m) => m.type === type) as
      Extract<ServerMessage, { type: T }> | undefined;
  }
}

function makeRoom(maxPlayers = 4): GameRoom {
  let next = 0;
  return new GameRoom("salle-test", {
    maxPlayers,
    bots: 5,
    mapSize: "small",
    seed: 1,
    generateClientId: () => `client-${next++}`,
  });
}

describe("GameRoom", () => {
  it("le premier arrivé est hôte et seul l'hôte peut lancer", () => {
    const room = makeRoom();
    const a = new FakeConnection();
    const b = new FakeConnection();
    const idA = room.join(a, "Alice", Race.Aldoria);
    const idB = room.join(b, "Bob", Race.Kharag);
    expect(b.last("lobby")?.players.map((p) => p.host)).toEqual([true, false]);
    expect(room.start(idB)).toBe("not_host");
    expect(room.start(idA)).toBeNull();
    expect(a.last("start")?.config.humans).toHaveLength(2);
  });

  it("diffuse des tours numérotés avec les intents horodatés par le serveur", () => {
    const room = makeRoom();
    const a = new FakeConnection();
    const id = room.join(a, "Alice", Race.Sylvanor);
    room.start(id);
    room.submit(id, { type: "attack", target: 0, troops: 100 });
    room.endTurn();
    room.endTurn();
    const turns = a.received.filter((m) => m.type === "turn");
    expect(turns).toHaveLength(2);
    expect(turns[0]).toEqual({
      type: "turn",
      turn: {
        turn: 0,
        intents: [{ clientId: id, intent: { type: "attack", target: 0, troops: 100 } }],
      },
    });
  });

  it("refuse les arrivées après le lancement et quand la salle est pleine", () => {
    const room = makeRoom(1);
    const id = room.join(new FakeConnection(), "Alice", Race.Morvane);
    expect(room.join(new FakeConnection(), "Bob", Race.Kharag)).toBe("room_full");
    room.start(id);
    expect(room.join(new FakeConnection(), "Carl", Race.Kharag)).toBe("game_started");
  });

  it("renvoie l'historique manquant lors d'une reconnexion", () => {
    const room = makeRoom();
    const id = room.join(new FakeConnection(), "Alice", Race.Aldoria);
    room.start(id);
    for (let i = 0; i < 5; i++) room.endTurn();
    room.leave(id);
    const back = new FakeConnection();
    expect(room.rejoin(back, id, 3)).toBeNull();
    expect(back.last("start")?.turns.map((t) => t.turn)).toEqual([3, 4]);
  });
});

describe("parseClientMessage", () => {
  it("valide et nettoie un join", () => {
    const msg = parseClientMessage(
      JSON.stringify({
        type: "join",
        roomId: "abc",
        name: "  Sir   Lancelot ",
        race: "aldoria",
        version: "0.1.0",
      }),
    );
    expect(msg).toEqual({
      type: "join",
      roomId: "abc",
      name: "Sir Lancelot",
      race: "aldoria",
      version: "0.1.0",
    });
  });

  it("rejette les messages invalides", () => {
    expect(parseClientMessage("pas du json")).toBeNull();
    expect(
      parseClientMessage(
        JSON.stringify({ type: "join", roomId: "abc", name: "X", race: "aldoria", version: "1" }),
      ),
    ).toBeNull();
    expect(
      parseClientMessage(
        JSON.stringify({ type: "intent", intent: { type: "attack", target: -1, troops: 5 } }),
      ),
    ).toBeNull();
    expect(
      parseClientMessage(
        JSON.stringify({ type: "intent", intent: { type: "build", building: "château", tile: 3 } }),
      ),
    ).toBeNull();
  });
});
