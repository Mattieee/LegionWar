/**
 * Les quatre races jouables. Toutes partagent le même socle de règles ; elles diffèrent par
 * des modificateurs numériques (et, plus tard, par leurs bâtiments et leur sort ultime — voir GDD).
 * Noms et univers 100 % originaux (aucune propriété intellectuelle tierce).
 */
export enum Race {
  Aldoria = "aldoria",
  Kharag = "kharag",
  Morvane = "morvane",
  Sylvanor = "sylvanor",
}

export const ALL_RACES: readonly Race[] = [Race.Aldoria, Race.Kharag, Race.Morvane, Race.Sylvanor];

export interface RaceModifiers {
  /** Multiplicateur du revenu d'or. */
  goldMult: number;
  /** Multiplicateur du plafond de troupes. */
  maxTroopsMult: number;
  /** Multiplicateur de la régénération des troupes. */
  regenMult: number;
  /** Multiplicateur des pertes subies quand on attaque (< 1 = avantage). */
  attackLossMult: number;
  /** Multiplicateur des pertes infligées à l'attaquant quand on défend (> 1 = avantage). */
  defenseMult: number;
  /** Vitesse de conquête (> 1 = plus rapide). */
  conquestSpeedMult: number;
  /** Multiplicateur du coût des bâtiments. */
  buildCostMult: number;
  /** Multiplicateur de portée des tours de garde. */
  towerRangeMult: number;
  /** Bonus défensif sur les tuiles de forêt. */
  forestDefenseMult: number;
  /** Coût de progression en forêt quand on attaque (< 1 = plus rapide). */
  forestAttackCostMult: number;
  /** Part des pertes ennemies relevées comme troupes à chaque tuile prise. */
  harvestRatio: number;
}

export const NEUTRAL_MODIFIERS: RaceModifiers = {
  goldMult: 1,
  maxTroopsMult: 1,
  regenMult: 1,
  attackLossMult: 1,
  defenseMult: 1,
  conquestSpeedMult: 1,
  buildCostMult: 1,
  towerRangeMult: 1,
  forestDefenseMult: 1,
  forestAttackCostMult: 1,
  harvestRatio: 0,
};

export interface RaceInfo {
  id: Race;
  /** Nom de la faction. */
  name: string;
  /** Peuple. */
  people: string;
  emblem: string;
  description: string;
  /** Résumé des bonus, affiché dans le menu. */
  traits: string[];
  modifiers: RaceModifiers;
}

export const RACES: Record<Race, RaceInfo> = {
  [Race.Aldoria]: {
    id: Race.Aldoria,
    name: "Royaume d'Aldoria",
    people: "Humains",
    emblem: "⚜",
    description:
      "Chevaliers, bâtisseurs et marchands. Un royaume riche qui fortifie ses frontières avant de marcher.",
    traits: ["+20 % d'or", "Bâtiments −15 %", "Tours de garde +25 % de portée", "Défense +10 %"],
    modifiers: {
      ...NEUTRAL_MODIFIERS,
      goldMult: 1.2,
      buildCostMult: 0.85,
      towerRangeMult: 1.25,
      defenseMult: 1.1,
    },
  },
  [Race.Kharag]: {
    id: Race.Kharag,
    name: "Clans de Kharag",
    people: "Orcs",
    emblem: "⚒",
    description:
      "Des clans guerriers venus des steppes de cendre. Ils frappent vite et fort, au prix de leur trésor.",
    traits: [
      "Pertes en attaque −15 %",
      "Conquête +15 % plus rapide",
      "+5 % de troupes max",
      "−15 % d'or",
    ],
    modifiers: {
      ...NEUTRAL_MODIFIERS,
      goldMult: 0.85,
      maxTroopsMult: 1.05,
      attackLossMult: 0.85,
      conquestSpeedMult: 1.15,
      defenseMult: 0.95,
    },
  },
  [Race.Morvane]: {
    id: Race.Morvane,
    name: "Les Damnés de Morvane",
    people: "Morts-vivants",
    emblem: "☠",
    description:
      "Une nécromancie glaciale. Chaque ennemi tombé se relève dans leurs rangs ; leur peuple se renouvelle lentement.",
    traits: ["Relève 30 % des pertes ennemies", "Régénération −10 %", "−10 % d'or"],
    modifiers: {
      ...NEUTRAL_MODIFIERS,
      goldMult: 0.9,
      regenMult: 0.9,
      harvestRatio: 0.3,
    },
  },
  [Race.Sylvanor]: {
    id: Race.Sylvanor,
    name: "Cercle de Sylvanor",
    people: "Elfes sylvains",
    emblem: "❦",
    description:
      "Gardiens des forêts anciennes. Insaisissables sous les frondaisons, redoutables quand on les y traque.",
    traits: [
      "Défense ×1,5 en forêt",
      "Avance 30 % plus vite en forêt",
      "+5 % d'or",
      "−5 % de troupes max",
    ],
    modifiers: {
      ...NEUTRAL_MODIFIERS,
      goldMult: 1.05,
      maxTroopsMult: 0.95,
      forestDefenseMult: 1.5,
      forestAttackCostMult: 0.7,
    },
  },
};

export function modifiersOf(race: Race | null): RaceModifiers {
  return race === null ? NEUTRAL_MODIFIERS : RACES[race].modifiers;
}
