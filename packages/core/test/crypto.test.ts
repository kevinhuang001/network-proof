import { describe, expect, it } from 'vitest';
import { HDNodeWallet, Mnemonic, Wallet, getBytes, hexlify } from 'ethers';
import {
  SEED_STRENGTHS,
  entropyToMnemonic,
  mnemonicToEntropy,
  mnemonicToSeed,
  mnemonicWords,
  normalizeMnemonic,
  suggestWords,
  validateMnemonic,
  wordCount,
} from '../src/crypto/mnemonic';
import {
  EVM_SCHEMES,
  buildWalletExport,
  checksumAddress,
  derivePath,
  fillTemplate,
  formatPath,
  isAddress,
  parsePath,
  publicKeyToAddress,
} from '../src/crypto/hd';
import { privateKeyToAddress } from '../src/crypto/evm';
import { TestDrbg } from './helpers/synthetic';
import { HDKey } from '@scure/bip32';

/** The canonical BIP39 test vector (Trezor's vectors.json, first entry). */
const VECTOR = {
  entropy: '00000000000000000000000000000000',
  mnemonic: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
  passphrase: 'TREZOR',
  seed: 'c55257c360c07c72029aebc1b53c05ed0362ada38ead3e3e9efa3708e53495531f09a6987599d18264c1e1c92f2cf141630c7a3c4ab7c81b2f001698e7463b04',
  xprv: 'xprv9s21ZrQH143K3h3fDYiay8mocZ3afhfULfb5GX8kCBdno77K4HiA5RgmcUwupB5rrKf5vU6FvJ7qKkXq5c7CkqU8bYQWkGr67nrJKB8kRr',
};

const unhex = (hex: string): Uint8Array =>
  getBytes(hex.startsWith('0x') ? hex : `0x${hex}`);

describe('mnemonic (BIP39)', () => {
  it('reproduces the official Trezor vector', () => {
    expect(entropyToMnemonic(unhex(VECTOR.entropy))).toBe(VECTOR.mnemonic);
    expect(hexlify(mnemonicToEntropy(VECTOR.mnemonic)).slice(2)).toBe(VECTOR.entropy);
    expect(hexlify(mnemonicToSeed(VECTOR.mnemonic, VECTOR.passphrase)).slice(2)).toBe(VECTOR.seed);
  });

  it('matches ethers for every supported strength and for a unicode passphrase', () => {
    // Independent implementation cross-check: @scure/bip39 here vs ethers' BIP39.
    // Note ethers v6 takes the passphrase in `fromEntropy`; its `computeSeed(pw)`
    // ignores the argument and just returns the already-derived seed.
    for (const strength of SEED_STRENGTHS) {
      const entropy = new TestDrbg(`strength-${strength}`).bytes(strength / 8);
      const mnemonic = entropyToMnemonic(entropy);
      expect(mnemonic).toBe(Mnemonic.fromEntropy(entropy).phrase);
      for (const passphrase of ['', 'TREZOR', '汉字密码🔐', 'ünïcödé']) {
        expect(
          hexlify(mnemonicToSeed(mnemonic, passphrase)),
          `strength ${strength}, passphrase ${JSON.stringify(passphrase)}`,
        ).toBe(Mnemonic.fromEntropy(entropy, passphrase).computeSeed());
      }
    }
  });

  it('produces the right word count for each strength', () => {
    for (const [strength, words] of [
      [128, 12],
      [160, 15],
      [192, 18],
      [224, 21],
      [256, 24],
    ] as const) {
      const mnemonic = entropyToMnemonic(new TestDrbg(`w${strength}`).bytes(strength / 8));
      expect(wordCount(mnemonic)).toBe(words);
      expect(mnemonicWords(mnemonic)).toHaveLength(words);
    }
  });

  it('rejects invalid entropy sizes and bad checksums', () => {
    expect(() => entropyToMnemonic(new Uint8Array(17))).toThrow(/16\/20\/24\/28\/32/);
    const words = VECTOR.mnemonic.split(' ');
    words[0] = 'zoo';
    expect(validateMnemonic(words.join(' '))).toBe(false);
    expect(() => mnemonicToEntropy(words.join(' '))).toThrow(/checksum/);
    expect(() => mnemonicToSeed(words.join(' '))).toThrow(/checksum/);
  });

  it('normalizes whitespace and NFKD so pasted mnemonics still work', () => {
    const messy = `  ${VECTOR.mnemonic.replace(/ /gu, '\n')}\n `;
    expect(normalizeMnemonic(messy)).toBe(VECTOR.mnemonic);
    expect(hexlify(mnemonicToSeed(messy, VECTOR.passphrase)).slice(2)).toBe(VECTOR.seed);
    // Full-width space and an ideographic space both collapse to a single space.
    expect(normalizeMnemonic(VECTOR.mnemonic.replace(/ /gu, '\u3000'))).toBe(VECTOR.mnemonic);
  });

  it('derives a completely different wallet from a one-character passphrase change', () => {
    const a = mnemonicToSeed(VECTOR.mnemonic, 'correct horse');
    const b = mnemonicToSeed(VECTOR.mnemonic, 'correct horsf');
    expect(hexlify(a)).not.toBe(hexlify(b));
    // And a passphrase changes the seed even for an empty-ish passphrase.
    expect(hexlify(mnemonicToSeed(VECTOR.mnemonic, ''))).not.toBe(hexlify(a));
  });

  it('suggests wordlist completions and tolerates a single typo', () => {
    expect(suggestWords('aban')).toContain('abandon');
    expect(suggestWords('abandon')).toEqual(['abandon']);
    expect(suggestWords('')).toEqual([]);
    expect(suggestWords('abandom')).toContain('abandon');
    expect(suggestWords('ab').length).toBeLessThanOrEqual(6);
  });
});

