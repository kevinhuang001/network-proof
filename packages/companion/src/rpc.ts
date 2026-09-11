import { buildSignRequestMessage, toHex } from '@netproof/core';
import type { EvmTransactionRequest, SignRequestMessage, TypedDataPayload } from '@netproof/core';
import { primaryAccount, resolveAccounts } from './accounts';
import { ERRORS, RpcError } from './types';
import type {
  ConnectedWallet,
  CompanionSettings,
  NetProofRpcError,
  PendingKind,
  PendingRequest,
} from './types';

/**
 * The EIP-1193 method surface.
 *
 * Read-only calls are forwarded to a node. Everything that would require a private
 * key is *refused here* and turned into a pending request that the user has to
 * carry to the offline device by QR. There is deliberately no fallback path that
 * signs locally, because there is no key to sign with.
 */

const READ_ONLY_METHODS = new Set([
  'eth_blockNumber',
  'eth_call',
  'eth_chainId',
  'eth_estimateGas',
  'eth_feeHistory',
  'eth_gasPrice',
  'eth_getBalance',
  'eth_getBlockByNumber',
  'eth_getCode',
  'eth_getLogs',
  'eth_getStorageAt',
  'eth_getTransactionByHash',
  'eth_getTransactionCount',
  'eth_getTransactionReceipt',
  'eth_maxPriorityFeePerGas',
  'eth_sendRawTransaction',
  'net_version',
  'web3_clientVersion',
]);

const SIGNING_METHODS: Record<string, PendingKind> = {
  eth_sendTransaction: 'sendTransaction',
  eth_signTransaction: 'signTransaction',
  personal_sign: 'personal_sign',
  eth_signTypedData_v4: 'signTypedData',
  eth_signTypedData: 'signTypedData',
};

export interface RpcContext {
  wallet: ConnectedWallet | null;
  settings: CompanionSettings;
  origin: string;
  approvedOrigins: string[];
  /** Queues a request for user approval and resolves with the final result. */
  requestApproval: (request: PendingRequest) => Promise<unknown>;
  /** Forwards a read-only call to the configured node. */
  forward: (method: string, params: unknown[]) => Promise<unknown>;
}

export interface RpcOutcome {
  result?: unknown;
  error?: NetProofRpcError;
  /** An event the page should receive, e.g. chainChanged. */
  event?: { event: string; data: unknown };
}

export async function handleRpc(
  method: string,
  params: unknown[],
  context: RpcContext,
): Promise<RpcOutcome> {
  try {
    return { result: await dispatch(method, params, context) };
  } catch (error) {
    if (error instanceof RpcError) return { error: error.toShape() };
    return { error: { code: ERRORS.internal.code, message: (error as Error).message } };
  }
}

