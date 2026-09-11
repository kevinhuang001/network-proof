import { argon2id } from '@noble/hashes/argon2.js';
import { scrypt } from '@noble/hashes/scrypt.js';
import { pbkdf2 } from '@noble/hashes/pbkdf2.js';
import { sha512 } from '@noble/hashes/sha2.js';
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { NetProofError } from '../errors';
import { fromHex, randomBytes, taggedHash, toHex, utf8 } from '../util/bytes';

/**
 * Password-protected vault for the device's secret material.
 *
 * Two factors guard a wallet:
 *   1. this vault password, which encrypts the mnemonic at rest; and
 *   2. the BIP39 passphrase, which is never stored and is re-entered to sign.
 * Losing either one loses the wallet, and neither can be recovered by design —
 * there is no server, no backup code and no reset path on an air-gapped device.
 *
 * The AES-grade detail that matters: the KDF parameters are authenticated as
 * additional data, so an attacker who can rewrite the stored blob cannot silently
 * downgrade Argon2 to a cheap setting and then brute-force the password offline.
 */

export type KdfAlgorithm = 'argon2id' | 'scrypt' | 'pbkdf2-sha512';

export interface Argon2idParams {
  algo: 'argon2id';
  /** Iterations (time cost). */
  t: number;
  /** Memory in KiB. */
  m: number;
  /** Parallelism / lanes. */
  p: number;
  salt: string;
}

export interface ScryptParams {
  algo: 'scrypt';
  /** CPU/memory cost, a power of two. */
  N: number;
  r: number;
  p: number;
  salt: string;
}

export interface Pbkdf2Params {
  algo: 'pbkdf2-sha512';
  iterations: number;
  salt: string;
}

export type KdfParams = Argon2idParams | ScryptParams | Pbkdf2Params;

export interface VaultBlob {
  version: 1;
  kdf: KdfParams;
  cipher: 'xchacha20poly1305';
  nonce: string;
  /** Ciphertext of the JSON-encoded secret, hex. */
  ciphertext: string;
  /** Free-form label, authenticated but not encrypted (safe to show before unlock). */
  label: string;
  createdAt: number;
}

/**
 * One mnemonic inside the device's vault.
 *
 * A device holds several of these — a main wallet, a savings wallet, a test wallet —
 * and *one* device password opens all of them. That is the whole point of keeping
 * them in a single encrypted blob rather than several: the user unlocks once, and
 * there is exactly one secret to protect, so it can be as strong as it deserves.
 */
export interface VaultWallet {
  /** Random id, so renaming or relabelling never re-keys anything. */
  id: string;
  /** User-visible name, e.g. "主钱包". */
  label: string;
  /** BIP39 mnemonic, the wallet's root secret. */
  mnemonic: string;
  /** BIP39 passphrase, when one is set. Always stored — see docs/SECURITY.md §4.11. */
  passphrase?: string;
  passphraseRequired?: boolean;
  /** Audit trail of how this wallet's seed was generated. */
  provenance: {
    source: string;
    frames: number;
    estimatedMinEntropyBits: number;
    transcriptDigest: string;
  };
  createdAt: number;
  words: number;
}

/** The decrypted contents of a vault: every wallet the device holds. */
export interface VaultData {
  /** Payload format inside the ciphertext. Blob format is versioned separately. */
  payloadVersion: 2;
  wallets: VaultWallet[];
  /** Wallet shown by default after unlock. */
  activeWalletId: string | null;
}

export interface VaultSecret {
  /** BIP39 mnemonic, the wallet's root secret. */
  mnemonic: string;
  /**
   * BIP39 passphrase, when the user chose to store it. Optional: many users prefer
   * to keep it in their head only, which is stronger but unforgiving.
   */
  passphrase?: string;
  /**
   * Whether this wallet was created *with* a passphrase.
   *
   * Recorded separately from `passphrase`, and deliberately so. The passphrase
   * itself may be absent because the user chose not to store it — but the device
   * still needs to know that one exists, or it cannot tell the user that it is about
   * to unlock the wrong wallet. Without this, unlocking with an empty passphrase
   * silently derives the *decoy* account and every signature fails with a puzzling
   * address mismatch.
   *
   * This flag is a hint, not a secret: it reveals only that a passphrase exists.
   */
  passphraseRequired?: boolean;
  /**
   * Audit trail of how the seed was generated. Recorded so the user can later
   * judge whether they trusted the entropy source at creation time.
   */
  entropy: {
    source: string;
    frames: number;
    estimatedMinEntropyBits: number;
    transcriptDigest: string;
  };
  createdAt: number;
  words: number;
}

