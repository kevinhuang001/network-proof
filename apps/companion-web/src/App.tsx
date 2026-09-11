import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_SETTINGS,
  allAddresses,
  chainLabel,
  fetchBalance,
  isSolanaChain,
  listAccounts,
  type CompanionSettings,
  type ConnectedWallet,
  type PendingRequest,
  type ResolvedAccount,
} from '@netproof/companion';
import {
  activeWallet,
  clearActivity,
  clearWallets,
  loadActivity,
  loadApprovedOrigins,
  loadSettings,
  loadWalletState,
  putPending,
  recordActivity,
  removeWallet,
  saveSettings,
  selectWallet,
  updateWallet,
  upsertWallet,
  type ActivityRecord,
  type WalletRecord,
  type WalletState,
} from './lib/store';
import { Alert, Badge, Button, Spinner, Toast, shortAddress, useToast } from './ui/kit';
import { BrandMark } from './ui/brand';
import { ChainLogo, CheckIcon } from './ui/icons';
import { ConnectScreen } from './screens/Connect';
import { StartScreen } from './screens/Start';
import { SignScreen } from './screens/Sign';
import {
  AddTokenScreen,
  AssetScreen,
  HomeScreen,
  ReceiveScreen,
  formatEth,
  useVisibleAccounts,
} from './screens/Wallet';
import { SendScreen } from './screens/Send';
import { ManageScreen } from './screens/Manage';
import { AdvancedScreen, DeveloperScreen, SettingsScreen } from './screens/Settings';

/**
 * The companion wallet shell.
 *
 * Shaped like a wallet, not like a hardware wallet's remote control. The things a
 * person does with a wallet are a click away — see the balance, switch account,
 * send, receive, check activity — and the air gap surfaces only where it must: the
 * moment a signature is needed.
 *
 * Nothing security-relevant is hidden by that reshaping. Every signature still goes
 * to the offline device's own screen, and the companion still re-verifies the answer
 * against the exact fields the user approved.
 */

export type Route =
  | { name: 'home' }
  | { name: 'connect' }
  | { name: 'wallets' }
  /** One asset, and the screen where its send and receive buttons live. */
  | { name: 'asset'; asset: string; symbol: string; label: string }
  | { name: 'send'; token?: string }
  | { name: 'receive' }
  | { name: 'add-token' }
  | { name: 'sign'; id: string }
  | { name: 'settings' }
  | { name: 'advanced' }
  | { name: 'developer' };

interface CompanionValue {
  /** The active wallet, or null when nothing is paired. */
  wallet: WalletRecord | null;
  /** Every paired wallet. The outermost object in this app is a wallet, not an account. */
  wallets: WalletRecord[];
  settings: CompanionSettings;
  approvedOrigins: string[];
  activity: ActivityRecord[];
  route: Route;
  navigate: (route: Route) => void;
  refresh: () => void;
  updateSettings: (patch: Partial<CompanionSettings>) => void;
  pair: (wallet: ConnectedWallet, preferredChainId?: number) => void;
  /** Switch wallets. The account selection follows the wallet, not the app. */
  activateWallet: (id: string) => void;
  renameWallet: (id: string, name: string) => void;
  forgetWallet: (id: string) => void;
  unpair: () => void;
  addOrigin: (origin: string) => void;
  dropOrigin: (origin: string) => void;
  addActivity: (record: ActivityRecord) => void;
  clearActivities: () => void;
  requestSigning: (request: Omit<PendingRequest, 'id' | 'createdAt'>) => string;
  show: (message: string) => void;
}

const CompanionContext = createContext<CompanionValue | null>(null);

export function useCompanion(): CompanionValue {
  const value = useContext(CompanionContext);
  if (!value) throw new Error('useCompanion must be used inside <CompanionProvider>');
  return value;
}

function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/u, '');
  if (path.startsWith('/connect')) return { name: 'connect' };
  if (path.startsWith('/wallets')) return { name: 'wallets' };
  if (path.startsWith('/asset/')) {
    const [asset = 'native', symbol = '', label = ''] = path.slice('/asset/'.length).split('|');
    return { name: 'asset', asset, symbol, label };
  }
  // `/send/<token address>` opens the send form already pointed at that token.
  if (path.startsWith('/send/')) return { name: 'send', token: path.slice('/send/'.length) };
  if (path.startsWith('/send')) return { name: 'send' };
  if (path.startsWith('/receive')) return { name: 'receive' };
  // Accounts and wallets are managed in one place; the old hash still lands there.
  if (path.startsWith('/accounts')) return { name: 'wallets' };
  if (path.startsWith('/add-token')) return { name: 'add-token' };
  if (path.startsWith('/sign/')) return { name: 'sign', id: path.slice('/sign/'.length) };
  if (path.startsWith('/settings')) return { name: 'settings' };
  if (path.startsWith('/advanced')) return { name: 'advanced' };
  if (path.startsWith('/developer')) return { name: 'developer' };
  return { name: 'home' };
}

