/**
 * `localStorage` stand-in for the web companion's storage tests.
 *
 * Implemented with real in-memory semantics rather than a mock's opinion of it, so
 * the tests exercise the actual read/write/merge logic.
 */
class MemoryStorage implements Storage {
  private readonly map = new Map<string, string>();

  get length(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }

  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
}

(globalThis as unknown as { window: unknown }).window = {
  localStorage: new MemoryStorage(),
  location: { origin: 'http://localhost:5174' },
};
