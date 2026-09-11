import { RpcError, ERRORS } from './types';

/**
 * Minimal JSON-RPC client for the configured node.
 *
 * The extension is a *watch-only* companion, so a node is needed for balances,
 * nonces, gas estimation and broadcasting. It is user-configurable on purpose: a
 * wallet that hard-codes one RPC provider is a wallet that leaks every address the
 * user owns to that provider, and gives it the power to silently censor or delay
 * broadcasts.
 *
 * Everything the node returns is treated as untrusted input that will end up on the
 * hardware device's screen, so values are validated before use.
 */

export interface RpcClientOptions {
  url: string;
  timeoutMs?: number;
}

export class JsonRpcClient {
  private id = 0;
  private readonly url: string;
  private readonly timeoutMs: number;

  constructor(options: RpcClientOptions) {
    this.url = options.url;
    this.timeoutMs = options.timeoutMs ?? 20_000;
  }

  async call<T = unknown>(method: string, params: unknown[] = []): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(this.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: ++this.id, method, params }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new RpcError({
          code: ERRORS.internal.code,
          message: `RPC 节点返回 HTTP ${response.status}`,
        });
      }
      const payload = (await response.json()) as {
        result?: T;
        error?: { code: number; message: string; data?: unknown };
      };
      if (payload.error) {
        throw new RpcError({
          code: payload.error.code,
          message: payload.error.message,
          ...(payload.error.data !== undefined ? { data: payload.error.data } : {}),
        });
      }
      return payload.result as T;
    } catch (error) {
      if (error instanceof RpcError) throw error;
      if ((error as Error).name === 'AbortError') {
        throw new RpcError({ code: ERRORS.internal.code, message: 'RPC 请求超时' });
      }
      throw new RpcError({
        code: ERRORS.internal.code,
        message: `无法连接 RPC 节点：${(error as Error).message}`,
      });
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Validate a hex quantity before it is handed to the device for display. */
export function asHexQuantity(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]+$/u.test(value)) {
    throw new RpcError({
      code: ERRORS.internal.code,
      message: `RPC 节点返回的 ${field} 不是合法的十六进制数量：${String(value)}`,
    });
  }
  return value;
}

export function asHexData(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^0x([0-9a-fA-F]{2})*$/u.test(value)) {
    throw new RpcError({
      code: ERRORS.internal.code,
      message: `RPC 节点返回的 ${field} 不是合法的十六进制数据`,
    });
  }
  return value;
}
