import type { ConnectedWallet, CompanionSettings, PendingRequest } from '@netproof/companion';
import { DEFAULT_SETTINGS } from '@netproof/companion';

/**
 * Browser storage for the web companion.
 *
 * Same contract as the Chrome extension's storage, backed by `localStorage`
 * instead of `chrome.storage.local`. What is stored is identical and equally
 * boring: extended public keys, derivation templates, settings and the list of
 * approved origins. There is no private key, no mnemonic and no seed anywhere in
 * this application.
 *
 * Because the web companion runs on an origin the user also visits dApps from,
 * `localStorage` is exposed to any script that achieves XSS on that origin. That is
 * a real difference from an extension, and it is why nothing secret is stored here:
 * the worst an attacker gains is the ability to *watch* the wallet and to *ask* the
 * device for a signature that the user still has to approve on its own screen.
 */

const PREFIX = 'netproof.companion.';
const WALLET_KEY = `${PREFIX}wallet.v1`;
const SETTINGS_KEY = `${PREFIX}settings.v1`;
const ORIGINS_KEY = `${PREFIX}origins.v1`;
const PENDING_KEY = `${PREFIX}pending.v1`;
const ACTIVITY_KEY = `${PREFIX}activity.v1`;

function storage(): Storage | null {
  try {
    const probe = `${PREFIX}probe`;
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    // Private browsing and some embedded webviews throw rather than returning null.
    return null;
  }
}

function read<T>(key: string): T | null {
  const raw = storage()?.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  storage()?.setItem(key, JSON.stringify(value));
}

export function loadWallet(): ConnectedWallet | null {
  return read<ConnectedWallet>(WALLET_KEY);
}

export function saveWallet(wallet: ConnectedWallet): void {
  write(WALLET_KEY, wallet);
}

export function clearWallet(): void {
  const area = storage();
  if (!area) return;
  area.removeItem(WALLET_KEY);
  area.removeItem(ORIGINS_KEY);
  area.removeItem(PENDING_KEY);
}

export function loadSettings(): CompanionSettings {
  const stored = read<Partial<CompanionSettings>>(SETTINGS_KEY);
  return {
    ...DEFAULT_SETTINGS,
    ...(stored ?? {}),
    rpcUrls: { ...DEFAULT_SETTINGS.rpcUrls, ...(stored?.rpcUrls ?? {}) },
  };
}

export function saveSettings(patch: Partial<CompanionSettings>): CompanionSettings {
  const next = { ...loadSettings(), ...patch };
  write(SETTINGS_KEY, next);
  return next;
}

export function loadApprovedOrigins(): string[] {
  return read<string[]>(ORIGINS_KEY) ?? [];
}

export function approveOrigin(origin: string): void {
  const origins = loadApprovedOrigins();
  if (!origins.includes(origin)) write(ORIGINS_KEY, [...origins, origin]);
}

export function revokeOrigin(origin: string): void {
  write(
    ORIGINS_KEY,
    loadApprovedOrigins().filter((entry) => entry !== origin),
  );
}

export function loadPending(): PendingRequest[] {
  return read<PendingRequest[]>(PENDING_KEY) ?? [];
}

export function putPending(request: PendingRequest): void {
  write(PENDING_KEY, [...loadPending().filter((entry) => entry.id !== request.id), request]);
}

export function getPending(id: string): PendingRequest | null {
  return loadPending().find((entry) => entry.id === id) ?? null;
}

export function removePending(id: string): void {
  write(
    PENDING_KEY,
    loadPending().filter((entry) => entry.id !== id),
  );
}

/** Identity of the page itself, used as the "origin" when a local dApp asks. */
export function selfOrigin(): string {
  return typeof window === 'undefined' ? 'netproof://local' : window.location.origin;
}

// ---------------------------------------------------------------------------
// Activity log
// ---------------------------------------------------------------------------

/**
 * What this wallet did, as far as it can know.
 *
 * Deliberately a *local* log rather than a chain query. Reading a full history the
 * way MetaMask does requires an indexer service, and pointing this wallet at one
 * would leak every address it watches to a third party for no functional gain. A
 * local record of "transactions this wallet initiated" is honest about being
 * partial, costs no privacy, and is exactly the information a user needs to answer
 * "did that send go through?".
 */
export interface ActivityRecord {
  hash: string;
  chainId: number;
  from: string;
  to: string | null;
  /** Value in wei, as a decimal string. */
  value: string;
  /** Human label captured at send time, so a rename later does not rewrite history. */
  kind: 'send' | 'contract';
  status: 'broadcast' | 'signed' | 'failed';
  timestamp: number;
  /** Set when broadcasting failed, so the payload is not silently lost. */
  rawTransaction?: string;
  error?: string;
}

export function loadActivity(): ActivityRecord[] {
  return read<ActivityRecord[]>(ACTIVITY_KEY) ?? [];
}

export function recordActivity(record: ActivityRecord): void {
  const all = loadActivity().filter((entry) => entry.hash !== record.hash);
  write(ACTIVITY_KEY, [record, ...all].slice(0, 200));
}

export function clearActivity(): void {
  storage()?.removeItem(ACTIVITY_KEY);
}

// ---------------------------------------------------------------------------
// Account naming
// ---------------------------------------------------------------------------

const ADJECTIVES = [
  '静默', '离线', '冷存', '主', '备用', '储蓄', '日常', '测试', '观察', '长期',
];

/** A stable, friendly default name for an account index, MetaMask-style. */
export function defaultAccountName(index: number): string {
  const adjective = ADJECTIVES[index % ADJECTIVES.length];
  return index < ADJECTIVES.length ? `${adjective}账户` : `账户 ${index + 1}`;
}

// ---------------------------------------------------------------------------
// Token list
// ---------------------------------------------------------------------------

const TOKENS_KEY = `${PREFIX}tokens.v1`;

export interface StoredToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  chainId: number;
}

/**
 * Tokens the user has added, per chain.
 *
 * Curated token lists are how wallets usually populate this screen, and every one of
 * them is a third party that learns what you hold. Adding a contract address by hand
 * costs the user one paste and keeps the wallet's token list private.
 */
export function loadTokens(chainId: number): StoredToken[] {
  const all = read<Record<string, StoredToken[]>>(TOKENS_KEY) ?? {};
  return all[String(chainId)] ?? [];
}

export function addToken(token: StoredToken): void {
  const all = read<Record<string, StoredToken[]>>(TOKENS_KEY) ?? {};
  const key = String(token.chainId);
  const existing = all[key] ?? [];
  const deduped = existing.filter(
    (entry) => entry.address.toLowerCase() !== token.address.toLowerCase(),
  );
  write(TOKENS_KEY, { ...all, [key]: [...deduped, token] });
}

export function removeToken(chainId: number, address: string): void {
  const all = read<Record<string, StoredToken[]>>(TOKENS_KEY) ?? {};
  const key = String(chainId);
  write(TOKENS_KEY, {
    ...all,
    [key]: (all[key] ?? []).filter(
      (entry) => entry.address.toLowerCase() !== address.toLowerCase(),
    ),
  });
}
