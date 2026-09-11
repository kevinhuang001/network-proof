import type { CompanionSettings, ConnectedWallet, PendingRequest } from '@netproof/companion';
import { DEFAULT_SETTINGS } from '@netproof/companion';

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

const WALLET_KEY = 'netproof.wallet.v1';
const SETTINGS_KEY = 'netproof.settings.v1';
const ORIGINS_KEY = 'netproof.origins.v1';
const PENDING_KEY = 'netproof.pending.v1';

function storage(): chrome.storage.StorageArea {
  return chrome.storage.local;
}

async function read<T>(key: string): Promise<T | null> {
  const result = await storage().get(key);
  return (result[key] as T | undefined) ?? null;
}

async function write(key: string, value: unknown): Promise<void> {
  await storage().set({ [key]: value });
}

/**
 * NOTE: one wallet only.
 *
 * The web companion is the app in use and now holds a *list* of wallets, each with its own
 * account selection (`apps/companion-web/src/lib/store.ts`). This extension keeps the older
 * single-wallet model, so pairing a second device here replaces the first. Porting it means
 * the same storage split, the same `WalletRecord` shape and the same switcher UI; until
 * that happens, do not treat the two companions as interchangeable.
 */
export async function loadWallet(): Promise<ConnectedWallet | null> {
  return read<ConnectedWallet>(WALLET_KEY);
}

export async function saveWallet(wallet: ConnectedWallet): Promise<void> {
  await write(WALLET_KEY, wallet);
}

export async function clearWallet(): Promise<void> {
  await storage().remove([WALLET_KEY, ORIGINS_KEY, PENDING_KEY]);
}

export async function loadSettings(): Promise<CompanionSettings> {
  const stored = await read<Partial<CompanionSettings>>(SETTINGS_KEY);
  return {
    ...DEFAULT_SETTINGS,
    ...(stored ?? {}),
    rpcUrls: { ...DEFAULT_SETTINGS.rpcUrls, ...(stored?.rpcUrls ?? {}) },
  };
}

export async function saveSettings(patch: Partial<CompanionSettings>): Promise<CompanionSettings> {
  const next = { ...(await loadSettings()), ...patch };
  await write(SETTINGS_KEY, next);
  return next;
}

/** Origins the user has approved for dApp connections. */
export async function loadApprovedOrigins(): Promise<string[]> {
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
