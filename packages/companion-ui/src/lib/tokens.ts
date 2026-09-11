import { keccak_256 } from '@noble/hashes/sha3.js';
import type { ChainMeta } from '@netproof/companion';

/**
 * Token discovery and balances.
 *
 * A wallet that only shows the native coin is not a wallet people can use: on every
 * EVM chain the money lives in ERC-20s. Two ways to know about a token, and this
 * module deliberately supports the honest one:
 *
 *  - a hard-coded list of popular tokens (what OKX Wallet and MetaMask ship), which
 *    requires trusting a curated list and usually a price API; or
 *  - the user pastes a contract address and the wallet asks the chain what it is.
 *
 * This implements the second. It needs nothing but the RPC the user already
 * configured, so no third party learns which tokens someone holds, and it cannot go
 * stale. `symbol`, `name` and `decimals` are read from the contract itself.
 */

export interface TokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  /** Chain this token belongs to. */
  chainId: number;
  /** True for the chain's native coin, which has no contract. */
  native: boolean;
}

export interface TokenBalance extends TokenInfo {
  /** Raw balance in the token's smallest unit. */
  raw: bigint;
  /** Human-readable amount. */
  formatted: string;
}

export interface CallFn {
  (method: string, params: unknown[]): Promise<unknown>;
}

