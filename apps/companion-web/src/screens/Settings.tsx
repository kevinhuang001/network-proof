import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { parseUnits, shortAddress } from '@netproof/core';
import {
  CHAINS,
  DEFAULT_SETTINGS,
  MAX_ADDRESSES_PER_ACCOUNT,
  buildMessageRequest,
  buildTransactionRequest,
  chainLabel,
  forwardToNode,
  handleRpc,
  primaryAccount,
  type PendingRequest,
} from '@netproof/companion';
import { useCompanion } from '../App';
import { Alert, Badge, Button, CopyButton, Header, KeyValue, Toast, useToast } from '../ui/kit';
import { ChainLogo, CheckIcon } from '../ui/icons';
import { PasswordField } from '../ui/kit';
import { createPasscodeRecord, verifyPasscode } from '../lib/lock';
import { loadPasscode } from '../lib/store';
import { TextArea, TextField } from '@netproof/ui/text-field';
import { useVisibleAccounts } from './Wallet';

/**
 * Settings, plus two screens most wallets would call "advanced" and "developer".
 *
 * The split matters: derivation schemes, xpub plumbing and the dApp test bench are
 * all genuinely useful, and none of them belong on a wallet's front page. Demoting
 * them keeps the wallet readable without removing the ability to inspect what it is
 * doing — which for a watch-only wallet over an air gap is the whole point.
 */

/** Host-only summary of an endpoint, for the compact network rows. */
function shortRpc(url: string | undefined): string {
  if (!url) return '未设置节点';
  try {
    return new URL(url).host;
  } catch {
    return url.length > 34 ? `${url.slice(0, 34)}…` : url;
  }
}

