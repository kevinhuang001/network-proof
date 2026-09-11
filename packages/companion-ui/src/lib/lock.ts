import {
  deriveVaultKey,
  fromHex,
  randomBytes,
  toHex,
} from '@netproof/core';

/**
 * The companion's passcode.
 *
 * Honest scope, because a lock that overstates itself is worse than no lock:
 *
 *  - This is a *lock*, not encryption. What the companion stores is public key material —
 *    account xpubs, derived addresses, account names, a local activity log. None of it is
 *    secret in the cryptographic sense, and all of it remains readable by anyone who can
 *    read this browser's storage. The passcode stops a person who picks up an unlocked
 *    machine from seeing the wallet. It does not stop anyone who can read the disk.
 *  - The passcode itself is never stored. The check is a real Argon2id derivation compared
 *    in constant time, so a stolen verifier is not a cheap oracle for the passcode — but
 *    that only protects the *passcode*, not the addresses behind it.
 *
 * The lock screen says this out loud. The alternative — a padlock icon implying the data
 * is encrypted when it is not — is how someone ends up leaving a wallet open on a shared
 * computer because they believed the lock was doing more than hiding the screen.
 */

export interface PasscodeRecord {
  algo: 'argon2id';
  /** Hex salt, 16 bytes. */
  salt: string;
  t: number;
  m: number;
  p: number;
  /** Hex of the derived verifier. */
  verifier: string;
}

const VERIFIER_BYTES = 32;

function derive(passcode: string, record: Omit<PasscodeRecord, 'verifier'>): Uint8Array {
  const { key } = deriveVaultKey(
    passcode,
    { algo: 'argon2id', t: record.t, m: record.m, p: record.p, salt: record.salt },
    VERIFIER_BYTES,
  );
  return key;
}

/**
 * Cheap KDF parameters, deliberately.
 *
 * The device wallet uses 64 MiB and three passes because brute-forcing it would recover a
 * *seed*. Here the worst case is recovering a screen lock over public data, and paying a
 * second of CPU on every unlock to defend that would be theatre. Fast enough to feel
 * instant, slow enough that guessing is still not free.
 */
const LOCK_KDF = { t: 2, m: 16384, p: 1 } as const;

export function createPasscodeRecord(passcode: string): PasscodeRecord {
  const base = {
    algo: 'argon2id' as const,
    salt: toHex(randomBytes(16)),
    ...LOCK_KDF,
  };
  return { ...base, verifier: toHex(derive(passcode, base)) };
}

/** Constant-time comparison: an early return would leak how much of the verifier matched. */
function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index++) diff |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return diff === 0;
}

export function verifyPasscode(passcode: string, record: PasscodeRecord): boolean {
  try {
    return equalBytes(derive(passcode, record), fromHex(record.verifier));
  } catch {
    // A malformed record fails closed instead of throwing into a render.
    return false;
  }
}
