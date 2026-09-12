import type { ReactNode } from 'react';
import { AnchoredMenu } from '@netproof/ui/anchored-menu';
import { useSurface } from './surface';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_SETTINGS,
  chainLabel,
  isSolanaChain,
  type CompanionSettings,
  type ConnectedWallet,
  type PendingRequest,
} from '@netproof/companion';
import {
  activeWallet,
  clearActivity,
  clearWallets,
  loadActivity,
  loadApprovedOrigins,
  loadLocked,
  loadPasscode,
  loadSettings,
  loadWalletState,
  saveLocked,
  savePasscode,
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
import { verifyPasscode, type PasscodeRecord } from './lib/lock';
import { Alert, Badge, Button, Spinner, Toast, useToast } from './ui/kit';
import {
  ChainLogo,
  ChevronDownIcon,
  ExternalIcon,
  GearIcon,
  HistoryIcon,
  LockIcon,
  MoreIcon,
} from './ui/icons';
import { ConnectScreen } from './screens/Connect';
import { StartScreen } from './screens/Start';
import { SignScreen } from './screens/Sign';
import { AddressesScreen } from './screens/Addresses';
import { SetPasscodeScreen } from './screens/SetPasscode';
import {
  ActivityScreen,
  AddTokenScreen,
  AssetScreen,
  HomeScreen,
  ReceiveScreen,
  useVisibleAccounts,
} from './screens/Wallet';
import { SendScreen } from './screens/Send';
import { LockScreen } from './screens/Lock';
import { Switcher } from './screens/Switcher';
import { SettingsScreen } from './screens/Settings';

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
  /** One asset — 'native' or a token address. */
  | { name: 'asset'; asset: string }
  | { name: 'activity' }
  | { name: 'addresses' }
  | { name: 'set-passcode'; required: boolean }
  | { name: 'send'; token?: string }
  | { name: 'receive'; token?: string }
  | { name: 'add-token' }
  | { name: 'sign'; id: string }
  | { name: 'settings' };

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
  pair: (wallet: ConnectedWallet, preferredChainId?: number, name?: string) => void;
  /** Switch wallets. The account selection follows the wallet, not the app. */
  activateWallet: (id: string) => void;
  /** Reveal one more account for a wallet. Works for any wallet, active or not. */
  addAccountToWallet: (id: string) => void;
  /**
   * Apply a change to a wallet that is not the active one.
   *
   * Exposed because two actions do it — adding and removing an account — and writing straight
   * to storage for those left the open sheet showing the old list.
   */
  patchWallet: (id: string, patch: Partial<WalletRecord>) => void;
  /** Lock the view. Honest scope: see `screens/Lock.tsx`. */
  locked: boolean;
  hasPasscode: boolean;
  lock: () => void;
  unlock: (passcode: string) => boolean;
  setPasscode: (record: PasscodeRecord | null) => void;
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
  if (path.startsWith('/activity')) return { name: 'activity' };
  if (path.startsWith('/addresses')) return { name: 'addresses' };
  if (path.startsWith('/set-passcode')) return { name: 'set-passcode', required: false };
  if (path.startsWith('/asset/')) {
    return { name: 'asset', asset: path.slice('/asset/'.length) || 'native' };
  }
  // `/send/<token address>` opens the send form already pointed at that token.
  if (path.startsWith('/send/')) return { name: 'send', token: path.slice('/send/'.length) };
  if (path.startsWith('/send')) return { name: 'send' };
  if (path.startsWith('/receive/')) return { name: 'receive', token: path.slice('/receive/'.length) };
  if (path.startsWith('/receive')) return { name: 'receive' };
  if (path.startsWith('/add-token')) return { name: 'add-token' };
  if (path.startsWith('/sign/')) return { name: 'sign', id: path.slice('/sign/'.length) };
  if (path.startsWith('/settings')) return { name: 'settings' };
  return { name: 'home' };
}

/**
 * Settings that live on a wallet rather than on the app. Kept in one place so the split is
 * visible: `updateSettings` routes these keys to the active wallet and everything else to
 * the global record, which lets every existing screen keep calling `updateSettings`.
 */
