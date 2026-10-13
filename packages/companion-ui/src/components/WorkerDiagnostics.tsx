import type { ReactNode } from 'react';
import { useState } from 'react';
import { Button } from '../ui/kit';

/**
 * What the service worker saw.
 *
 * Only the extension has one, and only the extension has the problem this solves: a dApp calls
 * `eth_requestAccounts`, nothing appears to happen, and the page console shows the site's own
 * logging rather than ours. This asks the worker directly — did the call arrive, from where,
 * and what did we decide — so the answer is evidence instead of a guess.
 */
export function WorkerDiagnostics(): ReactNode {
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

