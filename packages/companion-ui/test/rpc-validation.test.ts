import { describe, expect, it } from 'vitest';
import { rpcUrlError } from '../src/lib/rpcValidation';

describe('RPC endpoint validation', () => {
  it('accepts HTTPS and HTTP endpoints including port and path', () => {
    expect(rpcUrlError('https://rpc.example.org/v1')).toBeNull();
    expect(rpcUrlError(' http://localhost:8545 ')).toBeNull();
  });
  it('rejects missing and unsafe endpoint values', () => {
    expect(rpcUrlError('')).not.toBeNull();
    expect(rpcUrlError('javascript:alert(1)')).not.toBeNull();
    expect(rpcUrlError('https://user:pass@rpc.example.org')).not.toBeNull();
    expect(rpcUrlError('https://rpc.example.org/#fragment')).not.toBeNull();
    expect(rpcUrlError('wrong url')).not.toBeNull();
  });
});
