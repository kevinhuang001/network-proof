import type { CompanionSettings, ConnectedWallet, PendingRequest } from '@netproof/companion';
import { DEFAULT_SETTINGS, LEGACY_STORAGE_KEYS, STORAGE_KEYS, migrateLegacyStorage } from '@netproof/companion';

/**
 * Extension storage.
 *
 * The single most important property of this wallet: **no private key ever exists
 * here.** Everything persisted is watch-only — extended public keys, derivation
 * templates, addresses and settings. A full compromise of the browser profile
 * yields an attacker the ability to *watch* the wallet and to *ask* the device for
 * signatures, but never the ability to sign on its own.
 *
 * `chrome.storage.local` is used rather than `sync`, so nothing replicates to
 * Google's servers.
 */

const WALLET_KEY = STORAGE_KEYS.wallets;
const SETTINGS_KEY = STORAGE_KEYS.settings;
const ORIGINS_KEY = STORAGE_KEYS.origins;
const PENDING_KEY = STORAGE_KEYS.pending;

function storage(): chrome.storage.StorageArea {
  return chrome.storage.local;
}

/**
 * Carry a wallet paired under the extension's old key names into the current ones.
 *
 * The popup migrates too, through the shared UI's adapter, but the service worker is the
 * process that must not miss it: it is the one a dApp talks to, and a worker that reads an
 * empty wallet tells the site the user has no account.
 *
 * Runs once per worker lifetime, and reads only the four legacy names.
 */
let migration: Promise<void> | null = null;

export function ensureStorageMigrated(): Promise<void> {
  migration ??= (async () => {
    try {
      const names: string[] = Object.values(LEGACY_STORAGE_KEYS);
      const snapshot = await storage().get(names);
      const pendingWrites: Record<string, string> = {};
      const pendingRemovals: string[] = [];
      const applied = migrateLegacyStorage({
        getItem: (key) => snapshot[key],
        setItem: (key, value) => {
          pendingWrites[key] = value;
        },
        removeItem: (key) => pendingRemovals.push(key),
      });
      if (!applied) return;
      if (pendingRemovals.length > 0) await storage().remove(pendingRemovals);
      if (Object.keys(pendingWrites).length > 0) await storage().set(pendingWrites);
    } catch {
      // Storage unavailable: every caller below reports that on its own.
    }
  })();
  return migration;
}

/**
 * Values are JSON strings, because that is what the shared UI writes.
 *
 * The UI keeps a synchronous mirror of this area and talks to it through a `KeyValueStore`
 * interface — `getItem`/`setItem` with strings, like `localStorage`. The service worker and
 * the popup read the same area directly, so they speak the same encoding; when they did not,
 * the worker read a string where it expected a wallet and concluded none was paired.
 */
async function read<T>(key: string): Promise<T | null> {
  const result = await storage().get(key);
  const raw = result[key];
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function write(key: string, value: unknown): Promise<void> {
  await storage().set({ [key]: JSON.stringify(value) });
}

/**
 * The wallet the user is working in.
 *
 * The area holds a *list* of wallets with an active id, because the UI is now the same code as
 * the web companion's and supports several. The service worker only ever needs the active one:
 * a dApp asks for accounts, and the answer is "the wallet in front of the user".
 */
export async function loadWallet(): Promise<ConnectedWallet | null> {
  await ensureStorageMigrated();
  const state = await read<{ wallets?: ConnectedWallet[]; activeId?: string | null }>(WALLET_KEY);
  if (!state || !Array.isArray(state.wallets)) return null;
  return state.wallets.find((entry) => entry.masterFingerprint === state.activeId) ?? state.wallets[0] ?? null;
}

export async function clearWallet(): Promise<void> {
  await storage().remove([WALLET_KEY, ORIGINS_KEY, PENDING_KEY]);
}

interface WalletScoped {
  accountIndex?: number;
  addressIndex?: number;
  visibleAccounts?: number;
  hiddenAccounts?: string[];
}

export async function loadSettings(): Promise<CompanionSettings> {
  await ensureStorageMigrated();
  const stored = await read<Partial<CompanionSettings>>(SETTINGS_KEY);
  const state = await read<{ wallets?: (WalletScoped & { masterFingerprint: string })[]; activeId?: string | null }>(
    WALLET_KEY,
  );
  // Which account is selected is a property of the wallet, not of the app — the same split
  // the UI makes. Without this the worker would answer a dApp with the *global* selection,
  // which is not the one the user is looking at.
  const active =
    state?.wallets?.find((entry) => entry.masterFingerprint === state.activeId) ?? state?.wallets?.[0];
  return {
    ...DEFAULT_SETTINGS,
    ...(stored ?? {}),
    rpcUrls: { ...DEFAULT_SETTINGS.rpcUrls, ...(stored?.rpcUrls ?? {}) },
    ...(active
      ? {
          accountIndex: active.accountIndex ?? 0,
          addressIndex: active.addressIndex ?? 0,
          visibleAccounts: active.visibleAccounts ?? 1,
          hiddenAccounts: active.hiddenAccounts ?? [],
        }
      : {}),
  };
}

export async function saveSettings(patch: Partial<CompanionSettings>): Promise<CompanionSettings> {
  const next = { ...(await loadSettings()), ...patch };
  await write(SETTINGS_KEY, next);
  return next;
}

/** Origins the user has approved for dApp connections. */
export async function loadApprovedOrigins(): Promise<string[]> {
  await ensureStorageMigrated();
  return (await read<string[]>(ORIGINS_KEY)) ?? [];
}

export async function approveOrigin(origin: string): Promise<void> {
  const origins = await loadApprovedOrigins();
  if (!origins.includes(origin)) await write(ORIGINS_KEY, [...origins, origin]);
}

export async function revokeOrigin(origin: string): Promise<void> {
  const origins = await loadApprovedOrigins();
  await write(
    ORIGINS_KEY,
    origins.filter((entry) => entry !== origin),
  );
}

/**
 * Pending signing requests.
 *
 * Persisted so the approval tab can be reopened (or reloaded) without losing the
 * request: an approval flow that dies with a service-worker restart would be a
 * wallet that randomly refuses to sign.
 */
export async function loadPending(): Promise<PendingRequest[]> {
  await ensureStorageMigrated();
  return (await read<PendingRequest[]>(PENDING_KEY)) ?? [];
}

export async function putPending(request: PendingRequest): Promise<void> {
  const all = await loadPending();
  await write(
    PENDING_KEY,
    [...all.filter((entry) => entry.id !== request.id), request],
  );
}

export async function getPending(id: string): Promise<PendingRequest | null> {
  const all = await loadPending();
  return all.find((entry) => entry.id === id) ?? null;
}

export async function removePending(id: string): Promise<void> {
  const all = await loadPending();
  await write(
    PENDING_KEY,
    all.filter((entry) => entry.id !== id),
  );
}

/** The derivation helpers live in @netproof/companion and are re-exported here so
 * host screens have a single import site. */
export { primaryAccount, resolveAccounts, DEFAULT_SETTINGS } from '@netproof/companion';
