/** Hash de chaîne façon Java (h = h·31 + c), 32 bits non signé. */
export function simpleHash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = (Math.imul(h, 31) + text.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

/** Combine un hash courant avec une valeur numérique (entier ou flottant fini). */
export function mixHash(h: number, value: number): number {
  return (Math.imul(h ^ (value | 0), 0x01000193) + Math.floor(value / 4294967296)) | 0;
}
