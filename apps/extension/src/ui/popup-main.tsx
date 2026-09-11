import { mountCompanion } from '@netproof/companion-ui';
import { createChromeStore } from '../lib/browser-store';

/**
 * The toolbar popup: the same wallet, in a 360px window.
 *
 * It used to be a small status card with its own idea of the wallet — one it kept for months
 * after the web version moved on. Now it renders the same interface, on the same storage, and
 * only the two flows that genuinely cannot run in a popup (pairing and signing, both of which
 * need a camera, and a popup closes the moment it loses focus to a permission prompt) hand
 * off to a full tab.
 */
void (async () => {
  const store = await createChromeStore();
  mountCompanion({
    storage: store,
    surface: {
      kind: 'popup',
      openInTab: (hash) => {
        void chrome.tabs.create({ url: chrome.runtime.getURL(`tab.html#${hash}`) });
        window.close();
      },
    },
  });
})();