export const FAST_KDF_PARAMS: KdfParams = { algo: 'argon2id', t: 1, m: 1024, p: 1, salt: '' };

/** Phone-appropriate defaults: ~64 MiB and 3 passes, roughly a second on mid-range hardware. */
export const DEFAULT_KDF_PARAMS: Omit<Argon2idParams, 'salt'> = {
  algo: 'argon2id',
  t: 3,
  m: 65536,
  p: 1,
};

export function deriveVaultKey(
  password: string,
  params: KdfParams,
  keyLength = 32,
): { key: Uint8Array; salt: Uint8Array } {
  if (password.length === 0) {
    throw new NetProofError('VAULT_FORMAT', 'vault password must not be empty');
  }
  const salt = params.salt.length > 0 ? fromHex(params.salt) : new Uint8Array(0);
  if (salt.length < 8) {
    throw new NetProofError('VAULT_FORMAT', 'KDF salt must be at least 8 bytes');
  }
  switch (params.algo) {
    case 'argon2id': {
      if (params.t < 1 || params.m < 8 || params.p < 1) {
        throw new NetProofError('VAULT_KDF_UNSUPPORTED', 'invalid Argon2id parameters');
      }
      return { key: argon2id(password, salt, { t: params.t, m: params.m, p: params.p, dkLen: keyLength }), salt };
    }
    case 'scrypt': {
      return { key: scrypt(password, salt, { N: params.N, r: params.r, p: params.p, dkLen: keyLength }), salt };
    }
    case 'pbkdf2-sha512': {
      return {
        key: pbkdf2(sha512, password, salt, { c: params.iterations, dkLen: keyLength }),
        salt,
      };
    }
    default:
      throw new NetProofError(
        'VAULT_KDF_UNSUPPORTED',
        `unsupported KDF ${String((params as { algo?: string }).algo)}`,
      );
  }
}

/** Additional authenticated data: everything an attacker must not be able to change. */
function vaultAad(blob: Omit<VaultBlob, 'ciphertext' | 'nonce'>): Uint8Array {
  return taggedHash(
    'netproof/vault/aad/v1',
    utf8(
      JSON.stringify({
        version: blob.version,
        cipher: blob.cipher,
        label: blob.label,
        createdAt: blob.createdAt,
        kdf: { ...blob.kdf, salt: blob.kdf.salt },
      }),
    ),
  );
}

export interface CreateVaultOptions {
  kdf?: KdfParams;
  label?: string;
  createdAt?: number;
}

/**
 * Open a vault, returning both the contents and the derived key.
 *
 * The key is handed back deliberately. Adding or deleting a wallet has to re-encrypt
 * the whole payload, and requiring the password again for that would be user-hostile
 * — so the session keeps the key in memory and the password itself is never retained.
 */
export function openVault(blob: VaultBlob, password: string): { data: VaultData; key: Uint8Array } {
  const { key } = deriveVaultKey(password, blob.kdf);
  return { data: decryptWithKey(blob, key), key };
}

export function decryptWithKey(blob: VaultBlob, key: Uint8Array): VaultData {
  assertVaultShape(blob);
  let plaintext: Uint8Array;
  try {
    plaintext = xchacha20poly1305(key, fromHex(blob.nonce), vaultAad(blob)).decrypt(
      fromHex(blob.ciphertext),
    );
  } catch {
    // Wrong key and tampered ciphertext are indistinguishable, and should be.
    throw new NetProofError('VAULT_DECRYPT_FAILED', 'wrong password or corrupted vault');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(plaintext));
  } catch {
    throw new NetProofError('VAULT_FORMAT', 'decrypted vault payload is not valid JSON');
  }
  return normalizeVaultData(parsed);
}