async function dispatch(method: string, params: unknown[], context: RpcContext): Promise<unknown> {
  const { wallet, settings, origin, approvedOrigins } = context;

  switch (method) {
    case 'eth_chainId':
      return `0x${settings.chainId.toString(16)}`;

    case 'net_version':
      return String(settings.chainId);

    case 'wallet_getPermissions':
      return approvedOrigins.includes(origin)
        ? [{ parentCapability: 'eth_accounts', caveats: [] }]
        : [];

    case 'wallet_requestPermissions':
      requireWallet(wallet);
      return [
        {
          parentCapability: 'eth_accounts',
          caveats: [{ type: 'restrictReturnedAccounts', value: [primaryAccount(wallet!, settings)?.address] }],
        },
      ];

    case 'wallet_revokePermissions':
      return null;

    case 'wallet_switchEthereumChain': {
      const target = readChainId(params[0]);
      if (target === settings.chainId) return null;
      if (!settings.rpcUrls[target]) throw new RpcError(ERRORS.unrecognizedChain);
      await context.requestApproval({
        id: randomId(),
        kind: 'connect',
        origin,
        chainId: target,
        createdAt: Date.now(),
        method: 'wallet_switchEthereumChain',
        params,
      });
      return null;
    }

    case 'wallet_addEthereumChain':
      // Adding a chain would mean trusting a dApp-supplied RPC endpoint. The
      // prototype refuses: chains are configured by the user, not by a website.
      throw new RpcError({
        code: ERRORS.unsupportedMethod.code,
        message: '出于安全考虑，NetProof Companion 不接受 dApp 添加网络，请在插件设置中添加 RPC。',
      });

    case 'eth_accounts': {
      if (!wallet || !approvedOrigins.includes(origin)) return [];
      return accountsForDapp(wallet, settings);
    }

    case 'eth_requestAccounts': {
      if (!wallet) {
        // No device paired yet: the approval tab walks the user through pairing.
        await context.requestApproval({
          id: randomId(),
          kind: 'connect',
          origin,
          chainId: settings.chainId,
          createdAt: Date.now(),
          method,
          params: [],
        });
        throw new RpcError(ERRORS.disconnected);
      }
      if (!approvedOrigins.includes(origin)) {
        await context.requestApproval({
          id: randomId(),
          kind: 'connect',
          origin,
          chainId: settings.chainId,
          createdAt: Date.now(),
          method,
          params: [],
        });
      }
      return accountsForDapp(wallet, settings);
    }

    default:
      break;
  }

  if (READ_ONLY_METHODS.has(method)) {
    return context.forward(method, params);
  }

  const kind = SIGNING_METHODS[method];
  if (kind) {
    requireWallet(wallet);
    requireApproved(origin, approvedOrigins);
    const request: PendingRequest = {
      id: randomId(),
      kind,
      origin,
      chainId: settings.chainId,
      createdAt: Date.now(),
      method,
      params,
    };
    return context.requestApproval(request);
  }

  if (method.startsWith('wallet_')) {
    throw new RpcError(ERRORS.unsupportedMethod);
  }
  throw new RpcError({ code: -32601, message: `不支持的方法 ${method}` });
}

/**
 * The addresses a site is offered, selected account first.
 *
 * Exported because the host needs the same answer *after* an approval, to announce the
 * connection to a page that is already open: an SDK that timed out waiting for its own
 * `connect()` can recover from an `accountsChanged` event without a reload.
 */
export function accountsForDapp(wallet: ConnectedWallet, settings: CompanionSettings): string[] {
  const hidden = new Set(settings.hiddenAccounts.map((entry) => entry.toLowerCase()));
  // An account the user removed is not offered to a site either: "hidden from me" and
  // "hidden from the internet" have to be the same list, or the deletion is theatre.
  const accounts = resolveAccounts(wallet, settings).filter(
    (entry) => !hidden.has(entry.address.toLowerCase()),
  );
  const primary = primaryAccount(wallet, settings);
  if (!primary) return [];
  // EIP-1193 expects the first account to be the "selected" one; the rest are
  // exposed so dApps that scan a few addresses see a consistent set.
  return [primary.address, ...accounts.map((entry) => entry.address).filter((address) => address !== primary.address)];
}

function requireWallet(wallet: ConnectedWallet | null): asserts wallet is ConnectedWallet {
  if (!wallet) {
    throw new RpcError({
      code: ERRORS.disconnected.code,
      message: '尚未连接硬件钱包。请在插件中扫码导入 xpub。',
    });
  }
}

function requireApproved(origin: string, approved: string[]): void {
  if (!approved.includes(origin)) {
    throw new RpcError({
      code: ERRORS.unauthorized.code,
      message: '该站点尚未获得账户授权。请先调用 eth_requestAccounts。',
    });
  }
}

function readChainId(value: unknown): number {
  const raw = (value as { chainId?: unknown } | undefined)?.chainId;
  if (typeof raw === 'string') return Number.parseInt(raw.replace(/^0x/u, ''), 16);
  if (typeof raw === 'number') return raw;
  throw new RpcError(ERRORS.invalidParams);
}

function randomId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return toHex(bytes, true);
}

/**
 * Turn an EIP-1193 `eth_sendTransaction` call into the message the device will
 * display and sign.
 *
 * Everything the device needs must be resolved *here*, before the QR is shown:
 * the device is offline and cannot look up a nonce, a gas price or a chain id. So
 * the companion fills in the gaps from the node, then commits to exact values. If
 * it cannot resolve them, the request fails loudly rather than guessing — a
 * hardware wallet signing a guessed nonce is a hardware wallet signing the wrong
 * transaction.
 */
