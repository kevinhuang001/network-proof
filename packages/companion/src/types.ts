/**
 * Shared companion-wallet types.
 *
 * Kept in one place because these values cross several isolation boundaries — page,
 * content script, service worker, extension page, or a plain web page — and a
 * mismatch between them shows up as "the wallet silently did nothing".
 */

/** Message names on the page <-> content-script channel. */
export const PAGE_REQUEST = 'netproof:request';
export const PAGE_RESPONSE = 'netproof:response';
export const PAGE_EVENT = 'netproof:event';
export const PAGE_PROVIDER_INFO = 'netproof:provider-info';

export interface PageRequestMessage {
  channel: typeof PAGE_REQUEST;
  id: string;
  method: string;
  params?: unknown[];
}

export interface PageResponseMessage {
  channel: typeof PAGE_RESPONSE;
  id: string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface PageEventMessage {
  channel: typeof PAGE_EVENT;
  event: string;
  data: unknown;
}

/** Message names on the content-script <-> background channel. */
export interface RpcCall {
  type: 'rpc';
  id: string;
  method: string;
  params: unknown[];
  origin: string;
}

export interface RpcResult {
  type: 'rpc-result';
  id: string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface ApprovalResult {
  type: 'approval-result';
  id: string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface BackgroundPoke {
  type: 'provider-poke';
  origin: string;
}

export type ContentToBackground = RpcCall | ApprovalResult | BackgroundPoke;

export interface AccountExportLike {
  account: number;
  scheme: string;
  schemeLabel: string;
  xpubPath: string;
  xpub: string;
  firstAddress: string;
  firstAddressPath: string;
}

export interface SchemeLike {
  id: string;
  label: string;
  xpubPath: string;
  receive: string;
  change: string | null;
}

export interface ConnectedWallet {
  /**
   * Key family the device exported.
   *
   * `evm` gives account xpubs the companion derives from. `solana` gives addresses
   * the device computed, because SLIP-0010's ed25519 paths are hardened-only and
   * therefore have no watchable account key.
   */
  family?: 'evm' | 'solana';
  /** Solana watch list, present only when `family === 'solana'`. */
  addresses?: { path: string; address: string }[];
  /** BIP32 master fingerprint: the wallet's stable identity. */
  masterFingerprint: string;
  passphraseProtected: boolean;
  rootXpub: string;
  coinType: number;
  device: { name: string; model: string };
  accounts: AccountExportLike[];
  schemes: SchemeLike[];
  /** When the companion last scanned the device. */
  connectedAt: number;
}

export interface CompanionSettings {
  chainId: number;
  rpcUrls: Record<number, string>;
  schemeId: string;
  /** Which exported account is active. */
  accountIndex: number;
  /** Which address of that account is active. */
  addressIndex: number;
  /**
   * How many addresses per account to derive and expose.
   *
   * Bounds both the UI list and what a dApp sees through `eth_accounts`: deriving
   * more finds funds the user spread across addresses, but also discloses more of
   * the wallet's shape to the site.
   */
  addressCount: number;
  /**
   * How many accounts the *wallet UI* shows.
   *
   * MetaMask's model: you see one account until you press "add account", which
   * reveals the next derivation. Keeping this separate from `addressCount` means the
   * account list stays readable while `eth_accounts` can still expose more addresses
   * to a dApp that needs to find funds the user spread around.
   */
  visibleAccounts: number;
  /** User-chosen display names, keyed by lowercase address. */
  accountNames: Record<string, string>;
  /**
   * Accounts the user removed from the list, by lowercase address.
   *
   * An account is a derivation, not an object: `m/44'/60'/0'/0/i` exists whether or not
   * anyone looks at it, so "delete" can only mean "stop showing me this one". Recording the
   * address rather than the index keeps that stable when the list grows — deleting account 3
   * and then adding account 6 must not resurrect the wrong one.
   */
  hiddenAccounts: string[];
  qrFragmentLength: number;
  qrFrameDurationMs: number;
  /** Broadcast automatically once the device returns a valid signed payload. */
  autoBroadcast: boolean;
}

export type PendingKind = 'connect' | 'sendTransaction' | 'signTransaction' | 'personal_sign' | 'signTypedData';

export interface PendingRequest {
  id: string;
  kind: PendingKind;
  origin: string;
  chainId: number;
  createdAt: number;
  /** The exact EIP-1193 method, for display and for the response shape. */
  method: string;
  params: unknown[];
}

/** JSON-RPC error codes we produce ourselves (EIP-1193 / EIP-1474 conventions). */
export const ERRORS = {
  userRejected: { code: 4001, message: '用户拒绝了请求' },
  unauthorized: { code: 4100, message: '该账户未被授权给此站点' },
  unsupportedMethod: { code: 4200, message: 'NetProof Companion 不支持该方法' },
  disconnected: { code: 4900, message: '未连接硬件钱包' },
  chainDisconnected: { code: 4901, message: '当前链未连接' },
  unrecognizedChain: { code: 4902, message: '未知的链 ID' },
  internal: { code: -32603, message: '内部错误' },
  invalidParams: { code: -32602, message: '参数无效' },
  deviceRejected: { code: 4001, message: '硬件钱包拒绝了签名' },
} as const;

/**
 * The wire shape of an error. Anything that crosses a process boundary (page,
 * content script, worker, extension page) must use this plain object: class
 * instances do not survive structured cloning, and a `RpcError` sent through a port
 * would arrive as a bare object with the code silently dropped.
 */
export interface NetProofRpcError {
  code: number;
  message: string;
  data?: unknown;
}

/** In-process error type. Thrown inside one context, converted to a shape at the edge. */
export class RpcError extends Error {
  readonly code: number;
  readonly data?: unknown;

  constructor({ code, message, data }: NetProofRpcError) {
    super(message);
    this.name = 'RpcError';
    this.code = code;
    if (data !== undefined) this.data = data;
  }

  /** The structured-clone-safe representation. */
  toShape(): NetProofRpcError {
    return {
      code: this.code,
      message: this.message,
      ...(this.data !== undefined ? { data: this.data } : {}),
    };
  }
}
