/**
 * Storage key names, in one place.
 *
 * Two processes touch the same storage: the page that draws the wallet, and (in the
 * extension) the service worker that answers dApps. They must agree on every name, or the
 * UI shows a pending request that the worker never wrote, and approving it does nothing.
 * They were two hand-written lists until they disagreed about exactly that.
 */
export const STORAGE_PREFIX = 'netproof.companion.';

export const STORAGE_KEYS = {
  wallets: `${STORAGE_PREFIX}wallets.v1`,
  /** Pre-multi-wallet key, migrated on read. */
  legacyWallet: `${STORAGE_PREFIX}wallet.v1`,
  settings: `${STORAGE_PREFIX}settings.v1`,
  origins: `${STORAGE_PREFIX}origins.v1`,
  pending: `${STORAGE_PREFIX}pending.v1`,
  activity: `${STORAGE_PREFIX}activity.v1`,
  tokens: `${STORAGE_PREFIX}tokens.v1`,
  passcode: `${STORAGE_PREFIX}passcode.v1`,
  locked: `${STORAGE_PREFIX}locked.v1`,
} as const;

/** The key names the extension used before these were unified. */
export const LEGACY_EXTENSION_KEYS: Record<string, string> = {
  'netproof.wallet.v1': STORAGE_KEYS.wallets,
  'netproof.settings.v1': STORAGE_KEYS.settings,
  'netproof.origins.v1': STORAGE_KEYS.origins,
  'netproof.pending.v1': STORAGE_KEYS.pending,
};

/**
 * Rewrite the extension's pre-unification keys into the shared ones.
 *
 * Called by both sides that read this area — the UI and the service worker — because either
 * can be the first to run after an upgrade, and whichever runs second must not find the data
 * under a name the other never wrote.
 */
export function migrateLegacyKeys(raw: Record<string, unknown>): {
  values: Record<string, unknown>;
  changed: boolean;
} {
  const values = { ...raw };
  let changed = false;
  for (const [legacy, current] of Object.entries(LEGACY_EXTENSION_KEYS)) {
    if (values[legacy] === undefined || values[current] !== undefined) continue;
    const carried = values[legacy];
    // The old layout stored one wallet; the new one stores a list of them.
    values[current] =
      current === STORAGE_KEYS.wallets ? [carried] : carried;
    delete values[legacy];
    changed = true;
  }
  return { values, changed };
}
