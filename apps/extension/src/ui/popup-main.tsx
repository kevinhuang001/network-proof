import { Component, StrictMode, useEffect, useState } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import '@netproof/ui/theme.css';
import { fetchBalance } from '@netproof/companion';
import { loadApprovedOrigins, loadSettings, loadWallet, primaryAccount, resolveAccounts } from '../lib/store';
import { Alert, Badge, Button, Header, KeyValue, Spinner, shortAddress } from './kit';

/**
 * The popup.
 *
 * Chrome closes an action popup the moment focus moves, which makes it the wrong
 * place for any flow involving a camera. So the popup is a *status and launcher*
 * screen: it shows the paired wallet and pushes every multi-step flow into a full
 * extension tab, where the camera and the animated QR have room to work.
 */

const TAB_URL = 'tab.html';

/**
 * A popup must always say something.
 *
 * If a render throws, React unmounts the tree and the popup is left as an empty document —
 * which an action popup sizes to almost nothing, so the user sees a sliver of window and no
 * clue that anything went wrong. This turns that into a sentence and a way out.
 */
class PopupBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Console only: the popup has nowhere else to report, and this is a developer surface.
    console.error('popup render failed', error, info.componentStack);
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="np-app" style={{ minHeight: 420 }}>
        <Header title="NetProof Companion" />
        <div className="np-main">
          <Alert tone="danger" title="界面出错了">
            {this.state.error.message}
          </Alert>
          <Button block onClick={() => openTab('/')}>
            打开完整页面
          </Button>
        </div>
      </div>
    );
  }
}

function openTab(route: string): void {
  const url = chrome.runtime.getURL(`${TAB_URL}#${route}`);
  void chrome.tabs.create({ url });
  window.close();
}

