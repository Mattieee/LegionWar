import {
  ALLIANCE_RENEW_WINDOW,
  ALLIANCE_REQUEST_COOLDOWN,
  ALLIANCE_REQUEST_TICKS,
  DONATION_COOLDOWN,
  MAX_ALLIANCES,
  PARJURE_TICKS,
  maxTroops,
} from "../config/Rules";
import { mixHash } from "../core/hash";
import type { Game } from "./Game";
import type { Player } from "./Player";
import type { DiplomacyRejection, DiplomacyView, DonationResource } from "./Types";

interface Alliance {
  a: number;
  b: number;
  formed: number;
  expires: number;
  /** Alliés ayant demandé le renouvellement pendant la fenêtre. */
  renew: number[];
  windowOpened: boolean;
}

interface Request {
  from: number;
  to: number;
  expires: number;
}

/**
 * Alliances, demandes, trahisons et dons (GDD §12). Tout est stocké dans des tableaux dans
 * l'ordre de création, avec des échéances en ticks entiers : l'état est le même sur tous les
 * clients. Les intents des humains et les décisions des IA passent par les mêmes méthodes.
 */
export class Diplomacy {
  private alliances: Alliance[] = [];
  private requests: Request[] = [];
  /** Tick avant lequel `from` ne peut pas redemander à `to` (clé de paire orientée). */
  private readonly requestCooldowns = new Map<number, number>();
  /** Tick avant lequel `from` ne peut plus donner à `to`. */
  private readonly donationCooldowns = new Map<number, number>();
  /** Vrai quand la vue diplomatique a changé depuis la dernière collecte. */
  dirty = true;

  constructor(
    private readonly game: Game,
    /** Durée d'une alliance en ticks ; 0 désactive les alliances. */
    readonly allianceTicks: number,
    readonly donationsEnabled: boolean,
  ) {}

  get enabled(): boolean {
    return this.allianceTicks > 0;
  }

  // Lecture -------------------------------------------------------------------------------------

  allied(a: number, b: number): boolean {
    return this.find(a, b) !== null;
  }

  alliesOf(id: number): number[] {
    const out: number[] = [];
    for (const al of this.alliances) {
      if (al.a === id) out.push(al.b);
      else if (al.b === id) out.push(al.a);
    }
    return out;
  }

  allianceCount(id: number): number {
    let n = 0;
    for (const al of this.alliances) if (al.a === id || al.b === id) n++;
    return n;
  }

  /** Demandes reçues par `id`, dans l'ordre d'envoi. */
  requestsTo(id: number): { from: number; expires: number }[] {
    return this.requests.filter((r) => r.to === id);
  }

  /** Demandes envoyées par `id` et encore en attente. */
  requestsFrom(id: number): { to: number; expires: number }[] {
    return this.requests.filter((r) => r.from === id);
  }

  hasRequest(from: number, to: number): boolean {
    return this.requests.some((r) => r.from === from && r.to === to);
  }

  /** Tick de conclusion de l'alliance entre a et b (null s'ils ne sont pas alliés). */
  formedAt(a: number, b: number): number | null {
    return this.find(a, b)?.formed ?? null;
  }

  /** Vrai si l'alliance est dans sa fenêtre de renouvellement et que `id` a déjà renouvelé. */
  inRenewWindow(a: number, b: number): boolean {
    const al = this.find(a, b);
    return al !== null && al.expires - this.game.ticks <= ALLIANCE_RENEW_WINDOW;
  }

  hasRenewed(id: number, ally: number): boolean {
    return this.find(id, ally)?.renew.includes(id) ?? false;
  }

  // Actions -------------------------------------------------------------------------------------

  /** Propose une alliance ; vaut acceptation si `to` nous en a déjà proposé une. */
  request(from: Player, to: Player): DiplomacyRejection | null {
    if (!this.enabled) return "disabled";
    if (!this.canDeal(from, to)) return "invalidTarget";
    if (this.allied(from.id, to.id)) return "ally";
    if (this.hasRequest(to.id, from.id)) return this.reply(from, to.id, true);
    if (this.hasRequest(from.id, to.id)) return null;
    if ((this.requestCooldowns.get(pairKey(from.id, to.id)) ?? 0) > this.game.ticks) {
      return "cooldown";
    }
    if (this.allianceCount(from.id) >= MAX_ALLIANCES) return "maxAlliances";
    this.requests.push({
      from: from.id,
      to: to.id,
      expires: this.game.ticks + ALLIANCE_REQUEST_TICKS,
    });
    this.game.emit({ type: "allianceRequested", from: from.id, to: to.id });
    this.dirty = true;
    return null;
  }

