import { describe, expect, it } from 'vitest';
import { NetProofError } from '../src/errors';
import {
  DEFAULT_KDF_PARAMS,
  FAST_KDF_PARAMS,
  decryptWithKey,
  emptyVaultData,
  openVault,
  sealWithKey,
  secretFromWallet,
  vaultDataFromWallet,
  walletFromSecret,
  assessPassword,
  changeVaultPassword,
  createVault,
  deriveVaultKey,
  unlockVault,
  vaultDeserialize,
  vaultSerialize,
} from '../src/vault/vault';
import type { KdfParams, VaultSecret } from '../src/vault/vault';
import { toHex } from '../src/util/bytes';

const SECRET: VaultSecret = {
  mnemonic:
    'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
  passphrase: 'correct horse battery staple',
  entropy: {
    source: 'camera-temporal-noise',
    frames: 42,
    estimatedMinEntropyBits: 312.5,
    transcriptDigest: 'a'.repeat(64),
  },
  createdAt: 1_700_000_000_000,
  words: 12,
};

const FAST = { kdf: FAST_KDF_PARAMS };

describe('vault', () => {
  it('round-trips a secret through encryption', () => {
    const blob = createVault(SECRET, 'hunter2-hunter2', FAST);
    expect(blob.version).toBe(1);
    expect(blob.cipher).toBe('xchacha20poly1305');
    expect(blob.nonce).toHaveLength(48);
    expect(blob.kdf.salt).toHaveLength(32);
    expect(blob.ciphertext).not.toContain(SECRET.mnemonic);

    const recovered = unlockVault(blob, 'hunter2-hunter2');
    expect(recovered.mnemonic).toBe(SECRET.mnemonic);
    expect(recovered.passphrase).toBe(SECRET.passphrase);
    expect(recovered.entropy.transcriptDigest).toBe(SECRET.entropy.transcriptDigest);
    expect(recovered.words).toBe(12);
  });

  it('survives a JSON round trip through device storage', () => {
    const blob = createVault(SECRET, 'password-123456', FAST);
    const restored = vaultDeserialize(vaultSerialize(blob));
    expect(restored).toEqual(blob);
    expect(unlockVault(restored, 'password-123456').mnemonic).toBe(SECRET.mnemonic);
  });

  it('rejects the wrong password without leaking why', () => {
    const blob = createVault(SECRET, 'the-right-password', FAST);
    for (const wrong of ['the-right-passwor', 'THE-RIGHT-PASSWORD', '', 'the-right-password ']) {
      expect(() => unlockVault(blob, wrong), `password ${JSON.stringify(wrong)}`).toThrow(NetProofError);
      try {
        unlockVault(blob, wrong);
      } catch (error) {
        expect((error as NetProofError).code).toBe(wrong === '' ? 'VAULT_FORMAT' : 'VAULT_DECRYPT_FAILED');
      }
    }
  });

  it('detects a tampered ciphertext', () => {
    const blob = createVault(SECRET, 'password-123456', FAST);
    for (const mutate of [
      (hex: string) => (hex[0] === '0' ? '1' : '0') + hex.slice(1),
      (hex: string) => hex.slice(0, -1) + (hex.endsWith('0') ? '1' : '0'),
    ]) {
      const tampered = { ...blob, ciphertext: mutate(blob.ciphertext) };
      expect(() => unlockVault(tampered, 'password-123456')).toThrow(/wrong password or corrupted vault/);
    }
    // The nonce is authenticated too.
    const nonceTampered = { ...blob, nonce: '00'.repeat(24) };
    expect(() => unlockVault(nonceTampered, 'password-123456')).toThrow(/corrupted/);
  });

  it('refuses a KDF downgrade by authenticating the parameters', () => {
    const blob = createVault(SECRET, 'password-123456', FAST);
    expect(blob.kdf.algo).toBe('argon2id');
    // An attacker who can rewrite the stored blob tries to make the KDF cheap so
    // an offline brute force becomes affordable.
    const downgraded = {
      ...blob,
      kdf: { ...(blob.kdf as { algo: 'argon2id'; t: number; m: number; p: number; salt: string }), t: 1, m: 8 },
    };
    expect(() => unlockVault(downgraded, 'password-123456')).toThrow(/corrupted/);
    // Changing the label or creation time is likewise detected.
    expect(() => unlockVault({ ...blob, label: 'A different wallet' }, 'password-123456')).toThrow();
    expect(() => unlockVault({ ...blob, createdAt: blob.createdAt + 1 }, 'password-123456')).toThrow();
  });

  it('never reuses a nonce or a salt', () => {
    const a = createVault(SECRET, 'password-123456', FAST);
    const b = createVault(SECRET, 'password-123456', FAST);
    expect(a.nonce).not.toBe(b.nonce);
    expect(a.kdf.salt).not.toBe(b.kdf.salt);
    // Same plaintext, same password, different ciphertext.
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(unlockVault(a, 'password-123456').mnemonic).toBe(unlockVault(b, 'password-123456').mnemonic);
  });

  it('changes the password while keeping the secret', () => {
    const blob = createVault(SECRET, 'old-password-1234', FAST);
    const rotated = changeVaultPassword(blob, 'old-password-1234', 'new-password-5678', FAST);
    expect(rotated.createdAt).toBe(blob.createdAt);
    expect(rotated.label).toBe(blob.label);
    expect(unlockVault(rotated, 'new-password-5678').mnemonic).toBe(SECRET.mnemonic);
    expect(unlockVault(rotated, 'new-password-5678').passphrase).toBe(SECRET.passphrase);
    expect(() => unlockVault(rotated, 'old-password-1234')).toThrow();
    expect(() => changeVaultPassword(blob, 'wrong-password', 'x'.repeat(12), FAST)).toThrow();
  });

  it('validates the stored format before trying to decrypt', () => {
    const blob = createVault(SECRET, 'password-123456', FAST);
    expect(() => vaultDeserialize('not json')).toThrow(/not valid JSON/);
    expect(() => vaultDeserialize("[]")).toThrow(/must be a JSON object/);
    expect(() => vaultDeserialize(JSON.stringify({ ...blob, version: 2 }))).toThrow(/unsupported vault version/);
    expect(() => vaultDeserialize(JSON.stringify({ ...blob, cipher: 'aes-gcm' }))).toThrow(/unsupported cipher/);
    expect(() => vaultDeserialize(JSON.stringify({ ...blob, nonce: 'abcd' }))).toThrow(/nonce must be 24 bytes/);
    expect(() => vaultDeserialize(JSON.stringify({ ...blob, ciphertext: 'ab' }))).toThrow(/too short/);
    expect(() => vaultDeserialize(JSON.stringify({ ...blob, kdf: undefined }))).toThrow(/missing its KDF/);
    expect(() =>
      vaultDeserialize(JSON.stringify({ ...blob, kdf: { ...blob.kdf, salt: 'aabb' } })),
    ).toThrow(/salt is missing or too short/);
    expect(() => vaultDeserialize(JSON.stringify({ ...blob, createdAt: 'yesterday' }))).toThrow(/timestamp/);
  });

  it('rejects an empty or absurd KDF configuration', () => {
    expect(() => deriveVaultKey('', { algo: 'argon2id', t: 1, m: 1024, p: 1, salt: 'aabbccddeeff0011' })).toThrow(
      /must not be empty/,
    );
    expect(() => deriveVaultKey('pw', { algo: 'argon2id', t: 1, m: 1024, p: 1, salt: 'aabb' })).toThrow(
      /at least 8 bytes/,
    );
    expect(() =>
      deriveVaultKey('pw', { algo: 'argon2id', t: 0, m: 1024, p: 1, salt: 'aabbccddeeff0011' }),
    ).toThrow(/invalid Argon2id parameters/);
    expect(() =>
      deriveVaultKey('pw', { algo: 'nope', salt: 'aabbccddeeff0011' } as unknown as KdfParams),
    ).toThrow(/unsupported KDF/);
  });

  it('supports scrypt and pbkdf2 for interoperability with older vaults', () => {
    const scryptBlob = createVault(SECRET, 'password-123456', {
      kdf: { algo: 'scrypt', N: 1024, r: 8, p: 1, salt: '' },
    });
    expect(unlockVault(scryptBlob, 'password-123456').mnemonic).toBe(SECRET.mnemonic);
    const pbkdf2Blob = createVault(SECRET, 'password-123456', {
      kdf: { algo: 'pbkdf2-sha512', iterations: 2048, salt: '' },
    });
    expect(unlockVault(pbkdf2Blob, 'password-123456').mnemonic).toBe(SECRET.mnemonic);
  });

  it('derives a 32-byte key, salted and password dependent', () => {
    const params = { ...FAST_KDF_PARAMS, salt: '0011223344556677' } as const;
    const { key, salt } = deriveVaultKey('password-123456', params);
    expect(key).toHaveLength(32);
    expect(toHex(salt)).toBe('0011223344556677');
    // Different password, or different salt, gives a different key.
    expect(toHex(deriveVaultKey('password-123457', params).key)).not.toBe(toHex(key));
    expect(
      toHex(deriveVaultKey('password-123456', { ...FAST_KDF_PARAMS, salt: '8899aabbccddeeff' }).key),
    ).not.toBe(toHex(key));
    // A caller that asks for more key material gets it.
    expect(deriveVaultKey('password-123456', params, 64).key).toHaveLength(64);
  });

  it('stores the default KDF parameters a real device would use', () => {
    // The defaults are cheap to assert but expensive to run, so we only check the
    // shape; the fast parameters keep the suite quick.
    expect(DEFAULT_KDF_PARAMS.algo).toBe('argon2id');
    expect(DEFAULT_KDF_PARAMS.t).toBeGreaterThanOrEqual(3);
    expect(DEFAULT_KDF_PARAMS.m).toBeGreaterThanOrEqual(65536);
    expect(FAST_KDF_PARAMS.algo).toBe('argon2id');
    expect((FAST_KDF_PARAMS as { m: number }).m).toBeLessThan(DEFAULT_KDF_PARAMS.m);
  });

  it('omits an empty passphrase rather than storing an empty string', () => {
    const blob = createVault({ ...SECRET, passphrase: '' }, 'password-123456', FAST);
    expect(unlockVault(blob, 'password-123456').passphrase).toBeUndefined();
  });

  it('always returns the passphrase after unlock, so signing never asks again', () => {
    // Product guarantee: a passphrase supplied at creation is stored in the vault and
    // handed back on unlock, so the user types it once and never again. If this ever
    // regressed, signing would silently derive the decoy account instead.
    const blob = createVault({ ...SECRET, passphraseRequired: true }, 'password-123456', FAST);
    const recovered = unlockVault(blob, 'password-123456');
    expect(recovered.passphrase).toBe(SECRET.passphrase);
    expect(recovered.passphraseRequired).toBe(true);

    // And it is genuinely inside the ciphertext, not sitting in the clear.
    expect(blob.ciphertext).not.toContain(SECRET.passphrase!);
    expect(JSON.stringify(blob)).not.toContain(SECRET.passphrase!);
  });

  it('remembers that a passphrase is required even for a legacy vault that stores none', () => {
    // The passphrase is deliberately absent (the user chose not to store it), but the
    // fact that one exists must survive: without it the device cannot warn that it is
    // about to unlock the decoy account.
    const blob = createVault(
      {
        mnemonic:
          'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
        passphraseRequired: true,
        entropy: {
          source: 'camera-read-noise',
          frames: 40,
          estimatedMinEntropyBits: 300,
          transcriptDigest: 'b'.repeat(64),
        },
        createdAt: 1,
        words: 12,
      },
      'password-123456',
      FAST,
    );
    const recovered = unlockVault(blob, 'password-123456');
    expect(recovered.passphraseRequired).toBe(true);
    expect(recovered.passphrase).toBeUndefined();

    // A wallet without a passphrase must not claim one.
    const plain = createVault(
      { ...SECRET, passphrase: undefined },
      'password-123456',
      FAST,
    );
    expect(unlockVault(plain, 'password-123456').passphraseRequired).toBeUndefined();
  });

  it('preserves the entropy provenance of an imported wallet', () => {
    // Provenance must survive encryption: the UI distinguishes a wallet whose
    // phrase came from this device's camera from one the user typed in, and a
    // mislabelled imported wallet would claim a provenance it does not have.
    const imported: VaultSecret = {
      mnemonic:
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
      entropy: {
        source: 'imported-mnemonic',
        frames: 0,
        estimatedMinEntropyBits: 0,
        transcriptDigest: '',
      },
      createdAt: 1_700_000_000_000,
      words: 12,
    };
    const blob = createVault(imported, 'password-123456', FAST);
    const recovered = unlockVault(blob, 'password-123456');
    expect(recovered.entropy.source).toBe('imported-mnemonic');
    expect(recovered.entropy.frames).toBe(0);
    expect(recovered.entropy.estimatedMinEntropyBits).toBe(0);
    // And it must not be confused with a camera-generated wallet.
    expect(recovered.entropy.source).not.toContain('camera');
  });

  describe('multiple wallets under one password', () => {
    it('holds several mnemonics in one blob, opened by one password', () => {
      // The device model: one password, several wallets. Everything lives in a single
      // ciphertext, so adding a wallet never introduces a second secret to protect.
      const first = walletFromSecret({ ...SECRET, passphraseRequired: true }, '主钱包');
      const second = walletFromSecret(
        {
          ...SECRET,
          mnemonic:
            'legal winner thank year wave sausage worth useful legal winner thank yellow',
          entropy: { source: 'imported-mnemonic', frames: 0, estimatedMinEntropyBits: 0, transcriptDigest: '' },
        },
        '储蓄钱包',
      );
      expect(first.id).not.toBe(second.id);

      const data = { payloadVersion: 2 as const, wallets: [first, second], activeWalletId: second.id };
      const blob = createVault(SECRET, 'one-password-1234', FAST);
      const { key } = openVault(blob, 'one-password-1234');
      const sealed = sealWithKey(blob, key, data);

      const reopened = decryptWithKey(sealed, key);
      expect(reopened.wallets).toHaveLength(2);
      expect(reopened.wallets.map((w) => w.label)).toEqual(['主钱包', '储蓄钱包']);
      expect(reopened.activeWalletId).toBe(second.id);
      // The recovered mnemonics are the originals, not a re-encryption artefact.
      expect(reopened.wallets[0]!.mnemonic).toBe(SECRET.mnemonic);
      expect(reopened.wallets[1]!.mnemonic).toContain('legal winner');
      // Per-wallet provenance survives, so an imported wallet is still labelled so.
      expect(reopened.wallets[1]!.provenance.source).toBe('imported-mnemonic');

      key.fill(0);
    });

    it('re-encrypts with a fresh nonce and keeps the key', () => {
      const blob = createVault(SECRET, 'one-password-1234', FAST);
      const { key } = openVault(blob, 'one-password-1234');
      const once = sealWithKey(blob, key, vaultDataFromWallet(walletFromSecret(SECRET)));
      const twice = sealWithKey(blob, key, vaultDataFromWallet(walletFromSecret(SECRET)));
      // Same key, same plaintext, different ciphertext: the nonce is never reused.
      expect(once.nonce).not.toBe(twice.nonce);
      expect(once.ciphertext).not.toBe(twice.ciphertext);
      expect(decryptWithKey(once, key).wallets).toHaveLength(1);
      expect(decryptWithKey(twice, key).wallets).toHaveLength(1);
      key.fill(0);
    });

    it('refuses to open a re-encrypted vault with the wrong key', () => {
      const blob = createVault(SECRET, 'one-password-1234', FAST);
      const { key } = openVault(blob, 'one-password-1234');
      const sealed = sealWithKey(blob, key, vaultDataFromWallet(walletFromSecret(SECRET)));
      const wrong = deriveVaultKey('another-password', {
        ...FAST_KDF_PARAMS,
        salt: blob.kdf.salt,
      }).key;
      expect(() => decryptWithKey(sealed, wrong)).toThrow(/wrong password or corrupted vault/);
      key.fill(0);
    });

    it('migrates a single-wallet vault on read', () => {
      // A device from before multi-wallet support must keep working: re-importing a
      // mnemonic to satisfy a format change is not an acceptable upgrade path.
      const legacy = createVault(SECRET, 'one-password-1234', FAST);
      const { key } = openVault(legacy, 'one-password-1234');
      const migrated = decryptWithKey(legacy, key);
      expect(migrated.payloadVersion).toBe(2);
      expect(migrated.wallets).toHaveLength(1);
      expect(migrated.wallets[0]!.mnemonic).toBe(SECRET.mnemonic);
      expect(migrated.wallets[0]!.passphrase).toBe(SECRET.passphrase);
      expect(migrated.activeWalletId).toBe(migrated.wallets[0]!.id);
      key.fill(0);
    });

    it('rejects an empty or malformed wallet list', () => {
      const blob = createVault(SECRET, 'one-password-1234', FAST);
      const { key } = openVault(blob, 'one-password-1234');
      const sealed = sealWithKey(blob, key, emptyVaultData());
      expect(() => decryptWithKey(sealed, key)).toThrow(/no wallets/);
      key.fill(0);
    });

    it('round-trips a wallet through the legacy projection', () => {
      const wallet = walletFromSecret({ ...SECRET, passphraseRequired: true }, '主钱包');
      const projected = secretFromWallet(wallet);
      expect(projected.mnemonic).toBe(SECRET.mnemonic);
      expect(projected.passphrase).toBe(SECRET.passphrase);
      expect(projected.passphraseRequired).toBe(true);
      expect(projected.entropy).toEqual(SECRET.entropy);
      expect(projected.words).toBe(SECRET.words);
    });
  });

  it('gives honest, non-flattering password feedback', () => {
    expect(assessPassword('123456').score).toBe(0);
    expect(assessPassword('123456').suggestions.join(' ')).toMatch(/纯数字|常见弱密码/);
    expect(assessPassword('password').score).toBe(0);
    expect(assessPassword('password').suggestions.join(' ')).toMatch(/常见弱密码/);
    expect(assessPassword('short').score).toBeLessThanOrEqual(1);
    // 14 characters with all four character classes scores 3; the top score
    // additionally requires 16+ characters, which is a deliberate threshold.
    expect(assessPassword('Tr0ub4dor&3xyz').score).toBe(3);
    expect(assessPassword('Tr0ub4dor&3xyzLong').score).toBe(4);
    expect(assessPassword('aB3aB3aB3aB3aB3').score).toBeGreaterThanOrEqual(3);
    // Length is encouraged explicitly.
    expect(assessPassword('abcdefghijkl').suggestions.join(' ')).toMatch(/大小写/);
  });
});
