/**
 * Injected EIP-1193 provider (runs in the page's MAIN world).
 *
 * Declared in the manifest with `"world": "MAIN"`, which matters: a provider
 * injected by rewriting a `<script>` tag is blocked by any page with a strict CSP,
 * and one injected from the isolated world would be invisible to the page.
 *
 * This file is bundled as a classic IIFE and runs
 * before any page script (`run_at: document_start`), so `window.ethereum` exists
 * by the time a dApp checks for it.
 *
 * It also implements EIP-6963 (multi-provider discovery), which is how modern
 * dApps find wallets now that several extensions can coexist.
 */

interface RequestArguments {
  method: string;
  params?: unknown[] | object;
}

type Listener = (...args: unknown[]) => void;

import { CHANNEL_EVENT, CHANNEL_INFO, CHANNEL_REQUEST, CHANNEL_RESPONSE, PROVIDER_ICON, PROVIDER_INFO as PROVIDER_IDENTITY } from '../lib/channels';

import { PendingCalls } from './pending';

const PROVIDER_INFO = { ...PROVIDER_IDENTITY, icon: PROVIDER_ICON };

class NetProofProvider {
  private readonly pending = new PendingCalls();
  private readonly listeners = new Map<string, Set<Listener>>();
  private chainId = '0x1';
  private accounts: string[] = [];
  private counter = 0;

  readonly isNetProof = true;
  readonly isMetaMask = false;

  constructor() {
    window.addEventListener('message', (event: MessageEvent) => {
      if (event.source !== window || !event.data || typeof event.data !== 'object') return;
      const data = event.data as { channel?: string; id?: string; result?: unknown; error?: unknown; event?: string; data?: unknown };
      if (data.channel === CHANNEL_RESPONSE && data.id) {
        this.pending.settle(data.id, { result: data.result, error: data.error });
        return;
      }
      if (data.channel === CHANNEL_EVENT && typeof data.event === 'string') {
        if (data.event === 'disconnect') {
          // The connection is known to be gone, so nothing is coming: fail what is waiting
          // instead of letting the dApp sit on a promise until its own timeout.
          const detail = data.data as { message?: string } | undefined;
          this.pending.failAll(detail?.message ?? '扩展后台已断开，请重试');
        }
        this.emit(data.event, data.data);
      }
    });

    // The bridge asks for our info as soon as it is ready.
    window.addEventListener('message', (event: MessageEvent) => {
      const data = event.data as { channel?: string };
      if (event.source === window && data?.channel === CHANNEL_INFO) {
        this.announce();
      }
    });
    this.announce();

    // Keep chainId/accounts reasonably fresh for dApps that read them on load.
    void this.request({ method: 'eth_chainId' })
      .then((value) => {
        if (typeof value === 'string' && value !== this.chainId) {
          this.chainId = value;
          this.emit('chainChanged', value);
        }
      })
      .catch(() => undefined);
    void this.request({ method: 'eth_accounts' })
      .then((value) => {
        if (Array.isArray(value)) this.accounts = value as string[];
      })
      .catch(() => undefined);
  }

  private announce(): void {
    const detail = Object.freeze({ info: Object.freeze(PROVIDER_INFO), provider: this });
    window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail }));
  }

  async request(args: RequestArguments): Promise<unknown> {
    if (!args || typeof args.method !== 'string') {
      throw new Error('EIP-1193: request() requires a method');
    }
    const result = await this.requestRaw(args.method, args.params);
    if (args.method === 'eth_requestAccounts' || args.method === 'eth_accounts') {
      const next = Array.isArray(result) ? (result as string[]) : [];
      if (next.join(',') !== this.accounts.join(',')) {
        this.accounts = next;
        this.emit('accountsChanged', next);
      }
    }
    if (args.method === 'eth_chainId' && typeof result === 'string') this.chainId = result;
    return result;
  }

  private requestRaw(method: string, params?: unknown[] | object): Promise<unknown> {
    const id = `np-${Date.now().toString(36)}-${(this.counter++).toString(36)}`;
    return new Promise<unknown>((resolve, reject) => {
      this.pending.add(id, { resolve, reject });
      window.postMessage(
        {
          channel: CHANNEL_REQUEST,
          id,
          method,
          params: normalizeParams(params),
        },
        window.location.origin,
      );
      // A page that never hears back would hang forever.
      setTimeout(() => {
        this.pending.settle(id, { error: { code: 4900, message: 'NetProof Companion 未响应请求' } });
      }, 11 * 60 * 1000);
    });
  }

  on(event: string, listener: Listener): this {
    const set = this.listeners.get(event) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(event, set);
    return this;
  }

  removeListener(event: string, listener: Listener): this {
    this.listeners.get(event)?.delete(listener);
    return this;
  }

  private emit(event: string, data: unknown): void {
    for (const listener of this.listeners.get(event) ?? []) {
      try {
        listener(data);
      } catch {
        // A throwing listener must not break the provider.
      }
    }
  }

  // Legacy convenience API, still probed by a lot of dApp code.
  get isConnected(): boolean {
    return true;
  }
  get selectedAddress(): string | null {
    return this.accounts[0] ?? null;
  }
  get networkVersion(): string {
    return String(Number.parseInt(this.chainId, 16));
  }
  get chainIdValue(): string {
    return this.chainId;
  }
  enable(): Promise<unknown> {
    return this.request({ method: 'eth_requestAccounts' });
  }
  send(
    methodOrPayload: string | { method: string; params?: unknown[] },
    paramsOrCallback?: unknown[] | ((error: Error | null, response?: unknown) => void),
  ): Promise<unknown> | void {
    if (typeof methodOrPayload === 'string') {
      const callback = typeof paramsOrCallback === 'function' ? paramsOrCallback : undefined;
      const params = Array.isArray(paramsOrCallback) ? paramsOrCallback : [];
      const promise = this.request({ method: methodOrPayload, params });
      if (callback) {
        promise.then(
          (result) => callback(null, { id: 0, jsonrpc: '2.0', result }),
          (error: Error) => callback(error),
        );
        return undefined;
      }
      return promise;
    }
    return this.request({ method: methodOrPayload.method, params: methodOrPayload.params ?? [] });
  }
  sendAsync(
    payload: { method: string; params?: unknown[] },
    callback: (error: Error | null, response?: unknown) => void,
  ): void {
    this.request({ method: payload.method, params: payload.params ?? [] }).then(
      (result) => callback(null, { id: 0, jsonrpc: '2.0', result }),
      (error: Error) => callback(error),
    );
  }
}

function normalizeParams(params: unknown[] | object | undefined): unknown[] {
  if (params === undefined) return [];
  return Array.isArray(params) ? params : [params];
}

declare global {
  interface Window {
    ethereum?: NetProofProvider;
    netproof?: NetProofProvider;
  }
}

export {};

const provider = new NetProofProvider();

// Never clobber another wallet's provider: EIP-6963 exists precisely so that
// multiple wallets can coexist, and overwriting `window.ethereum` breaks them.
if (!window.ethereum) {
  window.ethereum = provider;
}
window.netproof = provider;

window.dispatchEvent(new Event('ethereum#initialized'));
