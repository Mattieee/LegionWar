import { describe, expect, it } from "vitest";
import {
  ALL_RACES,
  ALLIANCE_REQUEST_COOLDOWN,
  ALLIANCE_REQUEST_TICKS,
  DIFFICULTIES,
  Difficulty,
  Game,
  MAX_ALLIANCES,
  PARJURE_TICKS,
  Race,
  TerrainKind,
  attackLogic,
  maxTroops,
  type GameConfig,
  type GameEvent,
  type Intent,
  type TickResult,
} from "@legionwar/engine";

const A = "alpha";
const B = "beta";

/** Deux seigneurs humains en partie multijoueur, déployés loin l'un de l'autre. */
function twoLords(overrides: Partial<GameConfig> = {}) {
  const game = new Game({
    seed: 4242,
    mapSize: "small",
    bots: 0,
    humans: [
      { clientId: A, name: "Alpha", race: Race.Aldoria },
      { clientId: B, name: "Bêta", race: Race.Kharag },
    ],
    singleplayer: false,
    ...overrides,
  });
  const a = game.playerByClient(A);
  const b = game.playerByClient(B);
  if (!a || !b) throw new Error("joueurs introuvables");
  // Fin de la phase de déploiement : chacun reçoit une terre au hasard.
  while (game.inSpawnPhase) play(game);
  return { game, a, b };
}

function play(game: Game, intents: { clientId: string; intent: Intent }[] = []): TickResult {
  return game.executeTurn({ turn: game.ticks, intents });
}

function run(game: Game, ticks: number): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < ticks; i++) events.push(...play(game).events);
  return events;
}

const as = (clientId: string, intent: Intent) => ({ clientId, intent });

describe("Prétendants", () => {
  it("sont créés avec leur niveau, des peuples équilibrés et un nom propre", () => {
    const game = new Game({
      seed: 7,
      mapSize: "medium",
      bots: 10,
      nations: 8,
      difficulty: Difficulty.Duke,
      humans: [{ clientId: A, name: "Alpha", race: Race.Aldoria }],
      singleplayer: true,
    });
    const nations = [];
    for (let id = 2; id < 10; id++) nations.push(game.player(id));
    expect(nations.every((p) => p?.kind === "nation")).toBe(true);
    expect(game.player(10)?.kind).toBe("bot");
    for (const race of ALL_RACES) {
      expect(nations.filter((p) => p?.race === race).length).toBe(2);
    }
    const duke = DIFFICULTIES[Difficulty.Duke];
    for (const p of nations) {
      expect(p?.level).toBe(duke);
      expect(p?.spawned).toBe(true);
    }
    expect(new Set(nations.map((p) => p?.name)).size).toBe(8);
  });

  it("le niveau règle le plafond de troupes", () => {
    const make = (difficulty: Difficulty) =>
      new Game({
        seed: 7,
        mapSize: "small",
        bots: 0,
        nations: 1,
        difficulty,
        humans: [{ clientId: A, name: "Alpha", race: Race.Aldoria }],
        singleplayer: true,
      }).player(2);
    const squire = make(Difficulty.Squire);
    const emperor = make(Difficulty.Emperor);
    if (!squire || !emperor) throw new Error("prétendant introuvable");
    expect(maxTroops(emperor) / maxTroops(squire)).toBeCloseTo(1.25 / 0.5, 1);
  });
});

describe("Victoire", () => {
  it("une tribu ne gagne jamais, même seule en vie", () => {
    const game = new Game({
      seed: 11,
      mapSize: "small",
      bots: 3,
      humans: [{ clientId: A, name: "Alpha", race: Race.Aldoria }],
      singleplayer: true,
    });
    const human = game.playerByClient(A);
    let spawn = -1;
    for (let t = 0; t < game.map.size && spawn < 0; t++) {
      if (game.map.isPassableLand(t) && game.map.owner(t) === 0) spawn = t;
    }
    play(game, [as(A, { type: "spawn", tile: spawn })]);
    // Le seigneur perd toutes ses terres au profit d'une tribu.
    for (let t = 0; t < game.map.size; t++) {
      if (game.map.owner(t) === human?.id) game.conquer(t, 2);
    }
    run(game, 30);
    expect(human?.alive).toBe(false);
    expect(game.winner).toBeNull();
  });

  it("« dernier debout » ignore les tribus", () => {
    const { game, a, b } = twoLords({ bots: 5 });
    for (let t = 0; t < game.map.size; t++) if (game.map.owner(t) === b.id) game.conquer(t, a.id);
    run(game, 30);
    expect(game.winner).toBe(a.id);
  });
});

