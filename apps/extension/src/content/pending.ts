/**
 * The calls a page is waiting on.
 *
 * These promises are the dApp's: it called `eth_requestAccounts` and is rendering a spinner
 * until something settles. Two things must therefore never happen — a call that is silently
 * dropped, and a call settled twice.
 *
 * The case that motivated this: the worker was replaced while a call was in flight (Chrome
 * stops workers, and reloading the extension tears ports down). The port died, the answer was
 * never coming, and the *only* thing that would have ended the dApp's wait was its own
 * eleven-minute timeout. Failing the call the moment the connection is known to be gone turns
 * a hang into a retryable error.
 */
export interface PendingCall {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

export class PendingCalls {
  private readonly calls = new Map<string, PendingCall>();

  add(id: string, call: PendingCall): void {
    this.calls.set(id, call);
  }

  has(id: string): boolean {
    return this.calls.has(id);
  }

  /** Settle one call, once. Returns false when the id is unknown or already settled. */
  settle(id: string, outcome: { result?: unknown; error?: unknown }): boolean {
    const call = this.calls.get(id);
    if (!call) return false;
    this.calls.delete(id);
    if (outcome.error !== undefined && outcome.error !== null) {
      const shape = outcome.error as { message?: string };
      const error = new Error(shape.message ?? '请求失败');
      Object.assign(error, shape);
      call.reject(error);
    } else {
      call.resolve(outcome.result);
    }
    return true;
  }

  /** Fail everything still waiting, with the code EIP-1193 reserves for "disconnected". */
  failAll(message: string): void {
    for (const [id, call] of [...this.calls]) {
      this.calls.delete(id);
      call.reject(Object.assign(new Error(message), { code: 4900 }));
    }
  }

  get size(): number {
    return this.calls.size;
  }
}
