import { describe, expect, it } from 'vitest';
import { chainShowsFiat, formatUsd, usdValue } from '../src/lib/prices';
import {
  decodeString,
  decodeUint,
  encodeAddress,
  formatTokenAmount,
  inspectToken,
  selector,
} from '../src/lib/tokens';

/**
 * Tests for the token layer.
 *
 * An ABI bug here does not throw — it silently reports a wrong balance, and a user
 * who believes a wrong balance makes wrong decisions. So the codec is pinned against
 * the published selectors and hand-built return payloads.
 */

describe('ABI codec', () => {
  it('computes the canonical ERC-20 selectors', () => {
    // These four values are widely published and independently checkable.
    expect(selector('transfer(address,uint256)')).toBe('a9059cbb');
    expect(selector('balanceOf(address)')).toBe('70a08231');
    expect(selector('decimals()')).toBe('313ce567');
    expect(selector('symbol()')).toBe('95d89b41');
    expect(selector('name()')).toBe('06fdde03');
    expect(selector('approve(address,uint256)')).toBe('095ea7b3');
  });

  it('encodes an address as a left-padded word', () => {
    expect(encodeAddress('0x70997970C51812dc3A010C7d01b50e0d17dc79C8')).toBe(
      '00000000000000000000000070997970c51812dc3a010c7d01b50e0d17dc79c8',
    );
    expect(() => encodeAddress('0x1234')).toThrow(/不是合法地址/);
  });

  it('decodes uint returns, including zero and large values', () => {
    expect(decodeUint('0'.repeat(64))).toBe(0n);
    expect(decodeUint(`${'0'.repeat(63)}1`)).toBe(1n);
    expect(decodeUint('0'.repeat(64).replace(/.$/, 'a'))).toBe(10n);
    // 18 decimals of a large supply must stay exact.
    const big = (10n ** 27n).toString(16).padStart(64, '0');
    expect(decodeUint(big)).toBe(10n ** 27n);
    expect(() => decodeUint('')).toThrow(/不是合法的 uint/);
    expect(() => decodeUint('zz')).toThrow(/不是合法的 uint/);
  });

  it('decodes a dynamic string return', () => {
    // offset(32) | length(3) | "USD" padded to a word
    const body = Buffer.from('USD', 'utf8').toString('hex').padEnd(64, '0');
    expect(decodeString(`0x${'0'.repeat(62)}20${'0'.repeat(62)}03${body}`)).toBe('USD');
  });

  it('decodes a bytes32-style symbol from early tokens', () => {
    // Older contracts returned a fixed bytes32 instead of a dynamic string.
    const bytes32 = Buffer.from('MKR', 'utf8').toString('hex').padEnd(64, '0');
    expect(decodeString(`0x${bytes32}`)).toBe('MKR');
  });

  it('rejects a truncated or absurd payload instead of guessing', () => {
    expect(() => decodeString('0x1234')).toThrow();
    // length word says 1000 characters but the body is absent
    expect(() => decodeString(`0x${'0'.repeat(62)}20${'0'.repeat(62)}03e8`)).toThrow();
  });
});

describe('formatTokenAmount', () => {
  it('formats exact amounts without floating point', () => {
    expect(formatTokenAmount(10n ** 18n, 18)).toBe('1');
    expect(formatTokenAmount(1_500_000_000_000_000_000n, 18)).toBe('1.5');
    expect(formatTokenAmount(1n, 18)).toBe('0.000000000000000001');
    expect(formatTokenAmount(0n, 18)).toBe('0');
    expect(formatTokenAmount(123_456_789n, 6)).toBe('123.456789');
  });

  it('never rounds a non-zero balance down to "0"', () => {
    // A dust balance shown as 0 is a lie the user might act on.
    expect(formatTokenAmount(1n, 18, 6)).not.toBe('0');
    expect(formatTokenAmount(1n, 18, 6).startsWith('0.0')).toBe(true);
  });
});

