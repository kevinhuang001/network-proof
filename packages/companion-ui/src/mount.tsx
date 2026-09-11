import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@netproof/ui/theme.css';
import { App } from './App';
import { setStoreAdapter, type KeyValueStore } from './lib/store';

/**
 * Mount the companion wallet.
 *
 * Both hosts render this: the plain web app, and the Chrome extension's full-page tab. The
 * only thing that differs is where data is stored, which is why it is a parameter — the two
 * used to have separate interface code, and the extension's simply stopped receiving changes.
 */
export function mountCompanion(options: {
  /** Defaults to `localStorage`, which is right for a page and wrong for an extension. */
  storage?: KeyValueStore;
  root?: HTMLElement | null;
} = {}): void {
  setStoreAdapter(options.storage ?? null);
  const container = options.root ?? document.getElementById('root');
  if (!container) throw new Error('#root is missing from the page');
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

export { App } from './App';
export { setStoreAdapter, type KeyValueStore } from './lib/store';
