import type { Race } from "../config/Races";
import type { MapSize } from "../map/MapGenerator";

/**
 * Types de joueurs (GDD §13) : le seigneur humain, le prétendant (IA qui joue comme un humain :
 * il construit, attaque et fait de la diplomatie) et la tribu sauvage (remplissage passif).
 */
export type PlayerKind = "human" | "nation" | "bot";

/** Niveau des prétendants : Écuyer, Chevalier (par défaut), Duc, Empereur. */
export enum Difficulty {
  Squire = "squire",
  Knight = "knight",
  Duke = "duke",
  Emperor = "emperor",
}

export enum BuildingKind {
  /** Habitat : augmente le plafond de troupes. */
  Bourg = "bourg",
  /** Défense : ralentit et saigne les attaquants à proximité. */
  Tour = "tour",
}

export interface HumanSlot {
  clientId: string;
  name: string;
  race: Race;
}

export interface GameConfig {
  seed: number;
  mapSize: MapSize;
  /** Nombre de tribus sauvages (IA neutres). */
  bots: number;
  /** Nombre de prétendants (IA rivales), 0 par défaut. */
  nations?: number;
  /** Niveau des prétendants (Chevalier par défaut). */
  difficulty?: Difficulty;
  /** Durée d'une alliance en ticks (0 = alliances désactivées ; défaut : ALLIANCE_TICKS). */
  allianceTicks?: number;
  /** Dons d'or et de troupes entre alliés (activés par défaut). */
  donations?: boolean;
  humans: HumanSlot[];
  /** Solo : la phase de déploiement se termine dès que le joueur choisit sa terre. */
  singleplayer: boolean;
}

/** Action d'un joueur. Tout ce qui modifie la simulation passe par un intent. */
export type Intent =
  | { type: "spawn"; tile: number }
  /**
   * target = 0 → terres libres. `tile` (optionnel) = tuile visée : si la cible n'a aucune
   * frontière terrestre commune, l'attaque part en barge vers cette tuile.
   */
  | { type: "attack"; target: number; troops: number; tile?: number }
  /** Débarquement forcé vers la tuile visée, même si une frontière terrestre existe. */
  | { type: "boat"; tile: number; troops: number }
  | { type: "build"; building: BuildingKind; tile: number }
  /** Propose une alliance ; vaut acceptation si la cible nous en a déjà proposé une. */
  | { type: "allianceRequest"; target: number }
  | { type: "allianceReply"; requester: number; accept: boolean }
  /** Demande de renouvellement, pendant les 30 dernières secondes de l'alliance. */
  | { type: "allianceRenew"; ally: number }
  /** Rompt une alliance : le traître devient Parjure. */
  | { type: "allianceBreak"; ally: number }
  | { type: "donate"; target: number; resource: DonationResource; amount: number };

export type DonationResource = "gold" | "troops";

export interface StampedIntent {
  clientId: string;
  intent: Intent;
}

export interface Turn {
  turn: number;
  intents: StampedIntent[];
}

export interface PlayerView {
  id: number;
  name: string;
  kind: PlayerKind;
  race: Race | null;
  clientId: string | null;
  alive: boolean;
  spawned: boolean;
  tiles: number;
  troops: number;
  maxTroops: number;
  gold: number;
  bourgs: number;
  tours: number;
  /** Remparts (Aldoria) ou bosquets (Sylvanor) possédés. */
  marks: number;
  /** Or pillé (Kharag). */
  pillaged: number;
  /** Troupes relevées sur les charniers (Morvane). */
  raised: number;
  /** Alliés actuels (identifiants). */
  allies: number[];
  /** Tick de fin du statut de Parjure (0 ou passé = pas Parjure). */
  parjureUntil: number;
  /** Trahisons commises depuis le début de la partie. */
  betrayals: number;
  /** Prétendant : sa relation envers chaque seigneur humain (index = identifiant), sinon vide. */
  regard: number[];
}

