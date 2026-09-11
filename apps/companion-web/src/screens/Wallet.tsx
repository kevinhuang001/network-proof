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
import { addToken, tokensForChain } from '../lib/store';
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
import { tokenLogoUrl } from '@netproof/ui/networks';

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
 * Balances for the native coin and every token the wallet shows.
 *
 * Two properties this has to have, and the first one was missing:
 *
 *  1. **The list is known before the network is.** Which tokens exist is decided locally —
 *     the seeded stablecoins plus whatever the user added — so the rows render on the first
 *     paint and the amounts fill in as they arrive. Waiting for every contract call before
 *     showing anything meant a blank asset list for seconds after a refresh, and an asset
 *     list that appears only sometimes reads as a wallet with nothing in it.
 *  2. **Reads run in parallel.** They used to be one `await` after another across every
 *     account and every token; on five accounts that was fifteen sequential round trips to
 *     the user's own node before a single number appeared.
 *
 * Amounts are per account, because a dApp-facing list can expose many addresses and the user
 * still needs to know which one holds what.
 */
export function usePortfolio(): {
  native: Record<string, string>;
  tokens: { info: TokenInfo; perAccount: Record<string, string> }[];
  reload: () => void;
  error: string | null;
} {
  const { settings } = useCompanion();
  const { accounts } = useVisibleAccounts();
  const [native, setNative] = useState<Record<string, string>>({});
  const [amounts, setAmounts] = useState<Record<string, Record<string, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [localToken, setLocalToken] = useState(0);
  const key = accounts.map((entry) => entry.address).join(',');

  // Seeds plus stored tokens, read synchronously: no await, no empty first frame.
  const list = useMemo(() => tokensForChain(settings.chainId), [settings.chainId, localToken]);

  const tokens = useMemo(
    () =>
      list.map((entry) => {
        const perAccount = amounts[entry.address.toLowerCase()] ?? {};
        return {
          info: { ...entry, native: false } as TokenInfo,
          perAccount,
        };
      }),
    [list, amounts],
  );

  useEffect(() => {
    const rpcUrl = settings.rpcUrls[settings.chainId];
    const chain = chainMeta(settings.chainId);
    if (!rpcUrl || !chain || key.length === 0) return;
    let cancelled = false;

    const call: CallFn = (method, params) =>
      forwardToNode(method, params, { rpcUrl, chainId: settings.chainId });

    // Native balance for every account, then one read per token per account — all in flight
    // together, and each result applied as it lands.
    void Promise.all(
      accounts.map(async (account) => {
        try {
          const raw = await fetchBalance(account.address, { rpcUrl, chainId: settings.chainId });
          if (!cancelled) setNative((previous) => ({ ...previous, [account.address]: formatEth(raw) }));
        } catch (caught) {
          if (cancelled) return;
          setNative((previous) => ({ ...previous, [account.address]: '—' }));
          setError(`无法读取余额：${(caught as Error).message}`);
        }
      }),
    );

    for (const [index, entry] of list.entries()) {
      const info: TokenInfo = { ...entry, native: false };
      const slot = entry.address.toLowerCase();
      // Show the row with an empty amount immediately; fill it in per account.
      if (!cancelled && index < list.length) {
        setAmounts((previous) => (previous[slot] ? previous : { ...previous, [slot]: {} }));
      }
      void Promise.all(
        accounts.map(async (account) => {
          try {
            const raw = await fetchTokenBalance(info, account.address, call);
            const formatted = formatTokenAmount(raw, info.decimals);
            if (cancelled) return;
            setAmounts((previous) => ({
              ...previous,
              [slot]: { ...(previous[slot] ?? {}), [account.address]: formatted },
            }));
          } catch {
            if (cancelled) return;
            setAmounts((previous) => ({
              ...previous,
              [slot]: { ...(previous[slot] ?? {}), [account.address]: '—' },
            }));
          }
        }),
      );
    }

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, settings.chainId, settings.rpcUrls, localToken]);

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
  const { wallet, settings, navigate } = useCompanion();
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
            添加代币
          </button>
        )}
      </div>

      <div className="np-list">
        {assets.map((asset) => (
          <button
            type="button"
            className="np-list__item"
            key={asset.key}
            onClick={() => navigate({ name: 'asset', asset: asset.key })}
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

      {/*
        Solana lists one asset and no way to add more, which looks like a bug unless it is
        said out loud: SPL tokens are not supported, and every EVM chain seeds USDT/USDC
        instead. This line is the whole difference.
      */}
      {solana ? (
        <div className="np-body np-body--tight np-center">
          Solana 只显示原生 SOL，SPL 代币尚未支持
        </div>
      ) : null}

      {error ? <Alert tone="warn">{error}</Alert> : null}
    </div>
  );
}

/**
 * Round asset mark: the chain's real logo for the native coin, the stablecoin's own mark for
 * USDT/USDC, and a ticker chip for anything else.
 *
 * A text chip is a placeholder, and it looked like one next to the real chain logos — the row
 * for a dollar stablecoin showed a grey circle reading "USDT" while the row above it showed
 * Ethereum's actual mark.
 */
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

  const tokenLogo = tokenLogoUrl(symbol);
  if (tokenLogo) {
    return (
      <img
        src={tokenLogo}
        width={38}
        height={38}
        alt=""
        style={{ width: 38, height: 38, minWidth: 38, display: 'block', borderRadius: 999 }}
      />
    );
  }

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
// Activity: what this wallet did, on its own screen
// ---------------------------------------------------------------------------

/**
 * Local history.
 *
 * A local record of what *this wallet* initiated, not a chain-wide history: reading the
 * full history of an address means an indexer, and pointing this wallet at one would leak
 * every address it watches to a third party. The list says "本机记录" rather than implying
 * it is complete.
 */
export function ActivityScreen(): ReactNode {
  const { activity, navigate, wallet } = useCompanion();

  return (
    <>
      <Header title="交易历史" subtitle={wallet?.name} onBack={() => navigate({ name: 'home' })} />
      <div className="np-main">
        {activity.length === 0 ? (
          <div className="np-card np-card--sunken">
            <div className="np-body np-body--tight">本钱包发起过的交易，本地记录。</div>
          </div>
        ) : (
          <div className="np-list">
            {activity.map((record) => (
              <div className="np-list__item np-list__item--static" key={record.hash}>
                <div className="np-grow">
                  <div className="np-subtitle">
                    {record.kind === 'send' ? '发送' : '合约调用'}
                    {record.to ? ` → ${shortAddress(record.to, 6, 4)}` : ''}
                  </div>
                  <div className="np-body np-body--tight">
                    {record.chainId} · {formatAge(record.timestamp)}
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
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// One asset: where send and receive actually live
// ---------------------------------------------------------------------------

export function AssetScreen({ asset }: { asset: string }): ReactNode {
  const { settings, navigate, wallet } = useCompanion();
  const { accounts } = useVisibleAccounts();
  const { native, tokens } = usePortfolio();
  const current = accounts[settings.addressIndex] ?? accounts[0];
  const chain = chainMeta(settings.chainId);

  // The asset key is all the route carries; the labels come from the chain or the token list.
  // Putting them in the URL meant 发送 and 接收 could not know where the user had come from.
  const token =
    asset === 'native'
      ? null
      : tokens.find((entry) => entry.info.address.toLowerCase() === asset.toLowerCase());
  const symbol = asset === 'native' ? chain?.symbol ?? 'ETH' : token?.info.symbol ?? '代币';
  const label = asset === 'native' ? chain?.name ?? '' : token?.info.name ?? '';
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
      {/* No subtitle: the ticker is the identity, and "Tether USD" underneath it was a second
          line saying what the first line already said. */}
      <Header title={symbol} onBack={() => navigate({ name: 'home' })} />
      <div className="np-main">
        <div className="np-card">
          <div className="np-label">余额</div>
          <div className="np-hero-amount" style={{ fontSize: 32, marginTop: 6 }}>
            {amount} <span style={{ fontSize: 16, fontWeight: 600, opacity: 0.55 }}>{symbol}</span>
          </div>
          <KeyValue label="账户" value={current?.name ?? '—'} />
          <KeyValue label="地址" value={current ? shortAddress(current.address, 10, 8) : '—'} mono />
          {token ? <KeyValue label="合约" value={shortAddress(token.info.address, 10, 8)} mono /> : null}
          {label.length > 0 && label !== symbol ? <KeyValue label="名称" value={label} /> : null}
          {asset !== 'native' && !token ? (
            <Alert tone="warn">这个代币不在本机列表里，可能是通过链接直接打开的。</Alert>
          ) : null}
        </div>

        <div className="np-grid-2">
          <Button
            onClick={() => navigate({ name: 'send', ...(asset === 'native' ? {} : { token: asset }) })}
            disabled={asset === 'native' ? !wallet : !token}
          >
            发送
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              navigate({ name: 'receive', ...(asset === 'native' ? {} : { token: asset }) })
            }
          >
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

export function ReceiveScreen({ token }: { token?: string } = {}): ReactNode {
  const { settings, navigate } = useCompanion();
  const { accounts } = useVisibleAccounts();
  const current = accounts[settings.addressIndex] ?? accounts[0];
  // Back to the asset this was opened from, so 接收 → back does not dump the user on the
  // home screen having forgotten which token they were looking at.
  const back = () => navigate({ name: 'asset', asset: token ?? 'native' });

  if (!current) return null;

  return (
    <>
      <Header title="接收" subtitle={current.name} onBack={back} />
      <div className="np-main">
      <AddressQr value={current.address} />

      <div className="np-card">
        <div className="np-label">地址</div>
        <div className="np-address" style={{ marginTop: 8 }}>{current.address}</div>
        <div className="np-row" style={{ marginTop: 10 }}>
          <CopyButton value={current.address} label="复制地址" />
        </div>
      </div>
      </div>
    </>
  );
}

/** A scannable QR of the user's own address, so the sender can just point a phone at it. */
export function AddressQr({ value }: { value: string }): ReactNode {
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
    <>
      <Header title="添加代币" onBack={() => navigate({ name: 'home' })} />
      <div className="np-main">
      <div className="np-body np-body--tight">
        粘贴合约地址，直接向合约读取符号与精度 · {chainLabel(settings.chainId)}
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
    </>
  );
}