/**
 * Settings that live on a wallet rather than on the app. Kept in one place so the split is
 * visible: `updateSettings` routes these keys to the active wallet and everything else to
 * the global record, which lets every existing screen keep calling `updateSettings`.
 */
const WALLET_SCOPED = ['accountIndex', 'addressIndex', 'visibleAccounts'] as const;

function splitSettings(patch: Partial<CompanionSettings>): {
  scoped: Partial<CompanionSettings>;
  global: Partial<CompanionSettings>;
} {
  const scoped: Record<string, unknown> = {};
  const global: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if ((WALLET_SCOPED as readonly string[]).includes(key)) scoped[key] = value;
    else global[key] = value;
  }
  return { scoped: scoped as Partial<CompanionSettings>, global: global as Partial<CompanionSettings> };
}

function CompanionProvider({ children }: { children: ReactNode }): ReactNode {
  const [state, setState] = useState<WalletState>({ wallets: [], activeId: null });
  const [globalSettings, setGlobalSettings] = useState<CompanionSettings>(DEFAULT_SETTINGS);
  const [approvedOrigins, setApprovedOrigins] = useState<string[]>([]);
  const [activity, setActivity] = useState<ActivityRecord[]>([]);
  const [route, setRoute] = useState<Route>({ name: 'home' });
  const [ready, setReady] = useState(false);
  const { toast, show } = useToast();

  const refresh = useCallback(() => {
    setState(loadWalletState());
    setGlobalSettings(loadSettings());
    setApprovedOrigins(loadApprovedOrigins());
    setActivity(loadActivity());
  }, []);

  const wallet = activeWallet(state);

  // What every screen sees: global preferences, plus the active wallet's own selection.
  const settings = useMemo<CompanionSettings>(
    () => ({
      ...globalSettings,
      ...(wallet
        ? {
            accountIndex: wallet.accountIndex,
            addressIndex: wallet.addressIndex,
            visibleAccounts: wallet.visibleAccounts,
          }
        : {}),
    }),
    [globalSettings, wallet],
  );

  useEffect(() => {
    refresh();
    setRoute(parseRoute(window.location.hash));
    setReady(true);
    const onHash = (): void => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [refresh]);

  const navigate = useCallback((next: Route) => {
    const hash =
      next.name === 'sign'
        ? `#/sign/${next.id}`
        : next.name === 'asset'
          ? `#/asset/${next.asset}|${next.symbol}|${next.label}`
          : next.name === 'send' && next.token
            ? `#/send/${next.token}`
            : next.name === 'home'
              ? '#/'
              : `#/${next.name}`;
    if (window.location.hash === hash) setRoute(next);
    else window.location.hash = hash;
    window.scrollTo({ top: 0 });
  }, []);

  const updateSettings = useCallback(
    (patch: Partial<CompanionSettings>) => {
      const { scoped, global } = splitSettings(patch);
      if (Object.keys(global).length > 0) setGlobalSettings(saveSettings(global));
      if (Object.keys(scoped).length > 0 && wallet) {
        setState(updateWallet(wallet.id, scoped as Partial<WalletRecord>));
      }
    },
    [wallet],
  );

  const pair = useCallback(
    (next: ConnectedWallet, preferredChainId?: number) => {
      // A newly paired wallet starts on one visible account, like a fresh wallet — and on
      // the network the user picked on the device, so the token list is right on arrival.
      const known =
        preferredChainId !== undefined && loadSettings().rpcUrls[preferredChainId] !== undefined;
      setState(upsertWallet(next, { accountIndex: 0, addressIndex: 0, visibleAccounts: 1 }));
      if (known) setGlobalSettings(saveSettings({ chainId: preferredChainId }));
      setApprovedOrigins(loadApprovedOrigins());
    },
    [],
  );

  const activateWallet = useCallback((id: string) => {
    setState(selectWallet(id));
  }, []);

  const renameWallet = useCallback((id: string, name: string) => {
    const trimmed = name.trim();
    setState(updateWallet(id, { name: trimmed.length > 0 ? trimmed : '硬件钱包' }));
  }, []);

  const forgetWallet = useCallback((id: string) => {
    setState(removeWallet(id));
  }, []);

  const unpair = useCallback(() => {
    clearWallets();
    clearActivity();
    refresh();
  }, [refresh]);

  const addOrigin = useCallback(
    (origin: string) => {
      const origins = loadApprovedOrigins();
      if (!origins.includes(origin)) {
        window.localStorage.setItem('netproof.companion.origins.v1', JSON.stringify([...origins, origin]));
      }
      refresh();
    },
    [refresh],
  );

  const dropOrigin = useCallback(
    (origin: string) => {
      window.localStorage.setItem(
        'netproof.companion.origins.v1',
        JSON.stringify(loadApprovedOrigins().filter((entry) => entry !== origin)),
      );
      refresh();
    },
    [refresh],
  );

  const addActivity = useCallback((record: ActivityRecord) => {
    recordActivity(record);
    setActivity(loadActivity());
  }, []);

  const clearActivities = useCallback(() => {
    clearActivity();
    setActivity([]);
  }, []);

  const requestSigning = useCallback<CompanionValue['requestSigning']>(
    (partial) => {
      const id = `0x${Array.from(crypto.getRandomValues(new Uint8Array(16)))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('')}`;
      putPending({ ...partial, id, createdAt: Date.now() });
      navigate({ name: 'sign', id });
      return id;
    },
    [navigate],
  );

  const value = useMemo<CompanionValue>(
    () => ({
      wallet,
      wallets: state.wallets,
      settings,
      approvedOrigins,
      activity,
      route,
      navigate,
      refresh,
      updateSettings,
      pair,
      activateWallet,
      renameWallet,
      forgetWallet,
      unpair,
      addOrigin,
      dropOrigin,
      addActivity,
      clearActivities,
      requestSigning,
      show,
    }),
    [
      wallet,
      state.wallets,
      settings,
      approvedOrigins,
      activity,
      route,
      navigate,
      refresh,
      updateSettings,
      pair,
      unpair,
      addOrigin,
      dropOrigin,
      addActivity,
      clearActivities,
      requestSigning,
      show,
    ],
  );

  if (!ready) {
    return (
      <div className="np-app" style={{ alignItems: 'center', paddingTop: 140 }}>
        <Spinner />
      </div>
    );
  }

  return (
    <CompanionContext.Provider value={value}>
      {children}
      <Toast message={toast} />
    </CompanionContext.Provider>
  );
}

export function App(): ReactNode {
  return (
    <CompanionProvider>
      <Shell />
    </CompanionProvider>
  );
}

function Shell(): ReactNode {
  const { route, wallet } = useCompanion();

  // With nothing paired there is no wallet to lay out around, so the empty state is
  // the whole app. Settings remains reachable because the RPC endpoint may need
  // setting before a device is ever connected.
  if (!wallet && route.name !== 'settings' && route.name !== 'connect') {
    return (
      <div className="np-app">
        <StartScreen />
      </div>
    );
  }

  return (
    <div className="np-app">
      {wallet ? <TopBar /> : null}
      {route.name === 'home' ? <HomeScreen /> : null}
      {route.name === 'connect' ? <ConnectScreen /> : null}
      {route.name === 'wallets' ? <ManageScreen /> : null}
      {route.name === 'asset' ? (
        <AssetScreen asset={route.asset} symbol={route.symbol} label={route.label} />
      ) : null}
      {route.name === 'send' ? (
        <SendScreen {...(route.token !== undefined ? { token: route.token } : {})} />
      ) : null}
      {route.name === 'receive' ? <ReceiveScreen /> : null}
      {route.name === 'add-token' ? <AddTokenScreen /> : null}
      {route.name === 'sign' ? <SignScreen id={route.id} /> : null}
      {route.name === 'settings' ? <SettingsScreen /> : null}
      {route.name === 'advanced' ? <AdvancedScreen /> : null}
      {route.name === 'developer' ? <DeveloperScreen /> : null}
    </div>
  );
}

/**
 * The header.
 *
 * Network on the left, and one control on the right that names the wallet *and* the
 * account inside it — because "Account 01" means nothing on its own once two wallets are
 * paired, and the user asked which of their two wallets they were looking at.
 */
function TopBar(): ReactNode {
  const { settings, updateSettings, navigate, wallet, wallets, activateWallet, show } = useCompanion();
  const [openMenu, setOpenMenu] = useState<'network' | 'account' | null>(null);
  const [expanded, setExpanded] = useState<string | null>(wallet?.id ?? null);

  const { accounts } = useVisibleAccounts();
  const current = accounts[settings.addressIndex] ?? accounts[0];
  const balances = useNativeBalances(
    wallets.flatMap((entry) => accountsOf(entry, settings).map((account) => account.address)),
  );

  return (
    <>
      <header className="np-header" style={{ gap: 8 }}>
        <button
          type="button"
          className="np-icon-btn np-icon-btn--plain"
          onClick={() => navigate({ name: 'home' })}
          aria-label="回到钱包首页"
        >
          <BrandMark />
        </button>
        <button
          type="button"
          className="np-chip"
          onClick={() => setOpenMenu(openMenu === 'network' ? null : 'network')}
        >
          <ChainLogo chainId={settings.chainId} size={18} />
          {chainLabel(settings.chainId)}
          <span style={{ opacity: 0.5 }}>▾</span>
        </button>

        <div className="np-grow" />

        <button
          type="button"
          className="np-chip"
          onClick={() => {
            setExpanded(wallet?.id ?? null);
            setOpenMenu(openMenu === 'account' ? null : 'account');
          }}
          disabled={!wallet}
          aria-label="切换钱包或账户"
        >
          <span style={{ display: 'grid', lineHeight: 1.15, textAlign: 'left' }}>
            <span style={{ fontSize: 11, opacity: 0.6 }}>{wallet?.name}</span>
            <span>{current?.name ?? '账户'}</span>
          </span>
          <span style={{ opacity: 0.5 }}>▾</span>
        </button>
      </header>

      {openMenu ? (
        <div className="np-mask" style={{ alignItems: 'flex-start', paddingTop: 60 }} onClick={() => setOpenMenu(null)}>
          <div
            className="np-sheet"
            style={{ margin: '0 16px', borderRadius: 20, maxWidth: 420 }}
            onClick={(event) => event.stopPropagation()}
          >
            {openMenu === 'network' ? (
              <>
                <div className="np-label">网络</div>
                {Object.keys(settings.rpcUrls)
                  .map(Number)
                  .sort((a, b) => a - b)
                  .map((chainId) => (
                    <button
                      key={chainId}
                      type="button"
                      className="np-list__item"
                      style={{ borderRadius: 12 }}
                      onClick={() => {
                        updateSettings({ chainId });
                        setOpenMenu(null);
                      }}
                    >
                      <ChainLogo chainId={chainId} size={22} />
                      <span className="np-grow">{chainLabel(chainId)}</span>
                      {chainId === settings.chainId ? <Badge tone="accent">当前</Badge> : null}
                    </button>
                  ))}
                <Button variant="ghost" onClick={() => { setOpenMenu(null); navigate({ name: 'settings' }); }}>
                  RPC 与其它设置
                </Button>
              </>
            ) : (
              <>
                {/*
                  Wallets are groups; accounts are what you pick. Collapsed by default
                  except for the wallet you are in, so the list stays short with several
                  wallets paired.
                */}
                {wallets.map((entry) => {
                  const open = expanded === entry.id;
                  const itsAccounts = accountsOf(entry, settings);
                  const active = entry.id === wallet?.id;
                  return (
                    <div key={entry.id}>
                      <button
                        type="button"
                        className="np-list__item"
                        style={{ borderRadius: 12 }}
                        onClick={() => setExpanded(open ? null : entry.id)}
                        aria-expanded={open}
                      >
                        <span className="np-grow">{entry.name}</span>
                        {active ? <Badge tone="accent">使用中</Badge> : null}
                        <span style={{ opacity: 0.5 }}>{open ? '⌃' : '⌄'}</span>
                      </button>

                      {open
                        ? itsAccounts.map((account, index) => (
                            <button
                              key={account.path}
                              type="button"
                              className="np-list__item"
                              style={{ borderRadius: 12, paddingLeft: 18 }}
                              onClick={() => {
                                if (!active) activateWallet(entry.id);
                                updateSettings({ addressIndex: index });
                                setOpenMenu(null);
                              }}
                            >
                              <span
                                style={{
                                  width: 26,
                                  height: 26,
                                  borderRadius: 999,
                                  background: 'var(--np-bg-sunken)',
                                  display: 'grid',
                                  placeItems: 'center',
                                  fontSize: 11,
                                  fontWeight: 700,
                                }}
                              >
                                {index + 1}
                              </span>
                              <span className="np-grow" style={{ minWidth: 0 }}>
                                <span className="np-subtitle" style={{ display: 'block' }}>
                                  {account.name}
                                </span>
                                <span className="np-mono np-ink-3" style={{ fontSize: 12 }}>
                                  {shortAddress(account.address, 6, 4)}
                                </span>
                              </span>
                              <span className="np-num np-ink-3">{balances[account.address.toLowerCase()] ?? ''}</span>
                              {active && index === settings.addressIndex ? <CheckIcon size={18} /> : null}
                            </button>
                          ))
                        : null}

                      {open ? (
                        <button
                          type="button"
                          className="np-list__item"
                          style={{ borderRadius: 12, paddingLeft: 18 }}
                          onClick={() => {
                            if (!active) activateWallet(entry.id);
                            if (itsAccounts.length >= maxAccounts(entry, settings)) {
                              show('没有更多可显示地址了，请到「设置 → 账户」提高派生数量');
                              return;
                            }
                            setStateVisibleAccounts(entry, itsAccounts.length + 1, active, updateSettings);
                            setOpenMenu(null);
                          }}
                        >
                          <span className="np-grow">+ 添加账户</span>
                        </button>
                      ) : null}
                    </div>
                  );
                })}

                <div className="np-grid-2" style={{ marginTop: 10 }}>
                  <Button variant="secondary" onClick={() => { setOpenMenu(null); navigate({ name: 'wallets' }); }}>
                    管理
                  </Button>
                  <Button variant="ghost" onClick={() => { setOpenMenu(null); navigate({ name: 'connect' }); }}>
                    添加钱包
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

/** How many accounts a wallet can reveal: what the device exported, times the depth. */
function maxAccounts(entry: WalletRecord, settings: CompanionSettings): number {
  if (isSolanaChain(settings.chainId)) return entry.addresses?.length ?? 0;
  return (
    listAccounts(entry, settings.schemeId).length * Math.max(1, settings.addressCount)
  );
}

/** The accounts a wallet would show, honouring that wallet's own visible count. */
function accountsOf(entry: WalletRecord, settings: CompanionSettings): NamedAccount[] {
  const scoped: CompanionSettings = {
    ...settings,
    addressIndex: entry.addressIndex,
    visibleAccounts: entry.visibleAccounts,
  };
  return allAddresses(entry, scoped)
    .slice(0, Math.max(1, entry.visibleAccounts))
    .map((account, index) => ({
      ...account,
      ordinal: index + 1,
      name: settings.accountNames[account.address.toLowerCase()] ?? `账户 ${index + 1}`,
    }));
}

interface NamedAccount extends ResolvedAccount {
  ordinal: number;
  name: string;
}

function setStateVisibleAccounts(
  entry: WalletRecord,
  next: number,
  isActive: boolean,
  updateSettings: (patch: Partial<CompanionSettings>) => void,
): void {
  if (isActive) {
    updateSettings({ visibleAccounts: next });
    return;
  }
  // A wallet that is not active cannot go through `updateSettings`, which writes to the
  // active wallet; the next switch picks the count up from its own record.
  updateWallet(entry.id, { visibleAccounts: next });
}

/**
 * Native balances for every account in every wallet, for the switcher.
 *
 * Native only, and deliberately so: pricing every token on every chain is a job for an
 * indexer, and this wallet refuses to talk to one. Rows therefore show what the chain
 * itself can answer in one call each.
 */
function useNativeBalances(addresses: string[]): Record<string, string> {
  const { settings } = useCompanion();
  const [balances, setBalances] = useState<Record<string, string>>({});
  const key = addresses.map((entry) => entry.toLowerCase()).sort().join(',');

  useEffect(() => {
    const rpcUrl = settings.rpcUrls[settings.chainId];
    if (!rpcUrl || key.length === 0) return;
    let cancelled = false;
    void (async () => {
      const next: Record<string, string> = {};
      for (const address of key.split(',')) {
        try {
          const raw = await fetchBalance(address, { rpcUrl, chainId: settings.chainId });
          next[address] = formatEth(raw);
        } catch {
          // Leave the row blank rather than inventing a number.
        }
      }
      if (!cancelled) setBalances(next);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, settings.chainId, settings.rpcUrls]);

  return balances;
}

export { Alert, Button };