describe('hd (BIP32/BIP44)', () => {
  const root = HDKey.fromMasterSeed(mnemonicToSeed(VECTOR.mnemonic, VECTOR.passphrase));

  it('parses and formats paths, including hardened markers', () => {
    expect(parsePath('m')).toEqual([]);
    expect(parsePath("m/44'/60'/0'/0/0")).toEqual([
      0x8000002c, 0x8000003c, 0x80000000, 0, 0,
    ]);
    expect(parsePath("m/44h/60H/0'")).toEqual([0x8000002c, 0x8000003c, 0x80000000]);
    expect(formatPath(parsePath("m/44'/60'/0'/0/7"))).toBe("m/44'/60'/0'/0/7");
    expect(formatPath([])).toBe('m');
  });

  it('rejects malformed paths', () => {
    expect(() => parsePath('44/0')).toThrow(/must start with m/);
    expect(() => parsePath("m/44'/abc")).toThrow(/invalid path segment/);
    expect(() => parsePath(`m/${2 ** 32}`)).toThrow(/hardened range/);
  });

  it('matches ethers for BIP44, Ledger Live and legacy paths', () => {
    const ethersWallet = HDNodeWallet.fromSeed(hexlify(mnemonicToSeed(VECTOR.mnemonic, VECTOR.passphrase)));
    for (const path of [
      "m/44'/60'/0'/0/0",
      "m/44'/60'/0'/0/9",
      "m/44'/60'/1'/0/0",
      "m/44'/60'/0'/1/3",
      "m/44'/60'/5'/0/0",
      "m/44'/60'/0'/7",
    ]) {
      const mine = publicKeyToAddress(derivePath(root, path).publicKey!);
      const theirs = ethersWallet.derivePath(path).address;
      expect(mine, path).toBe(theirs);
    }
    expect(ethersWallet.address).toBe(publicKeyToAddress(root.publicKey!));
  });

  it('matches ethers for the well-known private-key-to-address vectors', () => {
    for (const key of [1n, 2n, 3n, 0xdeadbeefn]) {
      const privateKey = new Uint8Array(32);
      let value = key;
      for (let i = 31; i >= 0; i--) {
        privateKey[i] = Number(value & 0xffn);
        value >>= 8n;
      }
      const wallet = new Wallet(hexlify(privateKey));
      expect(privateKeyToAddress(privateKey)).toBe(wallet.address);
      expect(checksumAddress(privateKeyToAddress(privateKey))).toBe(wallet.address);
    }
    // The famous private key 0x...01 address, hard-coded as a third opinion.
    const one = new Uint8Array(32);
    one[31] = 1;
    expect(privateKeyToAddress(one)).toBe('0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf');
  });

  it('produces the documented Ethereum address for the classic test mnemonic', () => {
    // "abandon…about" with no passphrase is the MetaMask/OKX test wallet.
    const plain = HDKey.fromMasterSeed(mnemonicToSeed(VECTOR.mnemonic, ''));
    expect(publicKeyToAddress(derivePath(plain, "m/44'/60'/0'/0/0").publicKey!)).toBe(
      '0x9858EfFD232B4033E47d90003D41EC34EcaEda94',
    );
    // With the TREZOR passphrase it must be a completely different address.
    expect(publicKeyToAddress(derivePath(root, "m/44'/60'/0'/0/0").publicKey!)).toBe(
      HDNodeWallet.fromSeed(hexlify(mnemonicToSeed(VECTOR.mnemonic, 'TREZOR'))).derivePath("m/44'/60'/0'/0/0").address,
    );
  });

  it('round-trips the extended public key through base58check', () => {
    const account = derivePath(root, "m/44'/60'/0'");
    const xpub = account.publicExtendedKey;
    expect(xpub.startsWith('xpub')).toBe(true);
    const restored = HDKey.fromExtendedKey(xpub);
    expect(formatPath([0x8000002c, 0x8000003c, 0x80000000])).toBe("m/44'/60'/0'");
    expect(restored.publicKey).toEqual(account.publicKey);
    expect(restored.chainCode).toEqual(account.chainCode);
    // Public-only derivation of non-hardened children matches the private path.
    // `restored` already sits at m/44'/60'/0', so only 0/0 remains.
    const publicChild = derivePath(restored, 'm/0/0');
    expect(publicChild.publicKey).toEqual(derivePath(root, "m/44'/60'/0'/0/0").publicKey);
    expect(publicChild.privateKey).toBeNull();
  });

  it('refuses hardened derivation from a public-only node', () => {
    const accountPub = HDKey.fromExtendedKey(derivePath(root, "m/44'/60'/0'").publicExtendedKey);
    expect(() => derivePath(accountPub, 'm/0/1')).not.toThrow();
    expect(() => derivePath(accountPub, "m/1'")).toThrow(/hardened/);
  });

  it('exports every supported scheme and account as a watch-only xpub', () => {
    const exported = buildWalletExport(root, { accounts: 2, passphraseProtected: true });
    expect(exported.version).toBe(1);
    expect(exported.masterFingerprint).toMatch(/^[0-9a-f]{8}$/);
    expect(exported.passphraseProtected).toBe(true);
    expect(exported.rootXpub.startsWith('xpub')).toBe(true);
    expect(exported.accounts).toHaveLength(2 * EVM_SCHEMES.length);
    expect(exported.schemes.map((s) => s.id)).toEqual(['bip44', 'ledger-live', 'legacy-mew']);

    const ethersWallet = HDNodeWallet.fromSeed(hexlify(mnemonicToSeed(VECTOR.mnemonic, VECTOR.passphrase)));
    for (const account of exported.accounts) {
      expect(account.xpub).toBe(ethersWallet.derivePath(account.xpubPath).neuter().extendedKey);
      expect(account.firstAddress).toBe(ethersWallet.derivePath(account.firstAddressPath).address);
      // The exported public key and chain code must be enough to derive children.
      const restored = HDKey.fromExtendedKey(account.xpub);
      expect(restored.publicKey).toBeTruthy();
    }
    // Account 1's xpub derives a different family of addresses than account 0's.
    const a0 = exported.accounts.find((a) => a.scheme === 'bip44' && a.account === 0)!;
    const a1 = exported.accounts.find((a) => a.scheme === 'bip44' && a.account === 1)!;
    expect(HDKey.fromExtendedKey(a0.xpub).deriveChild(0).deriveChild(0).publicKey).not.toEqual(
      HDKey.fromExtendedKey(a1.xpub).deriveChild(0).deriveChild(0).publicKey,
    );
  });

  it('exposes the templates the companion needs', () => {
    const exported = buildWalletExport(root, { accounts: 1 });
    const bip44 = exported.schemes.find((s) => s.id === 'bip44')!;
    expect(fillTemplate(bip44.receiveTemplate, 2, 5)).toBe("m/44'/60'/2'/0/5");
    expect(fillTemplate(bip44.changeTemplate!, 0, 1)).toBe("m/44'/60'/0'/1/1");
    const ledger = exported.schemes.find((s) => s.id === 'ledger-live')!;
    expect(fillTemplate(ledger.receiveTemplate, 3, 0)).toBe("m/44'/60'/3'/0/0");
  });

  it('validates addresses and rejects absurd account counts', () => {
    expect(isAddress('0x9858EfFD232B4033E47d90003D41EC34EcaEda94')).toBe(true);
    expect(isAddress('0x9858EfFD232B4033E47d90003D41EC34EcaEda9')).toBe(false);
    expect(() => checksumAddress('0x1234')).toThrow(/not an EVM address/);
    expect(() => buildWalletExport(root, { accounts: 0 })).toThrow(/between 1 and 100/);
    expect(() => buildWalletExport(root, { accounts: 101 })).toThrow(/between 1 and 100/);
  });

  it('decompresses compressed public keys to the same address', () => {
    const node = derivePath(root, "m/44'/60'/0'/0/0");
    const compressed = new Wallet(hexlify(node.privateKey!)).signingKey.compressedPublicKey;
    expect(publicKeyToAddress(unhex(compressed))).toBe(publicKeyToAddress(node.publicKey!));
    expect(() => publicKeyToAddress(new Uint8Array(10))).toThrow(/unsupported public key length/);
    const bad = new Uint8Array(65);
    expect(() => publicKeyToAddress(bad)).toThrow(/must start with 0x04/);
  });
});
