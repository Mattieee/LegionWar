import { modifiersOf, type Race, type RaceModifiers } from "../config/Races";
import { DIFFICULTIES, type DifficultyLevel } from "../config/Rules";
import { BuildingKind, Difficulty, type PlayerKind } from "./Types";

export class Player {
  troops: number;
  gold = 0;
  tiles = 0;
  alive = true;
  spawned = false;
  everAttacked = false;
  /** Bourgs terminés (chacun augmente le plafond de troupes). */
  completedBourgs = 0;
  /** Bâtiments possédés, chantiers compris (sert au coût croissant). */
  readonly buildingCounts: Record<BuildingKind, number> = {
    [BuildingKind.Bourg]: 0,
    [BuildingKind.Tour]: 0,
    [BuildingKind.Port]: 0,
    [BuildingKind.Marche]: 0,
  };
  /** Tuiles possédées ayant au moins un voisin d'un autre propriétaire (ordre d'insertion déterministe). */
  readonly border = new Set<number>();
  readonly mods: RaceModifiers;
  /** Aldoria : tuiles frontière vues à la ronde précédente (futurs remparts). */
  rampartCandidates = new Set<number>();
  /** Tuiles possédées portant la marque de la race (remparts ou bosquets). */
  marks = 0;
  /** Kharag : or gagné par le pillage depuis le début de la partie. */
  pillaged = 0;
  /** Morvane : troupes relevées sur les charniers depuis le début de la partie. */
  raised = 0;
  /** Tick de fin du statut de Parjure (≤ tick courant : pas Parjure). */
  parjureUntil = 0;
  /** Trahisons commises (compteur permanent, visible au classement). */
  betrayals = 0;
  /** Or gagné par le commerce depuis le début de la partie. */
  tradeGold = 0;
  /** Or gagné par les caravanes depuis le début de la partie. */
  caravanGold = 0;

  constructor(
    readonly id: number,
    readonly name: string,
    readonly kind: PlayerKind,
    readonly race: Race | null,
    readonly clientId: string | null,
    startTroops: number,
    /** Niveau d'un prétendant (sans effet pour les autres types). */
    readonly level: DifficultyLevel = DIFFICULTIES[Difficulty.Knight],
  ) {
    this.troops = startTroops;
    this.mods = modifiersOf(race);
  }

  addTroops(amount: number): void {
    this.troops = Math.max(0, Math.floor(this.troops + amount));
  }

  /** Retire jusqu'à `amount` troupes et renvoie la quantité réellement retirée. */
  removeTroops(amount: number): number {
    const removed = Math.min(this.troops, Math.max(0, Math.floor(amount)));
    this.troops -= removed;
    return removed;
  }

  addGold(amount: number): void {
    this.gold = Math.max(0, Math.floor(this.gold + amount));
  }
}
