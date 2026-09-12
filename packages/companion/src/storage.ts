/**
 * Storage key names, in one place.
 *
 * Two processes touch the same storage: the page that draws the wallet, and (in the
 * extension) the service worker that answers dApps. They must agree on every name, or the
 * UI shows a pending request that the worker never wrote, and approving it does nothing.
 * They were two hand-written lists until they disagreed about exactly that.
 *
 * These names are a *contract with data that already exists on users' machines*. Renaming
 * one does not migrate anything, it orphans it: the wallet opens empty, the pairing is gone,
 * and the only way back is showing the device's QR again. That happened once — the extension
 * kept `netproof.wallet.v1` while the shared UI moved to `netproof.companion.wallets.v1` —
 * and `migrateLegacyStorage` below exists so that it cannot happen silently again.
 */
import { DEFAULT_SETTINGS } from './settings';

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

/**
 * Names the extension used before it and the web app became one application.
 *
 * Kept only so that a wallet paired under the old names is carried over instead of
 * disappearing. Nothing writes them any more.
 */
export const LEGACY_STORAGE_KEYS = {
  wallet: 'netproof.wallet.v1',
  settings: 'netproof.settings.v1',
  origins: 'netproof.origins.v1',
  pending: 'netproof.pending.v1',
} as const;

/**
 * A storage area, in the three operations a migration needs.
 *
 * The names are `localStorage`'s, on purpose: the web companion's store and the extension's
 * mirror both already speak exactly this, so the migration is the same function in both
 * places with the same spelling.
 */
export interface MigrationArea {
  getItem(key: string): unknown;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * The old stores wrote objects; the new ones write JSON strings.
 *
 * Both have to be readable here, because which one is on disk depends on which build the user
 * last loaded.
 */
function decode(value: unknown): unknown {
  if (typeof value !== 'string') return value ?? null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Carry a wallet paired under the old key names into the current ones.
 *
 * Deliberately additive and one-way:
 *   - a wallet is only added if its fingerprint is not already in the list, so running this
 *     twice — two pages, a popup and a worker, both booting — cannot duplicate or clobber;
 *   - settings are only taken if the current key is empty, because a newer file that exists
 *     is newer information;
 *   - approved origins are unioned, so re-pairing does not silently un-approve a site;
 *   - pending requests are *not* migrated: a request from a previous session is stale, and
 *     the dApp that asked for it has already resolved or retried.
 *
 * Returns true when the area was changed.
 */
export function migrateLegacyStorage(area: MigrationArea): boolean {
  const legacyPresent = Object.values(LEGACY_STORAGE_KEYS).some((key) => {
    const value = area.getItem(key);
    return value !== undefined && value !== null;
  });
  if (!legacyPresent) return false;

  const legacyWallet = decode(area.getItem(LEGACY_STORAGE_KEYS.wallet));
  if (isRecord(legacyWallet) && typeof legacyWallet.masterFingerprint === 'string') {
    const id = legacyWallet.masterFingerprint;
    const current = decode(area.getItem(STORAGE_KEYS.wallets));
    const wallets: unknown[] = isRecord(current) && Array.isArray(current.wallets) ? [...current.wallets] : [];
    const known = wallets.some((entry) => isRecord(entry) && entry.id === id);
    if (!known) {
      const device = isRecord(legacyWallet.device) ? legacyWallet.device : {};
      wallets.push({
        ...legacyWallet,
        id,
        // A name is required by the account list, and the old record had none: the device's
        // own name is the honest default, and re-pairing will keep whatever the user types.
        name: typeof device.name === 'string' && device.name.length > 0 ? device.name : '硬件钱包',
        pairedAt: typeof legacyWallet.pairedAt === 'number' ? legacyWallet.pairedAt : Date.now(),
        accountIndex: 0,
        addressIndex: 0,
        visibleAccounts: DEFAULT_SETTINGS.visibleAccounts,
        hiddenAccounts: [],
      });
    }
    const activeId = isRecord(current) && typeof current.activeId === 'string' ? current.activeId : id;
    area.setItem(STORAGE_KEYS.wallets, JSON.stringify({ wallets, activeId }));
  }

  const legacySettings = decode(area.getItem(LEGACY_STORAGE_KEYS.settings));
  const currentSettings = area.getItem(STORAGE_KEYS.settings);
  if (isRecord(legacySettings) && (currentSettings === undefined || currentSettings === null)) {
    area.setItem(STORAGE_KEYS.settings, JSON.stringify(legacySettings));
  }

  const legacyOrigins = decode(area.getItem(LEGACY_STORAGE_KEYS.origins));
  if (Array.isArray(legacyOrigins)) {
    const current = decode(area.getItem(STORAGE_KEYS.origins));
    const origins = new Set<string>(Array.isArray(current) ? (current as string[]) : []);
    for (const entry of legacyOrigins) if (typeof entry === 'string') origins.add(entry);
    area.setItem(STORAGE_KEYS.origins, JSON.stringify([...origins]));
  }

  for (const key of Object.values(LEGACY_STORAGE_KEYS)) area.removeItem(key);
  return true;
}
