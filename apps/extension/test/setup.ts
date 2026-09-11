/**
 * Minimal `chrome.*` stand-in.
 *
 * Only the surface the storage layer touches, implemented with real in-memory
 * semantics so the tests exercise the merge/read/write logic rather than a mock's
 * opinion of it.
 */
type Listener = (...args: unknown[]) => void;

function createStorageArea(): chrome.storage.StorageArea {
  const state = new Map<string, unknown>();
  return {
    async get(keys?: unknown) {
      if (keys === undefined || keys === null) return Object.fromEntries(state);
      if (typeof keys === 'string') return state.has(keys) ? { [keys]: state.get(keys) } : {};
      if (Array.isArray(keys)) {
        const out: Record<string, unknown> = {};
        for (const key of keys) if (state.has(key)) out[key] = state.get(key);
        return out;
      }
      const out: Record<string, unknown> = {};
      for (const [key, fallback] of Object.entries(keys as Record<string, unknown>)) {
        out[key] = state.has(key) ? state.get(key) : fallback;
      }
      return out;
    },
    async set(items: Record<string, unknown>) {
      for (const [key, value] of Object.entries(items)) state.set(key, value);
    },
    async remove(keys: string | string[]) {
      for (const key of Array.isArray(keys) ? keys : [keys]) state.delete(key);
    },
    async clear() {
      state.clear();
    },
    async getBytesInUse() {
      return 0;
    },
    onChanged: { addListener: () => undefined, removeListener: () => undefined },
  } as unknown as chrome.storage.StorageArea;
}

const messageListeners: Listener[] = [];

(globalThis as unknown as { chrome: unknown }).chrome = {
  storage: { local: createStorageArea(), session: createStorageArea() },
  runtime: {
    id: 'test-extension-id',
    getURL: (path: string) => `chrome-extension://test-extension-id/${path}`,
    onInstalled: { addListener: () => undefined },
    onConnect: { addListener: () => undefined },
    onMessage: {
      addListener: (listener: Listener) => {
        messageListeners.push(listener);
      },
    },
    async sendMessage(message: unknown) {
      for (const listener of messageListeners) listener(message, {}, () => undefined);
      return undefined;
    },
  },
  tabs: {
    async query() {
      return [];
    },
    async create() {
      return { id: 1 };
    },
    async update() {
      return { id: 1 };
    },
  },
  windows: { async update() {} },
};
