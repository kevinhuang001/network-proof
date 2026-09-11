import type { ConnectedWallet, CompanionSettings, PendingRequest } from '@netproof/companion';
import type { PasscodeRecord } from './lock';
import { DEFAULT_SETTINGS, defaultTokens } from '@netproof/companion';

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
/** Pre-multi-wallet key. Read once, migrated, then removed. */
const LEGACY_WALLET_KEY = `${PREFIX}wallet.v1`;
const WALLETS_KEY = `${PREFIX}wallets.v1`;
const SETTINGS_KEY = `${PREFIX}settings.v1`;
const ORIGINS_KEY = `${PREFIX}origins.v1`;
const PENDING_KEY = `${PREFIX}pending.v1`;
const ACTIVITY_KEY = `${PREFIX}activity.v1`;
const PASSCODE_KEY = `${PREFIX}passcode.v1`;
const LOCKED_KEY = `${PREFIX}locked.v1`;

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

// ---------------------------------------------------------------------------
// Wallets
// ---------------------------------------------------------------------------

/**
 * Settings that belong to a *wallet* rather than to the app.
 *
 * Which account you are looking at is a property of the wallet you are looking at: with
 * several paired, a single global "account 3" would move the selection under the user
 * every time they switched, and the address they were about to send to would change
 * while they were reading it.
 */
export interface WalletScopedSettings {
  accountIndex: number;
  addressIndex: number;
  visibleAccounts: number;
}

/**
 * A paired device wallet.
 *
 * `id` is the BIP32 master fingerprint, which is already the wallet's stable identity:
 * the same mnemonic and passphrase always produce it, and two different ones never
 * collide. Pairing the same device twice therefore *updates* a wallet instead of adding
 * a duplicate, which is what a user re-scanning for a refreshed account list expects.
 */
export interface WalletRecord extends ConnectedWallet, WalletScopedSettings {
  id: string;
  /** User-facing name. Defaults to the device's own name. */
  name: string;
  pairedAt: number;
}

export interface WalletState {
  wallets: WalletRecord[];
  activeId: string | null;
}

const EMPTY_STATE: WalletState = { wallets: [], activeId: null };

export function loadWalletState(): WalletState {
  const stored = read<WalletState>(WALLETS_KEY);
  if (stored && Array.isArray(stored.wallets)) {
    return {
      wallets: stored.wallets,
      activeId: stored.activeId ?? stored.wallets[0]?.id ?? null,
    };
  }

  // One-time migration from the single-wallet layout. The old record keeps its place as
  // the active wallet, and the account selection that used to live in settings moves onto
  // it, so an existing user opens the app exactly where they left it.
  const legacy = read<ConnectedWallet>(LEGACY_WALLET_KEY);
  if (!legacy) return EMPTY_STATE;
  const scoped = loadSettings();
  const record: WalletRecord = {
    ...legacy,
    id: legacy.masterFingerprint,
    name: legacy.device?.name ?? '硬件钱包',
    pairedAt: legacy.connectedAt ?? Date.now(),
    accountIndex: scoped.accountIndex,
    addressIndex: scoped.addressIndex,
    visibleAccounts: scoped.visibleAccounts,
  };
  const migrated: WalletState = { wallets: [record], activeId: record.id };
  write(WALLETS_KEY, migrated);
  storage()?.removeItem(LEGACY_WALLET_KEY);
  return migrated;
}

function saveWalletState(state: WalletState): WalletState {
  write(WALLETS_KEY, state);
  return state;
}

/** The active wallet, or the first one if the active id went stale. */
export function activeWallet(state: WalletState): WalletRecord | null {
  return state.wallets.find((entry) => entry.id === state.activeId) ?? state.wallets[0] ?? null;
}

/**
 * Add or update a wallet, and make it active.
 *
 * Re-pairing the same fingerprint updates in place and keeps the user's own name: the
 * device reports itself as "NetProof Air", and overwriting a name the user chose with the
 * device's default would undo their work every time they refreshed an account list.
 */
export function upsertWallet(
  wallet: ConnectedWallet,
  preferred?: Partial<WalletScopedSettings> & { name?: string },
): WalletState {
  const state = loadWalletState();
  const id = wallet.masterFingerprint;
  const existing = state.wallets.find((entry) => entry.id === id);
  const defaults = loadSettings();
  const record: WalletRecord = {
    ...wallet,
    id,
    // A name the user typed wins; otherwise keep what the wallet already had, and only
    // fall back to the device's own name for a first pairing with no name given.
    name: preferred?.name?.trim() || existing?.name || wallet.device?.name || '硬件钱包',
    pairedAt: existing?.pairedAt ?? Date.now(),
    accountIndex: preferred?.accountIndex ?? existing?.accountIndex ?? 0,
    addressIndex: preferred?.addressIndex ?? existing?.addressIndex ?? 0,
    visibleAccounts: preferred?.visibleAccounts ?? existing?.visibleAccounts ?? defaults.visibleAccounts,
  };
  const wallets = existing
    ? state.wallets.map((entry) => (entry.id === id ? record : entry))
    : [...state.wallets, record];
  return saveWalletState({ wallets, activeId: id });
}

