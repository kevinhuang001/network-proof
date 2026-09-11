import { StrictMode, useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import '@netproof/ui/theme.css';
import {
  FrameCollector,
  decodeMessage,
  describePersonalMessage,
  describeTransaction,
  describeTypedData,
  formatUnits,
  framesForMessage,
  hashPersonalMessage,
  hashTypedDataPayload,
  fromHex,
  toHex,
  verifySignedTransaction,
} from '@netproof/core';
import type {
  EvmTransactionRequest,
  FrameCollectorProgress,
  SignRequestMessage,
  SignResponseMessage,
  TransactionSummary,
  XpubExportMessage,
} from '@netproof/core';
import {
  approveOrigin,
  clearWallet,
  getPending,
  loadApprovedOrigins,
  loadSettings,
  loadWallet,
  resolveAccounts,
  revokeOrigin,
  saveSettings,
  saveWallet,
} from '../lib/store';
import type { ConnectedWallet, CompanionSettings, PendingRequest } from '@netproof/companion';
import { buildMessageRequest, buildTransactionRequest } from '@netproof/companion';
import { forwardToNode } from '@netproof/companion';
import { fetchBalance } from '@netproof/companion';
import {
  Alert,
  Badge,
  Button,
  CameraPreview,
  Header,
  KeyValue,
  QrDisplay,
  Spinner,
  Toast,
  shortAddress as short,
  useQrScanner,
  useToast,
} from './kit';

/**
 * The extension's full-page flows.
 *
 * Every flow that needs a camera or a large animated QR lives here rather than in
 * the popup, because Chrome destroys an action popup as soon as the user clicks
 * away — and "clicking away" is exactly what happens when you pick up a phone to
 * scan something.
 *
 * The approval flow is the important one. It is the only place in the extension
 * that can turn a dApp request into a broadcast transaction, and it verifies three
 * things before doing so:
 *   1. the response echoes the request id and the request's `claim` hash;
 *   2. the signature recovers to the account the user approved;
 *   3. the signed payload is byte-identical to the fields shown and signed.
 */

type Route =
  | { name: 'connect' }
  | { name: 'approve'; id: string }
  | { name: 'accounts' }
  | { name: 'settings' }
  | { name: 'unknown' };

function parseRoute(): Route {
  const hash = window.location.hash.replace(/^#/u, '');
  if (hash.startsWith('/approve/')) return { name: 'approve', id: hash.slice('/approve/'.length) };
  if (hash.startsWith('/accounts')) return { name: 'accounts' };
  if (hash.startsWith('/settings')) return { name: 'settings' };
  if (hash.startsWith('/connect')) return { name: 'connect' };
  return { name: 'unknown' };
}

function Tab(): ReactNode {
  const [route, setRoute] = useState<Route>(parseRoute);
  const [settings, setSettings] = useState<CompanionSettings | null>(null);
  const [wallet, setWallet] = useState<ConnectedWallet | null>(null);
  const [ready, setReady] = useState(false);
  const { toast, show } = useToast();

  const refresh = useCallback(async () => {
    const [nextSettings, nextWallet] = await Promise.all([loadSettings(), loadWallet()]);
    setSettings(nextSettings);
    setWallet(nextWallet);
    setReady(true);
  }, []);

  useEffect(() => {
    void refresh();
    const onHash = (): void => setRoute(parseRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [refresh]);

  if (!ready || !settings) {
    return (
      <div className="np-app" style={{ alignItems: 'center', paddingTop: 120 }}>
        <Spinner />
      </div>
    );
  }

  return (
    <div className="np-app">
      {route.name === 'connect' ? (
        <ConnectScreen
          existing={wallet}
          onSaved={async (saved) => {
            await saveWallet(saved);
            await refresh();
            show('已导入 xpub');
            window.location.hash = '/accounts';
          }}
        />
      ) : null}
      {route.name === 'approve' ? (
        <ApproveScreen
          id={route.id}
          wallet={wallet}
          settings={settings}
          onSettings={async (patch) => {
            const next = await saveSettings(patch);
            setSettings(next);
          }}
          onPaired={refresh}
          onDone={(message) => show(message)}
        />
      ) : null}
      {route.name === 'accounts' ? <AccountsScreen wallet={wallet} settings={settings} onSettings={async (patch) => setSettings(await saveSettings(patch))} /> : null}
      {route.name === 'settings' ? (
        <SettingsScreen
          settings={settings}
          wallet={wallet}
          onSaved={setSettings}
          onWiped={async () => {
            await clearWallet();
            await refresh();
            show('已清除配对的 xpub');
          }}
        />
      ) : null}
      {route.name === 'unknown' ? (
        <div className="np-main">
          <Alert tone="warn">未知页面。请从插件弹窗重新进入。</Alert>
        </div>
      ) : null}
      <Toast message={toast} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pairing: scan the device's xpub QR
// ---------------------------------------------------------------------------

function ConnectScreen({
  existing,
  onSaved,
}: {
  existing: ConnectedWallet | null;
  onSaved: (wallet: ConnectedWallet) => Promise<void>;
}): ReactNode {
  const collectorRef = useRef(new FrameCollector('NP-XPUB'));
  const [scanning, setScanning] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<XpubExportMessage | null>(null);

  // The scanner callback must be stable; the collector lives in a ref.
  const onText = useCallback((text: string): FrameCollectorProgress => {
    const collector = collectorRef.current;
    const next = collector.addText(text);
    if (collector.complete) {
      try {
        const message = decodeMessage(collector.result());
        if (message.t !== 'xpub') throw new Error('扫描到的不是 xpub 导出二维码');
        setPreview(message);
        setScanning(false);
      } catch (caught) {
        setError((caught as Error).message);
      }
    }
    return next;
  }, []);

  const { videoRef, state } = useQrScanner({ active: scanning, expectedType: 'NP-XPUB', onText });

  const confirm = async (): Promise<void> => {
    if (!preview) return;
    await onSaved({
      masterFingerprint: preview.fingerprint,
      passphraseProtected: preview.passphraseProtected,
      rootXpub: preview.rootXpub,
      coinType: preview.coinType,
      device: preview.device,
      accounts: preview.accounts,
      schemes: preview.schemes,
      connectedAt: Date.now(),
    });
  };

  return (
    <>
      <Header
        title="连接硬件钱包"
        subtitle={existing ? `已配对 ${existing.masterFingerprint}` : '扫码导入 xpub'}
        onBack={() => {
          window.location.hash = '/settings';
        }}
      />
      <div className="np-main">
        {!preview ? (
          <>
            <Alert tone="info" title="在离线手机上">
              打开 NetProof Air → 「导出 xpub · 供插件钱包扫码登录」，然后把手机的动画二维码对准这个摄像头。
            </Alert>
            <CameraPreview
              videoRef={videoRef}
              hint={error ?? `${state.hint}（已解码 ${state.decoded} 帧，已恢复 ${state.solved}/${state.total}）`}
              solved={state.solved}
              total={state.total}
              error={null}
            />
            {error ? <Alert tone="danger">{error}</Alert> : null}
          </>
        ) : (
          <>
            <Alert tone="up" title="读取成功">
              已从 {preview.device.name} 导入 {preview.accounts.length} 个账户级 xpub。
            </Alert>
            <div className="np-card">
              <KeyValue label="钱包指纹" value={preview.fingerprint} mono />
              <KeyValue label="设备" value={`${preview.device.name} · ${preview.device.model}`} />
              <KeyValue
                label="BIP39 Passphrase"
                value={preview.passphraseProtected ? '已启用（签名时需要）' : '未启用'}
                tone={preview.passphraseProtected ? 'warn' : undefined}
              />
              <KeyValue label="根 xpub" value={preview.rootXpub === preview.accounts[0]?.xpub ? '未导出' : '已导出'} />
            </div>
            <div className="np-list">
              {preview.schemes.map((scheme) => {
                const accounts = preview.accounts.filter((entry) => entry.scheme === scheme.id);
                return (
                  <div className="np-list__item np-list__item--static" key={scheme.id}>
                    <div className="np-grow">
                      <div className="np-subtitle">{scheme.label}</div>
                      <div className="np-body np-body--tight">
                        {scheme.receive.replace('{account}', '0').replace('{index}', 'i')}
                      </div>
                    </div>
                    <Badge tone="accent">{accounts.length} 个账户</Badge>
                  </div>
                );
              })}
            </div>
            {preview.passphraseProtected ? (
              <Alert tone="warn" title="这台设备启用了 passphrase">
                每次签名时都需要在手机上输入 passphrase。请确保你记得它。
              </Alert>
            ) : null}
          </>
        )}
      </div>
      <div className="np-footer">
        {preview ? (
          <>
            <Button block onClick={() => void confirm()}>
              保存并完成连接
            </Button>
            <Button variant="ghost" onClick={() => setPreview(null)}>
              重新扫描
            </Button>
          </>
        ) : (
          <Button variant="ghost" onClick={() => { collectorRef.current.reset(); setError(null); }}>
            重置扫描进度
          </Button>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Approval: the air-gap round trip
// ---------------------------------------------------------------------------

type ApprovalState =
  | { step: 'loading' }
  | { step: 'missing' }
  | { step: 'needs-wallet'; request: PendingRequest }
  | { step: 'connect'; request: PendingRequest }
  | { step: 'outgoing'; request: PendingRequest; message: SignRequestMessage; summary: TransactionSummary | null }
  | { step: 'verifying'; request: PendingRequest; message: SignRequestMessage; response: SignResponseMessage }
  | { step: 'done'; message: string }
  | { step: 'error'; message: string };

function ApproveScreen({
  id,
  wallet,
  settings,
  onSettings,
  onPaired,
  onDone,
}: {
  id: string;
  wallet: ConnectedWallet | null;
  settings: CompanionSettings;
  onSettings: (patch: Partial<CompanionSettings>) => Promise<void>;
  onPaired: () => Promise<void>;
  onDone: (message: string) => void;
}): ReactNode {
  const [state, setState] = useState<ApprovalState>({ step: 'loading' });
  const evmRequestRef = useRef<EvmTransactionRequest | null>(null);
  const collectorRef = useRef(new FrameCollector('NP-SIG'));
  const [scanning, setScanning] = useState(false);

  const forward = useCallback(
    (method: string, params: unknown[]) =>
      forwardToNode(method, params, {
        rpcUrl: settings.rpcUrls[settings.chainId] ?? '',
        chainId: settings.chainId,
      }),
    [settings.chainId, settings.rpcUrls],
  );

  // Build the outgoing QR payload for the pending request.
  useEffect(() => {
    void (async () => {
      const request = await getPending(id);
      if (!request) {
        setState({ step: 'missing' });
        return;
      }
      if (request.kind === 'connect') {
        setState(wallet ? { step: 'connect', request } : { step: 'needs-wallet', request });
        return;
      }
      if (!wallet) {
        setState({ step: 'needs-wallet', request });
        return;
      }
      try {
        let message: SignRequestMessage;
        if (request.kind === 'sendTransaction' || request.kind === 'signTransaction') {
          message = await buildTransactionRequest({
            wallet,
            settings,
            params: request.params,
            origin: request.origin,
            forward,
          });
          evmRequestRef.current = toEvm(message);
        } else if (request.kind === 'personal_sign') {
          message = buildMessageRequest({
            wallet,
            settings,
            kind: 'personal_sign',
            params: request.params,
            origin: request.origin,
          });
        } else {
          message = buildMessageRequest({
            wallet,
            settings,
            kind: 'signTypedData',
            params: request.params,
            origin: request.origin,
          });
        }
        const summary =
          message.kind === 'tx' && evmRequestRef.current ? describeTransaction(evmRequestRef.current) : null;
        setState({ step: 'outgoing', request, message, summary });
        setScanning(true);
      } catch (caught) {
        setState({ step: 'error', message: (caught as Error).message });
      }
    })();
  }, [id, wallet, settings, forward]);

  /** Called for every QR frame decoded from the device's signature QR. */
  const onScanText = useCallback(
    (text: string): FrameCollectorProgress => {
      const collector = collectorRef.current;
      const progress = collector.addText(text);
      if (!collector.complete) return progress;
      setScanning(false);
      void (async () => {
        try {
          const decoded = decodeMessage(collector.result());
          if (decoded.t !== 'sig') throw new Error('扫描到的不是签名结果');
          await finishApproval(decoded);
        } catch (caught) {
          setState({ step: 'error', message: (caught as Error).message });
        }
      })();
      return progress;
    },
    // `finishApproval` is recreated per render but only uses refs and current state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, settings, forward],
  );

  const { videoRef, state: scanState } = useQrScanner({
    active: scanning,
    expectedType: 'NP-SIG',
    onText: onScanText,
  });

  /**
   * Verify and deliver. Nothing reaches the dApp until all three checks pass.
   */
  const finishApproval = useCallback(
    async (response: SignResponseMessage): Promise<void> => {
      if (state.step !== 'outgoing') return;
      const { request, message } = state;
      setState({ step: 'verifying', request, message, response });

      const fail = async (reason: string): Promise<void> => {
        await chrome.runtime.sendMessage({
          type: 'approval-result',
          id: request.id,
          error: { code: 4001, message: reason },
        });
        setState({ step: 'error', message: reason });
      };

      if (response.id !== message.id) return fail('签名响应的请求 ID 不匹配，已忽略。');
      if (response.claim !== message.claim) return fail('签名响应的请求摘要不匹配：设备签的可能不是你看到的这笔请求。');
      if (!response.ok) return fail(response.error ?? '硬件钱包拒绝了签名。');
      if (response.address.toLowerCase() !== message.address.toLowerCase()) {
        return fail(`签名地址 ${response.address} 与预期账户 ${message.address} 不一致。`);
      }

      if (response.kind === 'tx') {
        if (!response.raw) return fail('签名响应中没有交易数据。');
        const evm = evmRequestRef.current;
        const verification = await verifySignedTransaction(response.raw, {
          from: message.address,
          hash: response.digest,
          ...(evm ? { request: evm } : {}),
        });
        if (!verification.ok) return fail(`签名校验失败：${verification.reasons.join('；')}`);

        if (request.kind === 'signTransaction') {
          await chrome.runtime.sendMessage({ type: 'approval-result', id: request.id, result: response.raw });
          setState({ step: 'done', message: '已返回签名交易（未广播）' });
          onDone('已返回签名交易');
          return;
        }
        if (!settings.autoBroadcast) {
          await chrome.runtime.sendMessage({ type: 'approval-result', id: request.id, result: response.raw });
          setState({ step: 'done', message: '已返回签名交易（未广播）' });
          return;
        }
        try {
          const hash = (await forward('eth_sendRawTransaction', [response.raw])) as string;
          await chrome.runtime.sendMessage({ type: 'approval-result', id: request.id, result: hash });
          setState({ step: 'done', message: `交易已广播：${hash}` });
          onDone('交易已广播');
        } catch (caught) {
          return fail(`验证通过，但广播失败：${(caught as Error).message}。签名仍然有效，可手动广播。`);
        }
        return;
      }

      if (!response.signature) return fail('签名响应中没有签名值。');
      await chrome.runtime.sendMessage({ type: 'approval-result', id: request.id, result: response.signature });
      setState({ step: 'done', message: '签名已返回给 dApp' });
      onDone('签名已返回给 dApp');
    },
    [state, settings.autoBroadcast, forward, onDone],
  );

  if (state.step === 'loading') {
    return (
      <div className="np-app" style={{ alignItems: 'center', paddingTop: 120 }}>
        <Spinner />
      </div>
    );
  }

  if (state.step === 'missing') {
    return (
      <>
        <Header title="请求已失效" />
        <div className="np-main">
          <Alert tone="warn">这个请求不存在或已被处理。请回到 dApp 重新发起。</Alert>
        </div>
      </>
    );
  }

  if (state.step === 'needs-wallet') {
    return (
      <>
        <Header title="需要先连接硬件钱包" />
        <div className="np-main">
          <Alert tone="info">
            站点 <span className="np-mono">{state.request.origin}</span> 正在请求使用你的账户。请先扫码导入硬件钱包的
            xpub。
          </Alert>
          <ConnectScreen
            existing={wallet}
            onSaved={async (saved) => {
              await saveWallet(saved);
              await onPaired();
            }}
          />
        </div>
      </>
    );
  }

  if (state.step === 'connect') {
    const accounts = wallet ? resolveAccounts(wallet, settings) : [];
    const isChainSwitch = state.request.method === 'wallet_switchEthereumChain';
    const approve = async (): Promise<void> => {
      if (isChainSwitch) {
        const raw = (state.request.params[0] as { chainId?: string } | undefined)?.chainId;
        const chainId = typeof raw === 'string' ? Number.parseInt(raw.replace(/^0x/u, ''), 16) : settings.chainId;
        await onSettings({ chainId });
        await chrome.runtime.sendMessage({ type: 'approval-result', id: state.request.id, result: null });
        setState({ step: 'done', message: `已切换到链 ${chainId}` });
        return;
      }
      await approveOrigin(state.request.origin);
      await chrome.runtime.sendMessage({
        type: 'approval-result',
        id: state.request.id,
        result: [accounts[0]?.address, ...accounts.slice(1).map((entry) => entry.address)].filter(Boolean),
      });
      setState({ step: 'done', message: '已授权该站点' });
    };
    const reject = async (): Promise<void> => {
      await chrome.runtime.sendMessage({
        type: 'approval-result',
        id: state.request.id,
        error: { code: 4001, message: '用户拒绝了连接请求' },
      });
      setState({ step: 'done', message: '已拒绝' });
    };

    return (
      <>
        <Header title={isChainSwitch ? '切换网络' : '连接请求'} subtitle={state.request.origin} />
        <div className="np-main">
          {isChainSwitch ? (
            <Alert tone="info" title="站点请求切换网络">
              {String((state.request.params[0] as { chainId?: string } | undefined)?.chainId ?? '')} →{' '}
              {settings.chainId}
            </Alert>
          ) : (
            <>
              <div className="np-card np-card--hero">
                <div className="np-label">站点请求连接</div>
                <div className="np-hero-amount" style={{ marginTop: 6, fontSize: 20, wordBreak: 'break-all' }}>
                  {state.request.origin}
                </div>
              </div>
              <div className="np-list">
                {accounts.map((account) => (
                  <div className="np-list__item np-list__item--static" key={account.address}>
                    <div className="np-grow">
                      <div className="np-mono">{short(account.address, 10, 8)}</div>
                      <div className="np-body np-body--tight">{account.path}</div>
                    </div>
                  </div>
                ))}
              </div>
              <Alert tone="warn" title="授权后该站点可以">
                读取上述地址、查看余额，并在你每次确认后请求签名。它<span className="np-ink">无法</span>
                在未经你扫码确认的情况下签出任何东西。
              </Alert>
            </>
          )}
        </div>
        <div className="np-footer">
          <Button block onClick={() => void approve()}>
            {isChainSwitch ? '允许切换' : '连接'}
          </Button>
          <Button variant="ghost" onClick={() => void reject()}>
            拒绝
          </Button>
        </div>
      </>
    );
  }

  if (state.step === 'done') {
    return (
      <>
        <Header title="已完成" action={<Badge tone="up">成功</Badge>} />
        <div className="np-main">
          <div className="np-card np-card--hero">
            <div className="np-label">结果</div>
            <div style={{ marginTop: 8, wordBreak: 'break-all', fontSize: 15 }}>{state.message}</div>
          </div>
          <Alert tone="info">这个标签页可以关闭了。</Alert>
        </div>
        <div className="np-footer">
          <Button block onClick={() => window.close()}>
            关闭标签页
          </Button>
        </div>
      </>
    );
  }

  if (state.step === 'error') {
    return (
      <>
        <Header title="签名未完成" action={<Badge tone="down">失败</Badge>} />
        <div className="np-main">
          <Alert tone="danger" title="已阻止">
            {state.message}
          </Alert>
          <Alert tone="info">dApp 会收到一个"用户拒绝"错误。你可以回到站点重新发起。</Alert>
        </div>
        <div className="np-footer">
          <Button block onClick={() => window.close()}>
            关闭标签页
          </Button>
        </div>
      </>
    );
  }

  if (state.step === 'verifying') {
    return (
      <>
        <Header title="校验签名" />
        <div className="np-main" style={{ alignItems: 'center', paddingTop: 60 }}>
          <Spinner />
          <Alert tone="info" title="正在独立校验">
            正在从签名恢复发送方、重算交易哈希，并与你确认过的字段逐项比对。
          </Alert>
        </div>
      </>
    );
  }

  // step === 'outgoing'
  const frames = framesForMessage('NP-REQ', state.message, settings.qrFragmentLength).frames;
  const messageSummary =
    state.message.kind === 'msg'
      ? describePersonalMessage(
          state.message.message?.text ?? '',
          toHex(hashPersonalMessage(messageBytes(state.message)), true),
        )
      : state.message.kind === 'typed' && state.message.typed
        ? describeTypedData(state.message.typed, toHex(hashTypedDataPayload(state.message.typed), true))
        : null;

  return (
    <>
      <Header
        title={state.message.kind === 'tx' ? '等待硬件钱包签名' : '等待消息签名'}
        subtitle={state.request.origin}
        action={<Badge tone="warn">气隙</Badge>}
      />
      <div className="np-main">
        <QrDisplay frames={frames} frameDurationMs={settings.qrFrameDurationMs} caption="用离线手机扫描这个二维码" />

        <div className="np-row np-row--between">
          <span className="np-body np-body--tight">签名请求帧</span>
          <Badge tone="accent">{frames.length} 帧</Badge>
        </div>

        {state.summary ? (
          <div className="np-card">
            <div className="np-label">你将要签名的内容</div>
            <KeyValue label="金额" value={state.summary.valueFormatted} />
            <KeyValue
              label="收款方"
              value={state.summary.to ? short(state.summary.to, 10, 8) : '合约部署'}
              mono
            />
            <KeyValue label="网络" value={state.summary.chainName} />
            <KeyValue label="Gas 上限 / 价格" value={`${state.summary.gas} · ${state.summary.feePerGasLabel}`} />
            <KeyValue label="最大支出" value={state.summary.maxTotalCostFormatted} />
            {state.summary.call ? (
              <KeyValue
                label="合约调用"
                value={`${state.summary.call.name} (${state.summary.call.standard})`}
                tone={state.summary.call.standard === 'unknown' ? 'warn' : undefined}
              />
            ) : null}
            {state.summary.warnings
              .filter((warning) => warning.level === 'danger')
              .map((warning) => (
                <Alert key={warning.code} tone="danger" title="高风险">
                  {warning.message}
                </Alert>
              ))}
          </div>
        ) : null}

        {messageSummary ? (
          <div className="np-card">
            <div className="np-label">{messageSummary.title}</div>
            <pre
              className="np-mono"
              style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 180, overflow: 'auto' }}
            >
              {messageSummary.body}
            </pre>
          </div>
        ) : null}

        <hr className="np-divider" />
        <div className="np-label">第 2 步 · 扫描签名结果</div>
        <CameraPreview
          videoRef={videoRef}
          hint={scanState.hint}
          solved={scanState.solved}
          total={scanState.total}
          error={null}
        />
        <Alert tone="info">
          在手机上确认签名后，手机会显示签名二维码。用这个摄像头扫描它，交易会自动完成广播。
        </Alert>
      </div>
      <div className="np-footer">
        <Button
          variant="ghost"
          onClick={async () => {
            await chrome.runtime.sendMessage({
              type: 'approval-result',
              id: state.request.id,
              error: { code: 4001, message: '用户取消了请求' },
            });
            setState({ step: 'done', message: '已取消' });
          }}
        >
          取消这笔请求
        </Button>
      </div>
    </>
  );
}

function messageBytes(message: SignRequestMessage): Uint8Array {
  return message.message?.hex
    ? fromHex(message.message.hex)
    : new TextEncoder().encode(message.message?.text ?? '');
}

function toEvm(message: SignRequestMessage): EvmTransactionRequest | null {
  const tx = message.tx;
  if (!tx) return null;
  return {
    type: tx.type,
    chainId: message.chainId,
    nonce: tx.nonce,
    to: tx.to,
    value: BigInt(tx.value),
    data: tx.data,
    gas: BigInt(tx.gas),
    ...(tx.maxFeePerGas !== undefined ? { maxFeePerGas: BigInt(tx.maxFeePerGas) } : {}),
    ...(tx.maxPriorityFeePerGas !== undefined
      ? { maxPriorityFeePerGas: BigInt(tx.maxPriorityFeePerGas) }
      : {}),
    ...(tx.gasPrice !== undefined ? { gasPrice: BigInt(tx.gasPrice) } : {}),
  };
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

function AccountsScreen({
  wallet,
  settings,
  onSettings,
}: {
  wallet: ConnectedWallet | null;
  settings: CompanionSettings;
  onSettings: (patch: Partial<CompanionSettings>) => Promise<void>;
}): ReactNode {
  const [balances, setBalances] = useState<Record<string, string>>({});
  if (!wallet) {
    return (
      <>
        <Header title="账户与路径" onBack={() => (window.location.hash = '/connect')} />
        <div className="np-main">
          <Alert tone="warn">尚未连接硬件钱包。</Alert>
        </div>
      </>
    );
  }

  const accounts = resolveAccounts(wallet, settings);
  const rpcUrl = settings.rpcUrls[settings.chainId];

  const loadBalances = async (): Promise<void> => {
    if (!rpcUrl) return;
    const next: Record<string, string> = {};
    for (const account of accounts) {
      try {
        const value = await fetchBalance(account.address, { rpcUrl, chainId: settings.chainId });
        next[account.address] = formatUnits(value, 18, 6);
      } catch {
        next[account.address] = '—';
      }
    }
    setBalances(next);
  };

  return (
    <>
      <Header
        title="账户与派生路径"
        subtitle={`指纹 ${wallet.masterFingerprint}`}
        onBack={() => (window.location.hash = '/settings')}
      />
      <div className="np-main">
        <div className="np-chip-row">
          {wallet.schemes.map((scheme) => (
            <button
              key={scheme.id}
              type="button"
              className={`np-chip${scheme.id === settings.schemeId ? ' np-chip--active' : ''}`}
              onClick={() => void onSettings({ schemeId: scheme.id })}
            >
              {scheme.label}
            </button>
          ))}
        </div>
        <Button variant="secondary" block onClick={() => void loadBalances()}>
          刷新余额
        </Button>
        <div className="np-list">
          {accounts.map((account, index) => (
            <button
              key={account.address}
              type="button"
              className="np-list__item"
              onClick={() => void onSettings({ addressIndex: index })}
            >
              <div className="np-grow">
                <div className="np-subtitle">
                  {balances[account.address] ? `${balances[account.address]} ETH` : `账户 ${index}`}
                </div>
                <div className="np-mono np-ink-3">{short(account.address, 10, 8)}</div>
                <div className="np-body np-body--tight">{account.path}</div>
              </div>
              {index === settings.addressIndex ? <Badge tone="accent">使用中</Badge> : null}
            </button>
          ))}
        </div>
        <div className="np-card np-card--sunken">
          <div className="np-label">关于派生路径</div>
          <div className="np-body np-body--tight" style={{ marginTop: 6 }}>
            这些地址全部由设备导出的 xpub 推导。插件没有任何私钥，因此也无法"导入私钥"或"导出助记词"——
            它连看都看不到。
          </div>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

function SettingsScreen({
  settings,
  wallet,
  onSaved,
  onWiped,
}: {
  settings: CompanionSettings;
  wallet: ConnectedWallet | null;
  onSaved: (settings: CompanionSettings) => void;
  onWiped: () => Promise<void>;
}): ReactNode {
  const [draft, setDraft] = useState(settings);
  const [origins, setOrigins] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const { toast, show } = useToast();

  useEffect(() => {
    void loadApprovedOrigins().then(setOrigins);
  }, []);

  const save = async (): Promise<void> => {
    const next = await saveSettings(draft);
    onSaved(next);
    setSaved(true);
    show('设置已保存');
    window.setTimeout(() => setSaved(false), 1500);
  };

  const chainIds = Object.keys(settings.rpcUrls)
    .map(Number)
    .sort((a, b) => a - b);

  return (
    <>
      <Header title="设置" onBack={() => (window.location.hash = '/accounts')} />
      <div className="np-main">
        <div className="np-card">
          <div className="np-label">当前网络</div>
          <div className="np-chip-row" style={{ marginTop: 10 }}>
            {chainIds.map((chainId) => (
              <button
                key={chainId}
                type="button"
                className={`np-chip${draft.chainId === chainId ? ' np-chip--active' : ''}`}
                onClick={() => setDraft({ ...draft, chainId })}
              >
                {chainLabel(chainId)}
              </button>
            ))}
          </div>
        </div>

        <div className="np-card">
          <div className="np-label">RPC 节点（{chainLabel(draft.chainId)}）</div>
          <input
            className="np-input"
            style={{ marginTop: 8 }}
            value={draft.rpcUrls[draft.chainId] ?? ''}
            placeholder="https://..."
            onChange={(event) =>
              setDraft({
                ...draft,
                rpcUrls: { ...draft.rpcUrls, [draft.chainId]: event.target.value },
              })
            }
          />
          <div className="np-body np-body--tight" style={{ marginTop: 8 }}>
            默认使用公共节点。RPC 提供方能看到你查询的所有地址，如果你在意隐私，请换成自己的节点。
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
              <div className="np-body np-body--tight">
                关闭后，签名结果只会返回给 dApp，由它自己广播。
              </div>
            </div>
          </label>
        </div>

        <div className="np-card">
          <div className="np-label">二维码传输</div>
          <div className="np-chip-row" style={{ marginTop: 10 }}>
            {[
              { label: '稳健', value: 200, duration: 520 },
              { label: '均衡', value: 300, duration: 420 },
              { label: '快速', value: 500, duration: 320 },
            ].map((preset) => (
              <button
                key={preset.label}
                type="button"
                className={`np-chip${draft.qrFragmentLength === preset.value ? ' np-chip--active' : ''}`}
                onClick={() => setDraft({ ...draft, qrFragmentLength: preset.value, qrFrameDurationMs: preset.duration })}
              >
                {preset.label} · {preset.value}B
              </button>
            ))}
          </div>
        </div>

        {origins.length > 0 ? (
          <div className="np-card">
            <div className="np-label">已授权站点</div>
            <div className="np-list" style={{ marginTop: 10 }}>
              {origins.map((origin) => (
                <div className="np-list__item np-list__item--static" key={origin}>
                  <span className="np-grow np-mono">{origin}</span>
                  <Button
                    variant="danger-soft"
                    size="small"
                    onClick={async () => {
                      await revokeOrigin(origin);
                      setOrigins(await loadApprovedOrigins());
                      show('已撤销');
                    }}
                  >
                    撤销
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {wallet ? (
          <div className="np-card">
            <div className="np-label">已配对设备</div>
            <KeyValue label="设备" value={`${wallet.device.name} · ${wallet.device.model}`} />
            <KeyValue label="指纹" value={wallet.masterFingerprint} mono />
            <KeyValue label="连接时间" value={new Date(wallet.connectedAt).toLocaleString()} />
            <Button variant="danger-soft" block onClick={() => void onWiped()}>
              清除配对的 xpub
            </Button>
          </div>
        ) : null}

        <div className="np-card np-card--sunken">
          <div className="np-label">安全模型</div>
          <div className="np-body np-body--tight" style={{ marginTop: 6 }}>
            本插件只保存 xpub，永远不保存私钥与助记词。任何签名都必须由离线手机在屏幕上确认，
            并通过二维码回到这里。因此"浏览器被攻破"最多导致地址泄露与签名请求被伪造——
            而伪造的请求会在设备屏幕上显示为实际内容，并在这里被二次校验。
          </div>
        </div>
      </div>
      <div className="np-footer">
        <Button block onClick={() => void save()} disabled={saved}>
          {saved ? '已保存' : '保存设置'}
        </Button>
      </div>
      <Toast message={toast} />
    </>
  );
}

function chainLabel(chainId: number): string {
  const names: Record<number, string> = {
    1: 'Ethereum',
    10: 'Optimism',
    56: 'BNB Chain',
    137: 'Polygon',
    8453: 'Base',
    42161: 'Arbitrum',
    43114: 'Avalanche',
    11155111: 'Sepolia',
  };
  return names[chainId] ?? `Chain ${chainId}`;
}

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <Tab />
    </StrictMode>,
  );
}
