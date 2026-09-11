import type { ReactNode } from 'react';
import { TextField } from '@netproof/ui/text-field';
import { useEffect, useMemo, useState } from 'react';
import {
  allAddresses,
  chainLabel,
  chainMeta,
  fetchBalance,
  isSolanaChain,
  forwardToNode,
  type ResolvedAccount,
} from '@netproof/companion';
import {
  fetchTokenBalance,
  formatTokenAmount,
  inspectToken,
  type CallFn,
  type TokenInfo,
} from '../lib/tokens';
import { addToken, loadTokens } from '../lib/store';
import { useCompanion } from '../App';
import {
  Alert,
  Badge,
  Button,
  CopyButton,
  Header,
  KeyValue,
  Spinner,
  shortAddress,
} from '../ui/kit';
import { ChainLogo } from '../ui/icons';

/**
 * Wallet-shaped screens.
 *
 * The companion is the *watch* half of a hardware wallet: it shows what the offline
 * device holds and starts transactions, but it can never sign. The UI therefore
 * follows the conventions people already know from MetaMask — an account pill, a
 * network pill, a big balance, Send/Receive, an activity list — because a wallet
 * that looks unfamiliar is a wallet people misread, and misreading a wallet is how
 * funds are lost.
 *
 * Everything technical (derivation schemes, xpubs, address counts, the dApp test
 * bench) lives under Settings → 高级 / 开发者. It is all still there; it just is not
 * the front page, because it is not how anyone uses a wallet.
 */

export interface WalletAccount extends ResolvedAccount {
  name: string;
  /** 1-based position in the visible list, for display. */
  ordinal: number;
}

/**
 * The flat, MetaMask-like account list: one entry per derived address the user has
 * revealed with "添加账户".
 */
export function useVisibleAccounts(): { accounts: WalletAccount[] } {
  const { wallet, settings } = useCompanion();

  const accounts = useMemo(() => {
    if (!wallet) return [];
    // Flattened across every exported account: account 0's addresses first, then
    // account 1's. The hardened account boundary stays visible in the derivation
    // path, but the user sees one continuing list of accounts.
    const flat = allAddresses(wallet, settings).slice(0, Math.max(1, settings.visibleAccounts));
    return flat.map((entry, index) => ({
      ...entry,
      ordinal: index + 1,
      name: settings.accountNames[entry.address.toLowerCase()] ?? `账户 ${index + 1}`,
    }));
  }, [wallet, settings]);

  return { accounts };
}

/**
 * Per-account balances for the native coin *and* every token the user added.
 *
 * Token balances are read straight from each contract, so the list needs no curated
 * token registry and no price API — nothing but the RPC the user already runs. The
 * cost is that the wallet shows amounts, not fiat values; inventing a dollar figure
 * would mean sending the user's holdings to somebody's price feed.
 */
