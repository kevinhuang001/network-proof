import { JsonRpcClient, asHexQuantity } from './jsonrpc';
import { isSolanaChain } from './settings';
import { RpcError, ERRORS } from './types';

/**
 * The node-facing half of the RPC router.
 *
 * Two things are worth calling out:
 *
 * 1. `eth_sendRawTransaction` is forwarded, but only after the caller has verified
 *    that the payload is the one the device signed. Broadcasting is otherwise the
 *    one place where a compromised node could do damage the user would notice.
 * 2. Quantities that will be shown on the device screen are validated as hex
 *    quantities first. A node returning `"1.5"` or `null` must produce a clear
 *    error, not a `BigInt` exception three layers deeper.
 */

export interface NodeContext {
  rpcUrl: string;
  chainId: number;
}

export async function forwardToNode(
  method: string,
  params: unknown[],
  context: NodeContext,
): Promise<unknown> {
  const client = new JsonRpcClient({ url: context.rpcUrl });
  switch (method) {
    case 'eth_getTransactionCount':
      return asHexQuantity(await client.call(method, params), 'nonce');
    case 'eth_gasPrice':
      return asHexQuantity(await client.call(method, params), 'gasPrice');
    case 'eth_estimateGas':
      return asHexQuantity(await client.call(method, params), 'gas');
    case 'eth_maxPriorityFeePerGas': {
      const value = await client.call(method, params);
      if (typeof value === 'string') return asHexQuantity(value, 'maxPriorityFeePerGas');
      // Not every node implements it; fall back to a modest default rather than
      // failing, and let the user see the resulting fee on the device.
      return asHexQuantity(await client.call('eth_gasPrice', []), 'gasPrice');
    }
    case 'eth_chainId': {
      const value = await client.call(method, params);
      return typeof value === 'string' ? value : `0x${context.chainId.toString(16)}`;
    }
    case 'eth_sendRawTransaction':
      assertRawTransaction(params[0]);
      return client.call(method, params);
    default:
      return client.call(method, params);
  }
}

/** Reject anything that is not a plausible EIP-2718 payload early. */
function assertRawTransaction(value: unknown): void {
  if (typeof value !== 'string' || !/^0x02[0-9a-fA-F]+$|^0x[0-9a-fA-F]{100,}$/u.test(value)) {
    throw new RpcError({
      code: ERRORS.invalidParams.code,
      message: '拒绝广播：不是合法的已签名交易载荷',
    });
  }
}

/** Read a balance for display. Never used for signing decisions. */
export async function fetchBalance(address: string, context: NodeContext): Promise<bigint> {
  const client = new JsonRpcClient({ url: context.rpcUrl });
  if (isSolanaChain(context.chainId)) {
    // Solana's JSON-RPC is a different protocol: `getBalance` returns
    // `{ value: lamports }`, and an unrecognised address is an error rather than a
    // zero balance, so a typo cannot masquerade as an empty account.
    const result = (await client.call('getBalance', [address])) as { value?: unknown } | null;
    const lamports = result?.value;
    if (typeof lamports !== 'number' || !Number.isFinite(lamports) || lamports < 0) {
      throw new RpcError({
        code: ERRORS.internal.code,
        message: `Solana 节点返回了非预期的余额：${JSON.stringify(result)?.slice(0, 60)}`,
      });
    }
    return BigInt(Math.trunc(lamports));
  }
  const value = await client.call('eth_getBalance', [address, 'latest']);
  return BigInt(asHexQuantity(value, 'balance'));
}
