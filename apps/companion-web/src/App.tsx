import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_SETTINGS,
  allAddresses,
  chainLabel,
  type CompanionSettings,
  type ConnectedWallet,
  type PendingRequest,
} from '@netproof/companion';
import {
  clearActivity,
  clearWallet,
  recordActivity,
  loadActivity,
  loadApprovedOrigins,
  loadSettings,
  loadWallet,
  putPending,
  saveSettings,
  saveWallet,
  type ActivityRecord,
} from './lib/store';
import { Alert, Badge, Button, Spinner, Toast, shortAddress, useToast } from './ui/kit';
import { ConnectScreen } from './screens/Connect';
import { SignScreen } from './screens/Sign';
import { AccountsScreen, AddTokenScreen, HomeScreen, ReceiveScreen } from './screens/Wallet';
import { SendScreen } from './screens/Send';
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
  | { name: 'send' }
  | { name: 'receive' }
  | { name: 'accounts' }
  | { name: 'add-token' }
  | { name: 'sign'; id: string }
  | { name: 'settings' }
  | { name: 'advanced' }
  | { name: 'developer' };

interface CompanionValue {
  wallet: ConnectedWallet | null;
  settings: CompanionSettings;
  approvedOrigins: string[];
  activity: ActivityRecord[];
  route: Route;
  navigate: (route: Route) => void;
  refresh: () => void;
  updateSettings: (patch: Partial<CompanionSettings>) => void;
  pair: (wallet: ConnectedWallet, preferredChainId?: number) => void;
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
  if (path.startsWith('/send')) return { name: 'send' };
  if (path.startsWith('/receive')) return { name: 'receive' };
  if (path.startsWith('/accounts')) return { name: 'accounts' };
  if (path.startsWith('/add-token')) return { name: 'add-token' };
  if (path.startsWith('/sign/')) return { name: 'sign', id: path.slice('/sign/'.length) };
  if (path.startsWith('/settings')) return { name: 'settings' };
  if (path.startsWith('/advanced')) return { name: 'advanced' };
  if (path.startsWith('/developer')) return { name: 'developer' };
  return { name: 'home' };
}

function CompanionProvider({ children }: { children: ReactNode }): ReactNode {
  const [wallet, setWallet] = useState<ConnectedWallet | null>(null);
  const [settings, setSettings] = useState<CompanionSettings>(DEFAULT_SETTINGS);
  const [approvedOrigins, setApprovedOrigins] = useState<string[]>([]);
  const [activity, setActivity] = useState<ActivityRecord[]>([]);
  const [route, setRoute] = useState<Route>({ name: 'home' });
  const [ready, setReady] = useState(false);
  const { toast, show } = useToast();

  const refresh = useCallback(() => {
    setWallet(loadWallet());
    setSettings(loadSettings());
    setApprovedOrigins(loadApprovedOrigins());
    setActivity(loadActivity());
  }, []);

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
        : next.name === 'home'
          ? '#/'
          : `#/${next.name}`;
    if (window.location.hash === hash) setRoute(next);
    else window.location.hash = hash;
    window.scrollTo({ top: 0 });
  }, []);

  const updateSettings = useCallback((patch: Partial<CompanionSettings>) => {
    setSettings(saveSettings(patch));
  }, []);

  const pair = useCallback(
    (next: ConnectedWallet, preferredChainId?: number) => {
      saveWallet(next);
      // A newly paired device starts on one visible account, like a fresh wallet —
      // and on the network the user picked on the device, so the token list is right
      // the moment they log in.
      const known = preferredChainId !== undefined && loadSettings().rpcUrls[preferredChainId] !== undefined;
      saveSettings({
        visibleAccounts: 1,
        addressIndex: 0,
        ...(known ? { chainId: preferredChainId } : {}),
      });
      refresh();
    },
    [refresh],
  );

  const unpair = useCallback(() => {
    clearWallet();
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
    }),
    [
      wallet,
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
  return (
    <div className="np-app np-app--wide">
      {/* No network and account pills until a device has been paired: an empty
          "Ethereum / 未连接" header is chrome that describes nothing. */}
      {wallet ? <TopBar /> : null}
      {route.name === 'home' ? <HomeScreen /> : null}
      {route.name === 'connect' ? <ConnectScreen /> : null}
      {route.name === 'accounts' ? <AccountsScreen /> : null}
      {route.name === 'send' ? <SendScreen /> : null}
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
 * The wallet header: network and account, side by side, the way every EVM wallet
 * does it. It is one control the user learns once and reads on every screen.
 */
function TopBar(): ReactNode {
  const { settings, updateSettings, navigate, wallet } = useCompanion();
  const [openMenu, setOpenMenu] = useState<'network' | 'account' | null>(null);

  const accounts = useMemo(() => {
    if (!wallet) return [];
    return allAddresses(wallet, settings)
      .slice(0, Math.max(1, settings.visibleAccounts))
      .map((entry, index) => ({
        ...entry,
        ordinal: index + 1,
        name: settings.accountNames[entry.address.toLowerCase()] ?? `账户 ${index + 1}`,
      }));
  }, [wallet, settings]);

  const current = accounts[settings.addressIndex] ?? accounts[0];

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
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: 'var(--np-up)',
              display: 'inline-block',
            }}
          />
          {chainLabel(settings.chainId)}
          <span style={{ opacity: 0.5 }}>▾</span>
        </button>

        <div className="np-grow" />

        <button
          type="button"
          className="np-chip"
          onClick={() => setOpenMenu(openMenu === 'account' ? null : 'account')}
          disabled={!wallet}
        >
          <span
            style={{
              width: 18,
              height: 18,
              borderRadius: 999,
              background: wallet ? 'var(--np-ink)' : 'var(--np-bg-sunken)',
              color: wallet ? '#fff' : 'var(--np-ink-3)',
              display: 'inline-grid',
              placeItems: 'center',
              fontSize: 10,
              fontWeight: 700,
            }}
          >
            {current?.ordinal ?? '?'}
          </span>
          {current?.name ?? '未连接'}
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
                <div className="np-label">选择网络</div>
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
                <div className="np-label">选择账户</div>
                {accounts.map((account, index) => (
                  <button
                    key={account.path}
                    type="button"
                    className="np-list__item"
                    style={{ borderRadius: 12 }}
                    onClick={() => {
                      updateSettings({ addressIndex: index });
                      setOpenMenu(null);
                    }}
                  >
                    <div className="np-grow">
                      <div className="np-subtitle">{account.name}</div>
                      <div className="np-mono np-ink-3">{shortAddress(account.address, 10, 8)}</div>
                    </div>
                    {index === settings.addressIndex ? <Badge tone="accent">使用中</Badge> : null}
                  </button>
                ))}
                <div className="np-grid-2">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setOpenMenu(null);
                      navigate({ name: 'accounts' });
                    }}
                  >
                    管理账户
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setOpenMenu(null);
                      navigate({ name: 'connect' });
                    }}
                  >
                    重新扫码配对
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

export { Alert, Button };

/**
 * The wallet's own mark.
 *
 * Doubles as the way home: every screen is reachable from the top bar, so the bar
 * needs exactly one always-present control, and a logo is the one thing users already
 * expect to be tappable.
 */
export function BrandMark({ size = 22 }: { size?: number }): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" aria-hidden="true">
      <rect width="128" height="128" rx="30" fill="#0B0B0F" />
      <path d="M34 88V40h13l18 27V40h13v48H65L47 61v27H34z" fill="#FFFFFF" />
      <circle cx="90" cy="50" r="8" fill="#0ECB81" />
    </svg>
  );
}
