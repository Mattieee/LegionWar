/**
 * Encodage d'une tuile.
 *
 * Terrain (immuable, 1 octet) :
 *   bit 7     terre
 *   bit 6     rivage (terre touchant l'eau, ou eau touchant la terre)
 *   bit 5     océan (plus grand plan d'eau ; sinon lac)
 *   bits 0-4  terre : bits 0-2 = TerrainKind, bits 3-4 = variante visuelle (0-3)
 *             eau   : profondeur = distance à la côte, plafonnée à 31
 *
 * État (mutable, 2 octets) :
 *   bits 0-11 propriétaire (0 = terres libres) → 4095 joueurs max
 *   bit 12    marque du propriétaire, dont le sens dépend de sa race : rempart (Aldoria),
 *             bosquet (Sylvanor). Effacée à chaque changement de propriétaire.
 *   bit 13    terre maudite (corruption laissée par les sorts)
 *   bit 14    charnier : champ de bataille récent, quel que soit le propriétaire
 *   bit 15    libre
 */
export const LAND_BIT = 0x80;
export const SHORE_BIT = 0x40;
export const OCEAN_BIT = 0x20;
export const LOW_MASK = 0x1f;
export const KIND_MASK = 0x07;
export const VARIANT_SHIFT = 3;

export const OWNER_MASK = 0x0fff;
export const MARK_BIT = 0x1000;
export const BLIGHT_BIT = 0x2000;
export const CHARNIER_BIT = 0x4000;
export const MAX_PLAYER_ID = OWNER_MASK;

export enum TerrainKind {
  Plain = 0,
  Forest = 1,
  Hills = 2,
  Mountain = 3,
  Impassable = 4,
  Water = 5,
}

export const TERRAIN_NAMES: Record<TerrainKind, string> = {
  [TerrainKind.Plain]: "Plaine",
  [TerrainKind.Forest]: "Forêt",
  [TerrainKind.Hills]: "Collines",
  [TerrainKind.Mountain]: "Montagnes",
  [TerrainKind.Impassable]: "Pics enneigés",
  [TerrainKind.Water]: "Eau",
};

export function encodeLand(kind: TerrainKind, variant: number): number {
  return LAND_BIT | (kind & KIND_MASK) | ((variant & 0x3) << VARIANT_SHIFT);
}

export function terrainKindOf(byte: number): TerrainKind {
  if ((byte & LAND_BIT) === 0) return TerrainKind.Water;
  return (byte & KIND_MASK) as TerrainKind;
}
