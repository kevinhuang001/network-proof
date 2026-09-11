import { describe, expect, it, vi } from 'vitest';
import { PendingCalls } from '../src/content/pending';

/**
 * The promises a dApp is holding.
 *
 * The reported symptom: the user approved a connection and the dApp kept waiting. One of the
 * ways that happens is a call that is never settled — the worker was replaced, the answer was
 * never coming, and the page's own timeout is eleven minutes away.
 */
describe('pending calls', () => {
  it('settles a call once, with a result', () => {
    const calls = new PendingCalls();
    const resolve = vi.fn();
    calls.add('0x1', { resolve, reject: vi.fn() });

    expect(calls.settle('0x1', { result: ['0xabc'] })).toBe(true);
    expect(resolve).toHaveBeenCalledWith(['0xabc']);
    // A duplicate delivery must not settle it twice.
    expect(calls.settle('0x1', { result: [] })).toBe(false);
  });

  it('rejects with the code the error carries', () => {
    const calls = new PendingCalls();
    const reject = vi.fn();
    calls.add('0x2', { resolve: vi.fn(), reject });
    calls.settle('0x2', { error: { code: 4001, message: '用户拒绝了请求' } });
    const [error] = reject.mock.calls[0]!;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error & { code?: number }).code).toBe(4001);
    expect((error as Error).message).toBe('用户拒绝了请求');
  });

  it('fails everything still waiting when the connection is gone', () => {
    const calls = new PendingCalls();
    const reject = vi.fn();
    calls.add('0x3', { resolve: vi.fn(), reject });
    calls.add('0x4', { resolve: vi.fn(), reject: vi.fn() });

    calls.failAll('扩展后台已断开，请重试');

    expect(calls.size).toBe(0);
    expect(reject).toHaveBeenCalledTimes(1);
    const [error] = reject.mock.calls[0]!;
    // 4900 is EIP-1193's "disconnected", which a dApp can recognise and retry.
    expect((error as Error & { code?: number }).code).toBe(4900);
  });

  it('ignores a result for a call nobody made', () => {
    const calls = new PendingCalls();
    expect(calls.settle('0x9', { result: 1 })).toBe(false);
  });
});
