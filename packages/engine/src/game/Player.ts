import { modifiersOf, type Race, type RaceModifiers } from "../config/Races";
import { BuildingKind, type PlayerKind } from "./Types";

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
  };
  /** Tuiles possédées ayant au moins un voisin d'un autre propriétaire (ordre d'insertion déterministe). */
  readonly border = new Set<number>();
  readonly mods: RaceModifiers;

  constructor(
    readonly id: number,
    readonly name: string,
    readonly kind: PlayerKind,
    readonly race: Race | null,
    readonly clientId: string | null,
    startTroops: number,
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
