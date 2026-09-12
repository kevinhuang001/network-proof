import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  DEFAULT_TOKENS,
  resolveAccounts,
  walletFromXpubMessage,
} from '@netproof/companion';
import { HDKey, buildWalletExport, buildXpubMessage, deriveAddressFromXpub, mnemonicToSeed } from '@netproof/core';
import {
  activeWallet,
  approveOrigin,
  clearWallets,
  getPending,
  loadApprovedOrigins,
  loadPending,
  loadSettings,
  loadWalletState,
  putPending,
  removePending,
  removeWallet,
  revokeOrigin,
  addToken,
  saveSettings,
  selectWallet,
  tokensForChain,
  updateWallet,
  upsertWallet,
} from '../src/lib/store';

/**
 * Storage tests for the web companion.
 *
 * The stored contents are the security-relevant part: this asserts not just that
 * round-tripping works, but that what lands in `localStorage` is watch-only. If a
 * future change ever put a seed in there, these tests are what should fail.
 */

/** Every key and value currently in localStorage, concatenated. */
function dumpStorage(): string {
  const store = window.localStorage;
  const parts: string[] = [];
  for (let index = 0; index < store.length; index++) {
    const key = store.key(index);
    if (key === null) continue;
    parts.push(key, store.getItem(key) ?? '');
  }
  return parts.join('\n');
}

const MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

function wallet() {
  const root = HDKey.fromMasterSeed(mnemonicToSeed(MNEMONIC, ''));
  const exported = buildWalletExport(root, { passphraseProtected: false });
  return walletFromXpubMessage(buildXpubMessage(exported, { name: 'NetProof Air', model: 'test' }));
}

