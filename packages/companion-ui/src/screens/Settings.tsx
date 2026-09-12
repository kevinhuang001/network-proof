import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { CHAINS, chainLabel } from '@netproof/companion';
import { useCompanion } from '../App';
import { Alert, Badge, Button, Header, KeyValue, PasswordField, Toast, useToast } from '../ui/kit';
import { ChainLogo } from '../ui/icons';
import { TextField } from '@netproof/ui/text-field';
import { createPasscodeRecord, verifyPasscode } from '../lib/lock';
import { loadPasscode } from '../lib/store';

/**
 * Settings.
 *
 * One screen. Derivation schemes, xpub plumbing and the dApp test bench used to live behind
 * two more screens reached from here; all three were things the wallet does for the user
 * rather than things the user decides, and each one was a menu entry promising a decision
 * that did not exist.
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
                {active ? <Badge tone="accent">当前</Badge> : null}
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
        <Button variant="secondary" size="small" onClick={() => { clearActivities(); show('活动记录已清空'); }}>
          清空活动记录
        </Button>
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

      <WorkerDiagnostics />

      <Button block onClick={() => { updateSettings(draft); show('设置已保存'); }}>
        保存设置
      </Button>
      <Toast message={toast} />
    </div>
    </>
  );
}

/**
 * What the service worker saw.
 *
 * Only the extension has one, and only the extension has the problem this solves: a dApp calls
 * `eth_requestAccounts`, nothing appears to happen, and the page console shows the site's own
 * logging rather than ours. This asks the worker directly — did the call arrive, from where,
 * and what did we decide — so the answer is evidence instead of a guess.
 */
function WorkerDiagnostics(): ReactNode {
  const [report, setReport] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const ask = (): void => {
    setBusy(true);
    try {
      const runtime = (globalThis as { chrome?: { runtime?: { sendMessage?: (message: unknown, cb: (response: unknown) => void) => void } } }).chrome?.runtime;
      if (!runtime?.sendMessage) {
        setReport('这里没有 service worker（网页版没有 dApp 注入）。');
        setBusy(false);
        return;
      }
      runtime.sendMessage({ type: 'diagnostics' }, (response: unknown) => {
        setReport(JSON.stringify(response, null, 2));
        setBusy(false);
      });
    } catch (caught) {
      setReport(`worker 没有响应：${(caught as Error).message}`);
      setBusy(false);
    }
  };

  return (
    <div className="np-card">
      <div className="np-label">dApp 连接诊断</div>
      <div className="np-body np-body--tight" style={{ marginTop: 6 }}>
        显示 service worker 最近收到的调用、来源与判断结果。
      </div>
      <Button variant="secondary" block disabled={busy} onClick={ask}>
        {busy ? '正在查询…' : '读取 worker 状态'}
      </Button>
      {report ? (
        <pre className="np-mono" style={{ marginTop: 10, whiteSpace: 'pre-wrap', fontSize: 11 }}>
          {report}
        </pre>
      ) : null}
    </div>
  );
}

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
    const record = loadPasscode();
    if (hasPasscode && (!record || !verifyPasscode(current, record))) {
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
        必设，可修改。锁屏只遮挡界面，不加密数据——本机存的地址仍可被能读取本机存储的人看到。
      </div>
      <div className="np-stack" style={{ marginTop: 12 }}>
        {hasPasscode ? (
          <PasswordField value={current} onChange={setCurrent} placeholder="当前密码" />
        ) : null}
        <PasswordField value={next} onChange={setNext} placeholder="新密码（至少 6 位）" />
        <PasswordField value={confirm} onChange={setConfirm} placeholder="再输一次" />
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <div className="np-grid-2">
          {/* No "remove the passcode": a wallet is required to have one, and offering to take
              it away would undo the requirement the pairing flow just enforced. Changing it is
              the supported direction. */}
          <Button variant="secondary" onClick={save}>
            {hasPasscode ? '修改密码' : '设置密码'}
          </Button>
          <Button variant="secondary" onClick={lock} disabled={!hasPasscode}>
            立即锁定
          </Button>
        </div>
      </div>
      <Toast message={toast} />
    </div>
  );
}
