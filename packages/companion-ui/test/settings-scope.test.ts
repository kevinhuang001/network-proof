import { describe, expect, it } from 'vitest';
import { splitSettings } from '../src/state/settingsScope';

describe('settings ownership', () => {
  it('keeps account selection scoped to individual wallets', () => {
    const result = splitSettings({ accountIndex: 2, addressIndex: 1, chainId: 1 });
    expect(result.scoped).toEqual({ accountIndex: 2, addressIndex: 1 });
    expect(result.global).toEqual({ chainId: 1 });
  });
  it('splits empty updates without losing data', () => {
    expect(splitSettings({})).toEqual({ scoped: {}, global: {} });
  });
});
