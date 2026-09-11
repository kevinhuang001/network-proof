import { mountCompanion } from '@netproof/companion-ui';
import { STORAGE_KEYS, type PendingRequest } from '@netproof/companion';
import { createChromeStore } from '../lib/browser-store';

/**
 * The toolbar popup: the same wallet, in a 360px window.
 *
 * It used to be a small status card with its own idea of the wallet — one it kept for months
 * after the web version moved on. Now it renders the same interface, on the same storage.
 *
 * The two flows that cannot run here (pairing and signing: both need a camera, and a popup
 * closes the moment it loses focus to a permission prompt) hand off to a full tab.
 *
 * It also opens *on a waiting request* when there is one. A site that says "open the extension
 * to connect" is telling the user to click this icon, and landing on the asset list instead of
 * the question they were sent here to answer is how a request looks like nothing happened.
 */
void (async () => {
  const store = await createChromeStore();

  const raw = store.getItem(STORAGE_KEYS.pending);
  if (raw) {
    try {
      const pending = JSON.parse(raw) as PendingRequest[];
      const next = pending[0];
      if (next) window.location.hash = `/sign/${next.id}`;
    } catch {
      // A malformed queue is not worth blocking the wallet for.
    }
  }

  mountCompanion({
    storage: store,
    surface: {
      kind: 'popup',
      openInTab: (hash) => {
        void chrome.tabs.create({ url: chrome.runtime.getURL(`tab.html#${hash}`) });
        window.close();
      },
      resolveRequest: (id, outcome) => {
        // The service worker holds the dApp's promise; this is the only thing that releases it.
        void chrome.runtime.sendMessage({ type: 'approval-result', id, ...outcome });
      },
    },
  });
})();
