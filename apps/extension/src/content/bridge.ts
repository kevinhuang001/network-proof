/**
 * Content-script bridge (runs in the isolated world).
 *
 * The page's MAIN world cannot talk to `chrome.runtime`, so this script relays:
 *   page --window.postMessage--> bridge --port--> service worker
 *   page <--window.postMessage-- bridge <--port-- service worker
 *
 * It is intentionally dumb: it validates the shape of what it forwards, tags every call with
 * the page origin (which only the isolated world can be trusted to report), and never
 * interprets a method itself. The port's lifetime — reconnecting after the worker is stopped
 * or the extension is reloaded — lives in `connection.ts`, where it can be tested.
 */

interface PageRequest {
  channel?: string;
  id?: string;
  method?: string;
  params?: unknown[];
}

import { CHANNEL_EVENT, CHANNEL_INFO, CHANNEL_REQUEST, CHANNEL_RESPONSE } from '../lib/channels';
import { BridgeConnection } from './connection';

function toPage(message: unknown): void {
  const data = message as { type?: string; id?: string; result?: unknown; error?: unknown };
  if (data?.type !== 'rpc-result' || !data.id) return;
  window.postMessage(
    {
      channel: CHANNEL_RESPONSE,
      id: data.id,
      ...(data.error !== undefined ? { error: data.error } : { result: data.result }),
    },
    window.location.origin,
  );
}

const connection = new BridgeConnection(
  () => chrome.runtime.connect({ name: 'netproof-provider' }),
  toPage,
  (error) => {
    window.postMessage(
      { channel: CHANNEL_EVENT, event: 'disconnect', data: error },
      window.location.origin,
    );
  },
);

window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== window) return;
  const data = event.data as PageRequest;
  if (!data || data.channel !== CHANNEL_REQUEST) return;
  if (typeof data.method !== 'string' || typeof data.id !== 'string') return;
  connection.send({
    type: 'rpc',
    id: data.id,
    method: data.method,
    params: Array.isArray(data.params) ? data.params : [],
    origin: window.location.origin,
  });
});

// Tell the injected provider we are listening, so it (re-)announces itself to the page through
// EIP-6963.
window.postMessage({ channel: CHANNEL_INFO }, window.location.origin);
window.addEventListener('DOMContentLoaded', () => {
  window.postMessage({ channel: CHANNEL_INFO }, window.location.origin);
});