/** Re-encrypt an updated payload under the same key: fresh nonce, same KDF salts. */
export function sealWithKey(blob: VaultBlob, key: Uint8Array, data: VaultData): VaultBlob {
  const nonce = randomBytes(24);
  const metadata = {
    version: blob.version,
    cipher: blob.cipher,
    label: blob.label,
    createdAt: blob.createdAt,
    kdf: blob.kdf,
  } as const;
  const ciphertext = xchacha20poly1305(key, nonce, vaultAad(metadata)).encrypt(
    utf8(JSON.stringify(data)),
  );
  return { ...metadata, nonce: toHex(nonce), ciphertext: toHex(ciphertext) };
}

export function emptyVaultData(): VaultData {
  return { payloadVersion: 2, wallets: [], activeWalletId: null };
}

/**
 * Accept either payload shape.
 *
 * A vault created before the device supported several wallets holds a bare
 * `VaultSecret`. Wrapping it on read means an existing device keeps working — and,
 * more importantly, keeps its funds reachable — instead of demanding a re-import.
 */
function normalizeVaultData(value: unknown): VaultData {
  if (!value || typeof value !== 'object') {
    throw new NetProofError('VAULT_FORMAT', 'decrypted payload must be an object');
  }
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.wallets)) {
    const wallets = record.wallets.map((entry) => validateWallet(entry));
    if (wallets.length === 0) {
      throw new NetProofError('VAULT_FORMAT', 'vault contains no wallets');
    }
    const activeWalletId =
      typeof record.activeWalletId === 'string' &&
      wallets.some((wallet) => wallet.id === record.activeWalletId)
        ? record.activeWalletId
        : wallets[0]!.id;
    return { payloadVersion: 2, wallets, activeWalletId };
  }
  // Legacy single-secret payload.
  const legacy = validateSecret(record);
  const wallet: VaultWallet = {
    id: toHex(randomBytes(16), true),
    label: '主钱包',
    mnemonic: legacy.mnemonic,
    ...(legacy.passphrase !== undefined ? { passphrase: legacy.passphrase } : {}),
    ...(legacy.passphraseRequired === true ? { passphraseRequired: true } : {}),
    provenance: legacy.entropy,
    createdAt: legacy.createdAt,
    words: legacy.words,
  };
  return { payloadVersion: 2, wallets: [wallet], activeWalletId: wallet.id };
}

export function validateWallet(value: unknown): VaultWallet {
  if (!value || typeof value !== 'object') {
    throw new NetProofError('VAULT_FORMAT', 'wallet entry must be an object');
  }
  const wallet = value as Partial<VaultWallet>;
  if (typeof wallet.mnemonic !== 'string' || wallet.mnemonic.length === 0) {
    throw new NetProofError('VAULT_FORMAT', 'wallet entry is missing its mnemonic');
  }
  if (wallet.passphrase !== undefined && typeof wallet.passphrase !== 'string') {
    throw new NetProofError('VAULT_FORMAT', 'wallet passphrase must be a string when present');
  }
  const id = typeof wallet.id === 'string' && wallet.id.length > 0 ? wallet.id : toHex(randomBytes(16), true);
  return {
    id,
    label: typeof wallet.label === 'string' && wallet.label.length > 0 ? wallet.label : '未命名钱包',
    mnemonic: wallet.mnemonic,
    ...(wallet.passphrase !== undefined && wallet.passphrase.length > 0
      ? { passphrase: wallet.passphrase }
      : {}),
    ...(wallet.passphraseRequired === true ? { passphraseRequired: true } : {}),
    provenance: wallet.provenance ?? {
      source: 'unknown',
      frames: 0,
      estimatedMinEntropyBits: 0,
      transcriptDigest: '',
    },
    createdAt: typeof wallet.createdAt === 'number' ? wallet.createdAt : 0,
    words: typeof wallet.words === 'number' ? wallet.words : wallet.mnemonic.split(' ').length,
  };
}

/** Wrap a single-wallet payload so older callers keep working. */
export function vaultDataFromWallet(wallet: VaultWallet): VaultData {
  return { payloadVersion: 2, wallets: [wallet], activeWalletId: wallet.id };
}