  /** Réponse de `responder` à la demande de `requesterId`. */
  reply(responder: Player, requesterId: number, accept: boolean): DiplomacyRejection | null {
    const index = this.requests.findIndex((r) => r.from === requesterId && r.to === responder.id);
    if (index < 0) return "noRequest";
    this.requests.splice(index, 1);
    this.dirty = true;
    const requester = this.game.player(requesterId);
    const full =
      this.allianceCount(responder.id) >= MAX_ALLIANCES ||
      this.allianceCount(requesterId) >= MAX_ALLIANCES;
    if (accept && requester !== null && requester.alive && !full) {
      this.form(requester, responder);
      return null;
    }
    this.requestCooldowns.set(
      pairKey(requesterId, responder.id),
      this.game.ticks + ALLIANCE_REQUEST_COOLDOWN,
    );
    this.game.emit({
      type: "allianceRejected",
      from: requesterId,
      to: responder.id,
      expired: false,
    });
    this.game.onRequestRefused(requesterId, responder.id);
    return accept && full ? "maxAlliances" : null;
  }

  /** Demande de renouvellement ; l'alliance repart au complet quand les deux l'ont demandé. */
  renew(p: Player, allyId: number): DiplomacyRejection | null {
    const al = this.find(p.id, allyId);
    if (al === null) return "notAlly";
    if (al.expires - this.game.ticks > ALLIANCE_RENEW_WINDOW) return "notRenewable";
    // La Couronne ne se partage pas : les derniers survivants ne peuvent plus prolonger.
    if (this.game.onlyAlliesRemain()) return "lastSurvivors";
    if (!al.renew.includes(p.id)) al.renew.push(p.id);
    this.dirty = true;
    if (al.renew.length === 2) {
      al.expires = this.game.ticks + this.allianceTicks;
      al.renew = [];
      al.windowOpened = false;
      this.game.emit({ type: "allianceRenewed", a: al.a, b: al.b });
      this.game.onAllianceSealed(al.a, al.b);
    }
    return null;
  }

  /**
   * Rompt une alliance. Le traître devient Parjure, sauf s'il rompt avec un Parjure.
   * Renvoie l'ancien allié rompu, ou null s'il n'y avait pas d'alliance.
   */
  breakAlliance(traitor: Player, allyId: number): DiplomacyRejection | null {
    const index = this.alliances.findIndex(
      (al) => (al.a === traitor.id && al.b === allyId) || (al.b === traitor.id && al.a === allyId),
    );
    if (index < 0) return "notAlly";
    this.alliances.splice(index, 1);
    this.dirty = true;
    const victim = this.game.player(allyId);
    const parjure = victim === null || !this.game.isParjure(victim);
    if (parjure) {
      traitor.parjureUntil = this.game.ticks + PARJURE_TICKS;
      traitor.betrayals++;
    }
    this.game.emit({ type: "allianceBroken", traitor: traitor.id, victim: allyId, parjure });
    if (parjure) this.game.onBetrayal(traitor, allyId);
    return null;
  }

  donate(
    from: Player,
    toId: number,
    resource: DonationResource,
    requested: number,
  ): DiplomacyRejection | null {
    if (!this.donationsEnabled) return "disabled";
    const to = this.game.player(toId);
    if (to === null || !to.alive || !from.alive) return "invalidTarget";
    if (!this.allied(from.id, toId)) return "notAlly";
    const key = pairKey(from.id, toId);
    if ((this.donationCooldowns.get(key) ?? 0) > this.game.ticks) return "cooldown";
    if (!Number.isFinite(requested)) return "invalidTarget";
    const wanted = Math.max(0, Math.floor(requested));
    const amount =
      resource === "gold"
        ? Math.min(from.gold, wanted)
        : Math.min(from.troops, wanted, Math.max(0, maxTroops(to) - to.troops));
    if (amount < 1) return null;
    if (resource === "gold") {
      from.gold -= amount;
      to.addGold(amount);
    } else {
      from.troops -= amount;
      to.addTroops(amount);
    }
    this.donationCooldowns.set(key, this.game.ticks + DONATION_COOLDOWN);
    this.game.emit({ type: "donation", from: from.id, to: toId, resource, amount });
    this.game.onDonation(from.id, toId, resource, amount);
    return null;
  }

  // Temps ---------------------------------------------------------------------------------------

