import type { KeyValueStore } from '@netproof/companion-ui';

/**
 * `chrome.storage.local` behind the synchronous interface the wallet UI expects.
 *
 * A wallet screen cannot `await` in the middle of a render, and rewriting every screen to be
 * async would mean the extension and the web app could no longer be the same code — which is
 * precisely how the extension ended up showing a version of this app that nobody had updated.
 *
 * So the whole area is read once at boot (it is a few extended public keys and a settings
 * object) and kept in a mirror. Writes go to the mirror first, so the UI sees them
 * immediately, then to `chrome.storage.local`, which is where they have to survive a restart.
 */
export async function createChromeStore(): Promise<KeyValueStore> {
  const area = chrome.storage.local;
  const raw = await area.get(null);

  const mirror = new Map<string, string>();
  for (const [key, value] of Object.entries(raw)) {
    mirror.set(key, typeof value === 'string' ? value : JSON.stringify(value));
  }

  /*
   * The area keeps changing under a page that is already open: the service worker stores a
   * request and *then* opens (or re-points) the approval tab. A mirror loaded once at boot
   * would not have it, and the approval screen would report a request that "does not exist"
   * — while a dApp waited for an answer.
   */
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    for (const [key, change] of Object.entries(changes)) {
      const value = change.newValue;
      if (value === undefined || value === null) mirror.delete(key);
      else mirror.set(key, typeof value === 'string' ? value : JSON.stringify(value));
    }
  });

  return {
    getItem: (key) => mirror.get(key) ?? null,
    setItem: (key, value) => {
      mirror.set(key, value);
      void area.set({ [key]: value });
    },
    removeItem: (key) => {
      mirror.delete(key);
      void area.remove(key);
    },
  };
}