export async function buildTransactionRequest(input: {
  wallet: ConnectedWallet;
  settings: CompanionSettings;
  params: unknown[];
  origin: string;
  forward: (method: string, params: unknown[]) => Promise<unknown>;
}): Promise<SignRequestMessage> {
  const { wallet, settings, params, origin, forward } = input;
  const tx = params[0] as
    | {
        from?: string;
        to?: string | null;
        value?: string;
        data?: string;
        gas?: string;
        gasLimit?: string;
        maxFeePerGas?: string;
        maxPriorityFeePerGas?: string;
        gasPrice?: string;
        nonce?: string;
        chainId?: string;
        type?: string;
      }
    | undefined;
  if (!tx || typeof tx !== 'object') throw new RpcError(ERRORS.invalidParams);

  const account = primaryAccount(wallet, settings);
  if (!account) throw new RpcError(ERRORS.disconnected);

  if (tx.from && tx.from.toLowerCase() !== account.address.toLowerCase()) {
    throw new RpcError({
      code: ERRORS.unauthorized.code,
      message: `请求的 from 地址 ${tx.from} 与当前账户 ${account.address} 不一致。`,
    });
  }

  const chainId = settings.chainId;
  const to = normalizeTo(tx.to);
  const data = normalizeData(tx.data);

  const nonce =
    tx.nonce !== undefined
      ? Number(BigInt(tx.nonce))
      : Number(BigInt((await forward('eth_getTransactionCount', [account.address, 'pending'])) as string));

  const value = BigInt(tx.value ?? '0x0');

  const gas =
    tx.gas !== undefined
      ? BigInt(tx.gas)
      : tx.gasLimit !== undefined
        ? BigInt(tx.gasLimit)
        : BigInt(
            (await forward('eth_estimateGas', [
              { from: account.address, to: to ?? undefined, value: tx.value ?? '0x0', data },
            ])) as string,
          );

  let request: EvmTransactionRequest;
  if (tx.gasPrice !== undefined) {
    request = { type: 'legacy', chainId, nonce, to, value, data, gas, gasPrice: BigInt(tx.gasPrice) };
  } else {
    const maxPriorityFeePerGas =
      tx.maxPriorityFeePerGas !== undefined
        ? BigInt(tx.maxPriorityFeePerGas)
        : BigInt((await forward('eth_maxPriorityFeePerGas', [])) as string);
    const maxFeePerGas =
      tx.maxFeePerGas !== undefined
        ? BigInt(tx.maxFeePerGas)
        : BigInt((await forward('eth_gasPrice', [])) as string);
    request = {
      type: 'eip1559',
      chainId,
      nonce,
      to,
      value,
      data,
      gas,
      maxFeePerGas,
      maxPriorityFeePerGas,
    };
  }

  return buildSignRequestMessage({
    t: 'req',
    id: randomId(),
    kind: 'tx',
    path: account.path,
    address: account.address,
    chainId,
    origin,
    tx: {
      type: request.type,
      nonce: request.nonce,
      to: request.to,
      value: request.value.toString(),
      data: request.data,
      gas: request.gas!.toString(),
      ...(request.maxFeePerGas !== undefined ? { maxFeePerGas: request.maxFeePerGas.toString() } : {}),
      ...(request.maxPriorityFeePerGas !== undefined
        ? { maxPriorityFeePerGas: request.maxPriorityFeePerGas.toString() }
        : {}),
      ...(request.gasPrice !== undefined ? { gasPrice: request.gasPrice.toString() } : {}),
    },
  });
}

/**
 * Validate the recipient before it reaches the encoder.
 *
 * Without this, a dApp that sends a malformed address produces "hex string must
 * have an even length" from deep inside CBOR encoding, which tells the user
 * nothing. Worse, it fails *after* the transaction has otherwise been assembled.
 */
