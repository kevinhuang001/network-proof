import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@netproof/ui/theme.css';
import { App } from './App';

const container = document.getElementById('root');
if (!container) throw new Error('#root is missing from index.html');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// There is deliberately no connectivity banner, and no connectivity check at all.
//
// An earlier version showed one whenever `navigator.onLine` was true. On Android that
// flag is derived from ConnectivityManager, so with ACCESS_NETWORK_STATE absent the
// WebView reported `true` permanently and the banner nagged users who had correctly
// enabled airplane mode. A warning that fires when nothing is wrong is worse than no
// warning: it teaches people to ignore warnings. The app now asks the OS nothing about
// the network, and relies on the guarantee it actually has — the manifest has no
// INTERNET permission, so a socket is not merely unused, it is unavailable.