describe("Demandes d'alliance", () => {
  it("demande puis acceptation", () => {
    const { game, a, b } = twoLords();
    const sent = play(game, [as(A, { type: "allianceRequest", target: b.id })]);
    expect(sent.events).toContainEqual({ type: "allianceRequested", from: a.id, to: b.id });
    const answered = play(game, [as(B, { type: "allianceReply", requester: a.id, accept: true })]);
    expect(answered.events).toContainEqual({ type: "allianceFormed", a: a.id, b: b.id });
    expect(game.diplomacy.allied(a.id, b.id)).toBe(true);
  });

  it("une demande croisée vaut acceptation", () => {
    const { game, a, b } = twoLords();
    play(game, [as(A, { type: "allianceRequest", target: b.id })]);
    play(game, [as(B, { type: "allianceRequest", target: a.id })]);
    expect(game.diplomacy.allied(a.id, b.id)).toBe(true);
  });

  it("expire après ALLIANCE_REQUEST_TICKS, puis délai avant de redemander", () => {
    const { game, a, b } = twoLords();
    play(game, [as(A, { type: "allianceRequest", target: b.id })]);
    const events = run(game, ALLIANCE_REQUEST_TICKS);
    expect(events).toContainEqual({
      type: "allianceRejected",
      from: a.id,
      to: b.id,
      expired: true,
    });
    const again = play(game, [as(A, { type: "allianceRequest", target: b.id })]);
    expect(again.events).toContainEqual({
      type: "diplomacyRejected",
      player: a.id,
      reason: "cooldown",
    });
    run(game, ALLIANCE_REQUEST_COOLDOWN);
    const later = play(game, [as(A, { type: "allianceRequest", target: b.id })]);
    expect(later.events).toContainEqual({ type: "allianceRequested", from: a.id, to: b.id });
  });

  it(`au plus ${MAX_ALLIANCES} alliances à la fois`, () => {
    const { game, a } = twoLords({ bots: 8 });
    const tribes = [];
    for (let id = 3; id < 11; id++) {
      const p = game.player(id);
      if (p?.alive) tribes.push(p);
    }
    for (const tribe of tribes.slice(0, MAX_ALLIANCES)) {
      expect(game.diplomacy.request(a, tribe)).toBeNull();
      expect(game.diplomacy.reply(tribe, a.id, true)).toBeNull();
    }
    expect(game.diplomacy.allianceCount(a.id)).toBe(MAX_ALLIANCES);
    expect(game.diplomacy.request(a, tribes[MAX_ALLIANCES] as never)).toBe("maxAlliances");
  });
});

describe("Effets d'une alliance", () => {
  it("on ne peut pas attaquer un allié", () => {
    const { game, a, b } = twoLords();
    game.diplomacy.request(a, b);
    game.diplomacy.reply(b, a.id, true);
    const troops = a.troops;
    const result = play(game, [as(A, { type: "attack", target: b.id, troops: 1000 })]);
    expect(result.events).toContainEqual({
      type: "diplomacyRejected",
      player: a.id,
      reason: "ally",
    });
    expect(result.attacks).toEqual([]);
    expect(a.troops).toBeGreaterThanOrEqual(troops);
  });

  it("une attaque en cours se retire sans perte quand l'alliance est conclue", () => {
    const { game, a } = twoLords({ bots: 1 });
    const tribe = game.player(3);
    if (!tribe) throw new Error("tribu introuvable");
    // Donne à la tribu un anneau de terres autour du seigneur, pour une frontière commune.
    const map = game.map;
    for (let t = 0; t < map.size; t++) {
      if (map.owner(t) !== 0 || !map.isPassableLand(t)) continue;
      if (map.neighbors(t).some((n) => map.owner(n) === a.id)) game.conquer(t, tribe.id);
    }
    tribe.troops = 100_000;
    const launched = play(game, [as(A, { type: "attack", target: tribe.id, troops: 10_000 })]);
    const attack = launched.attacks.find((x) => x.attacker === a.id);
    expect(attack).toBeDefined();
    const before = a.troops;
    game.diplomacy.request(a, tribe);
    game.diplomacy.reply(tribe, a.id, true);
    expect(Math.abs(a.troops - (before + (attack?.troops ?? 0)))).toBeLessThanOrEqual(1);
    expect(play(game).attacks.some((x) => x.attacker === a.id)).toBe(false);
  });
});

