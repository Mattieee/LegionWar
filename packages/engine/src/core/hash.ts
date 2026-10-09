/** Hash de chaîne façon Java (h = h·31 + c), 32 bits non signé. */
export function simpleHash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = (Math.imul(h, 31) + text.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

/** Hash FNV-1a d'un tableau d'entiers 16 bits (état des tuiles), 32 bits non signé. */
export function arrayHash(values: Uint16Array): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < values.length; i++) {
    h = Math.imul(h ^ (values[i] as number), 0x01000193);
  }
  return h >>> 0;
}

/** Combine un hash courant avec une valeur numérique (entier ou flottant fini). */
export function mixHash(h: number, value: number): number {
  return (Math.imul(h ^ (value | 0), 0x01000193) + Math.floor(value / 4294967296)) | 0;
}
