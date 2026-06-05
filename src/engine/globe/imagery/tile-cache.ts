export class TileCache<T> {
  private readonly entries = new Map<string, T>();

  constructor(readonly maxEntries = 128) {}

  get(key: string): T | undefined {
    const entry = this.entries.get(key);

    if (entry === undefined) {
      return undefined;
    }

    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry;
  }

  set(key: string, value: T): void {
    if (this.entries.has(key)) {
      this.entries.delete(key);
    }

    this.entries.set(key, value);

    while (this.entries.size > this.maxEntries) {
      const first = this.entries.keys().next().value;

      if (first === undefined) {
        return;
      }

      this.entries.delete(first);
    }
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  get size(): number {
    return this.entries.size;
  }
}