describe('inspectToken', () => {
  const call = (responses: Record<string, string>) => async (method: string, params: unknown[]) => {
    if (method === 'eth_getCode') return '0x60806040';
    const data = (params[0] as { data: string }).data;
    const entry = Object.entries(responses).find(([signature]) =>
      data.startsWith(`0x${selector(signature)}`),
    );
    if (!entry) throw new Error(`unexpected call ${data.slice(0, 10)}`);
    return entry[1];
  };

  const okResponses = {
    'symbol()':
      `0x${'0'.repeat(62)}20${'0'.repeat(62)}03${Buffer.from('USD', 'utf8').toString('hex').padEnd(64, '0')}`,
    'name()':
      `0x${'0'.repeat(62)}20${'0'.repeat(62)}06${Buffer.from('USD Co', 'utf8').toString('hex').padEnd(64, '0')}`,
    'decimals()': `0x${'0'.repeat(63)}6`,
  };

  it('reads symbol, name and decimals from the contract', async () => {
    const token = await inspectToken(
      '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      1,
      call(okResponses),
    );
    expect(token.symbol).toBe('USD');
    expect(token.name).toBe('USD Co');
    expect(token.decimals).toBe(6);
    expect(token.native).toBe(false);
    expect(token.chainId).toBe(1);
  });

  it('refuses an address with no contract code', async () => {
    const noCode = async (method: string) => (method === 'eth_getCode' ? '0x' : '0x');
    await expect(
      inspectToken('0x0000000000000000000000000000000000000001', 1, noCode),
    ).rejects.toThrow(/没有合约代码/);
  });

  it('refuses a malformed address before making any call', async () => {
    let called = false;
    const spy = async () => {
      called = true;
      return '0x';
    };
    await expect(inspectToken('0x1234', 1, spy)).rejects.toThrow(/格式不正确/);
    expect(called).toBe(false);
  });

  it('refuses a contract that does not answer the metadata calls', async () => {
    const broken = async (method: string) => (method === 'eth_getCode' ? '0x60' : '0x');
    await expect(
      inspectToken('0x0000000000000000000000000000000000000002', 1, broken),
    ).rejects.toThrow(/无法读取/);
  });

  it('refuses an absurd decimals value', async () => {
    const absurd = call({ ...okResponses, 'decimals()': `0x${'0'.repeat(62)}ff` });
    await expect(
      inspectToken('0x0000000000000000000000000000000000000003', 1, absurd),
    ).rejects.toThrow(/decimals 不合理/);
  });
});

describe('a fee in dollars', () => {
  it('converts wei at a spot price, exactly enough for a dollar figure', () => {
    // 21 000 gas at 30 gwei: the number the send screen used to hard-code.
    expect(usdValue(630_000_000_000_000n, 3000)).toBeCloseTo(1.89, 10);
    expect(usdValue(1_000_000_000_000_000_000n, 3000)).toBe(3000);
    expect(usdValue(4_200_000_000_000n, 3000)).toBeCloseTo(0.0126, 10);
    // No price is not a price of zero.
    expect(usdValue(630_000_000_000_000n, null)).toBeNull();
  });

  it('never shows a fee that looks free', () => {
    // Rounds to nothing but is not nothing: "$0.00" next to a real fee reads as free.
    expect(formatUsd(0.004)).toBe('<$0.01');
    expect(formatUsd(1.8899999)).toBe('$1.89');
    expect(formatUsd(12.6)).toBe('$12.60');
    expect(formatUsd(1234.56)).toBe('$1,235');
    expect(formatUsd(0)).toBe('$0');
    expect(formatUsd(Number.NaN)).toBe('$0');
  });

  it('has no dollar figure for a chain whose coin is not money', () => {
    expect(chainShowsFiat(1)).toBe(true);
    expect(chainShowsFiat(137)).toBe(true);
    // Sepolia ether cannot be sold, so a dollar figure next to its fee would be invented.
    expect(chainShowsFiat(11155111)).toBe(false);
    // Solana is not EVM and is not in the price table either.
    expect(chainShowsFiat(501)).toBe(false);
  });
});
