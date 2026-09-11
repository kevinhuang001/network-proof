import { Component, StrictMode } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import '@netproof/ui/theme.css';
import { App } from './App';
import { SurfaceProvider, type Surface } from './surface';
import { setStoreAdapter, type KeyValueStore } from './lib/store';

/**
 * Mount the companion wallet.
 *
 * Both hosts render this: the plain web app, and the Chrome extension — its tab *and* its
 * toolbar popup. The only things that differ are where data is stored and which surface the
 * interface is running on, because the two used to have separate interface code and the
 * extension's simply stopped receiving changes.
 */
export function mountCompanion(
  options: {
    /** Defaults to `localStorage`, which is right for a page and wrong for an extension. */
    storage?: KeyValueStore;
    root?: HTMLElement | null;
    surface?: Surface;
  } = {},
): void {
  setStoreAdapter(options.storage ?? null);
  const container = options.root ?? document.getElementById('root');
  if (!container) throw new Error('#root is missing from the page');
  createRoot(container).render(
    <StrictMode>
      <FatalBoundary>
        <SurfaceProvider value={options.surface ?? { kind: 'page' }}>
          <App />
        </SurfaceProvider>
      </FatalBoundary>
    </StrictMode>,
  );
}

/**
 * Something has to be on screen even when rendering fails.
 *
 * A thrown render unmounts the tree, and an empty document is a blank window — which in an
 * extension popup is a blank window about twenty pixels wide, with no hint about what went
 * wrong. This turns that into a sentence.
 */
class FatalBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('companion render failed', error, info.componentStack);
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="np-app" style={{ minHeight: 320, padding: 20 }}>
        <h1 className="np-headline">界面出错了</h1>
        <p className="np-body np-body--tight">{this.state.error.message}</p>
        <button type="button" className="np-btn np-btn--primary np-btn--block" onClick={() => window.location.reload()}>
          重新加载
        </button>
      </div>
    );
  }
}

export { App } from './App';
export { setStoreAdapter, type KeyValueStore } from './lib/store';
export { useSurface } from './surface';
