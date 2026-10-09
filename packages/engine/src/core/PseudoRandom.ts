/**
 * Générateur pseudo-aléatoire sfc32, graine étendue par splitmix32.
 * N'utilise que des opérations entières 32 bits : résultats identiques sur tous les moteurs JS.
 */
export class PseudoRandom {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: number) {
    let s = seed >>> 0;
    const splitmix = (): number => {
      s = (s + 0x9e3779b9) >>> 0;
      let z = s;
      z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
      z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
      return (z ^ (z >>> 16)) >>> 0;
    };
    this.a = splitmix();
    this.b = splitmix();
    this.c = splitmix();
    this.d = splitmix();
    for (let i = 0; i < 12; i++) this.nextUint32();
  }

  nextUint32(): number {
    const t = (((this.a + this.b) >>> 0) + this.d) >>> 0;
    this.d = (this.d + 1) >>> 0;
    this.a = (this.b ^ (this.b >>> 9)) >>> 0;
    this.b = (this.c + (this.c << 3)) >>> 0;
    this.c = ((this.c << 21) | (this.c >>> 11)) >>> 0;
    this.c = (this.c + t) >>> 0;
    return t;
  }

  /** Flottant dans [0, 1). */
  next(): number {
    return this.nextUint32() / 4294967296;
  }

  /** Entier dans [min, max) — max exclu. */
  nextInt(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min));
  }

  /** Vrai avec une probabilité 1/odds. */
  chance(odds: number): boolean {
    return this.nextInt(0, odds) === 0;
  }

  pick<T>(items: readonly T[]): T {
    const item = items[this.nextInt(0, items.length)];
    if (item === undefined) throw new Error("pick() sur un tableau vide");
    return item;
  }

  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i + 1);
      const tmp = items[i] as T;
      items[i] = items[j] as T;
      items[j] = tmp;
    }
    return items;
  }
}
