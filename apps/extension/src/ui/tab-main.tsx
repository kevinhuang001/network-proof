import { mountCompanion } from '@netproof/companion-ui';
import { createChromeStore } from '../lib/browser-store';

/**
 * The extension's full page.
 *
 * The same interface the web companion renders, mounted on `chrome.storage.local`. This file
 * used to hold a second, parallel implementation of the wallet — accounts, tokens, sending,
 * signing — which drifted: every change made to the web app simply did not exist here. The
 * only extension-specific thing left is *where the data lives*.
 */
void (async () => {
  const store = await createChromeStore();
  mountCompanion({
    storage: store,
    surface: {
      kind: 'page',
      resolveRequest: (id, outcome) => {
        void chrome.runtime.sendMessage({ type: 'approval-result', id, ...outcome });
      },
    },
  });
})();
