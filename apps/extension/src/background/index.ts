import { toHex } from '@netproof/core';
import { forwardToNode } from '@netproof/companion';
import { handleRpc } from '@netproof/companion';
import {
  approveOrigin,
  getPending,
  loadApprovedOrigins,
  loadPending,
  loadSettings,
  loadWallet,
  putPending,
  removePending,
} from '../lib/store';
import { ERRORS, RpcError, accountsForDapp } from '@netproof/companion';
import type {
  ApprovalResult,
  ContentToBackground,
  CompanionSettings,
  NetProofRpcError,
  PendingRequest,
} from '@netproof/companion';

/**
 * Background service worker: the broker between dApps and the air gap.
 *
 * Flow for a signing request:
 *   1. a page calls `eth_sendTransaction` through the injected provider;
 *   2. this worker turns it into a pending request and opens the approval tab;
 *   3. the tab builds the QR payload, the user scans it with the offline device,
 *      and scans the signature back;
 *   4. the tab posts an `approval-result` message, which resolves the promise the
 *      page is awaiting.
 *
 * The promise bound to a port request is held in memory, and the *request* is
 * persisted to `chrome.storage.local`. That split is deliberate: Chrome can stop
 * this worker at any time, so the durable half (the request) is what a reloaded
 * tab resumes from, while the ephemeral half (the pending promise) only matters
 * for as long as the originating page is open — and an open port keeps the worker
 * alive for exactly that long.
 */

const APPROVAL_PATH = 'tab.html';

interface PendingResolver {
  resolve: (value: unknown) => void;
  reject: (error: NetProofRpcError) => void;
}

const resolvers = new Map<string, PendingResolver>();

/**
 * Which page asked, so an event can be delivered to that page and no other.
 *
 * `accountsChanged` carries addresses. Broadcasting it to every open tab would tell one site
 * that some wallet exists and what it holds.
 */
const originPorts = new Map<string, chrome.runtime.Port>();
const portOrigins = new WeakMap<chrome.runtime.Port, string>();

/**
 * The last few things this worker decided, and why.
 *
 * Debugging "I clicked connect and nothing happened" from the outside is guesswork: the page
 * console only shows the site's own noise, and this worker runs in a different process with a
 * console nobody opens. A short ring buffer, readable from the wallet's own settings screen,
 * turns that into a question with an answer: did the call arrive, and what did we do with it?
 */
interface Decision {
  at: number;
  method: string;
  origin: string;
  outcome: string;
}
const decisions: Decision[] = [];
const DECISION_LIMIT = 40;

function note(method: string, origin: string, outcome: string): void {
  decisions.unshift({ at: Date.now(), method, origin, outcome });
  decisions.length = Math.min(decisions.length, DECISION_LIMIT);
}

void chrome.runtime.onInstalled.addListener(() => {
  // Clear any request left over from a previous session: a pending signature the
  // user walked away from must not be silently resumable.
  void loadPending().then(async (all) => {
    for (const request of all) await removePending(request.id);
  });
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'netproof-provider') return;

  port.onMessage.addListener((message: ContentToBackground) => {
    void (async () => {
      try {
        if (message.type === 'approval-result') {
          void settle(message);
          return;
        }
        if (message.type === 'provider-poke') {
          port.postMessage({ type: 'poked' });
          return;
        }
        if (message.type !== 'rpc') return;
        originPorts.set(message.origin, port);
        portOrigins.set(port, message.origin);
        const outcome = await route(message.method, message.params, message.origin);
        port.postMessage({ type: 'rpc-result', id: message.id, ...outcome });
      } catch (error) {
        port.postMessage({
          type: 'rpc-result',
          id: (message as { id?: string }).id ?? 'unknown',
          error: { code: ERRORS.internal.code, message: (error as Error).message },
        });
      }
    })();
  });
});

