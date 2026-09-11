import { describe, expect, it } from 'vitest';
import { deriveSolanaKeypair, isSolanaAddress, parseSolanaPath, signSolanaPayload, solanaAddress, solanaAccountPaths, verifySolanaSignature } from '../src/crypto/solana';
import { HDKey, derivePath, publicKeyToAddress } from '../src/crypto/hd';
import { mnemonicToSeed } from '../src/crypto/mnemonic';
import { derivePath as theirDerivePath } from 'ed25519-hd-key';
import { base58 } from '@scure/base';

/**
 * Solana derivation, verified against an independent implementation.
 *
 * SLIP-0010 ed25519 derivation is easy to get subtly wrong, and a wrong derivation
 * produces a *valid-looking* address that simply holds someone else's — or nobody's —
 * funds. So every key here is cross-checked against `ed25519-hd-key`, the library the
 * Solana ecosystem itself uses, rather than against values this code produced.
 */

const MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const SEED = mnemonicToSeed(MNEMONIC, '');

describe('solana derivation (SLIP-0010)', () => {
  it('matches ed25519-hd-key on the default account path', () => {
    const mine = deriveSolanaKeypair(SEED, "m/44'/501'/0'/0'");
    // The library works on the seed as hex and returns the derived seed (private key).
    const theirs = theirDerivePath("m/44'/501'/0'/0'", Buffer.from(SEED).toString('hex'));
    expect(Buffer.from(mine.privateKey).toString('hex')).toBe(Buffer.from(theirs.key).toString('hex'));
  });

  it('matches ed25519-hd-key across the path families wallets actually use', () => {
    // Phantom/Solflare use m/44'/501'/i'/0'; some wallets use the shorter m/44'/501'/i'.
    const paths = [
      "m/44'/501'/0'",
      "m/44'/501'/1'",
      "m/44'/501'/0'/0'",
      "m/44'/501'/1'/0'",
      "m/44'/501'/0'/0'/0'",
      "m/501'/0'/0'",
    ];
    for (const path of paths) {
      const mine = deriveSolanaKeypair(SEED, path);
      const theirs = theirDerivePath(path, Buffer.from(SEED).toString('hex'));
      expect(Buffer.from(mine.privateKey).toString('hex'), path).toBe(
        Buffer.from(theirs.key).toString('hex'),
      );
    }
  });

  it('derives distinct, well-formed addresses per account', () => {
    const addresses = solanaAccountPaths(5).map((path) => deriveSolanaKeypair(SEED, path).address);
    expect(new Set(addresses).size).toBe(5);
    for (const address of addresses) {
      expect(isSolanaAddress(address), address).toBe(true);
      // No 0x prefix and no checksum: it is base58 of the raw 32-byte key.
      expect(address.startsWith('0x')).toBe(false);
      expect(base58.decode(address)).toHaveLength(32);
    }
  });

  it('is deterministic and sensitive to the passphrase', () => {
    const a = deriveSolanaKeypair(SEED, "m/44'/501'/0'/0'").address;
    const b = deriveSolanaKeypair(SEED, "m/44'/501'/0'/0'").address;
    expect(a).toBe(b);
    const withPassphrase = deriveSolanaKeypair(
      mnemonicToSeed(MNEMONIC, 'TREZOR'),
      "m/44'/501'/0'/0'",
    ).address;
    expect(withPassphrase).not.toBe(a);
  });

  it('refuses non-hardened indices, because SLIP-0010 cannot derive them', () => {
    // This is not a limitation to work around: silently accepting a non-hardened index
    // would produce a key that no other Solana wallet agrees with.
    expect(() => deriveSolanaKeypair(SEED, "m/44'/501'/0'/0")).toThrow(/hardened/);
    expect(() => parseSolanaPath("m/44'/501'/0")).not.toThrow();
  });

  it('rejects malformed paths', () => {
    expect(() => parseSolanaPath("m/44'/abc")).toThrow(/invalid Solana path segment/);
    // A bare leading quote or an empty segment must not be silently treated as level 0.
    expect(() => parseSolanaPath("m/44'//0'")).toThrow(/invalid Solana path segment/);
    expect(() => parseSolanaPath("m/44''")).toThrow(/invalid Solana path segment/);
    // Relative and root forms are both acceptable, and mean the same thing.
    expect(parseSolanaPath('m')).toEqual([]);
    expect(parseSolanaPath("44'/501'")).toEqual([44 + 0x80000000, 501 + 0x80000000]);
  });

  it('signs and verifies with ed25519', () => {
    const keypair = deriveSolanaKeypair(SEED, "m/44'/501'/0'/0'");
    const payload = new Uint8Array([1, 2, 3, 4, 5]);
    const signature = signSolanaPayload(payload, keypair.privateKey);
    expect(signature).toHaveLength(64);
    expect(verifySolanaSignature(signature, payload, keypair.publicKey)).toBe(true);
    // A tampered payload must not verify.
    expect(verifySolanaSignature(signature, new Uint8Array([1, 2, 3, 4, 6]), keypair.publicKey)).toBe(
      false,
    );
    // Neither must a different key.
    const other = deriveSolanaKeypair(SEED, "m/44'/501'/1'/0'");
    expect(verifySolanaSignature(signature, payload, other.publicKey)).toBe(false);
  });

  it('rejects an address that is not 32 bytes of base58', () => {
    expect(isSolanaAddress('not base58 at all!!')).toBe(false);
    expect(isSolanaAddress('0x9858EfFD232B4033E47d90003D41EC34EcaEda94')).toBe(false);
    expect(() => solanaAddress(new Uint8Array(31))).toThrow(/32 bytes/);
  });

  it('keeps EVM and Solana derivation independent', () => {
    // Same mnemonic, two chains: different curves, different paths, and neither may
    // produce the other's address.
    const solana = deriveSolanaKeypair(SEED, "m/44'/501'/0'/0'").address;
    const evm = publicKeyToAddress(derivePath(HDKey.fromMasterSeed(SEED), "m/44'/60'/0'/0/0").publicKey!);
    expect(solana).not.toContain('0x');
    expect(evm.startsWith('0x')).toBe(true);
    expect(solana).not.toBe(evm);
    // The same mnemonic really does control both, so neither address may be reused.
    expect(isSolanaAddress(solana)).toBe(true);
    expect(isSolanaAddress(evm)).toBe(false);
  });
});