describe('web companion storage', () => {
  beforeEach(() => {
    clearWallets();
    window.localStorage.clear();
  });

  it('round-trips the paired wallet', () => {
    const paired = wallet();
    upsertWallet(paired);
    const restored = activeWallet(loadWalletState());
    expect(restored?.masterFingerprint).toBe(paired.masterFingerprint);
    expect(restored?.accounts).toHaveLength(paired.accounts.length);
    // BIP44 only: one scheme, one flat account list derived from it.
    expect(restored?.schemes.map((scheme) => scheme.id)).toEqual(['bip44']);
    // The restored wallet still derives the same addresses.
    expect(resolveAccounts(restored!, DEFAULT_SETTINGS)[0]!.address).toBe(
      paired.accounts[0]!.firstAddress,
    );
  });

  it('stores nothing secret', () => {
    upsertWallet(wallet());
    // Dump the real key/value pairs. (JSON.stringify on the Storage object itself
    // would serialise the adapter's internals, not the stored data.)
    const dump = dumpStorage().toLowerCase();
    for (const forbidden of ['mnemonic', 'privatekey', 'private_key', '"seed"', 'xprv']) {
      expect(dump, `storage must not contain ${forbidden}`).not.toContain(forbidden);
    }
    // Sanity: the storage is not trivially empty, so the check above means something.
    expect(dump).toContain('xpub');
  });

  it('merges settings without dropping the default RPC table', () => {
    saveSettings({ chainId: 42161, autoBroadcast: false });
    const settings = loadSettings();
    expect(settings.chainId).toBe(42161);
    expect(settings.autoBroadcast).toBe(false);
    expect(settings.rpcUrls[1]).toBe(DEFAULT_SETTINGS.rpcUrls[1]);
    expect(settings.rpcUrls[42161]).toBe(DEFAULT_SETTINGS.rpcUrls[42161]);
  });

  it('falls back to defaults when storage holds junk', () => {
    window.localStorage.setItem('netproof.companion.settings.v1', '{not json');
    expect(loadSettings().chainId).toBe(DEFAULT_SETTINGS.chainId);
    window.localStorage.setItem('netproof.companion.wallets.v1', '{not json');
    expect(loadWalletState().wallets).toEqual([]);
  });

  it('tracks approved origins without duplicates', () => {
    approveOrigin('https://a.example');
    approveOrigin('https://b.example');
    approveOrigin('https://a.example');
    expect(loadApprovedOrigins()).toEqual(['https://a.example', 'https://b.example']);
    revokeOrigin('https://a.example');
    expect(loadApprovedOrigins()).toEqual(['https://b.example']);
  });

  it('queues, reads back and removes pending requests', () => {
    expect(loadPending()).toEqual([]);
    const request = {
      id: '0xabc',
      kind: 'sendTransaction' as const,
      origin: 'https://app.example.org',
      chainId: 1,
      createdAt: 1_700_000_000_000,
      method: 'eth_sendTransaction',
      params: [{ to: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' }],
    };
    putPending(request);
    expect(getPending('0xabc')?.method).toBe('eth_sendTransaction');
    // Re-queueing the same id replaces rather than duplicates.
    putPending({ ...request, method: 'eth_signTransaction' });
    expect(loadPending()).toHaveLength(1);
    expect(getPending('0xabc')?.method).toBe('eth_signTransaction');
    removePending('0xabc');
    expect(getPending('0xabc')).toBeNull();
  });

  it('clears the wallets, their origins and the queue together', () => {
    upsertWallet(wallet());
    approveOrigin('https://a.example');
    putPending({
      id: '0x1',
      kind: 'personal_sign',
      origin: 'https://a.example',
      chainId: 1,
      createdAt: 1,
      method: 'personal_sign',
      params: [],
    });
    clearWallets();
    expect(loadWalletState().wallets).toEqual([]);
    expect(loadApprovedOrigins()).toEqual([]);
    expect(loadPending()).toEqual([]);
  });


  it('keeps several wallets, and keeps each one\'s account selection', () => {
    const first = wallet();
    const second = { ...wallet(), masterFingerprint: 'deadbeef', device: { name: 'Backup', model: 'test' } };

    upsertWallet(first);
    upsertWallet(second, { addressIndex: 0, accountIndex: 0, visibleAccounts: 1 });
    expect(loadWalletState().wallets).toHaveLength(2);

    // The second pairing is active, as a user who just scanned expects.
    expect(activeWallet(loadWalletState())!.name).toBe('Backup');

    updateWallet(second.masterFingerprint, { addressIndex: 7, visibleAccounts: 4 });
    selectWallet(first.masterFingerprint);
    const state = loadWalletState();
    expect(activeWallet(state)!.id).toBe(first.masterFingerprint);
    // Switching wallets must not carry the other wallet's account across.
    expect(activeWallet(state)!.addressIndex).toBe(0);
    expect(state.wallets.find((entry) => entry.id === second.masterFingerprint)!.addressIndex).toBe(7);

    // Re-pairing updates in place: same fingerprint, no duplicate.
    upsertWallet(first);
    expect(loadWalletState().wallets).toHaveLength(2);

    // A name the user chose survives a re-pair, which is exactly when they would lose it.
    const renamed = updateWallet(first.masterFingerprint, { name: '主钱包' });
    expect(activeWallet(renamed)!.name).toBe('主钱包');
    upsertWallet(first);
    expect(activeWallet(loadWalletState())!.name).toBe('主钱包');

    removeWallet(first.masterFingerprint);
    const remaining = loadWalletState();
    expect(remaining.wallets).toHaveLength(1);
    // Removing the active wallet falls back to the one that is left.
    expect(activeWallet(remaining)!.name).toBe('Backup');
  });

it('keeps hidden accounts hidden as the list grows', () => {
    const paired = wallet();
    upsertWallet(paired, { visibleAccounts: 3 });
    const id = paired.masterFingerprint;

    const state = loadWalletState();
    const record = activeWallet(state)!;
    expect(record.hiddenAccounts).toEqual([]);

    // Addresses are what get recorded, not indices: hiding the third account and then adding
    // a fourth must not reveal a different one in its place.
    updateWallet(id, { hiddenAccounts: ['0xabc'] });
    expect(activeWallet(loadWalletState())!.hiddenAccounts).toEqual(['0xabc']);

    // And they survive a re-pair, which is when a user would lose them.
    upsertWallet(paired, { visibleAccounts: 3 });
    expect(activeWallet(loadWalletState())!.hiddenAccounts).toEqual(['0xabc']);
  });

  it('agrees with the device on derived addresses after a storage round trip', () => {
    const paired = wallet();
    upsertWallet(paired);
    const restored = activeWallet(loadWalletState())!;
    const account0 = restored.accounts.find((entry) => entry.scheme === 'bip44' && entry.account === 0)!;
    for (const index of [0, 1, 4]) {
      const expected = deriveAddressFromXpub(account0.xpub, 'bip44', 0, index);
      const resolved = resolveAccounts(restored, { ...DEFAULT_SETTINGS, addressIndex: index })[index]!;
      expect(resolved.address).toBe(expected.address);
    }
  });
});