function Popup(): ReactNode {
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'empty' }
    | {
        status: 'connected';
        fingerprint: string;
        device: { name: string; model: string };
        passphraseProtected: boolean;
        accounts: { address: string; path: string }[];
        chainId: number;
        index: number;
      }
  >({ status: 'loading' });
  const [balance, setBalance] = useState<string | null>(null);
  const [approvedOrigins, setApprovedOrigins] = useState<string[]>([]);

  useEffect(() => {
    void (async () => {
      let wallet: Awaited<ReturnType<typeof loadWallet>> = null;
      let settings: Awaited<ReturnType<typeof loadSettings>>;
      try {
        wallet = await loadWallet();
        settings = await loadSettings();
        setApprovedOrigins(await loadApprovedOrigins());
      } catch (caught) {
        // Never leave the spinner up: a popup that loads for ever is indistinguishable from
        // one that failed, and the user is left staring at a spinner with no way forward.
        setState({ status: 'error', message: (caught as Error).message });
        return;
      }
      if (!wallet) {
        setState({ status: 'empty' });
        return;
      }
      const accounts = resolveAccounts(wallet, settings);
      const active = primaryAccount(wallet, settings);
      setState({
        status: 'connected',
        fingerprint: wallet.masterFingerprint,
        device: wallet.device,
        passphraseProtected: wallet.passphraseProtected,
        accounts,
        chainId: settings.chainId,
        index: active?.index ?? 0,
      });
      // Balances are a nicety and must never block the popup from rendering.
      const rpcUrl = settings.rpcUrls[settings.chainId];
      if (active && rpcUrl) {
        try {
          const value = await fetchBalance(active.address, { rpcUrl, chainId: settings.chainId });
          setBalance((Number(value) / 1e18).toFixed(4));
        } catch {
          setBalance(null);
        }
      }
    })();
  }, []);

  if (state.status === 'loading') {
    return (
      <div className="np-app" style={{ minHeight: 320, alignItems: 'center', justifyContent: 'center' }}>
        <Spinner />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="np-app" style={{ minHeight: 420 }}>
        <Header title="NetProof Companion" />
        <div className="np-main">
          <Alert tone="danger" title="无法读取本机数据">
            {state.message}
          </Alert>
        </div>
      </div>
    );
  }

  if (state.status === 'empty') {
    return (
      <div className="np-app" style={{ minHeight: 420 }}>
        <Header title="NetProof Companion" />
        <div className="np-main">
          <div className="np-card np-card--hero">
            <div className="np-label">只读插件钱包</div>
            <div className="np-hero-amount" style={{ marginTop: 6, fontSize: 26 }}>
              私钥不在浏览器
            </div>
            <p className="np-body" style={{ color: 'rgba(255,255,255,.66)', marginTop: 8 }}>
              这里只有 xpub。每一笔签名都要走二维码，由离线手机完成。
            </p>
          </div>
          <Button block onClick={() => openTab('/connect')}>
            扫码连接硬件钱包
          </Button>
          <Button variant="ghost" onClick={() => openTab('/settings')}>
            设置 RPC 节点
          </Button>
        </div>
      </div>
    );
  }

  const active = state.accounts[state.index] ?? state.accounts[0];

  return (
    <div className="np-app" style={{ minHeight: 460 }}>
      <Header
        title="NetProof"
        subtitle={`${state.device.name} · ${state.chainId}`}
        action={<Badge tone="up">已连接</Badge>}
      />
      <div className="np-main" style={{ paddingTop: 10 }}>
        <div className="np-card np-card--hero">
          <div className="np-row np-row--between">
            <span className="np-label">总余额</span>
            <Badge tone="inverse">{state.passphraseProtected ? 'passphrase' : '标准'}</Badge>
          </div>
          <div className="np-hero-amount" style={{ marginTop: 6 }}>
            {balance ?? '—'}{' '}
            <span style={{ fontSize: 16, fontWeight: 600, opacity: 0.6 }}>ETH</span>
          </div>
          <div className="np-mono" style={{ color: 'rgba(255,255,255,.6)', marginTop: 8 }}>
            {active ? shortAddress(active.address, 10, 8) : '—'}
          </div>
        </div>

        <div className="np-list">
          {state.accounts.slice(0, 3).map((account, index) => (
            <button
              key={account.address}
              type="button"
              className="np-list__item"
              onClick={() => openTab(`/accounts?index=${index}`)}
            >
              <div className="np-grow">
                <div className="np-subtitle">
                  {index === state.index ? '当前账户' : `账户 ${index}`}
                </div>
                <div className="np-mono np-ink-3">{shortAddress(account.address)}</div>
              </div>
              {index === state.index ? <Badge tone="accent">使用中</Badge> : null}
            </button>
          ))}
        </div>

        {approvedOrigins.length > 0 ? (
          <div className="np-card np-card--sunken">
            <div className="np-label">已授权站点</div>
            <div className="np-body np-body--tight" style={{ marginTop: 4 }}>
              {approvedOrigins.length} 个站点可读取地址并请求签名
            </div>
          </div>
        ) : (
          <div className="np-card np-card--sunken">
            <div className="np-label">dApp 连接</div>
            <div className="np-body np-body--tight" style={{ marginTop: 4 }}>
              已注入 window.ethereum（EIP-1193 / EIP-6963），dApp 可直接发现本钱包。
            </div>
          </div>
        )}

        <KeyValue label="钱包指纹" value={state.fingerprint} mono />
      </div>
      <div className="np-footer" style={{ padding: '10px 16px 14px' }}>
        <Button block onClick={() => openTab('/connect')}>
          重新扫码导入 xpub
        </Button>
        <div className="np-row">
          <Button variant="ghost" onClick={() => openTab('/settings')}>
            设置
          </Button>
          <Button variant="ghost" onClick={() => openTab('/accounts')}>
            账户与路径
          </Button>
        </div>
      </div>
    </div>
  );
}

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <PopupBoundary>
        <Popup />
      </PopupBoundary>
    </StrictMode>,
  );
}