export function createVault(
  secret: VaultSecret,
  password: string,
  options: CreateVaultOptions = {},
): VaultBlob {
  const kdfTemplate: KdfParams = options.kdf ?? { ...DEFAULT_KDF_PARAMS, salt: '' };
  const kdf: KdfParams = {
    ...kdfTemplate,
    salt: kdfTemplate.salt.length > 0 ? kdfTemplate.salt : toHex(randomBytes(16)),
  } as KdfParams;
  const { key } = deriveVaultKey(password, kdf);
  const wallet = walletFromSecret(secret, options.label);
  const metadata = {
    version: 1 as const,
    cipher: 'xchacha20poly1305' as const,
    label: options.label ?? 'NetProof Wallet',
    createdAt: options.createdAt ?? Date.now(),
    kdf,
  };
  const sealed = sealWithKey({ ...metadata, nonce: '', ciphertext: '' }, key, vaultDataFromWallet(wallet));
  key.fill(0);
  return sealed;
}

/** Project a legacy single-secret payload into a wallet entry. */
export function walletFromSecret(secret: VaultSecret, label?: string): VaultWallet {
  return {
    id: toHex(randomBytes(16), true),
    label: label ?? '主钱包',
    mnemonic: secret.mnemonic,
    ...(secret.passphrase !== undefined && secret.passphrase.length > 0
      ? { passphrase: secret.passphrase }
      : {}),
    ...(secret.passphraseRequired === true ? { passphraseRequired: true } : {}),
    provenance: secret.entropy,
    createdAt: secret.createdAt,
    words: secret.words,
  };
}

/** Project a wallet entry back to the legacy single-secret shape. */
export function secretFromWallet(wallet: VaultWallet): VaultSecret {
  return {
    mnemonic: wallet.mnemonic,
    ...(wallet.passphrase !== undefined ? { passphrase: wallet.passphrase } : {}),
    ...(wallet.passphraseRequired === true ? { passphraseRequired: true } : {}),
    entropy: wallet.provenance,
    createdAt: wallet.createdAt,
    words: wallet.words,
  };
}

/**
 * Convenience wrapper for a single-wallet vault.
 *
 * Kept so callers that only ever hold one mnemonic do not have to think about the
 * list. It returns the *active* wallet, which for a fresh vault is the only one.
 */
export function unlockVault(blob: VaultBlob, password: string): VaultSecret {
  const { data, key } = openVault(blob, password);
  key.fill(0);
  const wallet =
    data.wallets.find((entry) => entry.id === data.activeWalletId) ?? data.wallets[0];
  if (!wallet) throw new NetProofError('VAULT_FORMAT', 'vault contains no wallets');
  return secretFromWallet(wallet);
}

export function changeVaultPassword(
  blob: VaultBlob,
  oldPassword: string,
  newPassword: string,
  options: CreateVaultOptions = {},
): VaultBlob {
  const { data } = openVault(blob, oldPassword);
  const kdfTemplate: KdfParams = options.kdf ?? { ...DEFAULT_KDF_PARAMS, salt: '' };
  const kdf: KdfParams = {
    ...kdfTemplate,
    // A password change re-keys the vault, so it gets a fresh salt too.
    salt: toHex(randomBytes(16)),
  } as KdfParams;
  const { key } = deriveVaultKey(newPassword, kdf);
  const metadata = {
    version: 1 as const,
    cipher: 'xchacha20poly1305' as const,
    label: options.label ?? blob.label,
    createdAt: options.createdAt ?? blob.createdAt,
    kdf,
  };
  const sealed = sealWithKey({ ...metadata, nonce: '', ciphertext: '' }, key, data);
  key.fill(0);
  return sealed;
}

export function vaultSerialize(blob: VaultBlob): string {
  return JSON.stringify(blob);
}

export function vaultDeserialize(text: string): VaultBlob {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new NetProofError('VAULT_FORMAT', 'vault is not valid JSON');
  }
  assertVaultShape(parsed);
  return parsed;
}

