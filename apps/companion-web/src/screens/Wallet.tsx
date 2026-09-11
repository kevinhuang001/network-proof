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
  listAccounts,
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
import { Alert, Badge, Button, CopyButton, KeyValue, ProgressBar, Spinner, shortAddress, useToast } from '../ui/kit';

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

/** One asset row, OKX/MetaMask style: badge, name, amount. */
function TokenRow({
  symbol,
  name,
  amount,
  label,
}: {
  symbol: string;
  name: string;
  amount: string;
  label: string;
}): ReactNode {
  return (
    <div className="np-list__item np-list__item--static">
      <div
        style={{
          width: 38,
          height: 38,
          minWidth: 38,
          borderRadius: 999,
          background: 'var(--np-bg-sunken)',
          display: 'grid',
          placeItems: 'center',
          fontWeight: 800,
          fontSize: 13,
        }}
      >
        {symbol.slice(0, 4)}
      </div>
      <div className="np-grow" style={{ minWidth: 0 }}>
        <div className="np-subtitle">{symbol}</div>
        <div className="np-body np-body--tight" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {name}
        </div>
      </div>
      <div className="np-right">
        <div className="np-subtitle np-num">{amount}</div>
        <div className="np-body np-body--tight">{label}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------

export function HomeScreen(): ReactNode {
  const { wallet, settings, navigate, activity } = useCompanion();
  const { accounts } = useVisibleAccounts();
  const { native, tokens, error, reload } = usePortfolio();
  const current = accounts[settings.addressIndex] ?? accounts[0];
  const chain = chainMeta(settings.chainId);
  const solana = isSolanaChain(settings.chainId);
  const total = current ? native[current.address] ?? null : null;

  if (!wallet) {
    return (
      <div className="np-main">
        <div className="np-card np-card--hero">
          <div className="np-label">观察钱包</div>
          <div className="np-hero-amount" style={{ marginTop: 8, fontSize: 26 }}>
            还没有连接设备
          </div>
          <p className="np-body" style={{ color: 'rgba(255,255,255,.66)', marginTop: 10 }}>
            私钥在离线设备上，这里只保存公开的 xpub。扫码把设备加进来，就能查看余额、发起交易。
          </p>
        </div>
        <Button block onClick={() => navigate({ name: 'connect' })}>
          扫码连接硬件钱包
        </Button>
      </div>
    );
  }

  return (
    <div className="np-main">
      <div className="np-card np-card--hero">
        <div className="np-row np-row--between">
          <span className="np-label">{current?.name ?? '账户'}</span>
          <Badge tone="inverse">{chainLabel(settings.chainId)}</Badge>
        </div>
        <div className="np-hero-amount" style={{ marginTop: 10 }}>
          {total ?? '—'}{' '}
          <span style={{ fontSize: 18, fontWeight: 600, opacity: 0.6 }}>{chain?.symbol ?? ''}</span>
        </div>
        <div className="np-mono" style={{ color: 'rgba(255,255,255,.6)', marginTop: 8 }}>
          {current ? shortAddress(current.address, 10, 8) : '—'}
        </div>
        <div className="np-row" style={{ marginTop: 16, gap: 10 }}>
          <button
            type="button"
            className="np-btn np-btn--small"
            style={{ background: '#fff', color: '#0B0B0F', flex: 1 }}
            onClick={() => navigate({ name: 'send' })}
          >
            发送
          </button>
          <button
            type="button"
            className="np-btn np-btn--small"
            style={{ background: 'rgba(255,255,255,.14)', color: '#fff', flex: 1 }}
            onClick={() => navigate({ name: 'receive' })}
          >
            接收
          </button>
        </div>
      </div>

      <div className="np-alert np-alert--info">
        <span className="np-alert__icon" aria-hidden>
          ℹ
        </span>
        <div className="np-grow">
          <span className="np-ink">观察模式</span>：签名必须由「{wallet.device.name}」完成。
          发起交易时会出现一个二维码，用离线设备扫描并确认，再把签名扫回来即可。
        </div>
      </div>

      {error ? <Alert tone="warn">{error}</Alert> : null}

      {solana ? (
        <Alert tone="info">
          Solana 没有可观察的账户公钥，所以设备导出的是地址本身。发送交易尚未实现。
        </Alert>
      ) : null}

      <div className="np-row np-row--between">
        <span className="np-label">资产 · {chainLabel(settings.chainId)}</span>
        <div className="np-row" style={{ gap: 6 }}>
          {solana ? null : (
            <button type="button" className="np-chip" onClick={() => navigate({ name: 'add-token' })}>
              + 添加代币
            </button>
          )}
          <button type="button" className="np-chip" onClick={reload}>
            刷新
          </button>
        </div>
      </div>
      <div className="np-list">
        <TokenRow
          symbol={chain?.symbol ?? 'ETH'}
          name={chain?.name ?? '原生代币'}
          amount={current ? native[current.address] ?? '—' : '—'}
          label={current?.name ?? ''}
        />
        {tokens.map((entry) => (
          <TokenRow
            key={entry.info.address}
            symbol={entry.info.symbol}
            name={entry.info.name}
            amount={current ? entry.perAccount[current.address] ?? '—' : '—'}
            label={entry.info.address.slice(0, 10)}
          />
        ))}
      </div>
      {tokens.length === 0 ? (
        <div className="np-body np-body--tight np-center">
          只显示原生代币。ERC-20 代币需要你粘贴合约地址添加——本钱包不内置代币清单，
          因为任何清单都意味着有第三方知道你持有什么。
        </div>
      ) : null}

      <div className="np-row np-row--between">
        <span className="np-label">活动</span>
        {activity.length > 0 ? <Badge>{activity.length}</Badge> : null}
      </div>
      {activity.length === 0 ? (
        <div className="np-card np-card--sunken">
          <div className="np-body np-body--tight">
            这里会列出**本钱包发起过**的交易。它是一个本地记录，不是链上全量历史——
            读全量历史需要索引服务，那会把你在看的地址都交给第三方。
          </div>
        </div>
      ) : (
        <div className="np-list">
          {activity.slice(0, 8).map((record) => (
            <div className="np-list__item np-list__item--static" key={record.hash}>
              <div className="np-grow">
                <div className="np-subtitle">
                  {record.kind === 'send' ? '发送' : '合约调用'}
                  {record.status === 'failed' ? '（广播失败）' : ''}
                </div>
                <div className="np-mono np-ink-3">
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

      <div className="np-grid-2">
        {solana ? null : (
          <Button variant="secondary" onClick={() => navigate({ name: 'accounts' })}>
            管理账户
          </Button>
        )}
        <Button variant="ghost" onClick={reload}>
          刷新余额
        </Button>
      </div>
    </div>
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
      <div className="np-body np-body--tight">
        这是「{current.name}」的收款地址。
        {current.index > 0 ? '它由设备导出的同一账户派生而来。' : ''}
      </div>

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

export function AccountsScreen(): ReactNode {
  const { wallet, settings, updateSettings, navigate, show } = useCompanion();
  const { accounts } = useVisibleAccounts();
  const { native } = usePortfolio();
  const solana = isSolanaChain(settings.chainId);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const { toast, show: toastShow } = useToast();

  if (!wallet) return null;

  const exported = listAccounts(wallet, settings.schemeId);
  // How many accounts can be revealed at all: for Solana that is however many addresses
  // the device exported; for EVM it is the exported accounts times the per-account
  // derivation depth.
  const maxRevealable = solana
    ? (wallet.addresses?.length ?? 0)
    : exported.length * settings.addressCount;

  const addAccount = (): void => {
    if (settings.visibleAccounts >= maxRevealable) {
      show('已经显示到这个账户下所有已派生的地址，请到「设置 → 高级」提高派生数量');
      return;
    }
    updateSettings({ visibleAccounts: settings.visibleAccounts + 1 });
  };

  return (
    <div className="np-main">
      <h2 className="np-headline" style={{ fontSize: 22 }}>
        账户
      </h2>

      <div className="np-list">
        {accounts.map((account, index) => (
          <div key={account.path} className="np-list__item">
            <button
              type="button"
              className="np-icon-btn"
              style={{
                background: index === settings.addressIndex ? 'var(--np-ink)' : 'var(--np-bg-sunken)',
                color: index === settings.addressIndex ? '#fff' : 'var(--np-ink)',
                fontWeight: 700,
                border: 0,
              }}
              onClick={() => updateSettings({ addressIndex: index })}
              aria-label={`选择 ${account.name}`}
            >
              {account.ordinal}
            </button>
            <div className="np-grow" style={{ minWidth: 0 }}>
              {renaming === account.address ? (
                <TextField
                  className="np-input"
                  style={{ padding: '6px 10px', fontSize: 14 }}
                  value={draft}
                  autoFocus
                  onChange={setDraft}
                  onBlur={() => {
                    updateSettings({
                      accountNames: {
                        ...settings.accountNames,
                        [account.address.toLowerCase()]: draft.trim() || account.name,
                      },
                    });
                    setRenaming(null);
                    toastShow('已重命名');
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
                  }}
                />
              ) : (
                <button
                  type="button"
                  style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', font: 'inherit', color: 'inherit', cursor: 'pointer' }}
                  onClick={() => {
                    setRenaming(account.address);
                    setDraft(account.name);
                  }}
                >
                  <div className="np-subtitle">{account.name} ✎</div>
                  <div className="np-mono np-ink-3">{shortAddress(account.address, 10, 8)}</div>
                </button>
              )}
              <div className="np-body np-body--tight np-num">
                {native[account.address] ?? '—'} ·{' '}
                {account.scheme === 'solana' ? 'Solana 地址' : `账户 ${account.account} · #${account.index}`}
              </div>
            </div>
            {index === settings.addressIndex ? <Badge tone="accent">使用中</Badge> : null}
          </div>
        ))}
      </div>

      <Button block onClick={addAccount}>
        添加账户
      </Button>
      <div className="np-body np-body--tight np-center">
        已显示 {accounts.length} / {maxRevealable} 个可派生地址
      </div>

      <Alert tone="info" title="账户从哪来">
        <div style={{ marginBottom: 6 }}>
          这里显示的每个账户都是设备导出 xpub 下的一个派生地址。插件
          <span className="np-ink">无法自行发明新账户</span>——账户级密钥是硬化派生的，公钥推不出来。
          所以你只能看到设备已经暴露出来的那些。
        </div>
        <div className="np-mono" style={{ fontSize: 12 }}>
          {exported.length} 个账户级 xpub · 每账户派生 {settings.addressCount} 个地址
        </div>
      </Alert>

      <div className="np-grid-2">
        <Button variant="secondary" onClick={() => navigate({ name: 'receive' })}>
          接收
        </Button>
        <Button variant="ghost" onClick={() => navigate({ name: 'settings' })}>
          账户设置
        </Button>
      </div>
      {toast ? <div className="np-toast">{toast}</div> : null}
    </div>
  );
}

export { KeyValue, ProgressBar };

// ---------------------------------------------------------------------------
// Add token
// ---------------------------------------------------------------------------

/**
 * Add an ERC-20 by contract address.
 *
 * The wallet asks the contract what it is instead of consulting a registry. That
 * keeps the token list private (no price or list API sees what this wallet holds)
 * and cannot go stale, at the cost of one paste per token — which is also exactly
 * how the user confirms they are adding the contract they meant to.
 */
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
