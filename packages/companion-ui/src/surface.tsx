import type { ReactNode } from 'react';
import { createContext, useContext } from 'react';

/**
 * Where this copy of the wallet is running.
 *
 * Two places differ between a browser tab and a toolbar popup, and both are physics rather
 * than taste:
 *
 *  - **A popup closes the moment it loses focus.** Asking for camera permission takes focus,
 *    so the pairing and signing flows cannot run there — they need a tab.
 *  - **A popup is about 360×420.** The wallet's own layout is built for a phone, so this is
 *    only about how much of it fits before scrolling.
 *
 * Everything else — the asset list, accounts, history, settings, locking — is the same
 * interface, which is the point: the extension had a second, parallel implementation of the
 * whole app, and every change made to the web version simply did not exist there.
 */
export interface Surface {
  kind: 'page' | 'popup';
  /** Opens a route in a full tab, for the screens a popup cannot host. */
  openInTab?: (hash: string) => void;
  /**
   * Hands the outcome of a dApp's request back to whoever is waiting for it.
   *
   * In the extension that is the service worker, which is holding the dApp's promise open; in
   * the plain web app there is no waiting dApp and this is absent. Without it the interface
   * completes a signature and the site waits for ever — the request was answered on screen and
   * never answered on the wire.
   */
  resolveRequest?: (id: string, outcome: { result?: unknown; error?: { code: number; message: string } }) => void;
}

const SurfaceContext = createContext<Surface>({ kind: 'page' });

export function SurfaceProvider({
  value,
  children,
}: {
  value: Surface;
  children: ReactNode;
}): ReactNode {
  return <SurfaceContext.Provider value={value}>{children}</SurfaceContext.Provider>;
}

export function useSurface(): Surface {
  return useContext(SurfaceContext);
}
