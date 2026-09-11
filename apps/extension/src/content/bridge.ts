/**
 * Content-script bridge (runs in the isolated world).
 *
 * The page's MAIN world cannot talk to `chrome.runtime`, so this script relays:
 *   page --window.postMessage--> bridge --port--> service worker
 *   page <--window.postMessage-- bridge <--port-- service worker
 *
 * It is intentionally dumb: it validates the shape of what it forwards, tags every
 * call with the page origin (which only the isolated world can be trusted to
 * report), and never interprets a method itself.
 */

interface PageRequest {
  channel?: string;
  id?: string;
  method?: string;
  params?: unknown[];
}

import { CHANNEL_EVENT, CHANNEL_INFO, CHANNEL_REQUEST, CHANNEL_RESPONSE } from '../lib/channels';

const port = chrome.runtime.connect({ name: 'netproof-provider' });

port.onMessage.addListener((message: unknown) => {
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
});

port.onDisconnect.addListener(() => {
  // The service worker went away mid-request. Tell the page rather than leaving it
  // waiting on a promise that can never settle.
  window.postMessage(
    {
      channel: CHANNEL_EVENT,
      event: 'disconnect',
      data: { code: 4900, message: '扩展后台已断开，请重试' },
    },
    window.location.origin,
  );
});

window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== window) return;
  const data = event.data as PageRequest;
  if (!data || data.channel !== CHANNEL_REQUEST) return;
  if (typeof data.method !== 'string' || typeof data.id !== 'string') return;
  port.postMessage({
    type: 'rpc',
    id: data.id,
    method: data.method,
    params: Array.isArray(data.params) ? data.params : [],
    origin: window.location.origin,
  });
});

// Tell the injected provider we are listening, so it (re-)announces itself to the
// page through EIP-6963.
window.postMessage({ channel: CHANNEL_INFO }, window.location.origin);
window.addEventListener('DOMContentLoaded', () => {
  window.postMessage({ channel: CHANNEL_INFO }, window.location.origin);
});