/** Also accept results delivered via one-shot messages (used by the tab reload). */
chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  const candidate = message as { type?: string };
  if (candidate?.type === 'approval-result') {
    void settle(candidate as ApprovalResult);
    sendResponse({ ok: true });
    return true;
  }
  if (candidate?.type === 'pending-list') {
    void loadPending().then((all) => sendResponse({ pending: all }));
    return true;
  }
  if (candidate?.type === 'diagnostics') {
    void (async () => {
      const [pending, wallet, settings, origins] = await Promise.all([
        loadPending(),
        loadWallet(),
        loadSettings(),
        loadApprovedOrigins(),
      ]);
      sendResponse({
        wallet: wallet?.masterFingerprint ?? null,
        chainId: settings.chainId,
        rpcUrl: settings.rpcUrls[settings.chainId] ?? null,
        approvedOrigins: origins,
        pending: pending.map((entry) => ({ id: entry.id, method: entry.method, origin: entry.origin })),
        decisions,
      });
    })();
    return true;
  }
  return false;
});

async function route(
  method: string,
  params: unknown[],
  origin: string,
): Promise<{ result?: unknown; error?: NetProofRpcError }> {
  const settings = await loadSettings();
  const wallet = await loadWallet();
  const approvedOrigins = await loadApprovedOrigins();
  const rpcUrl = settings.rpcUrls[settings.chainId];
  if (!rpcUrl) {
    return { error: { code: ERRORS.unrecognizedChain.code, message: `链 ${settings.chainId} 没有配置 RPC` } };
  }

  if (!wallet) note(method, origin, '还没有配对的钱包');
  else if (!approvedOrigins.includes(origin)) note(method, origin, '未授权来源');

  return handleRpc(method, params, {
    wallet,
    settings,
    origin,
    approvedOrigins,
    forward: (forwardMethod, forwardParams) =>
      forwardToNode(forwardMethod, forwardParams, { rpcUrl, chainId: settings.chainId }),
    requestApproval: (request) => queueApproval(request, settings),
  });
}

/**
 * Ask the user, and surface the question where they will actually see it.
 *
 * A request that opens nothing is a request that never happens. Connecting needs no camera, so
 * it is asked in the toolbar popup — the thing the user's browser is already telling them to
 * click. Signing needs a camera, and a popup closes the moment it loses focus to a permission
 * prompt, so that one gets a tab. Either way the badge goes up, because the popup can only be
 * opened by the user, not by us.
 */
function queueApproval(request: PendingRequest, settings: CompanionSettings): Promise<unknown> {
  return new Promise<unknown>((resolve, reject) => {
    void (async () => {
      await putPending(request);
      resolvers.set(request.id, { resolve, reject });
      await markPending(1);
      await surfaceRequest(request);

      // A request nobody answers would otherwise hang the page forever.
      setTimeout(() => {
        if (!resolvers.has(request.id)) return;
        resolvers.delete(request.id);
        void removePending(request.id);
        void markPending(0);
        reject({ code: ERRORS.userRejected.code, message: '请求已超时，请重新发起' });
      }, 10 * 60 * 1000);

      void settings;
    })();
  });
}

/** How many requests are still waiting, as the icon's badge. */
function raiseBadge(): void {
  void loadPending().then((all) => markPending(all.length));
}

/** A pending request has to be visible from outside the wallet. */
async function markPending(count: number): Promise<void> {
  try {
    await chrome.action.setBadgeBackgroundColor({ color: '#2b6bff' });
    await chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
  } catch {
    // A browser without the badge API is not a reason to drop the request.
  }
}

async function surfaceRequest(request: PendingRequest): Promise<void> {
  if (request.kind === 'connect') {
    // No camera involved, so the popup can host it. `openPopup` is recent and can refuse
    // without a user gesture; the tab below is the fallback that always works.
    try {
      const action = chrome.action as typeof chrome.action & { openPopup?: () => Promise<void> };
      if (typeof action.openPopup === 'function') {
        await action.openPopup();
        return;
      }
    } catch {
      // Fall through to the tab.
    }
  }
  await openApprovalTab(request.id);
}

