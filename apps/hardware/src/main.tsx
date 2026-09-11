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

// There is deliberately no "you are online!" banner here.
//
// The previous version prepended one whenever `navigator.onLine` was true, which
// on Android is derived from ConnectivityManager and needs ACCESS_NETWORK_STATE.
// That permission was absent, so the WebView reported `true` permanently and the
// banner nagged users who had correctly enabled airplane mode. A warning that
// fires when nothing is wrong is worse than no warning: it teaches people to
// ignore warnings. The status is now shown (attributed to its source) inside the
// app, and the real guarantee is the missing INTERNET permission.