export function SettingsScreen(): ReactNode {
  const {
    settings,
    updateSettings,
    wallet,
    approvedOrigins,
    dropOrigin,
    navigate,
    activity,
    clearActivities,
  } = useCompanion();
  const [draft, setDraft] = useState(settings);
  const { toast, show } = useToast();

  useEffect(() => setDraft(settings), [settings]);

  return (
    <>
      <Header title="设置" onBack={() => navigate({ name: 'home' })} />
      <div className="np-main">

      {/* Wallet first, then the accounts derived from it. Settings used to list the wallet
          last, under the local-data counters, which put the two levels of the app in the
          opposite order from the header. */}
      {wallet ? (
        <div className="np-card">
          <div className="np-label">钱包</div>
          <KeyValue label="当前" value={wallet.name} />
          <KeyValue label="指纹" value={wallet.masterFingerprint} mono />
          <Button variant="ghost" size="small" onClick={() => navigate({ name: 'advanced' })}>
            账户与派生设置
          </Button>
          <PasscodeSection />
        </div>
      ) : null}

      {/*
        Network and RPC node in one card, because they are one decision. Choosing a chain
        and choosing the endpoint that serves it were two cards a screen apart, which
        meant the node field could show a URL for a chain the user was no longer on.
      */}
      <div className="np-card">
        <div className="np-label">网络与节点</div>
        <div className="np-list" style={{ marginTop: 10, borderRadius: 14 }}>
          {CHAINS.map((chain) => {
            const active = draft.chainId === chain.chainId;
            return (
              <div key={chain.chainId} className="np-list__item np-list__item--static" style={{ gap: 12 }}>
                <ChainLogo chainId={chain.chainId} size={26} />
                <button
                  type="button"
                  className="np-grow"
                  style={{
                    background: 'none',
                    border: 0,
                    padding: 0,
                    font: 'inherit',
                    color: 'inherit',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                  onClick={() => setDraft({ ...draft, chainId: chain.chainId })}
                >
                  <span className="np-subtitle">{chainLabel(chain.chainId)}</span>
                  <div className="np-body np-body--tight np-mono" style={{ opacity: 0.7 }}>
                    {shortRpc(draft.rpcUrls[chain.chainId])}
                  </div>
                </button>
                {active ? <CheckIcon size={20} /> : null}
              </div>
            );
          })}
        </div>

        <div className="np-field" style={{ marginTop: 14 }}>
          <label className="np-label" htmlFor="rpc-url">
            {chainLabel(draft.chainId)} 的 RPC 节点
          </label>
          <TextField
            id="rpc-url"
            className="np-input"
            lang="en"
            value={draft.rpcUrls[draft.chainId] ?? ''}
            placeholder="https://..."
            onChange={(next) =>
              setDraft({ ...draft, rpcUrls: { ...draft.rpcUrls, [draft.chainId]: next } })
            }
          />
        </div>
        <div className="np-body np-body--tight" style={{ marginTop: 8 }}>
          公共节点能看到你查询过的地址。
        </div>
      </div>

      <div className="np-card">
        <label className="np-switch">
          <input
            type="checkbox"
            checked={draft.autoBroadcast}
            onChange={(event) => setDraft({ ...draft, autoBroadcast: event.target.checked })}
          />
          <div>
            <div className="np-subtitle">校验通过后自动广播</div>
            <div className="np-body np-body--tight">关闭后只返回已签名载荷，由你自己广播。</div>
          </div>
        </label>
      </div>

      <div className="np-card">
        <div className="np-label">本机数据</div>
        <KeyValue label="已记录活动" value={`${activity.length} 条`} />
        <KeyValue label="已授权站点" value={`${approvedOrigins.length} 个`} />
        <Button variant="ghost" size="small" onClick={() => { clearActivities(); show('活动记录已清空'); }}>
          清空活动记录
        </Button>
      </div>

      <div className="np-list">
        <button type="button" className="np-list__item" onClick={() => navigate({ name: 'advanced' })}>
          <span className="np-grow">
            <span className="np-subtitle">账户与派生</span>
            <span className="np-body np-body--tight" style={{ display: 'block' }}>
              派生方案、地址数量、xpub
            </span>
          </span>
          <span style={{ opacity: 0.4 }}>›</span>
        </button>
        <button type="button" className="np-list__item" onClick={() => navigate({ name: 'developer' })}>
          <span className="np-grow">
            <span className="np-subtitle">开发者工具</span>
            <span className="np-body np-body--tight" style={{ display: 'block' }}>
              dApp 调用测试台（与扩展走同一套策略层）
            </span>
          </span>
          <span style={{ opacity: 0.4 }}>›</span>
        </button>
      </div>

      {approvedOrigins.length > 0 ? (
        <div className="np-card">
          <div className="np-label">已授权站点</div>
          <div className="np-list" style={{ marginTop: 10 }}>
            {approvedOrigins.map((origin) => (
              <div className="np-list__item np-list__item--static" key={origin}>
                <span className="np-grow np-mono">{origin}</span>
                <Button variant="danger-soft" size="small" onClick={() => dropOrigin(origin)}>
                  撤销
                </Button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <Button block onClick={() => { updateSettings(draft); show('设置已保存'); }}>
        保存设置
      </Button>
      <Toast message={toast} />
    </div>
    </>
  );
}

/** Derivation plumbing and the raw xpub, for when something needs checking. */
export function AdvancedScreen(): ReactNode {
  const { wallet, settings, updateSettings, navigate } = useCompanion();
  const { accounts } = useVisibleAccounts();

  if (!wallet) {
    return (
      <div className="np-main">
        <Alert tone="warn">尚未连接硬件钱包。</Alert>
        <Button block onClick={() => navigate({ name: 'connect' })}>
          扫码连接
        </Button>
      </div>
    );
  }

  const current = accounts[settings.addressIndex] ?? accounts[0];

  return (
    <>
      <Header title="高级" onBack={() => navigate({ name: 'settings' })} />
      <div className="np-main">

      <div className="np-card">
        <div className="np-label">派生方案</div>
        <div className="np-chip-row" style={{ marginTop: 10 }}>
          {wallet.schemes.map((scheme) => (
            <button
              key={scheme.id}
              type="button"
              className={`np-chip${scheme.id === settings.schemeId ? ' np-chip--active' : ''}`}
              onClick={() => updateSettings({ schemeId: scheme.id, addressIndex: 0, visibleAccounts: 1 })}
            >
              {scheme.label}
            </button>
          ))}
        </div>
        <div className="np-address" style={{ marginTop: 10 }}>
          {wallet.schemes.find((scheme) => scheme.id === settings.schemeId)?.receive ??
            'm/44\'/60\'/{account}\'/0/{index}'}
        </div>
        <div className="np-body np-body--tight" style={{ marginTop: 8 }}>
          不同钱包软件历史上用过不同路径。如果你在别处看到的地址对不上，多半是这里选错了方案。
        </div>
      </div>

      <div className="np-card">
        <div className="np-label">每个账户派生多少地址</div>
        <div className="np-chip-row" style={{ marginTop: 10 }}>
          {[5, 10, 20, 50, 100].map((count) => (
            <button
              key={count}
              type="button"
              className={`np-chip${settings.addressCount === count ? ' np-chip--active' : ''}`}
              onClick={() => updateSettings({ addressCount: count })}
            >
              {count}
            </button>
          ))}
        </div>
        <div className="np-body np-body--tight" style={{ marginTop: 8 }}>
          同时决定 dApp 通过 <span className="np-mono">eth_accounts</span> 能看到多少地址。
          派生的地址越多，越容易找到你分散的资金，但也会把钱包结构的更多细节告诉对方。上限{' '}
          {MAX_ADDRESSES_PER_ACCOUNT}。
        </div>
      </div>

      <div className="np-card">
        <div className="np-label">已显露的账户</div>
        <div className="np-chip-row" style={{ marginTop: 10 }}>
          {[1, 3, 5, 10].map((count) => (
            <button
              key={count}
              type="button"
              className={`np-chip${settings.visibleAccounts === count ? ' np-chip--active' : ''}`}
              onClick={() => updateSettings({ visibleAccounts: count })}
            >
              {count}
            </button>
          ))}
        </div>
        <div className="np-body np-body--tight" style={{ marginTop: 8 }}>
          只影响本页显示多少个账户，不影响 dApp 能看到多少。日常用「添加账户」逐个增加更清楚。
        </div>
      </div>

      {current ? (
        <div className="np-card">
          <div className="np-label">当前账户的公开信息</div>
          <KeyValue label="名称" value={current.name} />
          <KeyValue label="派生路径" value={current.path} mono />
          <KeyValue label="账户" value={String(current.account)} />
          <KeyValue label="地址序号" value={String(current.index)} />
          <div className="np-row" style={{ marginTop: 10 }}>
            <CopyButton value={current.address} label="复制地址" />
          </div>
        </div>
      ) : null}

      <div className="np-card">
        <div className="np-label">账户级 xpub</div>
        <div className="np-body np-body--tight" style={{ marginTop: 6 }}>
          设备通过二维码交给本钱包的全部内容。它可以派生出该账户下的所有地址，
          但不能派生新账户（账户级密钥是硬化派生的）。
        </div>
        <div className="np-list" style={{ marginTop: 10 }}>
          {wallet.accounts.map((entry) => (
            <div className="np-list__item np-list__item--static" key={entry.xpubPath}>
              <div className="np-grow" style={{ minWidth: 0 }}>
                <div className="np-mono np-ink-3">{entry.xpubPath}</div>
                <div className="np-body np-body--tight np-mono" style={{ wordBreak: 'break-all' }}>
                  {shortAddress(entry.xpub, 20, 8)}
                </div>
              </div>
              <CopyButton value={entry.xpub} label="复制" />
            </div>
          ))}
        </div>
      </div>

      <Button variant="ghost" onClick={() => navigate({ name: 'settings' })}>
        返回设置
      </Button>
    </div>
    </>
  );
}

/**
 * The dApp test bench.
 *
 * A web page cannot inject `window.ethereum` into other origins the way the Chrome
 * extension does, so this drives the *same* `handleRpc` policy layer a dApp would
 * reach through a provider. The policy under test is therefore the real one; only
 * the transport differs. Kept because it is genuinely useful, filed under developer
 * tools because it is not how anyone uses a wallet.
 */
export function DeveloperScreen(): ReactNode {
  const { wallet, settings, approvedOrigins, addOrigin, dropOrigin, requestSigning, navigate } =
    useCompanion();
  const [method, setMethod] = useState<'eth_sendTransaction' | 'personal_sign' | 'eth_signTypedData_v4'>(
    'eth_sendTransaction',
  );
  const [to, setTo] = useState('0x70997970C51812dc3A010C7d01b50e0d17dc79C8');
  const [valueEth, setValueEth] = useState('0.001');
  const [data, setData] = useState('0x');
  const [messageText, setMessageText] = useState('Sign in to NetProof\nnonce: 42');
  const [readResult, setReadResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState('https://app.example.org');
  const [log, setLog] = useState<string[]>([]);
  const { toast, show } = useToast();

  const active = wallet ? primaryAccount(wallet, settings) : null;
  const rpcUrl = settings.rpcUrls[settings.chainId];
  const append = (line: string): void => setLog((previous) => [line, ...previous].slice(0, 12));

  const runRead = async (requested: string): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const outcome = await handleRpc(requested, [], {
        wallet,
        settings,
        origin,
        approvedOrigins,
        forward: (m, p) => forwardToNode(m, p, { rpcUrl: rpcUrl ?? '', chainId: settings.chainId }),
        requestApproval: async () => {
          throw new Error('该方法需要用户批准，测试台不处理审批');
        },
      });
      const text = outcome.error
        ? `错误 ${outcome.error.code}: ${outcome.error.message}`
        : JSON.stringify(outcome.result);
      setReadResult(text);
      append(`${requested} → ${text.slice(0, 90)}`);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const queue = async (): Promise<void> => {
    if (!wallet || !active) {
      setError('请先连接硬件钱包');
      return;
    }
    setError(null);
    if (!approvedOrigins.includes(origin)) {
      addOrigin(origin);
      append(`已授权站点 ${origin}`);
    }

    const params =
      method === 'eth_sendTransaction'
        ? [
            {
              from: active.address,
              to,
              value: `0x${toWei(valueEth).toString(16)}`,
              data,
            },
          ]
        : method === 'personal_sign'
          ? [`0x${Array.from(new TextEncoder().encode(messageText)).map((b) => b.toString(16).padStart(2, '0')).join('')}`, active.address]
          : [
              active.address,
              {
                domain: { name: 'NetProof Demo', version: '1', chainId: settings.chainId, verifyingContract: to },
                types: { Mail: [{ name: 'contents', type: 'string' }] },
                primaryType: 'Mail',
                message: { contents: messageText },
              },
            ];

    const kind =
      method === 'eth_sendTransaction'
        ? ('sendTransaction' as const)
        : method === 'personal_sign'
          ? ('personal_sign' as const)
          : ('signTypedData' as const);

    try {
      // Build eagerly so a malformed input fails here, before the user picks up a phone.
      if (kind === 'sendTransaction') {
        await buildTransactionRequest({
          wallet,
          settings,
          params,
          origin,
          forward: (m, p) => forwardToNode(m, p, { rpcUrl: rpcUrl ?? '', chainId: settings.chainId }),
        });
      } else {
        buildMessageRequest({ wallet, settings, kind, params, origin });
      }
      requestSigning({
        kind,
        origin,
        chainId: settings.chainId,
        method,
        params,
      } as Omit<PendingRequest, 'id' | 'createdAt'>);
      append(`已排队 ${method}`);
      show('请求已排队');
    } catch (caught) {
      setError((caught as Error).message);
      append(`${method} 构建失败：${(caught as Error).message}`);
    }
  };

  if (!wallet) {
    return (
      <div className="np-main">
        <Alert tone="info" title="先连接硬件钱包">
          测试台通过真实的策略层发起请求，所以需要 xpub 才能推导出签名账户。
        </Alert>
        <Button block onClick={() => navigate({ name: 'connect' })}>
          扫码连接
        </Button>
      </div>
    );
  }

  return (
    <>
      <Header title="开发者工具" onBack={() => navigate({ name: 'settings' })} />
      <div className="np-main">
      <Alert tone="info" title="与真实 dApp 走同一条代码路径">
        网页无法向其它网站注入 <span className="np-mono">window.ethereum</span>，所以这里直接调用插件版本
        同一套 <span className="np-mono">handleRpc</span> 策略层。只读调用转发给节点，
        任何签名请求都必须扫码。
      </Alert>

      <div className="np-card">
        <div className="np-label">模拟站点 origin</div>
        <TextField className="np-input" value={origin} onChange={setOrigin} lang="en" />
        <div className="np-row" style={{ marginTop: 10 }}>
          <Badge tone={approvedOrigins.includes(origin) ? 'up' : 'warn'}>
            {approvedOrigins.includes(origin) ? '已授权' : '未授权'}
          </Badge>
          {approvedOrigins.includes(origin) ? (
            <Button variant="danger-soft" size="small" onClick={() => dropOrigin(origin)}>
              撤销
            </Button>
          ) : (
            <Button variant="secondary" size="small" onClick={() => addOrigin(origin)}>
              授权
            </Button>
          )}
        </div>
      </div>

      <div className="np-card">
        <div className="np-label">只读调用</div>
        <div className="np-chip-row" style={{ marginTop: 10 }}>
          {['eth_chainId', 'eth_blockNumber', 'eth_gasPrice', 'eth_maxPriorityFeePerGas', 'eth_accounts'].map(
            (name) => (
              <button key={name} type="button" className="np-chip" onClick={() => void runRead(name)} disabled={busy}>
                {name}
              </button>
            ),
          )}
        </div>
        {readResult ? <div className="np-address" style={{ marginTop: 10 }}>{readResult}</div> : null}
      </div>

      <div className="np-card">
        <div className="np-label">发起签名请求</div>
        <div className="np-chip-row" style={{ marginTop: 10 }}>
          {(
            [
              ['eth_sendTransaction', '发送交易'],
              ['personal_sign', '签名消息'],
              ['eth_signTypedData_v4', 'EIP-712'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`np-chip${method === value ? ' np-chip--active' : ''}`}
              onClick={() => setMethod(value)}
            >
              {label}
            </button>
          ))}
        </div>

        {method === 'eth_sendTransaction' ? (
          <div className="np-stack" style={{ marginTop: 12 }}>
            <TextField className="np-input np-input--mono" value={to} onChange={setTo} />
            <TextField className="np-input" value={valueEth} onChange={setValueEth} />
            <TextArea
              className="np-textarea np-textarea--mono"
              rows={2}
              value={data}
              onChange={setData}
              lang="en"
            />
            <div className="np-chip-row">
              <button
                type="button"
                className="np-chip"
                onClick={() =>
                  setData(`0x095ea7b3${'0'.repeat(24)}1111111254eeb25477b68fb85ed929f73a960582${'f'.repeat(64)}`)
                }
              >
                无限授权 approve
              </button>
              <button
                type="button"
                className="np-chip"
                onClick={() => setData(`0xa22cb465${'0'.repeat(24)}1111111254eeb25477b68fb85ed929f73a960582${'0'.repeat(63)}1`)}
              >
                授权全部 NFT
              </button>
              <button type="button" className="np-chip" onClick={() => setData('0xdeadbeef')}>
                未知方法
              </button>
            </div>
          </div>
        ) : (
          <TextArea
            className="np-textarea"
            style={{ marginTop: 12 }}
            value={messageText}
            onChange={setMessageText}
          />
        )}

        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Button block onClick={() => void queue()}>
          排队并去扫码签名
        </Button>
      </div>

      {log.length > 0 ? (
        <div className="np-card np-card--sunken">
          <div className="np-label">调用日志</div>
          <div className="np-stack" style={{ marginTop: 8 }}>
            {log.map((line, index) => (
              <div key={`${index}-${line.slice(0, 12)}`} className="np-body np-body--tight np-mono">
                {line}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <Button variant="ghost" onClick={() => navigate({ name: 'settings' })}>
        返回设置
      </Button>
      <Toast message={toast} />
    </div>
    </>
  );
}

/** Exact ETH -> wei, with a clear error rather than a silently wrong amount. */
function toWei(amount: string): bigint {
  try {
    return parseUnits(amount.trim() === '' ? '0' : amount, 18);
  } catch {
    throw new Error(`金额不是合法的十进制数字：${amount}`);
  }
}

export { DEFAULT_SETTINGS };

/**
 * Passcode management.
 *
 * The wording matters more than the widget. This lock hides the wallet from someone who
 * picks up an unlocked machine; it does not encrypt anything, and every address this app
 * watches is still readable in this browser's storage. A settings row that said "安全"
 * without saying that would be a false claim about what the user just turned on.
 */
function PasscodeSection(): ReactNode {
  const { hasPasscode, setPasscode, lock } = useCompanion();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { toast, show } = useToast();

  const save = (): void => {
    setError(null);
    if (hasPasscode && !verifyPasscode(current, loadPasscode()!)) {
      setError('当前密码不正确');
      return;
    }
    if (next.length < 6) {
      setError('新密码至少 6 位');
      return;
    }
    if (next !== confirm) {
      setError('两次输入不一致');
      return;
    }
    setPasscode(createPasscodeRecord(next));
    setCurrent('');
    setNext('');
    setConfirm('');
    show('密码已更新');
  };

  return (
    <div className="np-card">
      <div className="np-label">锁屏密码</div>
      <div className="np-body np-body--tight" style={{ marginTop: 6 }}>
        锁屏只遮挡界面，不加密数据——本机存的地址仍可被能读取本机存储的人看到。
      </div>
      <div className="np-stack" style={{ marginTop: 12 }}>
        {hasPasscode ? (
          <PasswordField value={current} onChange={setCurrent} placeholder="当前密码" />
        ) : null}
        <PasswordField value={next} onChange={setNext} placeholder="新密码（至少 6 位）" />
        <PasswordField value={confirm} onChange={setConfirm} placeholder="再输一次" />
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <div className="np-grid-2">
          <Button variant="secondary" onClick={save}>
            {hasPasscode ? '修改密码' : '设置密码'}
          </Button>
          {hasPasscode ? (
            <Button
              variant="ghost"
              onClick={() => {
                setPasscode(null);
                show('已取消密码');
              }}
            >
              取消密码
            </Button>
          ) : (
            <Button variant="ghost" onClick={lock}>
              立即锁定
            </Button>
          )}
        </div>
      </div>
      <Toast message={toast} />
    </div>
  );
}