async function openApprovalTab(id: string): Promise<void> {
  const url = chrome.runtime.getURL(`${APPROVAL_PATH}#/sign/${id}`);
  const existing = await chrome.tabs.query({ url: chrome.runtime.getURL(`${APPROVAL_PATH}*`) });
  const tab = existing[0];
  if (tab?.id !== undefined) {
    await chrome.tabs.update(tab.id, { url, active: true });
    if (tab.windowId !== undefined) await chrome.windows.update(tab.windowId, { focused: true });
    return;
  }
  await chrome.tabs.create({ url });
}

/**
 * Finish an approval.
 *
 * The origin is written *here*, by the side that answers dApps, and before the caller is
 * resolved. The interface also records it — that is what the user's click means — but its
 * write goes through an asynchronous store adapter, so a site that calls `eth_accounts`
 * immediately after `eth_requestAccounts` could reach this worker before the origin landed and
 * be told, correctly and uselessly, that it is not approved yet. That is a connection that
 * appears to succeed and then does nothing.
 */
async function settle(message: ApprovalResult): Promise<void> {
  const resolver = resolvers.get(message.id);
  if (!resolver) return;
  const request = await getPending(message.id);
  resolvers.delete(message.id);
  void markPending(0);

  if (request) lastApprovedOrigin = request.origin;
  if (request && !message.error) {
    // Idempotent: a rejection leaves the origin unapproved.
    await approveOrigin(request.origin);
  }
  if (message.error) resolver.reject(message.error);
  else resolver.resolve(message.result);

  void announceIfConnected(message, request?.origin ?? null);
}

/**
 * Tell the page it is connected, the moment it is.
 *
 * A dApp that calls `eth_requestAccounts` on load and gives up after thirty seconds has
 * usually given up before a human has finished approving — that is the "EIP1193 provider
 * connection timeout" in the wild. Between the timeout and the next page load nothing
 * reconnects the site, so the approval lands on a page that has stopped listening. An
 * `accountsChanged` event is what wallets emit at this point, and what SDKs like wagmi watch
 * for, so the page can recover without the user reloading anything.
 */
async function announceIfConnected(message: ApprovalResult, askedBy: string | null): Promise<void> {
  if (message.error) return;
  const origin = askedBy ?? lastApprovedOrigin;
  const port = origin ? originPorts.get(origin) : undefined;
  if (!origin || !port) return;
  const wallet = await loadWallet();
  if (!wallet) return;
  const settings = await loadSettings();
  try {
    port.postMessage({
      type: 'event',
      event: 'accountsChanged',
      data: accountsForDapp(wallet, settings),
    });
  } catch {
    // The page went away; nothing to announce to.
  }
}

/** The origin most recently approved, for a request whose record is already gone. */
let lastApprovedOrigin: string | null = null;

/**
 * The approval tab records the outcome here once the device has signed and the
 * payload has been verified. Only this worker broadcasts, so there is exactly one
 * place where a transaction can reach the network.
 */
export async function completeApproval(
  id: string,
  outcome: { result?: unknown; error?: NetProofRpcError },
): Promise<void> {
  const request = await getPending(id);
  if (!request) return;
  lastApprovedOrigin = request.origin;
  await removePending(id);
  raiseBadge();
  const resolver = resolvers.get(id);
  if (!resolver) return;
  resolvers.delete(id);
  if (outcome.error) resolver.reject(outcome.error);
  else resolver.resolve(outcome.result);
}

/** Approve an origin once the user accepts the connection prompt. */
export async function rememberOrigin(origin: string): Promise<void> {
  await approveOrigin(origin);
}

export { completeApproval as __completeApproval, RpcError };

/** Exposed for the approval tab: it needs the settings to build the QR frames. */
export async function readSettings(): Promise<CompanionSettings> {
  return loadSettings();
}

export function newRequestId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return toHex(bytes, true);
}
