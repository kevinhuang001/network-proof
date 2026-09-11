import { beforeEach, describe, expect, it } from 'vitest';
import {
  HDKey,
  buildWalletExport,
  buildXpubMessage,
  deriveAddressFromXpub,
  mnemonicToSeed,
} from '@netproof/core';
import { DEFAULT_SETTINGS, resolveAccounts, walletFromXpubMessage } from '@netproof/companion';
import {
  approveOrigin,
  clearWallet,
  getPending,
  loadApprovedOrigins,
  loadPending,
  loadSettings,
  loadWallet,
  putPending,
  removePending,
  revokeOrigin,
  saveSettings,
  saveWallet,
} from '../src/lib/store';

/**
 * Tests for the extension's `chrome.storage` adapter.
 *
 * The shared policy layer lives in `@netproof/companion` and is tested there; what
 * is specific to this host is where the bytes go. Both assertions matter: that the
 * round trip works, and that what lands in storage is watch-only.
 */

const MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

function wallet() {
  const root = HDKey.fromMasterSeed(mnemonicToSeed(MNEMONIC, ''));
  const exported = buildWalletExport(root, { accounts: 2 });
  return walletFromXpubMessage(
    buildXpubMessage(exported, { name: 'NetProof Air', model: 'test' }),
  );
}

/** Every key and value currently in chrome.storage.local, concatenated. */
async function dumpStorage(): Promise<string> {
  const all = await chrome.storage.local.get(undefined);
  return Object.entries(all)
    .map(([key, value]) => `${key}:${JSON.stringify(value)}`)
    .join('\n');
}

describe('extension storage', () => {
  beforeEach(async () => {
    await clearWallet();
  });

  it('round-trips the paired wallet', async () => {
    const paired = wallet();
    await saveWallet(paired);
    const restored = await loadWallet();
    expect(restored?.masterFingerprint).toBe(paired.masterFingerprint);
    expect(restored?.accounts).toHaveLength(paired.accounts.length);
    expect(resolveAccounts(restored!, DEFAULT_SETTINGS)[0]!.address).toBe(
      paired.accounts[0]!.firstAddress,
    );
  });

  it('stores nothing secret', async () => {
    await saveWallet(wallet());
    const dump = (await dumpStorage()).toLowerCase();
    for (const forbidden of ['mnemonic', 'privatekey', 'private_key', '"seed"', 'xprv']) {
      expect(dump, `storage must not contain ${forbidden}`).not.toContain(forbidden);
    }
    expect(dump).toContain('xpub');
  });

  it('merges settings without dropping the default RPC table', async () => {
    await saveSettings({ chainId: 8453 });
    const settings = await loadSettings();
    expect(settings.chainId).toBe(8453);
    expect(settings.rpcUrls[1]).toBe(DEFAULT_SETTINGS.rpcUrls[1]);
    expect(settings.rpcUrls[8453]).toBe(DEFAULT_SETTINGS.rpcUrls[8453]);
  });

  it('tracks approved origins without duplicates and revokes them', async () => {
    await approveOrigin('https://a.example');
    await approveOrigin('https://b.example');
    await approveOrigin('https://a.example');
    expect(await loadApprovedOrigins()).toEqual(['https://a.example', 'https://b.example']);
    await revokeOrigin('https://a.example');
    expect(await loadApprovedOrigins()).toEqual(['https://b.example']);
  });

  it('queues pending requests, replacing by id', async () => {
    const request = {
      id: '0xabc',
      kind: 'sendTransaction' as const,
      origin: 'https://app.example.org',
      chainId: 1,
      createdAt: 1_700_000_000_000,
      method: 'eth_sendTransaction',
      params: [],
    };
    await putPending(request);
    await putPending({ ...request, method: 'eth_signTransaction' });
    expect(await loadPending()).toHaveLength(1);
    expect((await getPending('0xabc'))?.method).toBe('eth_signTransaction');
    await removePending('0xabc');
    expect(await getPending('0xabc')).toBeNull();
  });

  it('agrees with the device on derived addresses after a round trip', async () => {
    await saveWallet(wallet());
    const restored = (await loadWallet())!;
    const account0 = restored.accounts.find(
      (entry) => entry.scheme === 'bip44' && entry.account === 0,
    )!;
    for (const index of [0, 2]) {
      const expected = deriveAddressFromXpub(account0.xpub, 'bip44', 0, index);
      expect(resolveAccounts(restored, DEFAULT_SETTINGS)[index]!.address).toBe(expected.address);
    }
  });
});
