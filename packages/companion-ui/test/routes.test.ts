import { describe, expect, it } from 'vitest';
import { parseRoute } from '../src/navigation/routes';

describe('companion navigation', () => {
  it('defaults to wallet home', () => {
    expect(parseRoute('#/unknown')).toEqual({ name: 'home' });
  });
  it('parses transaction and wallet deep links', () => {
    expect(parseRoute('#/sign/abc')).toEqual({ name: 'sign', id: 'abc' });
    expect(parseRoute('#/asset/native')).toEqual({ name: 'asset', asset: 'native' });
    expect(parseRoute('#/send/0xabc')).toEqual({ name: 'send', token: '0xabc' });
  });
  it('supports settings and account navigation', () => {
    expect(parseRoute('#/settings')).toEqual({ name: 'settings' });
    expect(parseRoute('#/addresses')).toEqual({ name: 'addresses' });
    expect(parseRoute('#/receive')).toEqual({ name: 'receive' });
  });
});