function assertVaultShape(value: unknown): asserts value is VaultBlob {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new NetProofError('VAULT_FORMAT', 'vault must be a JSON object');
  }
  const blob = value as Partial<VaultBlob>;
  if (blob.version !== 1) {
    throw new NetProofError('VAULT_FORMAT', `unsupported vault version ${String(blob.version)}`);
  }
  if (blob.cipher !== 'xchacha20poly1305') {
    throw new NetProofError('VAULT_FORMAT', `unsupported cipher ${String(blob.cipher)}`);
  }
  if (typeof blob.nonce !== 'string' || blob.nonce.length !== 48) {
    throw new NetProofError('VAULT_FORMAT', 'vault nonce must be 24 bytes of hex');
  }
  if (typeof blob.ciphertext !== 'string' || blob.ciphertext.length < 33) {
    throw new NetProofError('VAULT_FORMAT', 'vault ciphertext is too short');
  }
  if (!blob.kdf || typeof blob.kdf !== 'object') {
    throw new NetProofError('VAULT_FORMAT', 'vault is missing its KDF parameters');
  }
  if (typeof blob.kdf.salt !== 'string' || blob.kdf.salt.length < 16) {
    throw new NetProofError('VAULT_FORMAT', 'vault KDF salt is missing or too short');
  }
  if (typeof blob.label !== 'string') {
    throw new NetProofError('VAULT_FORMAT', 'vault label must be a string');
  }
  if (typeof blob.createdAt !== 'number' || !Number.isFinite(blob.createdAt)) {
    throw new NetProofError('VAULT_FORMAT', 'vault createdAt must be a timestamp');
  }
}

function validateSecret(value: unknown): VaultSecret {
  if (!value || typeof value !== 'object') {
    throw new NetProofError('VAULT_FORMAT', 'decrypted secret must be an object');
  }
  const secret = value as Partial<VaultSecret>;
  if (typeof secret.mnemonic !== 'string' || secret.mnemonic.length === 0) {
    throw new NetProofError('VAULT_FORMAT', 'decrypted secret is missing its mnemonic');
  }
  if (secret.passphrase !== undefined && typeof secret.passphrase !== 'string') {
    throw new NetProofError('VAULT_FORMAT', 'decrypted passphrase must be a string when present');
  }
  return {
    mnemonic: secret.mnemonic,
    ...(secret.passphrase !== undefined && secret.passphrase.length > 0
      ? { passphrase: secret.passphrase }
      : {}),
    ...(secret.passphraseRequired === true ? { passphraseRequired: true } : {}),
    entropy: secret.entropy ?? {
      source: 'unknown',
      frames: 0,
      estimatedMinEntropyBits: 0,
      transcriptDigest: '',
    },
    createdAt: secret.createdAt ?? 0,
    words: secret.words ?? secret.mnemonic.split(' ').length,
  };
}

/** Cheap, honest feedback for the password screen. Not a strength guarantee. */
export function assessPassword(password: string): { score: 0 | 1 | 2 | 3 | 4; suggestions: string[] } {
  const suggestions: string[] = [];
  const length = [...password].length;
  const classes = [/[a-z]/u, /[A-Z]/u, /\d/u, /[^A-Za-z0-9]/u].filter((re) => re.test(password)).length;
  let score = 0;
  if (length >= 8) score++;
  if (length >= 12) score++;
  if (classes >= 3) score++;
  if (length >= 16 && classes >= 3) score++;
  if (length < 12) suggestions.push('建议至少 12 个字符');
  if (classes < 3) suggestions.push('建议混合大小写字母、数字和符号');
  if (/^\d+$/u.test(password)) {
    score = 0;
    suggestions.push('纯数字密码极易被暴力破解');
  }
  if (isCommonPassword(password)) {
    score = 0;
    suggestions.push('这是常见弱密码，请更换');
  }
  return { score: Math.min(4, score) as 0 | 1 | 2 | 3 | 4, suggestions };
}

const COMMON_PASSWORDS = new Set([
  'password',
  '123456',
  '12345678',
  'qwerty',
  '111111',
  'abc123',
  'password1',
  'letmein',
  'iloveyou',
  'admin',
  '666666',
  '888888',
]);

function isCommonPassword(password: string): boolean {
  return COMMON_PASSWORDS.has(password.toLowerCase());
}
