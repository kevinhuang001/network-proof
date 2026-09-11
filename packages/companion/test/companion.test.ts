import { describe, expect, it } from 'vitest';
import {
  HDKey,
  buildWalletExport,
  buildXpubMessage,
  deriveAddressFromXpub,
  mnemonicToSeed,
  solanaAccountPaths,
} from '@netproof/core';
import { accountsForDapp, handleRpc } from '../src/rpc';
import { buildMessageRequest, buildTransactionRequest } from '../src/rpc';
import {
  MAX_ADDRESSES_PER_ACCOUNT,
  allAddresses,
  deriveAccountAddresses,
  listAccounts,
  primaryAccount,
  resolveAccounts,
  visibleAccounts,
  walletFromXpubMessage,
} from '../src/accounts';
import { DEFAULT_SETTINGS, SOLANA_CHAIN_ID } from '../src/settings';
import type { ConnectedWallet, PendingRequest } from '../src/types';

/**
 * Tests for the companion's dApp-facing logic.
 *
 * These cover the layer that decides *what gets signed*. `@netproof/core` is tested
 * thoroughly elsewhere; what matters here is policy: which methods are forwarded,
 * which are refused, and exactly what is put into the QR the device will display.
 *
 * Storage is deliberately not tested here — it is the caller's concern, and each
 * host (Chrome extension, plain web page) has its own adapter.
 */

const MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const VECTOR_ADDRESS = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94';

/**
 * Build a paired wallet the way the apps do: from the device export, through the
 * real `NP-XPUB` message. Going through the wire format means this test also covers
 * the CBOR round trip and the template-to-stored-scheme conversion.
 */
function makeWallet(): ConnectedWallet {
  const root = HDKey.fromMasterSeed(mnemonicToSeed(MNEMONIC, ''));
  const exported = buildWalletExport(root, { accounts: 2 });
  const message = buildXpubMessage(exported, { name: 'NetProof Air', model: 'test' });
  return walletFromXpubMessage(message, 1_700_000_000_000);
}

function context(overrides: Partial<Parameters<typeof handleRpc>[2]> = {}) {
  const approvedOrigins = overrides.approvedOrigins ?? [];
  const queued: PendingRequest[] = [];
  return {
    queued,
    context: {
      wallet: null as ConnectedWallet | null,
      settings: { ...DEFAULT_SETTINGS },
      origin: 'https://app.example.org',
      approvedOrigins,
      forward: async () => '0x0',
      requestApproval: async (request: PendingRequest) => {
        queued.push(request);
        return 'approved';
      },
      ...overrides,
    },
  };
}