  /** Expirations des demandes et des alliances, ouverture des fenêtres de renouvellement. */
  update(): void {
    const now = this.game.ticks;
    // Les délais échus sont oubliés : les tables restent petites (ordre d'insertion conservé).
    for (const [key, until] of this.requestCooldowns)
      if (until <= now) this.requestCooldowns.delete(key);
    for (const [key, until] of this.donationCooldowns)
      if (until <= now) this.donationCooldowns.delete(key);
    if (this.requests.some((r) => r.expires <= now)) {
      const expired = this.requests.filter((r) => r.expires <= now);
      this.requests = this.requests.filter((r) => r.expires > now);
      for (const r of expired) {
        this.requestCooldowns.set(pairKey(r.from, r.to), now + ALLIANCE_REQUEST_COOLDOWN);
        this.game.emit({ type: "allianceRejected", from: r.from, to: r.to, expired: true });
      }
      this.dirty = true;
    }
    const kept: Alliance[] = [];
    for (const al of this.alliances) {
      if (al.expires <= now) {
        this.game.emit({ type: "allianceExpired", a: al.a, b: al.b });
        this.dirty = true;
        continue;
      }
      if (!al.windowOpened && al.expires - now <= ALLIANCE_RENEW_WINDOW) {
        al.windowOpened = true;
        this.game.emit({ type: "allianceRenewWindow", a: al.a, b: al.b });
        this.dirty = true;
      }
      kept.push(al);
    }
    this.alliances = kept;
  }

  /** Un joueur éliminé perd ses alliances et ses demandes. */
  onEliminated(id: number): void {
    const before = this.alliances.length + this.requests.length;
    this.alliances = this.alliances.filter((al) => al.a !== id && al.b !== id);
    this.requests = this.requests.filter((r) => r.from !== id && r.to !== id);
    if (this.alliances.length + this.requests.length !== before) this.dirty = true;
  }

  /** Attaquer une cible annule sa propre demande d'alliance en attente envers elle. */
  cancelRequest(from: number, to: number): void {
    const index = this.requests.findIndex((r) => r.from === from && r.to === to);
    if (index >= 0) {
      this.requests.splice(index, 1);
      this.dirty = true;
    }
  }

  // Sorties -------------------------------------------------------------------------------------

  /**
   * Couvre tout l'état diplomatique : une divergence (demande, date de conclusion qui pilote
   * les trahisons des IA, délais) doit être détectée tout de suite, pas quand elle a des effets.
   */
  hash(h: number): number {
    for (const al of this.alliances) {
      h = mixHash(h, al.a);
      h = mixHash(h, al.b);
      h = mixHash(h, al.formed);
      h = mixHash(h, al.expires);
      h = mixHash(h, al.windowOpened ? 1 : 0);
      for (const id of al.renew) h = mixHash(h, id);
    }
    for (const r of this.requests) {
      h = mixHash(h, r.from);
      h = mixHash(h, r.to);
      h = mixHash(h, r.expires);
    }
    for (const [key, until] of this.requestCooldowns) h = mixHash(mixHash(h, key), until);
    for (const [key, until] of this.donationCooldowns) h = mixHash(mixHash(h, key), until);
    return h;
  }

  view(): DiplomacyView {
    return {
      requests: this.requests.map((r) => ({ from: r.from, to: r.to, expires: r.expires })),
      alliances: this.alliances.map((al) => ({
        a: al.a,
        b: al.b,
        expires: al.expires,
        renew: [...al.renew],
      })),
    };
  }

  private form(a: Player, b: Player): void {
    this.requests = this.requests.filter(
      (r) => !((r.from === a.id && r.to === b.id) || (r.from === b.id && r.to === a.id)),
    );
    const now = this.game.ticks;
    this.alliances.push({
      a: a.id,
      b: b.id,
      formed: now,
      expires: now + this.allianceTicks,
      renew: [],
      windowOpened: false,
    });
    this.dirty = true;
    this.game.emit({ type: "allianceFormed", a: a.id, b: b.id });
    this.game.onAllianceSealed(a.id, b.id);
  }

  private canDeal(from: Player, to: Player): boolean {
    return from !== to && from.alive && to.alive && to.spawned && !this.game.inSpawnPhase;
  }

  private find(a: number, b: number): Alliance | null {
    for (const al of this.alliances) {
      if ((al.a === a && al.b === b) || (al.a === b && al.b === a)) return al;
    }
    return null;
  }
}

function pairKey(from: number, to: number): number {
  return from * 4096 + to;
}
