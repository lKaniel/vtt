/** A binary min-heap of keys ordered by `f`, for A* searches. */
export class MinHeap {
  private items: { key: number; f: number }[] = [];

  get size(): number {
    return this.items.length;
  }

  push(key: number, f: number): void {
    const a = this.items;
    a.push({ key, f });
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p]!.f <= a[i]!.f) break;
      this.swap(p, i);
      i = p;
    }
  }

  pop(): number {
    const a = this.items;
    const top = a[0]!;
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      this.siftDown(0);
    }
    return top.key;
  }

  private siftDown(start: number): void {
    const a = this.items;
    let i = start;
    for (;;) {
      const smallest = [2 * i + 1, 2 * i + 2]
        .filter((c) => c < a.length)
        .reduce((m, c) => (a[c]!.f < a[m]!.f ? c : m), i);
      if (smallest === i) return;
      this.swap(smallest, i);
      i = smallest;
    }
  }

  private swap(i: number, j: number): void {
    const a = this.items;
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
}