export function usePortfolio(): {
  native: Record<string, string>;
  tokens: { info: TokenInfo; perAccount: Record<string, string>; total: string }[];
  reload: () => void;
  error: string | null;
} {
  const { settings } = useCompanion();
  const { accounts } = useVisibleAccounts();
  const [native, setNative] = useState<Record<string, string>>({});
  const [tokens, setTokens] = useState<{ info: TokenInfo; perAccount: Record<string, string>; total: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tokenVersion, setTokenVersion] = useState(0);
  const [localToken, setLocalToken] = useState(0);
  const key = accounts.map((entry) => entry.address).join(',');

  // Re-read the stored token list whenever the chain changes or the user edits it.
  useEffect(() => {
    const unsubscribe = () => undefined;
    void tokenVersion;
    setTokenVersion((value) => value);
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const rpcUrl = settings.rpcUrls[settings.chainId];
    const chain = chainMeta(settings.chainId);
    if (!rpcUrl || !chain || key.length === 0) return;
    let cancelled = false;
    void (async () => {
      const call: CallFn = (method, params) =>
        forwardToNode(method, params, { rpcUrl, chainId: settings.chainId });
      const nextNative: Record<string, string> = {};
      let failure: string | null = null;
      for (const account of accounts) {
        try {
          nextNative[account.address] = formatEth(
            await fetchBalance(account.address, { rpcUrl, chainId: settings.chainId }),
          );
        } catch (caught) {
          nextNative[account.address] = '—';
          failure = `无法读取余额：${(caught as Error).message}`;
        }
      }

      const nextTokens: typeof tokens = [];
      for (const stored of loadTokens(settings.chainId)) {
        const info: TokenInfo = { ...stored, native: false };
        const perAccount: Record<string, string> = {};
        let sum = 0n;
        for (const account of accounts) {
          try {
            const raw = await fetchTokenBalance(info, account.address, call);
            perAccount[account.address] = formatTokenAmount(raw, info.decimals);
            sum += raw;
          } catch {
            perAccount[account.address] = '—';
          }
        }
        nextTokens.push({
          info,
          perAccount,
          total: formatTokenAmount(sum, info.decimals),
        });
      }

      if (cancelled) return;
      setNative(nextNative);
      setTokens(nextTokens);
      setError(failure);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, settings.chainId, settings.rpcUrls, localToken, tokenVersion]);

  return { native, tokens, reload: () => setLocalToken((value) => value + 1), error };
}

export function formatEth(wei: bigint): string {
  const whole = wei / 10n ** 18n;
  const fraction = (wei % 10n ** 18n).toString().padStart(18, '0').slice(0, 6).replace(/0+$/u, '');
  return fraction.length > 0 ? `${whole}.${fraction}` : whole.toString();
}

export function formatAge(timestamp: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds} 秒前`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} 小时前`;
  return new Date(timestamp).toLocaleDateString();
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------

export function HomeScreen(): ReactNode {
  const { wallet, settings, navigate, activity } = useCompanion();
  const { accounts } = useVisibleAccounts();
  const { native, tokens, error } = usePortfolio();
  const current = accounts[settings.addressIndex] ?? accounts[0];
  const chain = chainMeta(settings.chainId);
  const solana = isSolanaChain(settings.chainId);

  if (!wallet) {
    return (
      <div className="np-main">
        <h2 className="np-headline">还没有连接设备</h2>
        <Button block onClick={() => navigate({ name: 'connect' })}>
          扫码连接硬件钱包
        </Button>
      </div>
    );
  }

  /*
   * The assets list *is* the home screen.
   *
   * There used to be a black hero card holding the native balance with 发送/接收 buttons
   * under it, which made ETH look like the wallet and every token look like a footnote.
   * On every chain this wallet supports, the money is usually in the ERC-20s, and the
   * native coin is one row among many. Each row opens that asset, which is where sending
   * and receiving belong — you send a *thing*, not "the wallet".
   */
  const assets = [
    {
      key: 'native',
      symbol: chain?.symbol ?? 'ETH',
      name: chain?.name ?? '原生代币',
      amount: current ? native[current.address] ?? '—' : '—',
    },
    ...tokens.map((entry) => ({
      key: entry.info.address,
      symbol: entry.info.symbol,
      name: entry.info.name,
      amount: current ? entry.perAccount[current.address] ?? '—' : '—',
    })),
  ];

  return (
    <div className="np-main">
      <div className="np-row np-row--between">
        <span className="np-label">资产 · {chainLabel(settings.chainId)}</span>
        {solana ? null : (
          <button type="button" className="np-chip" onClick={() => navigate({ name: 'add-token' })}>
            + 代币
          </button>
        )}
      </div>

      <div className="np-list">
        {assets.map((asset) => (
          <button
            type="button"
            className="np-list__item"
            key={asset.key}
            onClick={() =>
              navigate({ name: 'asset', asset: asset.key, symbol: asset.symbol, label: asset.name })
            }
          >
            <AssetBadge symbol={asset.symbol} chainId={settings.chainId} native={asset.key === 'native'} />
            <div className="np-grow" style={{ minWidth: 0 }}>
              <div className="np-subtitle">{asset.symbol}</div>
              <div
                className="np-body np-body--tight"
                style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {asset.name}
              </div>
            </div>
            <div className="np-subtitle np-num">{asset.amount}</div>
          </button>
        ))}
      </div>

      {error ? <Alert tone="warn">{error}</Alert> : null}
      {solana ? (
        <Alert tone="info">
          Solana 没有可观察的账户公钥，设备导出的是地址本身。发送交易尚未实现。
        </Alert>
      ) : null}

      <div className="np-row np-row--between">
        <span className="np-label">活动</span>
        {activity.length > 0 ? <Badge>{activity.length}</Badge> : null}
      </div>
      {activity.length === 0 ? (
        <div className="np-card np-card--sunken">
          <div className="np-body np-body--tight">本钱包发起过的交易，本地记录。</div>
        </div>
      ) : (
        <div className="np-list">
          {activity.slice(0, 8).map((record) => (
            <div className="np-list__item np-list__item--static" key={record.hash}>
              <div className="np-grow">
                <div className="np-subtitle">
                  {record.kind === 'send' ? '发送' : '合约调用'}
                  {record.to ? ` → ${shortAddress(record.to, 6, 4)}` : ''}
                </div>
                <div className="np-body np-body--tight">
                  {record.to ? shortAddress(record.to, 8, 6) : '合约部署'} · {formatAge(record.timestamp)}
                </div>
              </div>
              <div className="np-right">
                <div className="np-subtitle np-num">{formatEth(BigInt(record.value))}</div>
                <Badge tone={record.status === 'failed' ? 'down' : 'up'}>
                  {record.status === 'failed' ? '失败' : '已广播'}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      )}

      {solana ? null : (
        <div className="np-body np-body--tight np-center np-ink-3">
          切换和管理都在右上角
        </div>
      )}
    </div>
  );
}

/** Round asset mark: the chain's logo for the native coin, a symbol chip for a token. */
function AssetBadge({
  symbol,
  chainId,
  native,
}: {
  symbol: string;
  chainId: number;
  native: boolean;
}): ReactNode {
  if (native) return <ChainLogo chainId={chainId} size={38} />;
  return (
    <span
      style={{
        width: 38,
        height: 38,
        minWidth: 38,
        borderRadius: 999,
        background: 'var(--np-bg-sunken)',
        display: 'grid',
        placeItems: 'center',
        fontWeight: 800,
        fontSize: 12,
      }}
    >
      {symbol.slice(0, 4)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// One asset: where send and receive actually live
// ---------------------------------------------------------------------------

export function AssetScreen({
  asset,
  symbol,
  label,
}: {
  asset: string;
  /** Short ticker, and what the header shows. */
  symbol: string;
  /** Long name, e.g. "Ethereum Mainnet" or the token's name. */
  label: string;
}): ReactNode {
  const { settings, navigate, wallet } = useCompanion();
  const { accounts } = useVisibleAccounts();
  const { native, tokens } = usePortfolio();
  const current = accounts[settings.addressIndex] ?? accounts[0];
  const token = asset === 'native' ? null : tokens.find((entry) => entry.info.address.toLowerCase() === asset.toLowerCase());
  const amount =
    asset === 'native'
      ? current
        ? native[current.address] ?? '—'
        : '—'
      : current
        ? token?.perAccount[current.address] ?? '—'
        : '—';

  return (
    <>
      <Header title={symbol} subtitle={label} onBack={() => navigate({ name: 'home' })} />
      <div className="np-main">
        <div className="np-card">
          <div className="np-label">余额</div>
          <div className="np-hero-amount" style={{ fontSize: 32, marginTop: 6 }}>
            {amount}{' '}
            <span style={{ fontSize: 16, fontWeight: 600, opacity: 0.55 }}>{symbol}</span>
          </div>
          <KeyValue label="账户" value={current?.name ?? '—'} />
          <KeyValue label="地址" value={current ? shortAddress(current.address, 10, 8) : '—'} mono />
          {token ? <KeyValue label="合约" value={shortAddress(token.info.address, 10, 8)} mono /> : null}
          {asset !== 'native' && !token ? (
            <Alert tone="warn">这个代币不在本机列表里，可能是通过链接直接打开的。</Alert>
          ) : null}
        </div>

        <div className="np-grid-2">
          <Button
            onClick={() =>
              navigate({ name: 'send', ...(asset === 'native' ? {} : { token: asset }) })
            }
            disabled={asset === 'native' ? !wallet : !token}
          >
            发送
          </Button>
          <Button variant="secondary" onClick={() => navigate({ name: 'receive' })}>
            接收
          </Button>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Receive
// ---------------------------------------------------------------------------

export function ReceiveScreen(): ReactNode {
  const { settings, navigate } = useCompanion();
  const { accounts } = useVisibleAccounts();
  const current = accounts[settings.addressIndex] ?? accounts[0];

  if (!current) return null;

  return (
    <div className="np-main">
      <h2 className="np-headline" style={{ fontSize: 22 }}>
        接收
      </h2>
      <div className="np-body np-body--tight">「{current.name}」的收款地址</div>

      <AddressQr value={current.address} />

      <div className="np-card">
        <div className="np-label">地址</div>
        <div className="np-address" style={{ marginTop: 8 }}>{current.address}</div>
        <div className="np-row" style={{ marginTop: 10 }}>
          <CopyButton value={current.address} label="复制地址" />
          <CopyButton value={current.path} label="复制派生路径" />
        </div>
      </div>

      <Alert tone="info" title="用哪个地址收款">
        每次收款都可以用同一个地址，也可以切换到下一个（「管理账户」→ 添加账户）。
        地址都由离线设备派生，设备没联网也能继续派生新地址——你只需要把地址给对方。
      </Alert>

      <Button variant="ghost" onClick={() => navigate({ name: 'home' })}>
        返回
      </Button>
    </div>
  );
}

/** A scannable QR of the user's own address, so the sender can just point a phone at it. */
function AddressQr({ value }: { value: string }): ReactNode {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  useEffect(() => {
    void import('qrcode').then(async (module) => {
      const url = await module.default.toDataURL(value, {
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 320,
        color: { dark: '#0B0B0F', light: '#FFFFFF' },
      });
      setDataUrl(url);
    });
  }, [value]);

  if (!dataUrl) {
    return (
      <div className="np-qr-stage">
        <Spinner />
      </div>
    );
  }
  return (
    <div className="np-qr-stage">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={dataUrl} alt="收款地址二维码" style={{ width: '100%', maxWidth: 280, display: 'block' }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Accounts (MetaMask-style list)
// ---------------------------------------------------------------------------

export function AddTokenScreen(): ReactNode {
  const { wallet, settings, navigate, show } = useCompanion();
  const { reload } = usePortfolio();
  const [contract, setContract] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<TokenInfo | null>(null);

  const rpcUrl = settings.rpcUrls[settings.chainId];

  const lookup = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setFound(null);
    try {
      if (!rpcUrl) throw new Error(`链 ${settings.chainId} 没有配置 RPC 节点`);
      const info = await inspectToken(contract.trim(), settings.chainId, (method, params) =>
        forwardToNode(method, params, { rpcUrl, chainId: settings.chainId }),
      );
      setFound(info);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const save = (): void => {
    if (!found) return;
    addToken({
      address: found.address,
      symbol: found.symbol,
      name: found.name,
      decimals: found.decimals,
      chainId: found.chainId,
    });
    reload();
    show(`${found.symbol} 已添加`);
    navigate({ name: 'home' });
  };

  return (
    <div className="np-main">
      <h2 className="np-headline" style={{ fontSize: 22 }}>
        添加代币
      </h2>
      <div className="np-body np-body--tight">
        粘贴代币合约地址，钱包会直接向合约读取符号、名称与精度。当前网络：
        {chainLabel(settings.chainId)}。
      </div>

      <div className="np-field">
        <label className="np-label" htmlFor="token-contract">
          合约地址
        </label>
        <TextField
          id="token-contract"
          className="np-input np-input--mono"
          lang="en"
          value={contract}
          placeholder="0x..."
          onChange={(next) => {
            setContract(next);
            setFound(null);
            setError(null);
          }}
        />
      </div>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      {found ? (
        <div className="np-card">
          <div className="np-label">识别到的代币</div>
          <KeyValue label="符号" value={found.symbol} />
          <KeyValue label="名称" value={found.name} />
          <KeyValue label="精度" value={String(found.decimals)} />
          <KeyValue label="合约" value={shortAddress(found.address, 12, 10)} mono />
        </div>
      ) : null}

      <div className="np-row">
        <Button variant="ghost" onClick={() => navigate({ name: 'home' })}>
          返回
        </Button>
        <div className="np-grow" />
        {found ? (
          <Button onClick={save}>确认添加</Button>
        ) : (
          <Button disabled={busy || contract.trim().length === 0} onClick={() => void lookup()}>
            {busy ? '正在读取合约…' : '识别代币'}
          </Button>
        )}
      </div>

      {wallet ? null : <Alert tone="warn">尚未连接硬件钱包。</Alert>}
    </div>
  );
}