describe("Durée, renouvellement et trahison", () => {
  it("expire, sauf si les deux alliés renouvellent pendant la fenêtre", () => {
    // Un prétendant en plus : entre derniers survivants, on ne renouvelle plus (testé à part).
    const { game, a, b } = twoLords({ allianceTicks: 400, nations: 1 });
    game.diplomacy.request(a, b);
    game.diplomacy.reply(b, a.id, true);
    // Avant la fenêtre (300 dernières ticks), on ne peut pas renouveler.
    expect(game.diplomacy.renew(a, b.id)).toBe("notRenewable");
    const window = run(game, 101);
    expect(window).toContainEqual({ type: "allianceRenewWindow", a: a.id, b: b.id });
    expect(game.diplomacy.renew(a, b.id)).toBeNull();
    // Un seul a renouvelé : l'alliance expire.
    const events = run(game, 300);
    expect(events).toContainEqual({ type: "allianceExpired", a: a.id, b: b.id });
    expect(game.diplomacy.allied(a.id, b.id)).toBe(false);

    game.diplomacy.request(a, b);
    game.diplomacy.reply(b, a.id, true);
    run(game, 101);
    game.diplomacy.renew(a, b.id);
    game.diplomacy.renew(b, a.id);
    run(game, 300);
    expect(game.diplomacy.allied(a.id, b.id)).toBe(true);
  });

  it("rompre rend Parjure, sauf face à un Parjure", () => {
    const { game, a, b } = twoLords();
    game.diplomacy.request(a, b);
    game.diplomacy.reply(b, a.id, true);
    const result = play(game, [as(A, { type: "allianceBreak", ally: b.id })]);
    expect(result.events).toContainEqual({
      type: "allianceBroken",
      traitor: a.id,
      victim: b.id,
      parjure: true,
    });
    expect(a.betrayals).toBe(1);
    expect(a.parjureUntil).toBe(game.ticks - 1 + PARJURE_TICKS);
    expect(game.isParjure(a)).toBe(true);

    // Rompre avec un Parjure ne coûte rien.
    game.diplomacy.request(b, a);
    game.diplomacy.reply(a, b.id, true);
    game.diplomacy.breakAlliance(b, a.id);
    expect(b.betrayals).toBe(0);
    expect(game.isParjure(b)).toBe(false);
  });

  it("contre un Parjure : pertes ×0,5 et progression 1,25× plus rapide", () => {
    const { game, a, b } = twoLords();
    const input = {
      kind: TerrainKind.Plain,
      attacker: a,
      defender: b,
      attackTroops: 5000,
      borderSize: 10,
      towerCover: false,
      rampart: false,
      landTiles: game.map.numLandTiles,
    };
    const loyal = attackLogic({ ...input, parjure: false });
    const traitor = attackLogic({ ...input, parjure: true });
    expect(traitor.attackerLoss).toBeCloseTo(loyal.attackerLoss * 0.5);
    expect(traitor.tickFraction).toBeCloseTo(loyal.tickFraction * 0.8);
  });
});

describe("Dons", () => {
  it("entre alliés seulement, un don toutes les 10 s, troupes plafonnées à la marge", () => {
    const { game, a, b } = twoLords();
    expect(game.diplomacy.donate(a, b.id, "gold", 100)).toBe("notAlly");
    game.diplomacy.request(a, b);
    game.diplomacy.reply(b, a.id, true);
    a.gold = 10_000;
    const goldBefore = b.gold;
    expect(game.diplomacy.donate(a, b.id, "gold", 3000)).toBeNull();
    expect(b.gold).toBe(goldBefore + 3000);
    expect(a.gold).toBe(7000);
    expect(game.diplomacy.donate(a, b.id, "troops", 10)).toBe("cooldown");
    run(game, 100);
    b.troops = maxTroops(b) - 500;
    a.troops = 50_000;
    expect(game.diplomacy.donate(a, b.id, "troops", 20_000)).toBeNull();
    expect(b.troops).toBe(maxTroops(b));
    expect(a.troops).toBe(49_500);
  });
});