const WALLET_SCOPED = ['accountIndex', 'addressIndex', 'visibleAccounts', 'hiddenAccounts'] as const;

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
  const [locked, setLocked] = useState(false);
  const [passcode, setPasscodeRecord] = useState<PasscodeRecord | null>(null);
  const [ready, setReady] = useState(false);
  const { toast, show } = useToast();

  const refresh = useCallback(() => {
    setState(loadWalletState());
    setLocked(loadLocked());
    setPasscodeRecord(loadPasscode());
    setGlobalSettings(loadSettings());
    setApprovedOrigins(loadApprovedOrigins());
    setActivity(loadActivity());
  }, []);

  const wallet = activeWallet(state);

  // What every screen sees: global preferences, plus the active wallet's own selection.
  const settings = useMemo<CompanionSettings>(() => {
    if (!wallet) return globalSettings;
    const scoped: CompanionSettings = {
      ...globalSettings,
      accountIndex: wallet.accountIndex,
      addressIndex: wallet.addressIndex,
      visibleAccounts: wallet.visibleAccounts,
      hiddenAccounts: wallet.hiddenAccounts ?? [],
    };
    /*
     * Solana cannot derive accounts, so it can only offer the addresses the device exported.
     * If the user has revealed more accounts than that — which is fine and normal on EVM —
     * the selection is clamped for this chain rather than the chain being refused. Ten
     * accounts is not ten accounts' worth of Solana; it is ten on EVM and five here.
     */
    if (isSolanaChain(scoped.chainId)) {
      const available = Math.max(1, wallet.addresses?.length ?? 1);
      return {
        ...scoped,
        visibleAccounts: Math.min(scoped.visibleAccounts, available),
        addressIndex: Math.min(scoped.addressIndex, available - 1),
      };
    }
    return scoped;
  }, [globalSettings, wallet]);

  useEffect(() => {
    refresh();
    /*
     * A wallet without a passcode is asked for one before anything else — including a wallet
     * paired by an earlier version, which had the option of skipping it. The requirement is
     * about the state the wallet is in, not about the flow that created it.
     */
    const state = loadWalletState();
    const needsPasscode = state.wallets.length > 0 && loadPasscode() === null;
    setRoute(needsPasscode ? { name: 'set-passcode', required: true } : parseRoute(window.location.hash));
    setReady(true);
    const onHash = (): void => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [refresh]);

  const navigate = useCallback((next: Route) => {
    const hash =
      next.name === 'sign'
        ? `#/sign/${next.id}`
        : next.name === 'set-passcode'
          ? '#/set-passcode'
          : next.name === 'asset'
          ? `#/asset/${next.asset}`
          : next.name === 'send' && next.token
            ? `#/send/${next.token}`
            : next.name === 'receive' && next.token
              ? `#/receive/${next.token}`
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
    (next: ConnectedWallet, preferredChainId?: number, name?: string) => {
      // A newly paired wallet starts on one visible account, like a fresh wallet — and on
      // the network the user picked on the device, so the token list is right on arrival.
      const known =
        preferredChainId !== undefined && loadSettings().rpcUrls[preferredChainId] !== undefined;
      setState(
        upsertWallet(next, {
          accountIndex: 0,
          addressIndex: 0,
          visibleAccounts: 1,
          ...(name !== undefined ? { name } : {}),
        }),
      );
      if (known) setGlobalSettings(saveSettings({ chainId: preferredChainId }));
      setApprovedOrigins(loadApprovedOrigins());
    },
    [],
  );

  const activateWallet = useCallback((id: string) => {
    setState(selectWallet(id));
  }, []);

  /*
   * Adding an account writes through the provider, not straight to storage.
   *
   * The switcher used to call the store directly for a wallet that was not the active one,
   * which persisted the change and never told React: the spinner-free UI simply sat there
   * with the old count, so "+ 添加账户" looked like it did nothing.
   */
  const patchWallet = useCallback((id: string, patch: Partial<WalletRecord>) => {
    setState(updateWallet(id, patch));
  }, []);

  const addAccountToWallet = useCallback((id: string) => {
    const target = loadWalletState().wallets.find((entry) => entry.id === id);
    if (!target) return;
    setState(updateWallet(id, { visibleAccounts: target.visibleAccounts + 1 }));
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

  const lock = useCallback(() => {
    saveLocked(true);
    setLocked(true);
    // Drop straight back to the wallet list, so unlocking never lands on whatever half-read
    // screen happened to be open when the user walked away.
    navigate({ name: 'home' });
  }, [navigate]);

  const unlock = useCallback((candidate: string): boolean => {
    const record = loadPasscode();
    if (record && !verifyPasscode(candidate, record)) return false;
    saveLocked(false);
    setLocked(false);
    return true;
  }, []);

  const setPasscode = useCallback((record: PasscodeRecord | null) => {
    savePasscode(record);
    setPasscodeRecord(record);
    if (!record) saveLocked(false);
  }, []);

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
      addAccountToWallet,
      patchWallet,
      locked,
      hasPasscode: passcode !== null,
      lock,
      unlock,
      setPasscode,
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
      addAccountToWallet,
      patchWallet,
      locked,
      passcode,
      lock,
      unlock,
      setPasscode,
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
  const { route, wallet, locked, hasPasscode, unlock, setPasscode } = useCompanion();

  // The lock covers everything, including the empty state: a locked app that still shows
  // "no wallet paired" has told the observer something.
  if (locked) {
    return (
      <div className="np-app">
        <LockScreen
          hasPasscode={hasPasscode}
          onUnlock={unlock}
          setPasscode={(record) => setPasscode(record)}
        />
      </div>
    );
  }

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
      {route.name === 'activity' ? <ActivityScreen /> : null}
      {route.name === 'addresses' ? <AddressesScreen /> : null}
      {route.name === 'set-passcode' ? (
        <SetPasscodeScreen required={route.required} />
      ) : null}
      {route.name === 'asset' ? <AssetScreen asset={route.asset} /> : null}
      {route.name === 'send' ? (
        <SendScreen {...(route.token !== undefined ? { token: route.token } : {})} />
      ) : null}
      {route.name === 'receive' ? (
        <ReceiveScreen {...(route.token !== undefined ? { token: route.token } : {})} />
      ) : null}
      {route.name === 'add-token' ? <AddTokenScreen /> : null}
      {route.name === 'sign' ? <SignScreen id={route.id} /> : null}
      {route.name === 'settings' ? <SettingsScreen /> : null}
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
  const surface = useSurface();
  const { settings, updateSettings, navigate, wallet, lock } = useCompanion();
  const [openMenu, setOpenMenu] = useState<'network' | 'account' | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const kebabRef = useRef<HTMLButtonElement | null>(null);

  const { accounts } = useVisibleAccounts();
  const current = accounts[settings.addressIndex] ?? accounts[0];

  return (
    <>
      <header className="np-header" style={{ gap: 8 }}>
        <button
          type="button"
          className="np-chip"
          onClick={() => setOpenMenu(openMenu === 'network' ? null : 'network')}
        >
          <ChainLogo chainId={settings.chainId} size={18} />
          {chainLabel(settings.chainId)}
          <ChevronDownIcon size={16} />
        </button>

        <div className="np-grow" />

        <button
          type="button"
          className="np-chip"
          onClick={() => setOpenMenu(openMenu === 'account' ? null : 'account')}
          disabled={!wallet}
          aria-label="切换钱包或账户"
        >
          <span style={{ display: 'grid', lineHeight: 1.15, textAlign: 'left' }}>
            <span style={{ fontSize: 11, opacity: 0.6 }}>{wallet?.name}</span>
            <span>{current?.name ?? '账户'}</span>
          </span>
          <ChevronDownIcon size={16} />
        </button>

        {/* Same kebab, same corner, same entries as the device's own menu. */}
        <div className="np-menu">
          <button
            ref={kebabRef}
            type="button"
            className="np-icon-btn np-icon-btn--plain"
            onClick={() => setMenuOpen((previous) => !previous)}
            aria-label="更多"
            aria-expanded={menuOpen}
          >
            <MoreIcon size={22} />
          </button>
          <AnchoredMenu
            open={menuOpen}
            trigger={kebabRef}
            onClose={() => setMenuOpen(false)}
          >
                    <button
                      type="button"
                      className="np-menu__item"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        navigate({ name: 'activity' });
                      }}
                    >
                      <HistoryIcon size={18} />
                      <span className="np-grow">交易历史</span>
                    </button>
                    <button
                      type="button"
                      className="np-menu__item"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        lock();
                      }}
                    >
                      <LockIcon size={18} />
                      <span className="np-grow">锁定</span>
                    </button>
                    <button
                      type="button"
                      className="np-menu__item"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        navigate({ name: 'settings' });
                      }}
                    >
                      <GearIcon size={18} />
                      <span className="np-grow">设置</span>
                    </button>
                    {/* Only a popup has somewhere to go: the full page is where the roomier
                        screens, the camera and the diagnostics live. */}
                    {surface.kind === 'popup' && surface.openInTab ? (
                      <button
                        type="button"
                        className="np-menu__item"
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false);
                          surface.openInTab?.('/');
                        }}
                      >
                        <ExternalIcon size={18} />
                        <span className="np-grow">在标签页中打开</span>
                      </button>
                    ) : null}
          </AnchoredMenu>
        </div>
      </header>

      {openMenu ? (
        <div className="np-mask" style={{ alignItems: 'flex-start', paddingTop: 54 }} onClick={() => setOpenMenu(null)}>
          <div
            className="np-sheet np-sheet--compact"
            style={{ margin: '0 10px', borderRadius: 18, maxWidth: 420 }}
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
              </>
            ) : (
              <Switcher onClose={() => setOpenMenu(null)} />
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

export { Alert, Button };