function hex(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('0x')) {
    throw new Error(`RPC 返回了非预期的结果：${String(value).slice(0, 60)}`);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Minimal ABI codec
// ---------------------------------------------------------------------------
//
// Four view functions is the entire surface this needs, so the encoding is done by
// hand rather than pulling a full ABI library (and its dependencies) into the wallet
// bundle. Every function here is exercised by tests, because an ABI bug does not
// crash — it silently reports the wrong balance, which is worse.

const SELECTORS = {
  symbol: selector('symbol()'),
  name: selector('name()'),
  decimals: selector('decimals()'),
  balanceOf: selector('balanceOf(address)'),
} as const;

/** First four bytes of keccak256 of the canonical signature. */
export function selector(signature: string): string {
  const digest = keccak_256(new TextEncoder().encode(signature));
  return Array.from(digest.subarray(0, 4))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/** Left-pad a 20-byte address into a 32-byte ABI word. */
export function encodeAddress(address: string): string {
  const clean = address.toLowerCase().replace(/^0x/u, '');
  if (!/^[0-9a-f]{40}$/u.test(clean)) throw new Error(`不是合法地址：${address}`);
  return clean.padStart(64, '0');
}

/** Decode a `uint256`/`uint8` return value. */
export function decodeUint(word: string): bigint {
  const clean = word.replace(/^0x/u, '');
  if (!/^[0-9a-f]*$/u.test(clean) || clean.length === 0 || clean.length > 64) {
    throw new Error('返回值不是合法的 uint');
  }
  return BigInt(`0x${clean}`);
}

/**
 * Decode a `string` return value.
 *
 * The value is an ABI-encoded dynamic string: a 32-byte offset, then a 32-byte
 * length, then the bytes. Some non-standard contracts return a fixed `bytes32`
 * instead, which is why that shape is handled too rather than throwing.
 */
export function decodeString(data: string): string {
  const clean = data.replace(/^0x/u, '');
  if (clean.length === 64) {
    // bytes32-encoded symbol, as several early tokens did.
    return trimTrailingNulls(clean);
  }
  if (clean.length < 128) throw new Error('字符串返回值太短');

  const offset = Number(decodeUint(clean.slice(0, 64)));
  if (!Number.isFinite(offset) || offset * 2 + 64 > clean.length) {
    // Fall back to treating the payload as bytes32 rather than failing outright.
    return trimTrailingNulls(clean.slice(0, 64));
  }
  const lengthWord = clean.slice(offset * 2, offset * 2 + 64);
  const length = Number(decodeUint(lengthWord));
  if (length === 0) return '';
  if (length > 128) throw new Error('字符串返回值长度不合理');
  const body = clean.slice(offset * 2 + 64, offset * 2 + 64 + length * 2);
  if (body.length < length * 2) throw new Error('字符串返回值被截断');
  return hexToUtf8(body);
}

function trimTrailingNulls(hexBody: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < hexBody.length; i += 2) {
    const byte = Number.parseInt(hexBody.slice(i, i + 2), 16);
    if (byte === 0) break;
    bytes.push(byte);
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

function hexToUtf8(hexBody: string): string {
  const bytes = new Uint8Array(hexBody.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hexBody.slice(i * 2, i * 2 + 2), 16);
  }
  return new TextDecoder().decode(bytes);
}

/**
 * Ask the chain what a contract is.
 *
 * A contract that does not implement the metadata functions (or that returns
 * malformed data) must produce a clear failure rather than a token row full of
 * "undefined" — the user is about to trust this list with money.
 */
export async function inspectToken(contract: string, chainId: number, call: CallFn): Promise<TokenInfo> {
  if (!/^0x[0-9a-fA-F]{40}$/u.test(contract)) {
    throw new Error('合约地址格式不正确（应为 0x + 40 位十六进制）');
  }

  const code = await call('eth_getCode', [contract, 'latest']);
  if (typeof code !== 'string' || code === '0x' || code === '0x0') {
    throw new Error('该地址没有合约代码，可能不是代币合约（或写错了网络）');
  }

  const readString = async (fn: 'symbol' | 'name'): Promise<string> => {
    try {
      const result = await call('eth_call', [
        { to: contract, data: `0x${SELECTORS[fn]}` },
        'latest',
      ]);
      return decodeString(hex(result)).trim();
    } catch (error) {
      throw new Error(`无法读取代币的 ${fn}()：${(error as Error).message}`);
    }
  };

  let decimals = 18;
  try {
    const result = await call('eth_call', [
      { to: contract, data: `0x${SELECTORS.decimals}` },
      'latest',
    ]);
    decimals = Number(decodeUint(hex(result).replace(/^0x/u, '')));
  } catch (error) {
    throw new Error(`无法读取代币的 decimals()：${(error as Error).message}`);
  }
  // A hostile or broken contract could report 255 decimals and make every balance
  // render as zero; clamp to the range the ERC-20 spec allows in practice.
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
    throw new Error(`代币报告的 decimals 不合理：${decimals}`);
  }

  const symbol = await readString('symbol');
  const name = await readString('name');
  if (symbol.length === 0 || symbol.length > 32) throw new Error('代币 symbol 为空或过长');

  return {
    address: contract as string,
    symbol,
    name: name.length > 0 ? name : symbol,
    decimals,
    chainId,
    native: false,
  };
}

export async function fetchTokenBalance(
  token: TokenInfo,
  holder: string,
  call: CallFn,
): Promise<bigint> {
  const data = `0x${SELECTORS.balanceOf}${encodeAddress(holder)}`;
  const result = await call('eth_call', [{ to: token.address, data }, 'latest']);
  return decodeUint(hex(result).replace(/^0x/u, ''));
}

/**
 * Calldata for `transfer(address,uint256)`.
 *
 * Encoding this by hand is the whole reason an ERC-20 send is possible from an air-gapped
 * wallet: the *device* re-parses these bytes and shows the recipient and amount on its own
 * screen, so a wrong selector here would be a transfer the user approved reading something
 * else. The signature is hashed at runtime rather than pasted in as a constant, so the
 * selector in the transaction is provably the selector of the string above it.
 */
export function encodeErc20Transfer(to: string, amount: bigint): string {
  if (amount < 0n) throw new Error('转账金额不能为负');
  if (amount >= 1n << 256n) throw new Error('转账金额超出 uint256');
  return `0x${selector('transfer(address,uint256)')}${encodeAddress(to)}${amount
    .toString(16)
    .padStart(64, '0')}`;
}

export function nativeToken(chain: ChainMeta): TokenInfo {
  return {
    address: 'native',
    symbol: chain.symbol,
    name: chain.name,
    decimals: chain.decimals,
    chainId: chain.chainId,
    native: true,
  };
}

/** Exact decimal formatting, never rounding a non-zero balance down to "0". */
export function formatTokenAmount(raw: bigint, decimals: number, maxFractionDigits = 6): string {
  const base = 10n ** BigInt(decimals);
  const whole = raw / base;
  const remainder = raw % base;
  if (remainder === 0n) return whole.toString();
  let fraction = remainder.toString().padStart(decimals, '0').slice(0, maxFractionDigits);
  fraction = fraction.replace(/0+$/u, '');
  if (fraction.length === 0) {
    // The amount is smaller than the display precision: show one significant digit
    // rather than "0", because "0" is a lie the user might act on.
    const firstSignificant = remainder.toString().padStart(decimals, '0').search(/[1-9]/u);
    fraction = remainder
      .toString()
      .padStart(decimals, '0')
      .slice(0, Math.min(decimals, firstSignificant + 1));
  }
  return `${whole}.${fraction}`;
}