describe("Tribus et diplomatie", () => {
  it("une tribu accepte une demande à son prochain cycle, sauf de celui qui l'attaque", () => {
    const { game, a } = twoLords({ bots: 2 });
    const friendly = game.player(3);
    const victim = game.player(4);
    if (!friendly || !victim) throw new Error("tribus introuvables");
    game.diplomacy.request(a, friendly);
    run(game, 80);
    expect(game.diplomacy.allied(a.id, friendly.id)).toBe(true);

    // La tribu attaquée refuse : on lui donne une large bande de terres autour du seigneur
    // (pour que l'attaque dure jusqu'à sa réponse), puis on l'attaque.
    const map = game.map;
    for (let layer = 0; layer < 40; layer++) {
      const owner = layer === 0 ? a.id : victim.id;
      const band: number[] = [];
      for (let t = 0; t < map.size; t++) {
        if (map.owner(t) !== 0 || !map.isPassableLand(t)) continue;
        if (map.neighbors(t).some((n) => map.owner(n) === owner)) band.push(t);
      }
      for (const t of band) game.conquer(t, victim.id);
    }
    victim.troops = 600_000;
    a.troops = 1_000_000;
    play(game, [as(A, { type: "attack", target: victim.id, troops: 300_000 })]);
    game.diplomacy.request(a, victim);
    // La réponse arrive au cycle de la tribu : l'attaque doit être encore en cours à ce moment.
    let answered = false;
    for (let i = 0; i < 80 && !answered; i++) {
      const result = play(game);
      const reply = result.events.find(
        (e) =>
          (e.type === "allianceRejected" && e.from === a.id && e.to === victim.id) ||
          (e.type === "allianceFormed" && (e.a === victim.id || e.b === victim.id)),
      );
      if (!reply) continue;
      answered = true;
      expect(result.attacks.some((x) => x.attacker === a.id && x.target === victim.id)).toBe(true);
      expect(reply.type).toBe("allianceRejected");
    }
    expect(answered).toBe(true);
    expect(game.diplomacy.allied(a.id, victim.id)).toBe(false);
  });
});

describe("Déterminisme avec prétendants et diplomatie", () => {
  it("mêmes tours ⇒ mêmes hashes ; jamais d'attaque entre alliés", () => {
    const playOnce = () => {
      const game = new Game({
        seed: 99,
        mapSize: "small",
        bots: 30,
        nations: 4,
        difficulty: Difficulty.Duke,
        humans: [{ clientId: A, name: "Alpha", race: Race.Sylvanor }],
        singleplayer: true,
      });
      let spawn = -1;
      for (let t = game.map.size >> 1; t < game.map.size && spawn < 0; t++) {
        if (game.map.isPassableLand(t) && game.map.owner(t) === 0) spawn = t;
      }
      const hashes: number[] = [];
      let alliances: { a: number; b: number }[] = [];
      let formed = 0;
      for (let turn = 0; turn < 3000; turn++) {
        const intents: { clientId: string; intent: Intent }[] = [];
        if (turn === 0) intents.push(as(A, { type: "spawn", tile: spawn }));
        // Le seigneur propose une alliance à chaque prétendant à intervalles réguliers.
        if (turn % 400 === 200) {
          for (let id = 2; id <= 5; id++)
            intents.push(as(A, { type: "allianceRequest", target: id }));
        }
        if (turn % 50 === 0 && turn > 0) {
          intents.push(as(A, { type: "attack", target: 0, troops: 5000 }));
        }
        const result = game.executeTurn({ turn, intents });
        if (result.hash !== null) hashes.push(result.hash);
        if (result.diplomacy) alliances = result.diplomacy.alliances;
        formed += result.events.filter((e) => e.type === "allianceFormed").length;
        for (const attack of result.attacks) {
          const between = alliances.some(
            (al) =>
              (al.a === attack.attacker && al.b === attack.target) ||
              (al.b === attack.attacker && al.a === attack.target),
          );
          expect(between).toBe(false);
        }
      }
      return { hashes, formed };
    };
    const first = playOnce();
    const second = playOnce();
    expect(first.hashes).toEqual(second.hashes);
    // Garde-fou de couverture : la diplomatie a bien servi pendant la partie.
    expect(first.formed).toBeGreaterThan(0);
  }, 60_000);
});

describe("Derniers survivants", () => {
  it("deux seigneurs seuls et alliés ne peuvent pas renouveler : la Couronne ne se partage pas", () => {
    const { game, a, b } = twoLords({ allianceTicks: 400 });
    game.diplomacy.request(a, b);
    game.diplomacy.reply(b, a.id, true);
    run(game, 101);
    expect(game.diplomacy.renew(a, b.id)).toBe("lastSurvivors");
  });
});
