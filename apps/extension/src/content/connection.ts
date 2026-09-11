/**
 * The port between a page and the service worker, with the reconnection it needs.
 *
 * MV3 workers are stopped whenever Chrome feels like it, and reloading the extension tears
 * every open port down. The bridge used to hold one port created at load and keep posting to
 * it: after either event, every call threw `Attempting to use a disconnected port object`, the
 * page never heard back, and the only fix was reloading the tab — which nothing told the user
 * to do. A dApp waiting on `eth_requestAccounts` just sat there.
 *
 * So the port is created on demand, dropped when it disconnects, and re-created for the next
 * call. A call that cannot be delivered is answered with a JSON-RPC error instead of throwing
 * into the void, because a promise that never settles is worse than one that fails.
 */
export interface DeliveredCall {
  type: 'rpc';
  id: string;
  method: string;
  params: unknown[];
  origin: string;
}

export interface BridgePort {
  postMessage(message: DeliveredCall): void;
  onMessage: { addListener: (listener: (message: unknown) => void) => void };
  onDisconnect: { addListener: (listener: () => void) => void };
}

export class BridgeConnection {
  private port: BridgePort | null = null;

  constructor(
    private readonly connect: () => BridgePort,
    private readonly onResult: (message: unknown) => void,
    private readonly onLost: (error: { code: number; message: string }) => void,
  ) {}

  /** True when a live port is in hand; reconnects if not. */
  private ensure(): BridgePort | null {
    if (this.port) return this.port;
    try {
      const port = this.connect();
      port.onMessage.addListener((message) => this.onResult(message));
      port.onDisconnect.addListener(() => {
        this.port = null;
        this.onLost({ code: 4900, message: '扩展后台已断开，正在重连，请重试' });
      });
      this.port = port;
      return port;
    } catch (error) {
      // "Extension context invalidated": the extension was reloaded and *this* content script
      // belongs to the previous one. Nothing can revive it — the page has to be reloaded, and
      // saying so is the only useful thing left.
      this.port = null;
      this.onLost({
        code: 4900,
        message: `扩展已重新加载：请刷新这个页面后重试（${(error as Error).message}）`,
      });
      return null;
    }
  }

  /** Deliver a call, or fail it. Never throws. */
  send(call: DeliveredCall): void {
    const port = this.ensure();
    if (!port) {
      this.fail(call.id, '扩展后台不可用，请刷新页面后重试');
      return;
    }
    try {
      port.postMessage(call);
    } catch {
      // The port died between the check and the send.
      this.port = null;
      this.fail(call.id, '扩展后台已断开，请重试');
    }
  }

  private fail(id: string, message: string): void {
    this.onResult({ type: 'rpc-result', id, error: { code: 4900, message } });
  }
}