function normalizeTo(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (!/^0x[0-9a-fA-F]{40}$/u.test(value)) {
    throw new RpcError({
      code: ERRORS.invalidParams.code,
      message: `dApp 提供的收款地址不合法：${String(value)}`,
    });
  }
  return value;
}

/** Calldata must be byte-aligned hex; anything else is a malformed request. */
function normalizeData(value: string | undefined): string {
  if (value === undefined) return '0x';
  if (!/^0x([0-9a-fA-F]{2})*$/u.test(value)) {
    throw new RpcError({
      code: ERRORS.invalidParams.code,
      message: 'dApp 提供的 calldata 不是字节对齐的十六进制数据。',
    });
  }
  return value;
}

/** Build the message for `personal_sign` / `eth_signTypedData_v4`. */
export function buildMessageRequest(input: {
  wallet: ConnectedWallet;
  settings: CompanionSettings;
  kind: 'personal_sign' | 'signTypedData';
  params: unknown[];
  origin: string;
}): SignRequestMessage {
  const { wallet, settings, kind, params, origin } = input;
  const account = primaryAccount(wallet, settings);
  if (!account) throw new RpcError(ERRORS.disconnected);

  if (kind === 'personal_sign') {
    // EIP-1193 puts the message first and the address second, but several dApps
    // (and older MetaMask versions) send them the other way around.
    const [first, second] = params;
    const looksLikeAddress = (value: unknown): boolean =>
      typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/u.test(value);
    const message = looksLikeAddress(first) && !looksLikeAddress(second) ? second : first;
    const address = looksLikeAddress(first) && !looksLikeAddress(second) ? first : second;
    if (typeof address === 'string' && address.toLowerCase() !== account.address.toLowerCase()) {
      throw new RpcError({
        code: ERRORS.unauthorized.code,
        message: `签名地址 ${String(address)} 与当前账户不一致。`,
      });
    }
    const text = decodeMessageText(message);
    return buildSignRequestMessage({
      t: 'req',
      id: randomId(),
      kind: 'msg',
      path: account.path,
      address: account.address,
      chainId: settings.chainId,
      origin,
      message: text.isHex ? { text: text.preview, hex: text.hex } : { text: text.text },
    });
  }

  const payload = (typeof params[1] === 'object' ? params[1] : params[0]) as
    | { domain?: unknown; types?: unknown; primaryType?: unknown; message?: unknown }
    | undefined;
  if (!payload || typeof payload !== 'object' || typeof payload.primaryType !== 'string') {
    throw new RpcError({ code: ERRORS.invalidParams.code, message: 'EIP-712 载荷缺少 primaryType' });
  }
  const typed: TypedDataPayload = {
    domain: (payload.domain ?? {}) as Record<string, unknown>,
    types: (payload.types ?? {}) as TypedDataPayload['types'],
    primaryType: payload.primaryType,
    message: (payload.message ?? {}) as Record<string, unknown>,
  };
  return buildSignRequestMessage({
    t: 'req',
    id: randomId(),
    kind: 'typed',
    path: account.path,
    address: account.address,
    chainId: settings.chainId,
    origin,
    typed,
  });
}

function decodeMessageText(value: unknown): { text: string; isHex: boolean; hex: string; preview: string } {
  if (typeof value !== 'string') {
    return { text: JSON.stringify(value), isHex: false, hex: '', preview: '' };
  }
  if (!/^0x([0-9a-fA-F]{2})+$/u.test(value)) {
    return { text: value, isHex: false, hex: '', preview: '' };
  }
  const bytes = new Uint8Array((value.length - 2) / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(value.slice(2 + i * 2, 4 + i * 2), 16);
  }
  // Render printable ASCII, fall back to hex for binary payloads.
  const printable = Array.from(bytes)
    .map((byte) => (byte >= 0x20 && byte < 0x7f ? String.fromCharCode(byte) : byte === 0x0a ? '\n' : '·'))
    .join('');
  const readable = /^[\x20-\x7e\n\t]*$/u.test(printable) && !/^·+$/u.test(printable);
  return { text: readable ? printable : value, isHex: true, hex: value, preview: readable ? printable : value };
}
