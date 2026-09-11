import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FrameCollector,
  decodeMessage,
  describePersonalMessage,
  describeTransaction,
  describeTypedData,
  fromHex,
  framesForMessage,
  hashPersonalMessage,
  hashTypedDataPayload,
  toHex,
  verifySignedTransaction,
  type EvmTransactionRequest,
  type FrameCollectorProgress,
  type SignRequestMessage,
  type SignResponseMessage,
  type TransactionSummary,
} from '@netproof/core';
import { buildMessageRequest, buildTransactionRequest, forwardToNode } from '@netproof/companion';
import type { PendingRequest } from '@netproof/companion';
import { useCompanion } from '../App';
import { getPending, removePending } from '../lib/store';
import {
  Alert,
  Badge,
  Button,
  CameraPanel,
  KeyValue,
  QrDisplay,
  Spinner,
  shortAddress,
  useQrScanner,
} from '../ui/kit';

/**
 * The signing flow — the one place where a request becomes a broadcast.
 *
 * Three checks stand between the device's answer and the network, and all three
 * must pass. They exist because the QR channel is public: anyone who can see the
 * screen can also show a code to the camera.
 *
 *   1. the response echoes our request id *and* its `claim` hash, so it can only be
 *      an answer to the exact request we sent;
 *   2. the signature recovers to the account the user approved;
 *   3. the signed payload is byte-identical to the fields we displayed and the
 *      device displayed.
 */

type State =
  | { step: 'loading' }
  | { step: 'missing' }
  | { step: 'needs-wallet' }
  | { step: 'error'; message: string }
  | {
      step: 'outgoing';
      request: PendingRequest;
      message: SignRequestMessage;
      summary: TransactionSummary | null;
    }
  | { step: 'verifying'; request: PendingRequest }
  | { step: 'done'; title: string; detail: string; hash?: string; signature?: string };