describe('watch-only account derivation', () => {
  it('derives accounts from the exported xpub alone, agreeing with the device', () => {
    const wallet = makeWallet();
    const settings = { ...DEFAULT_SETTINGS, chainId: 1 };
    const accounts = resolveAccounts(wallet, settings);
    // The count is a setting, not a constant: deriving more finds funds the user
    // spread across addresses, at the cost of disclosing more to a dApp.
    expect(accounts).toHaveLength(settings.addressCount);
    expect(accounts).toHaveLength(DEFAULT_SETTINGS.addressCount);
    const bip44Account0 = wallet.accounts.find(
      (entry) => entry.scheme === 'bip44' && entry.account === 0,
    )!;
    for (const account of accounts) {
      // Cross-check against the core helper, which is the same one the device uses
      // to verify the request. If these disagreed, every signature would be refused.
      const expected = deriveAddressFromXpub(bip44Account0.xpub, 'bip44', 0, account.index);
      expect(account.address).toBe(expected.address);
      expect(account.path).toBe(`m/44'/60'/0'/0/${account.index}`);
    }
    expect(primaryAccount(wallet, settings)?.address).toBe(bip44Account0.firstAddress);
  });

  it('enumerates every exported account, and cannot invent new ones', () => {
    const wallet = makeWallet();
    const bip44 = listAccounts(wallet, 'bip44');
    expect(bip44.map((entry) => entry.account)).toEqual([0, 1]);
    // Hardened account keys cannot be derived from a public key, so an account the
    // device did not export is simply unavailable — not silently mis-derived.
    expect(deriveAccountAddresses(wallet, 'bip44', 7, 5)).toEqual([]);
    expect(deriveAccountAddresses(wallet, 'nonexistent', 0, 5)).toEqual([]);
  });

  it('derives independent address lists per account', () => {
    const wallet = makeWallet();
    const a0 = deriveAccountAddresses(wallet, 'bip44', 0, 3);
    const a1 = deriveAccountAddresses(wallet, 'bip44', 1, 3);
    expect(a0).toHaveLength(3);
    expect(a1).toHaveLength(3);
    expect(a0[0]!.path).toBe("m/44'/60'/0'/0/0");
    expect(a1[0]!.path).toBe("m/44'/60'/1'/0/0");
    // No address may appear in two accounts, or the UI would offer duplicates.
    const all = new Set([...a0, ...a1].map((entry) => entry.address));
    expect(all.size).toBe(6);
  });

  it('bounds the per-account address count', () => {
    const wallet = makeWallet();
    expect(deriveAccountAddresses(wallet, 'bip44', 0, 0)).toHaveLength(1);
    expect(deriveAccountAddresses(wallet, 'bip44', 0, 10_000)).toHaveLength(
      MAX_ADDRESSES_PER_ACCOUNT,
    );
  });

  it('derives the whole account list from the one exported xpub', () => {
    const wallet = makeWallet();
    const settings = { ...DEFAULT_SETTINGS, addressCount: 4 };
    const all = allAddresses(wallet, settings);
    // Account i is `m/44'/60'/0'/0/i`: one key, unbounded accounts, no extra export.
    expect(all).toHaveLength(4);
    expect(all.map((entry) => entry.path)).toEqual([
      "m/44'/60'/0'/0/0",
      "m/44'/60'/0'/0/1",
      "m/44'/60'/0'/0/2",
      "m/44'/60'/0'/0/3",
    ]);
    // And a wallet whose export happens to contain several hardened account keys still
    // shows one flat list, because the user's accounts are the addresses, not the keys.
    const many = walletFromXpubMessage(
      buildXpubMessage(
        buildWalletExport(HDKey.fromMasterSeed(mnemonicToSeed(MNEMONIC, '')), { accounts: 3 }),
        { name: 'NetProof Air', model: 'test' },
      ),
    );
    expect(allAddresses(many, settings)).toHaveLength(4);
  });

  it('honours the selected account', () => {
    const wallet = makeWallet();
    const first = resolveAccounts(wallet, DEFAULT_SETTINGS)[0]!;
    const exported = wallet.accounts.find((entry) => entry.scheme === 'bip44' && entry.account === 0)!;
    expect(first.address).toBe(exported.firstAddress);
    expect(first.path).toBe("m/44'/60'/0'/0/0");

    const account1 = resolveAccounts(wallet, { ...DEFAULT_SETTINGS, accountIndex: 1 })[0]!;
    expect(account1.path).toBe("m/44'/60'/1'/0/0");
    expect(account1.address).not.toBe(first.address);
  });

  it('stores exactly what the device sent, and nothing secret', () => {
    const wallet = makeWallet();
    expect(wallet.device.name).toBe('NetProof Air');
    expect(wallet.connectedAt).toBe(1_700_000_000_000);
    expect(wallet.schemes.map((scheme) => scheme.id)).toEqual(['bip44']);
    // A watch-only wallet has no field that could hold a private key or a mnemonic.
    const serialized = JSON.stringify(wallet).toLowerCase();
    for (const forbidden of ['mnemonic', 'privatekey', 'private_key', 'seed', 'passphrase"']) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

describe('combined EVM + Solana export', () => {
  it('stores both families from one payload and picks per network', () => {
    const root = HDKey.fromMasterSeed(mnemonicToSeed(MNEMONIC, ''));
    const exported = buildWalletExport(root, { accounts: 1 });
    const message = buildXpubMessage(
      {
        ...exported,
        addresses: [
          { path: "m/44'/501'/0'/0'", address: 'So11111111111111111111111111111111111111112' },
          { path: "m/44'/501'/1'/0'", address: 'So11111111111111111111111111111111111111113' },
        ],
      },
      { name: 'NetProof Air', model: 'test' },
    );
    const paired = walletFromXpubMessage(message);
    expect(paired.accounts.length).toBeGreaterThan(0);
    expect(paired.addresses).toHaveLength(2);

    // On an EVM chain the companion derives from the xpubs…
    const evm = allAddresses(paired, { ...DEFAULT_SETTINGS, chainId: 1, visibleAccounts: 2 });
    expect(evm[0]!.address).toMatch(/^0x/u);

    // …and on Solana it uses the exported addresses, lazily.
    const solana = allAddresses(paired, { ...DEFAULT_SETTINGS, chainId: 501, visibleAccounts: 1 });
    expect(solana).toHaveLength(1);
    expect(solana[0]!.address).toBe('So11111111111111111111111111111111111111112');
    expect(solana[0]!.path).toBe("m/44'/501'/0'/0'");

    // Revealing a second account surfaces the second address, not a derivation.
    const two = allAddresses(paired, { ...DEFAULT_SETTINGS, chainId: 501, visibleAccounts: 2 });
    expect(two).toHaveLength(2);
    expect(two[1]!.address).toBe('So11111111111111111111111111111111111111113');
  });

  it('refuses a payload with neither accounts nor addresses', () => {
    const empty = buildXpubMessage(
      {
        masterFingerprint: '00000000',
        passphraseProtected: false,
        rootXpub: 'xpub',
        coinType: 60,
        accounts: [],
        schemes: [],
      },
      { name: 'x', model: 'y' },
    );
    expect(() => walletFromXpubMessage(empty)).toThrow(/没有导出任何账户或地址/);
  });
});

describe('dApp RPC policy', () => {
  it('reports no accounts to a site that has not been approved', async () => {
    const wallet = makeWallet();
    const { context: ctx } = context({ wallet });
    const outcome = await handleRpc('eth_accounts', [], ctx);
    expect(outcome.result).toEqual([]);
  });

  it('reports accounts to an approved site', async () => {
    const wallet = makeWallet();
    const { context: ctx } = context({ wallet, approvedOrigins: ['https://app.example.org'] });
    const outcome = await handleRpc('eth_accounts', [], ctx);
    const accounts = outcome.result as string[];
    expect(accounts[0]).toBe(wallet.accounts[0]!.firstAddress);
    expect(accounts.length).toBeGreaterThan(1);
  });

  it('queues an approval when an unpair site requests accounts', async () => {
    const wallet = makeWallet();
    const { context: ctx, queued } = context({ wallet });
    await handleRpc('eth_requestAccounts', [], ctx);
    expect(queued).toHaveLength(1);
    expect(queued[0]!.kind).toBe('connect');
    expect(queued[0]!.origin).toBe('https://app.example.org');
  });

  it('walks the user through pairing when no device is connected', async () => {
    const { context: ctx, queued } = context({ wallet: null });
    const outcome = await handleRpc('eth_requestAccounts', [], ctx);
    expect(queued[0]!.kind).toBe('connect');
    expect(outcome.error?.code).toBe(4900);
  });

  it('forwards read-only calls to the node', async () => {
    const seen: string[] = [];
    const { context: ctx } = context({
      forward: async (method) => {
        seen.push(method);
        return '0x1234';
      },
    });
    for (const method of ['eth_blockNumber', 'eth_getBalance', 'eth_call', 'eth_estimateGas', 'eth_getTransactionReceipt']) {
      const outcome = await handleRpc(method, [], ctx);
      expect(outcome.result).toBe('0x1234');
    }
    expect(seen).toEqual([
      'eth_blockNumber',
      'eth_getBalance',
      'eth_call',
      'eth_estimateGas',
      'eth_getTransactionReceipt',
    ]);
  });

  it('never signs locally: signing methods become pending QR requests', async () => {
    const wallet = makeWallet();
    for (const [method, kind] of [
      ['eth_sendTransaction', 'sendTransaction'],
      ['eth_signTransaction', 'signTransaction'],
      ['personal_sign', 'personal_sign'],
      ['eth_signTypedData_v4', 'signTypedData'],
    ] as const) {
      const { context: ctx, queued } = context({ wallet, approvedOrigins: ['https://app.example.org'] });
      await handleRpc(method, [{}, '0x0'], ctx);
      expect(queued[0]?.kind, method).toBe(kind);
      expect(queued[0]?.method, method).toBe(method);
    }
  });

  it('refuses to sign for an unapproved origin', async () => {
    const wallet = makeWallet();
    const { context: ctx, queued } = context({ wallet, approvedOrigins: [] });
    const outcome = await handleRpc('personal_sign', ['0xdeadbeef', '0x0'], ctx);
    expect(outcome.error?.code).toBe(4100);
    expect(queued).toHaveLength(0);
  });

  it('refuses to sign when no wallet is paired', async () => {
    const { context: ctx, queued } = context({ wallet: null, approvedOrigins: ['https://app.example.org'] });
    const outcome = await handleRpc('eth_sendTransaction', [{}], ctx);
    expect(outcome.error?.code).toBe(4900);
    expect(queued).toHaveLength(0);
  });

  it('reports unsupported and unknown methods instead of guessing', async () => {
    const { context: ctx } = context();
    expect((await handleRpc('wallet_addEthereumChain', [{}], ctx)).error?.code).toBe(4200);
    expect((await handleRpc('wallet_watchAsset', [], ctx)).error?.code).toBe(4200);
    expect((await handleRpc('eth_totallyMadeUp', [], ctx)).error?.code).toBe(-32601);
  });

  it('refuses a chain that has no configured RPC', async () => {
    const { context: ctx } = context();
    const outcome = await handleRpc('wallet_switchEthereumChain', [{ chainId: '0x7a69' }], ctx);
    expect(outcome.error?.code).toBe(4902);
  });

  it('queues a chain switch the user must approve', async () => {
    const { context: ctx, queued } = context();
    const outcome = await handleRpc('wallet_switchEthereumChain', [{ chainId: '0x89' }], ctx);
    expect(outcome.result).toBeNull();
    expect(queued[0]?.method).toBe('wallet_switchEthereumChain');
  });

  it('exposes the chain id in both formats EIP-1193 callers expect', async () => {
    const { context: ctx } = context({ settings: { ...DEFAULT_SETTINGS, chainId: 137 } });
    expect((await handleRpc('eth_chainId', [], ctx)).result).toBe('0x89');
    expect((await handleRpc('net_version', [], ctx)).result).toBe('137');
  });

  it('returns the authorized accounts through wallet_getPermissions', async () => {
    const { context: approved } = context({ approvedOrigins: ['https://app.example.org'] });
    expect((await handleRpc('wallet_getPermissions', [], approved)).result).toHaveLength(1);
    const { context: denied } = context();
    expect((await handleRpc('wallet_getPermissions', [], denied)).result).toEqual([]);
  });
});

describe('building the request that goes to the device', () => {
  it('resolves nonce, gas and fees from the node and commits to exact values', async () => {
    const wallet = makeWallet();
    const account = primaryAccount(wallet, { ...DEFAULT_SETTINGS })!;
    const calls: string[] = [];
    const message = await buildTransactionRequest({
      wallet,
      settings: { ...DEFAULT_SETTINGS },
      origin: 'https://app.example.org',
      params: [{ from: account.address, to: VECTOR_ADDRESS, value: '0xde0b6b3a7640000', data: '0x' }],
      forward: async (method) => {
        calls.push(method);
        if (method === 'eth_getTransactionCount') return '0x7';
        if (method === 'eth_estimateGas') return '0x5208';
        if (method === 'eth_gasPrice') return '0x6fc23ac00';
        if (method === 'eth_maxPriorityFeePerGas') return '0x59682f00';
        return '0x0';
      },
    });
    expect(calls).toContain('eth_getTransactionCount');
    expect(calls).toContain('eth_estimateGas');
    expect(message.kind).toBe('tx');
    expect(message.tx?.nonce).toBe(7);
    expect(message.tx?.gas).toBe('21000');
    expect(message.tx?.value).toBe('1000000000000000000');
    expect(message.tx?.type).toBe('eip1559');
    expect(message.path).toBe(account.path);
    expect(message.address).toBe(account.address);
    expect(message.origin).toBe('https://app.example.org');
    // The claim commits to the whole request, so the device can prove what it signed.
    expect(message.claim).toMatch(/^0x[0-9a-f]{64}$/u);
  });

  it('uses a legacy transaction when the dApp supplies gasPrice', async () => {
    const wallet = makeWallet();
    const account = primaryAccount(wallet, { ...DEFAULT_SETTINGS })!;
    const message = await buildTransactionRequest({
      wallet,
      settings: { ...DEFAULT_SETTINGS },
      origin: 'https://app.example.org',
      params: [{ from: account.address, to: VECTOR_ADDRESS, gas: '0x5208', gasPrice: '0x4a817c800' }],
      forward: async (method) => (method === 'eth_getTransactionCount' ? '0x1' : '0x0'),
    });
    expect(message.tx?.type).toBe('legacy');
    expect(message.tx?.gasPrice).toBe('20000000000');
    expect(message.tx?.maxFeePerGas).toBeUndefined();
  });

  it('refuses a request whose from address is not the active account', async () => {
    const wallet = makeWallet();
    await expect(
      buildTransactionRequest({
        wallet,
        settings: { ...DEFAULT_SETTINGS },
        origin: 'https://app.example.org',
        params: [{ from: '0x000000000000000000000000000000000000dEaD', to: VECTOR_ADDRESS }],
        forward: async () => '0x0',
      }),
    ).rejects.toThrow(/不一致/);
  });

  it('normalizes personal_sign argument order in both directions', async () => {
    const wallet = makeWallet();
    const account = primaryAccount(wallet, { ...DEFAULT_SETTINGS })!;
    // Standard order: message, address.
    const standard = buildMessageRequest({
      wallet,
      settings: { ...DEFAULT_SETTINGS },
      kind: 'personal_sign',
      params: ['0x68656c6c6f', account.address],
      origin: 'https://app.example.org',
    });
    expect(standard.kind).toBe('msg');
    expect(standard.message?.text).toBe('hello');
    expect(standard.message?.hex).toBe('0x68656c6c6f');

    // Swapped order, as several older dApps send it.
    const swapped = buildMessageRequest({
      wallet,
      settings: { ...DEFAULT_SETTINGS },
      kind: 'personal_sign',
      params: [account.address, '0x68656c6c6f'],
      origin: 'https://app.example.org',
    });
    expect(swapped.message?.text).toBe('hello');

    // Plain text messages survive unchanged.
    const text = buildMessageRequest({
      wallet,
      settings: { ...DEFAULT_SETTINGS },
      kind: 'personal_sign',
      params: ['Sign in to NetProof\nnonce: 42', account.address],
      origin: 'https://app.example.org',
    });
    expect(text.message?.text).toContain('nonce: 42');
  });

  it('refuses personal_sign for an address that is not the active account', async () => {
    const wallet = makeWallet();
    expect(() =>
      buildMessageRequest({
        wallet,
        settings: { ...DEFAULT_SETTINGS },
        kind: 'personal_sign',
        params: ['0xdeadbeef', '0x000000000000000000000000000000000000dEaD'],
        origin: 'https://app.example.org',
      }),
    ).toThrow(/不一致/);
  });

  it('carries an EIP-712 payload through intact', async () => {
    const wallet = makeWallet();
    const account = primaryAccount(wallet, { ...DEFAULT_SETTINGS })!;
    const payload = {
      domain: { name: 'Permit2', chainId: 1, verifyingContract: '0x000000000022D473030F116dDEE9F6B43aC78BA3' },
      types: { PermitTransferFrom: [{ name: 'permitted', type: 'TokenPermissions' }] },
      primaryType: 'PermitTransferFrom',
      message: { permitted: { token: '0x0000000000000000000000000000000000000001', amount: '1000' } },
    };
    const message = buildMessageRequest({
      wallet,
      settings: { ...DEFAULT_SETTINGS },
      kind: 'signTypedData',
      params: [account.address, payload],
      origin: 'https://app.example.org',
    });
    expect(message.kind).toBe('typed');
    expect(message.typed?.primaryType).toBe('PermitTransferFrom');
    expect(message.typed?.domain.name).toBe('Permit2');
  });

  it('rejects an EIP-712 payload without a primaryType', async () => {
    const wallet = makeWallet();
    const account = primaryAccount(wallet, { ...DEFAULT_SETTINGS })!;
    expect(() =>
      buildMessageRequest({
        wallet,
        settings: { ...DEFAULT_SETTINGS },
        kind: 'signTypedData',
        params: [account.address, { domain: {}, types: {}, message: {} }],
        origin: 'https://app.example.org',
      }),
    ).toThrow(/primaryType/);
  });

  it('rejects a malformed recipient with a readable error', async () => {
    const wallet = makeWallet();
    const account = primaryAccount(wallet, { ...DEFAULT_SETTINGS })!;
    // Addresses with the wrong length or wrong alphabet must fail here with a
    // clear message, not with a hex-length error from inside the QR encoder.
    for (const to of [
      '0x9858EfFD232B4033E47d60c7d01b50e0d17dc79', // 39 hex chars
      '0x9858EfFD232B4033E47d60c7d01b50e0d17dc79C8A', // 41 hex chars
      '0xzzzzEfFD232B4033E47d60c7d01b50e0d17dc79C8', // non-hex characters
      'vitalik.eth', // not an address at all
    ]) {
      await expect(
        buildTransactionRequest({
          wallet,
          settings: { ...DEFAULT_SETTINGS },
          origin: 'https://app.example.org',
          params: [{ from: account.address, to, gas: '0x5208' }],
          forward: async () => '0x1',
        }),
        to,
      ).rejects.toThrow(/收款地址不合法/);
    }

    await expect(
      buildTransactionRequest({
        wallet,
        settings: { ...DEFAULT_SETTINGS },
        origin: 'https://app.example.org',
        params: [{ from: account.address, to: VECTOR_ADDRESS, data: '0xabc', gas: '0x5208' }],
        forward: async () => '0x1',
      }),
    ).rejects.toThrow(/字节对齐/);
  });

  it('never builds a request without a gas limit', async () => {
    const wallet = makeWallet();
    const account = primaryAccount(wallet, { ...DEFAULT_SETTINGS })!;
    await expect(
      buildTransactionRequest({
        wallet,
        settings: { ...DEFAULT_SETTINGS },
        origin: 'https://app.example.org',
        params: [{ from: account.address, to: VECTOR_ADDRESS }],
        forward: async (method) => {
          // A node that returns nonsense for gas must fail here, not on the device.
          if (method === 'eth_estimateGas') return 'not-a-quantity';
          return '0x1';
        },
      }),
    ).rejects.toThrow();
  });
});

describe('account limits per chain', () => {
  it('derives past the dApp-disclosure bound when the UI asks for more', () => {
    const wallet = makeWallet();
    // `addressCount` is what a website may see. How many accounts the user may *create* is a
    // different number, and the UI passes the hard cap for it.
    const exposed = allAddresses(wallet, { ...DEFAULT_SETTINGS, addressCount: 20 });
    expect(exposed).toHaveLength(20);
    const forTheUi = allAddresses(wallet, { ...DEFAULT_SETTINGS, addressCount: 20 }, 40);
    expect(forTheUi).toHaveLength(40);
    expect(forTheUi[39]!.path).toBe("m/44'/60'/0'/0/39");
  });

  it('gives Solana only the addresses the device exported', () => {
    const root = HDKey.fromMasterSeed(mnemonicToSeed(MNEMONIC, ''));
    const exported = buildWalletExport(root, { accounts: 1 });
    const message = buildXpubMessage(
      { ...exported, addresses: solanaAccountPaths(5).map((path) => ({ path, address: `So${path}` })) },
      { name: 'NetProof Air', model: 'test' },
    );
    const wallet = walletFromXpubMessage(message);

    // Ten accounts revealed on EVM is normal; on Solana there are only five addresses to
    // show, and the list stops at five rather than inventing more.
    const solana = { ...DEFAULT_SETTINGS, chainId: SOLANA_CHAIN_ID, visibleAccounts: 10 };
    expect(allAddresses(wallet, solana, 200)).toHaveLength(5);
  });
});

describe('removing an account from the list', () => {
  it('drops it from what the user sees, and from what a dApp sees', () => {
    const wallet = makeWallet();
    const settings = { ...DEFAULT_SETTINGS, visibleAccounts: 3 };
    const before = visibleAccounts(wallet, settings, MAX_ADDRESSES_PER_ACCOUNT);
    expect(before).toHaveLength(3);

    // The second account is removed. The derivation still exists — this is a list decision,
    // not arithmetic — so what is recorded is the address.
    const removed = before[1]!.address;
    const after = visibleAccounts(
      wallet,
      { ...settings, hiddenAccounts: [removed.toLowerCase()] },
      MAX_ADDRESSES_PER_ACCOUNT,
    );
    expect(after).toHaveLength(2);
    expect(after.map((entry) => entry.address)).not.toContain(removed);
    // And the accounts that remain are the same ones, not renumbered onto new addresses.
    expect(after[0]!.address).toBe(before[0]!.address);
    expect(after[1]!.address).toBe(before[2]!.address);
  });

  it('hides the removed account from eth_accounts too', async () => {
    const wallet = makeWallet();
    const settings = { ...DEFAULT_SETTINGS, addressCount: 3, visibleAccounts: 3 };
    const address = resolveAccounts(wallet, settings)[1]!.address;
    const { context: ctx } = context({
      wallet,
      settings: { ...settings, hiddenAccounts: [address.toLowerCase()] },
      approvedOrigins: ['https://app.example.org'],
    });
    const outcome = await handleRpc('eth_accounts', [], ctx);
    // "Hidden from me" and "hidden from the internet" are the same list, or removing an
    // account would be theatre.
    expect(outcome.result as string[]).not.toContain(address);
    expect((outcome.result as string[]).length).toBeGreaterThan(0);
  });
});

describe('account names survive a removal', () => {
  it('names an account after its derivation index, not its row', () => {
    const wallet = makeWallet();
    const settings = { ...DEFAULT_SETTINGS, visibleAccounts: 4 };
    const names = (hidden: string[]): string[] =>
      visibleAccounts(wallet, { ...settings, hiddenAccounts: hidden }, MAX_ADDRESSES_PER_ACCOUNT).map(
        (entry) => `账户 ${entry.index + 1}`,
      );

    expect(names([])).toEqual(['账户 1', '账户 2', '账户 3', '账户 4']);

    // Remove the second account. The one the user knows as 账户 4 is still 账户 4 — a
    // positional name would renumber it to 3 the moment the row above it disappeared.
    const removed = visibleAccounts(wallet, settings, MAX_ADDRESSES_PER_ACCOUNT)[1]!.address;
    expect(names([removed.toLowerCase()])).toEqual(['账户 1', '账户 3', '账户 4']);
  });
});

describe('announcing a connection', () => {
  it('offers the selected account first, and hides removed ones', () => {
    const wallet = makeWallet();
    const settings = { ...DEFAULT_SETTINGS, addressCount: 3, addressIndex: 1, visibleAccounts: 3 };
    const offered = accountsForDapp(wallet, settings);
    const selected = resolveAccounts(wallet, settings);

    // EIP-1193 expects the first entry to be the account the user is *on* — which is
    // `addressIndex`, not index zero.
    expect(offered[0]).toBe(selected[settings.addressIndex]!.address);
    expect(offered).toHaveLength(settings.addressCount);

    const hidden = accountsForDapp(wallet, {
      ...settings,
      hiddenAccounts: [offered[1]!.toLowerCase()],
    });
    expect(hidden).not.toContain(offered[1]);
  });
});

describe('the probes a connector makes after connecting', () => {
  it('answers wallet_getPermissions with the granted capability', async () => {
    const wallet = makeWallet();
    const { context: ctx } = context({ wallet, approvedOrigins: ['https://app.example.org'] });
    const granted = await handleRpc('wallet_getPermissions', [], ctx);
    expect(granted.result).toEqual([{ parentCapability: 'eth_accounts', caveats: [] }]);

    // An unapproved site gets an empty list, not an error: EIP-2255 is a query.
    const { context: unknown } = context({ wallet });
    expect((await handleRpc('wallet_getPermissions', [], unknown)).result).toEqual([]);
  });

  it('answers wallet_getCapabilities with "none" instead of an unsupported error', async () => {
    const wallet = makeWallet();
    const { context: ctx } = context({ wallet, approvedOrigins: ['https://app.example.org'] });
    // EIP-5792: `{}` is a legitimate "no optional capabilities" answer that a connector can
    // fall back from, where a 4200 is an error it may treat as fatal.
    expect((await handleRpc('wallet_getCapabilities', ['0xabc'], ctx)).result).toEqual({});
  });
});