export function updateWallet(id: string, patch: Partial<WalletRecord>): WalletState {
  const state = loadWalletState();
  return saveWalletState({
    ...state,
    wallets: state.wallets.map((entry) => (entry.id === id ? { ...entry, ...patch, id: entry.id } : entry)),
  });
}

export function selectWallet(id: string): WalletState {
  const state = loadWalletState();
  if (!state.wallets.some((entry) => entry.id === id)) return state;
  return saveWalletState({ ...state, activeId: id });
}

/**
 * Forget one wallet.
 *
 * The activity log is keyed by address, not by wallet, so it is left alone: a send that
 * happened is still a fact about the chain, and the user may still be looking at that hash.
 */
export function removeWallet(id: string): WalletState {
  const state = loadWalletState();
  const wallets = state.wallets.filter((entry) => entry.id !== id);
  const activeId = state.activeId === id ? (wallets[0]?.id ?? null) : state.activeId;
  return saveWalletState({ wallets, activeId });
}

/** Forget everything this app knows about paired wallets, and their approvals. */
export function clearWallets(): void {
  const area = storage();
  if (!area) return;
  area.removeItem(WALLETS_KEY);
  area.removeItem(LEGACY_WALLET_KEY);
  area.removeItem(ORIGINS_KEY);
  area.removeItem(PENDING_KEY);
}

/**
 * Endpoints that are known not to work, and what to use instead.
 *
 * `api.mainnet-beta.solana.com` 403s any request with an `Origin` header, so a browser can
 * never talk to it — but a user who paired before that was fixed has it stored, and stored
 * settings win over defaults. Without this, their Solana balance stays broken forever with
 * no hint about why.
 */
const RETIRED_RPC_URLS: Record<string, string> = {
  'https://api.mainnet-beta.solana.com': 'https://solana-rpc.publicnode.com',
};

export function loadSettings(): CompanionSettings {
  const stored = read<Partial<CompanionSettings>>(SETTINGS_KEY);
  const merged = { ...DEFAULT_SETTINGS.rpcUrls, ...(stored?.rpcUrls ?? {}) };
  const rpcUrls: Record<number, string> = {};
  for (const [chainId, url] of Object.entries(merged)) {
    rpcUrls[Number(chainId)] = RETIRED_RPC_URLS[(url ?? '').trim()] ?? url;
  }
  return {
    ...DEFAULT_SETTINGS,
    ...(stored ?? {}),
    rpcUrls,
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
// Lock
// ---------------------------------------------------------------------------

/**
 * The passcode verifier, and whether the app is currently locked.
 *
 * The verifier is not a secret and is not treated as one: it is an Argon2id output, stored
 * so the passcode can be checked without ever storing the passcode. Losing it (clearing
 * storage) simply means setting a new one.
 */
export function loadPasscode(): PasscodeRecord | null {
  const stored = read<PasscodeRecord>(PASSCODE_KEY);
  return stored && typeof stored.verifier === 'string' ? stored : null;
}

export function savePasscode(record: PasscodeRecord | null): void {
  const area = storage();
  if (!area) return;
  if (record) area.setItem(PASSCODE_KEY, JSON.stringify(record));
  else area.removeItem(PASSCODE_KEY);
}

/**
 * Whether the app should come up locked.
 *
 * Only persisted when a passcode exists. Without one, "locked" would be a screen anyone
 * can dismiss, and surviving a reload would give it a permanence it has not earned — a
 * refresh revealing the wallet is the honest behaviour.
 */
export function loadLocked(): boolean {
  return loadPasscode() !== null && read<boolean>(LOCKED_KEY) === true;
}

export function saveLocked(locked: boolean): void {
  const area = storage();
  if (!area) return;
  if (locked && loadPasscode()) area.setItem(LOCKED_KEY, 'true');
  else area.removeItem(LOCKED_KEY);
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

/**
 * Everything the wallet should show for a chain: the seeded stablecoins plus what the user
 * added, deduplicated by address.
 *
 * A user who pastes USDT's address themselves gets one row, not two: the stored entry wins
 * over the seed, because their copy carries whatever `symbol()` reported when they added it.
 */
export function tokensForChain(chainId: number): StoredToken[] {
  const merged = new Map<string, StoredToken>();
  for (const seed of defaultTokens(chainId)) {
    merged.set(seed.address.toLowerCase(), { ...seed, chainId });
  }
  for (const stored of loadTokens(chainId)) {
    merged.set(stored.address.toLowerCase(), stored);
  }
  return [...merged.values()];
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
