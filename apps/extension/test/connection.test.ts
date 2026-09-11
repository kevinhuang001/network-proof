import { describe, expect, it, vi } from 'vitest';
import { BridgeConnection, type BridgePort, type DeliveredCall } from '../src/content/connection';

/**
 * The page <-> worker port.
 *
 * The bug these cover, seen in the wild: after the extension was reloaded or the worker was
 * stopped, every call threw `Attempting to use a disconnected port object` into the content
 * script's console, the page never heard back, and the dApp's pending request sat there for
 * ever. Nothing reconnected, and nothing told the page.
 */
function fakePort(): BridgePort & { posted: DeliveredCall[]; disconnect: () => void; deliver: (m: unknown) => void } {
  const messageListeners: ((message: unknown) => void)[] = [];
  const disconnectListeners: (() => void)[] = [];
  return {
    posted: [],
    postMessage(message) {
      this.posted.push(message);
    },
    onMessage: { addListener: (listener) => messageListeners.push(listener) },
    onDisconnect: { addListener: (listener) => disconnectListeners.push(listener) },
    disconnect: () => disconnectListeners.forEach((listener) => listener()),
    deliver: (message) => messageListeners.forEach((listener) => listener(message)),
  };
}

const call = (id: string): DeliveredCall => ({
  type: 'rpc',
  id,
  method: 'eth_requestAccounts',
  params: [],
  origin: 'https://app.example',
});

describe('content-script connection', () => {
  it('reconnects after the worker goes away, and delivers the next call', () => {
    const first = fakePort();
    const second = fakePort();
    const ports = [first, second];
    const connect = vi.fn(() => ports.shift() ?? fakePort());
    const onResult = vi.fn();
    const onLost = vi.fn();
    const connection = new BridgeConnection(connect, onResult, onLost);

    connection.send(call('0x1'));
    expect(first.posted).toHaveLength(1);

    // The worker is stopped: the port dies, and the page is told so rather than left waiting.
    first.disconnect();
    expect(onLost).toHaveBeenCalledTimes(1);

    // The next call must work, on a fresh port.
    connection.send(call('0x2'));
    expect(connect).toHaveBeenCalledTimes(2);
    expect(second.posted).toHaveLength(1);
    expect(second.posted[0]!.id).toBe('0x2');
  });

  it('reuses a live port instead of reconnecting per call', () => {
    const port = fakePort();
    const connect = vi.fn(() => port);
    const connection = new BridgeConnection(connect, vi.fn(), vi.fn());
    connection.send(call('0x1'));
    connection.send(call('0x2'));
    expect(connect).toHaveBeenCalledTimes(1);
    expect(port.posted).toHaveLength(2);
  });

  it('answers a call it cannot deliver instead of throwing', () => {
    // "Extension context invalidated": this content script belongs to a previous extension
    // load and cannot be revived. A promise that never settles is worse than a failure.
    const onResult = vi.fn();
    const connection = new BridgeConnection(
      () => {
        throw new Error('Extension context invalidated.');
      },
      onResult,
      vi.fn(),
    );

    connection.send(call('0x9'));

    expect(onResult).toHaveBeenCalledTimes(1);
    const [message] = onResult.mock.calls[0]!;
    expect(message).toMatchObject({ type: 'rpc-result', id: '0x9' });
    expect((message as { error?: { code?: number } }).error?.code).toBe(4900);
  });
});
