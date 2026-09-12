import { beforeEach, describe, expect, it } from 'vitest';
import {
  HDKey,
  buildWalletExport,
  buildXpubMessage,
  mnemonicToSeed,
} from '@netproof/core';
import { ERRORS, STORAGE_KEYS, handleRpc, walletFromXpubMessage } from '@netproof/companion';
import { loadApprovedOrigins, loadSettings, loadWallet } from '../src/lib/store';

/**
 * The service worker's read path, end to end.
 *
 * The worker loads the wallet and settings out of `chrome.storage.local` and hands them to the
 * policy layer. Every one of those is a place where a shape can go wrong, and the symptom is
 * always the same from outside: the dApp says "connection failed" and the console shows the
 * site's own logging, not ours. So the fixtures here are exactly what the UI writes — a wallet
 * *list* with per-wallet account selection, and settings as JSON strings.
 *
 * The bug this is here for: a store that read a raw value where the UI wrote a JSON string
 * concluded "no wallet paired", and `eth_requestAccounts` answered a dApp with
 * "disconnected" — a connection failure with a perfectly good wallet on the other side.
 */

const MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const ORIGIN = 'https://app.example.org';

function pairedWallet() {
  const root = HDKey.fromMasterSeed(mnemonicToSeed(MNEMONIC, ''));
  const exported = buildWalletExport(root);
  return walletFromXpubMessage(buildXpubMessage(exported, { name: 'NetProof Air', model: 'test' }));
}

async function writeWalletAsTheUiDoes(): Promise<string> {
  const wallet = pairedWallet();
  await chrome.storage.local.set({
    [STORAGE_KEYS.wallets]: JSON.stringify({
      wallets: [
        {
          ...wallet,
          id: wallet.masterFingerprint,
          name: '主钱包',
          pairedAt: Date.now(),
          accountIndex: 0,
          addressIndex: 0,
          visibleAccounts: 2,
          hiddenAccounts: [],
        },
      ],
      activeId: wallet.masterFingerprint,
    }),
  });
  return wallet.masterFingerprint;
}

async function context() {
  const settings = await loadSettings();
  const wallet = await loadWallet();
  return {
    wallet,
    settings,
    origin: ORIGIN,
    approvedOrigins: await loadApprovedOrigins(),
    forward: async () => '0x0',
  };
}

describe('worker -> policy layer', () => {
  beforeEach(async () => {
    await chrome.storage.local.clear();
  });

  it('answers an approved origin with real accounts', async () => {
    const fingerprint = await writeWalletAsTheUiDoes();
    await chrome.storage.local.set({ [STORAGE_KEYS.origins]: JSON.stringify([ORIGIN]) });

    const ctx = await context();
    expect(ctx.wallet?.masterFingerprint).toBe(fingerprint);
    expect(ctx.settings.hiddenAccounts).toEqual([]);

    const outcome = await handleRpc('eth_requestAccounts', [], {
      ...ctx,
      requestApproval: async () => null,
    });
    const accounts = outcome.result as string[];
    expect(outcome.error).toBeUndefined();
    // A dApp sees `addressCount` addresses — the disclosure bound, deliberately wider than the
    // wallet UI's visible list — with the selected account first, as EIP-1193 expects.
    expect(accounts).toHaveLength(ctx.settings.addressCount);
    expect(accounts[0]).toMatch(/^0x[0-9a-fA-F]{40}$/u);
  });

  it('asks for approval from an origin it has not seen before', async () => {
    await writeWalletAsTheUiDoes();
    let asked = 0;
    const outcome = await handleRpc('eth_requestAccounts', [], {
      ...(await context()),
      requestApproval: async () => {
        asked += 1;
        return null;
      },
    });
    // The request is the point: the dApp is told "wait" while a human decides.
    expect(asked).toBe(1);
    expect(outcome.result as string[]).toHaveLength((await context()).settings.addressCount);
  });

  it('reports disconnected when nothing is paired, rather than hanging', async () => {
    const outcome = await handleRpc('eth_requestAccounts', [], {
      ...(await context()),
      requestApproval: async () => null,
    });
    expect(outcome.error?.code).toBe(ERRORS.disconnected.code);
  });
});