/** État diplomatique visible, transmis seulement quand il change. */
export interface DiplomacyView {
  /** Demandes en attente, dans l'ordre d'envoi. */
  requests: { from: number; to: number; expires: number }[];
  /** Alliances en cours ; `renew` = alliés ayant demandé le renouvellement. */
  alliances: { a: number; b: number; expires: number; renew: number[] }[];
}

export interface BuildingView {
  id: number;
  kind: BuildingKind;
  owner: number;
  tile: number;
  done: boolean;
}

export interface AttackView {
  id: number;
  attacker: number;
  target: number;
  troops: number;
}

export interface BoatView {
  id: number;
  owner: number;
  /** Tuile d'eau où se trouve la barge. */
  tile: number;
  /** Tuile de terre où elle débarquera. */
  landing: number;
  /** Propriétaire de la tuile de débarquement au départ (0 = terres libres). */
  target: number;
  troops: number;
}

export type BoatRejection = "maxBoats" | "notCoastal" | "noRoute" | "ally";

export type GameEvent =
  | { type: "spawnPhaseEnd" }
  | { type: "boatLaunched"; attacker: number; target: number; troops: number }
  | { type: "boatLanded"; attacker: number; target: number }
  | { type: "boatRejected"; player: number; reason: BoatRejection }
  | { type: "spawnRejected"; player: number }
  | { type: "attackStarted"; attacker: number; target: number; troops: number }
  | { type: "eliminated"; player: number; by: number; gold: number }
  | { type: "buildingDone"; player: number; building: BuildingKind }
  | { type: "buildingCaptured"; player: number; from: number; building: BuildingKind }
  | { type: "buildingRejected"; player: number; reason: BuildRejection }
  | { type: "win"; player: number; reason: WinReason }
  /** Le Crépuscule tombe : le seuil de victoire commence à baisser. */
  | { type: "twilight" }
  | { type: "allianceRequested"; from: number; to: number }
  | { type: "allianceRejected"; from: number; to: number; expired: boolean }
  | { type: "allianceFormed"; a: number; b: number }
  | { type: "allianceRenewWindow"; a: number; b: number }
  | { type: "allianceRenewed"; a: number; b: number }
  | { type: "allianceExpired"; a: number; b: number }
  | { type: "allianceBroken"; traitor: number; victim: number; parjure: boolean }
  | {
      type: "donation";
      from: number;
      to: number;
      resource: DonationResource;
      amount: number;
    }
  | { type: "diplomacyRejected"; player: number; reason: DiplomacyRejection };

/** Raisons de refus d'une action diplomatique ou d'une attaque contre un allié. */
export type DiplomacyRejection =
  | "disabled"
  | "invalidTarget"
  | "ally"
  | "notAlly"
  | "cooldown"
  | "maxAlliances"
  | "noRequest"
  | "notRenewable"
  | "lastSurvivors";

/**
 * Cause d'une victoire : 80 % des terres, seuil abaissé par le Crépuscule, dernier royaume
 * debout, ou plus grand royaume à la limite de temps (GDD §14).
 */
export type WinReason = "dominion" | "twilight" | "lastStanding" | "timeLimit";

export type BuildRejection = "spawnPhase" | "notOwned" | "terrain" | "tooClose" | "gold";

export interface TickResult {
  tick: number;
  inSpawnPhase: boolean;
  /** Paires [tuile, état16] pour chaque tuile modifiée pendant ce tick. */
  changedTiles: Uint32Array;
  players: PlayerView[];
  /** Liste complète des bâtiments, seulement si elle a changé (sinon null). */
  buildings: BuildingView[] | null;
  attacks: AttackView[];
  boats: BoatView[];
  /** État diplomatique, seulement s'il a changé (sinon null). */
  diplomacy: DiplomacyView | null;
  events: GameEvent[];
  /** Hash d'état (tous les 10 ticks) pour détecter les désynchronisations, sinon null. */
  hash: number | null;
  winner: number | null;
  /** Ticks écoulés depuis la fin du déploiement (horloge du Crépuscule). */
  warTicks: number;
  /** Seuil de victoire courant, en % des terres (GDD §14). */
  winPercent: number;
  /** Porteur de la Couronne pendant ce tick (0 = personne), tel que le moteur l'applique. */
  crown: number;
}