export function SignScreen({ id }: { id: string }): ReactNode {
  const { wallet, settings, navigate, refresh, show, addActivity } = useCompanion();
  const [state, setState] = useState<State>({ step: 'loading' });
  const evmRequestRef = useRef<EvmTransactionRequest | null>(null);
  const collectorRef = useRef(new FrameCollector('NP-SIG'));

  const forward = useCallback(
    (method: string, params: unknown[]) =>
      forwardToNode(method, params, {
        rpcUrl: settings.rpcUrls[settings.chainId] ?? '',
        chainId: settings.chainId,
      }),
    [settings.chainId, settings.rpcUrls],
  );

  useEffect(() => {
    const request = getPending(id);
    if (!request) {
      setState({ step: 'missing' });
      return;
    }
    if (!wallet) {
      setState({ step: 'needs-wallet' });
      return;
    }
    if (request.method === 'eth_requestAccounts' || request.kind === 'connect') {
      // The web companion has no injected provider, so "connect" is just pairing.
      setState({ step: 'needs-wallet' });
      return;
    }

    let cancelled = false;
    void (async () => {
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
        if (cancelled) return;
        const summary =
          message.kind === 'tx' && evmRequestRef.current
            ? describeTransaction(evmRequestRef.current)
            : null;
        setState({ step: 'outgoing', request, message, summary });
      } catch (caught) {
        if (!cancelled) setState({ step: 'error', message: (caught as Error).message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, wallet, settings, forward]);

  /**
   * Verify and deliver. Every failure path removes the request and reports an
   * error: a half-finished approval that stays queued would be worse than a failed
   * one, because the user would have no idea whether it went through.
   */
  const finish = useCallback(
    async (outgoing: Extract<State, { step: 'outgoing' }>, response: SignResponseMessage) => {
      const { request, message } = outgoing;
      setState({ step: 'verifying', request });

      const fail = (message: string): void => {
        removePending(request.id);
        setState({ step: 'error', message });
      };

      if (response.id !== message.id) return fail('签名响应的请求 ID 不匹配，已忽略。');
      if (response.claim !== message.claim) {
        return fail('签名响应的请求摘要不匹配：设备签的可能不是你看到的这笔请求。');
      }
      if (!response.ok) return fail(response.error ?? '硬件钱包拒绝了这次签名。');
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
        removePending(request.id);

        // `eth_signTransaction` means "give me the payload", not "broadcast it".
        if (request.kind === 'signTransaction' || !settings.autoBroadcast) {
          addActivity({
            hash: verification.hash,
            chainId: settings.chainId,
            from: message.address,
            to: message.tx?.to ?? null,
            value: message.tx?.value ?? '0',
            kind: message.tx?.data && message.tx.data !== '0x' ? 'contract' : 'send',
            status: 'signed',
            timestamp: Date.now(),
          });
          setState({
            step: 'done',
            title: '已取得签名交易（未广播）',
            detail: '校验通过。下方是完整的已签名载荷，你可以自行广播。',
            signature: response.raw,
          });
          return;
        }

        const record = {
          chainId: settings.chainId,
          from: message.address,
          to: message.tx?.to ?? null,
          value: message.tx?.value ?? '0',
          kind: (message.tx?.data && message.tx.data !== '0x' ? 'contract' : 'send') as 'contract' | 'send',
          timestamp: Date.now(),
        };
        try {
          const hash = (await forward('eth_sendRawTransaction', [response.raw])) as string;
          addActivity({ ...record, hash, status: 'broadcast' });
          setState({
            step: 'done',
            title: '交易已广播',
            detail: '设备签名通过校验，交易已发送到网络。',
            hash,
          });
          show('交易已广播');
        } catch (caught) {
          // The signature is still valid; do not throw it away just because the node
          // was unreachable. Record it as failed-but-signed and show the payload.
          addActivity({
            ...record,
            hash: verification.hash,
            status: 'failed',
            error: (caught as Error).message,
            rawTransaction: response.raw,
          });
          setState({
            step: 'done',
            title: '广播失败，但签名有效',
            detail: `广播时出错：${(caught as Error).message}。校验已通过，你可以复制下方的载荷自行广播。`,
            signature: response.raw,
          });
        }
        return;
      }

      if (!response.signature) return fail('签名响应中没有签名值。');
      removePending(request.id);
      setState({
        step: 'done',
        title: response.kind === 'typed' ? 'EIP-712 签名已完成' : '消息签名已完成',
        detail: '签名由离线设备产生，已通过地址与摘要校验。',
        signature: response.signature,
      });
      show('签名完成');
    },
    [forward, settings.autoBroadcast, show, addActivity, settings.chainId],
  );

  // `outgoing` covers only the state that has a message to display and frame;
  // `request` also covers the verifying state, which still needs its heading.
  const outgoing = state.step === 'outgoing' ? state : null;
  const activeRequest =
    state.step === 'outgoing' || state.step === 'verifying' ? state.request : null;

  const onText = useCallback(
    (text: string) => {
      const collector = collectorRef.current;
      const progress = collector.addText(text);
      if (collector.complete && state.step === 'outgoing') {
        try {
          const decoded = decodeMessage(collector.result());
          if (decoded.t !== 'sig') throw new Error('扫描到的不是签名结果二维码');
          void finish(state, decoded);
        } catch (caught) {
          setState({ step: 'error', message: (caught as Error).message });
        }
      }
      return {
        decoded: 0,
        rejected: progress.rejectedFrames,
        solved: progress.solved,
        total: progress.total,
        hint: progress.hint,
      };
    },
    [state, finish],
  );

  const { videoRef, state: scanState, error: cameraError } = useQrScanner({
    active: state.step === 'outgoing',
    expectedType: 'NP-SIG',
    onText,
  });

  const frames = useMemo(
    () =>
      outgoing
        ? framesForMessage('NP-REQ', outgoing.message, settings.qrFragmentLength).frames
        : [],
    [outgoing, settings.qrFragmentLength],
  );

  if (state.step === 'loading') {
    return (
      <div className="np-main" style={{ alignItems: 'center', paddingTop: 80 }}>
        <Spinner />
      </div>
    );
  }

  if (state.step === 'missing') {
    return (
      <div className="np-main">
        <Alert tone="warn" title="请求已失效">
          这条签名请求不存在或已被处理。请回到「dApp 测试台」重新发起。
        </Alert>
        <Button block onClick={() => navigate({ name: 'developer' })}>
          去发起请求
        </Button>
      </div>
    );
  }

  if (state.step === 'needs-wallet') {
    return (
      <div className="np-main">
        <Alert tone="info" title="需要先配对硬件钱包">
          这个网页自身不能被 dApp 发现（没有浏览器扩展那样的注入能力），所以流程是：
          先在离线设备上显示 xpub 二维码，然后在这个页面扫码导入。
        </Alert>
        <Button block onClick={() => navigate({ name: 'connect' })}>
          扫码导入 xpub
        </Button>
      </div>
    );
  }

  if (state.step === 'error') {
    return (
      <div className="np-main">
        <Alert tone="danger" title="已阻止">
          {state.message}
        </Alert>
        <Alert tone="info">
          交易没有被广播，签名也不可用。请检查设备屏幕上显示的内容是否与你预期一致，然后重新发起。
        </Alert>
        <Button block onClick={() => navigate({ name: 'developer' })}>
          重新发起
        </Button>
      </div>
    );
  }

  if (state.step === 'done') {
    return (
      <div className="np-main">
        <div className="np-card np-card--hero">
          <div className="np-label">结果</div>
          <div className="np-title" style={{ color: '#fff', marginTop: 8 }}>
            {state.title}
          </div>
          <p className="np-body" style={{ color: 'rgba(255,255,255,.66)', marginTop: 8 }}>
            {state.detail}
          </p>
        </div>
        {state.hash ? (
          <div className="np-card">
            <div className="np-label">交易哈希</div>
            <div className="np-address" style={{ marginTop: 8 }}>
              {state.hash}
            </div>
          </div>
        ) : null}
        {state.signature ? (
          <div className="np-card">
            <div className="np-label">签名 / 已签名载荷</div>
            <div className="np-address" style={{ marginTop: 8, maxHeight: 160, overflow: 'auto' }}>
              {state.signature}
            </div>
          </div>
        ) : null}
        <div className="np-grid-2">
          <Button onClick={() => navigate({ name: 'home' })}>回到钱包</Button>
          <Button variant="secondary" onClick={() => navigate({ name: 'send' })}>
            再发一笔
          </Button>
        </div>
      </div>
    );
  }

  // step: 'outgoing' | 'verifying'
  const message = outgoing?.message ?? null;
  const summary = outgoing?.summary ?? null;

  const messageSummary =
    message?.kind === 'msg'
      ? describePersonalMessage(
          message.message?.text ?? '',
          toHex(hashPersonalMessage(messageTextBytes(message)), true),
        )
      : message?.kind === 'typed' && message.typed
        ? describeTypedData(message.typed, toHex(hashTypedDataPayload(message.typed), true))
        : null;

  return (
    <>
      <div className="np-main">
        <div className="np-row np-row--between">
          <h2 className="np-headline" style={{ fontSize: 20 }}>
            {activeRequest?.kind === 'personal_sign' || activeRequest?.kind === 'signTypedData'
              ? '扫码签名消息'
              : '扫码签名交易'}
          </h2>
          <Badge tone="warn">需要离线设备</Badge>
        </div>

        {state.step === 'verifying' ? (
          <Alert tone="info" title="正在校验签名">
            正在从签名恢复发送方、重算交易哈希，并与你确认过的字段逐项比对。
          </Alert>
        ) : null}

        {summary ? (
          <div className="np-card">
            <div className="np-label">你将要签名的内容</div>
            <div className="np-title" style={{ marginTop: 6 }}>
              {summary.valueFormatted}
            </div>
            <KeyValue
              label="收款方"
              value={summary.to ? shortAddress(summary.to, 10, 8) : '合约部署（无收款方）'}
              mono
              tone={summary.toKind === 'contract-creation' ? 'warn' : undefined}
            />
            <KeyValue label="网络" value={`${summary.chainName} (${summary.chainId})`} />
            <KeyValue label="Nonce" value={summary.nonce} />
            <KeyValue label="Gas 上限 / 价格" value={`${summary.gas} · ${summary.feePerGasLabel}`} />
            <KeyValue label="最大可能支出" value={summary.maxTotalCostFormatted} />
            {summary.call ? (
              <KeyValue
                label="合约调用"
                value={`${summary.call.name}（${summary.call.standard}）`}
                tone={summary.call.standard === 'unknown' ? 'warn' : undefined}
              />
            ) : null}
            {summary.warnings
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
              style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 200, overflow: 'auto', margin: '10px 0 0' }}
            >
              {messageSummary.body}
            </pre>
          </div>
        ) : null}

        <div className="np-card np-card--sunken">
          <div className="np-label">第 1 步 · 让离线设备扫描这个二维码</div>
          <div className="np-body np-body--tight" style={{ marginTop: 6 }}>
            打开 NetProof Air →「扫描并签名」→ 对准下面的二维码。
            设备会独立解析并显示同一笔交易的内容；只有当你在**手机屏幕上**确认后才会签名。
          </div>
        </div>

        {frames.length > 0 ? (
          <QrDisplay
            frames={frames}
            frameDurationMs={settings.qrFrameDurationMs}
            caption="用离线手机扫描这个二维码"
          />
        ) : null}

        <hr className="np-divider" />
        <div className="np-label">第 2 步 · 扫描手机的签名结果</div>
        <CameraPanel
          videoRef={videoRef}
          hint={scanState.hint}
          solved={scanState.solved}
          total={scanState.total}
          error={cameraError}
        />
        <Alert tone="info">
          手机确认签名后会显示签名二维码，用这个摄像头扫描它。校验通过后会自动广播（可在设置里关闭）。
        </Alert>
      </div>
      <div className="np-footer">
        <Button
          variant="ghost"
          onClick={() => {
            removePending(id);
            refresh();
            navigate({ name: 'developer' });
          }}
        >
          取消这笔请求
        </Button>
      </div>
    </>
  );
}

function messageTextBytes(message: SignRequestMessage): Uint8Array {
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

export type { FrameCollectorProgress };
