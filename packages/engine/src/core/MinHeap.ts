/** Tas binaire minimal (priorité flottante → valeur entière). Ordre déterministe. */
export class MinHeap {
  private readonly priorities: number[] = [];
  private readonly values: number[] = [];

  get size(): number {
    return this.values.length;
  }

  push(priority: number, value: number): void {
    const p = this.priorities;
    const v = this.values;
    let i = v.length;
    p.push(priority);
    v.push(value);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if ((p[parent] as number) <= priority) break;
      p[i] = p[parent] as number;
      v[i] = v[parent] as number;
      i = parent;
    }
    p[i] = priority;
    v[i] = value;
  }

  /** Retire et renvoie la valeur de plus petite priorité. Le tas ne doit pas être vide. */
  pop(): number {
    const p = this.priorities;
    const v = this.values;
    const top = v[0] as number;
    const lastP = p.pop() as number;
    const lastV = v.pop() as number;
    const n = v.length;
    if (n === 0) return top;
    let i = 0;
    for (;;) {
      const left = 2 * i + 1;
      if (left >= n) break;
      const right = left + 1;
      const child = right < n && (p[right] as number) < (p[left] as number) ? right : left;
      if ((p[child] as number) >= lastP) break;
      p[i] = p[child] as number;
      v[i] = v[child] as number;
      i = child;
    }
    p[i] = lastP;
    v[i] = lastV;
    return top;
  }

  clear(): void {
    this.priorities.length = 0;
    this.values.length = 0;
  }
}
