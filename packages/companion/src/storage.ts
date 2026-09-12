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
  settings: `${STORAGE_PREFIX}settings.v1`,
  origins: `${STORAGE_PREFIX}origins.v1`,
  pending: `${STORAGE_PREFIX}pending.v1`,
  activity: `${STORAGE_PREFIX}activity.v1`,
  tokens: `${STORAGE_PREFIX}tokens.v1`,
  passcode: `${STORAGE_PREFIX}passcode.v1`,
  locked: `${STORAGE_PREFIX}locked.v1`,
} as const;
