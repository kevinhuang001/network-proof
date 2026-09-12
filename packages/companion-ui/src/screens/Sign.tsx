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
import {
  buildMessageRequest,
  buildTransactionRequest,
  forwardToNode,
  nativeSymbol,
} from '@netproof/companion';
import type { PendingRequest } from '@netproof/companion';
import { useCompanion } from '../App';
import { useSurface } from '../surface';
import { getPending, removePending } from '../lib/store';
import { useFeeTiers } from '../lib/fees';
import { chainShowsFiat, formatUsd, useUsdPrice, usdValue } from '../lib/prices';
import { FeeSelector } from '../ui/FeeSelector';
import { formatEth, useVisibleAccounts } from './Wallet';
import {
  Alert,
  Badge,
  Button,
  CameraPanel,
  Header,
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
  /** A dApp is asking to see this wallet's accounts. */
  | { step: 'connect'; request: PendingRequest }
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
  const surface = useSurface();
  const resolve = useCallback(
    (outcome: { result?: unknown; error?: { code: number; message: string } }): void => {
      surface.resolveRequest?.(id, outcome);
    },
    [surface, id],
  );
  const { wallet, settings, navigate, refresh, show, addActivity, addOrigin } = useCompanion();
  const { accounts } = useVisibleAccounts();
  const [state, setState] = useState<State>({ step: 'loading' });
  /**
   * True while the transaction is being rebuilt for a different fee.
   *
   * The QR is what the device scans, so a code still on screen from the previous price must
   * not be scannable: it would produce a signed payload whose claim no longer matches the
   * request, and the wallet would refuse it after the user had already approved it on the
   * phone. So the code is taken away while the new one is built.
   */
  const [rebuilding, setRebuilding] = useState(false);
  /**
   * How far along the signing is, once there is something to sign.
   *
   * `null` means "not chosen yet", and the default is derived from the request: a transaction
   * a site asked for is confirmed first — that is where its price is chosen — while a request
   * whose fee the send form already set, or one with no fee at all, goes straight to the code.
   *
   * The two steps are sequential on purpose. The QR is what the device reads and the camera
   * is what reads the device back; showing both at once meant a user aiming a camera at a
   * screen that was still waiting for them, and it meant a fee could be changed after the
   * transaction had already been displayed as final.
   */
  const [stage, setStage] = useState<'review' | 'code' | 'scan' | null>(null);
  const evmRequestRef = useRef<EvmTransactionRequest | null>(null);
  const collectorRef = useRef(new FrameCollector('NP-SIG'));
  /** False until the request has been turned into a message once. */
  const builtRef = useRef(false);

  const forward = useCallback(
    (method: string, params: unknown[]) =>
      forwardToNode(method, params, {
        rpcUrl: settings.rpcUrls[settings.chainId] ?? '',
        chainId: settings.chainId,
      }),
    [settings.chainId, settings.rpcUrls],
  );
  /*
   * The same three tiers as the send form, for the transactions a site asks for.
   *
   * A dApp sends whatever price it likes; the user is the one who pays it, and a contract
   * call is exactly where an inflated price hides — the amount being moved is often zero, so
   * the fee is the whole cost. Choosing here also means the summary card below and the bytes
   * the device signs are built from the same numbers.
   */
  const fee = useFeeTiers({ rpcUrl: settings.rpcUrls[settings.chainId], chainId: settings.chainId });
  const usdPrice = useUsdPrice(
    nativeSymbol(settings.chainId),
    settings.showFiat && chainShowsFiat(settings.chainId),
  );
  /**
   * Whether the chain has answered yet, and which choice the user has made.
   *
   * The transaction is rebuilt when one of those changes, and *not* when the background poll
   * finds a new price: a QR that vanishes every twenty seconds cannot be scanned, and the
   * price that was signed is the one in the summary card on screen.
   */
  const feeReady = fee.fields !== null;
  const feeChoice = fee.version;

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
      /*
       * A connection request means two different things depending on the host.
       *
       * In the extension a dApp is waiting: it called `eth_requestAccounts` and the service
       * worker is holding that promise open, so somebody has to approve or refuse the site. In
       * the plain web app there is no injected provider and therefore no such caller — the
       * "request" is just this screen's way of saying the wallet is not paired yet.
       *
       * `resolveRequest` is exactly the difference: only a host that can answer a page
       * provides it.
       */
      setState(surface.resolveRequest ? { step: 'connect', request } : { step: 'needs-wallet' });
      return;
    }

    const isTransaction = request.kind === 'sendTransaction' || request.kind === 'signTransaction';
    /*
     * A transaction is not built until the chain has told us what gas costs. Building it with
     * a fallback price would put the wallet's own guess in front of the user as if it were the
     * market, and then the tiers offered next to it would not be what gets signed.
     */
    if (isTransaction && fee.fields === null) {
      if (fee.feeError) {
        const text = '无法读取当前网络费率，已阻止这次签名请求。请检查 RPC 设置后重试。';
        removePending(id);
        setState({ step: 'error', message: text });
        resolve({ error: { code: -32603, message: text } });
      }
      return;
    }

    let cancelled = false;
    if (builtRef.current) setRebuilding(true);
    void (async () => {
      try {
        let message: SignRequestMessage;
        if (isTransaction) {
          message = await buildTransactionRequest({
            wallet,
            settings,
            params: request.params,
            origin: request.origin,
            forward,
            ...(fee.fields ? { fee: fee.fields } : {}),
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
        builtRef.current = true;
        setRebuilding(false);
        setState({ step: 'outgoing', request, message, summary });
      } catch (caught) {
        if (!cancelled) {
          setRebuilding(false);
          setState({ step: 'error', message: (caught as Error).message });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // Deliberately not `fee.fields`: that object is new on every poll, and comparing it would
    // rebuild a code the user might be scanning. A new price is picked by tapping a tier.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, wallet, settings, forward, feeReady, feeChoice, fee.feeError, resolve]);

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
        // A site that is waiting must be told, even when the answer is "no": a promise left
        // open is a spinner in a dApp that never resolves.
        resolve({ error: { code: 4001, message } });
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
          resolve({ result: response.raw });
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
          // `eth_sendTransaction` resolves with the hash; that is what the dApp is holding.
          resolve({ result: hash });
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
          resolve({ error: { code: -32603, message: (caught as Error).message } });
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
      resolve({ result: response.signature });
    },
    [forward, settings.autoBroadcast, show, addActivity, settings.chainId, resolve],
  );

  // `outgoing` covers only the state that has a message to display and frame;
  // `request` also covers the verifying state, which still needs its heading.
  const outgoing = state.step === 'outgoing' ? state : null;
  const activeRequest =
    state.step === 'outgoing' || state.step === 'verifying' ? state.request : null;

  /*
   * Which part of the flow is on screen.
   *
   * A transaction a *site* asked for is confirmed first, and that is where its price is
   * chosen; a transaction whose fee was already set — the send form does that — has nothing
   * left to decide and opens on the code. Chosen values win from then on: once the user is
   * scanning, the fee is what it is.
   */
  const needsReview =
    outgoing !== null && outgoing.message.kind === 'tx' && outgoing.request.feeLocked !== true;
  const stageNow: 'review' | 'code' | 'scan' = stage ?? (needsReview ? 'review' : 'code');

  /*
   * What this transaction will pay, read back out of the request that was built.
   *
   * Not from the price screen: that keeps polling the node, and a number that moves after the
   * bytes were fixed is a number that disagrees with what the device is signing.
   */
  const lockedFee = ((): bigint | null => {
    const tx = outgoing?.message.tx;
    if (!tx) return null;
    const perGas = tx.maxFeePerGas ?? tx.gasPrice;
    return perGas === undefined ? null : BigInt(perGas) * BigInt(tx.gas);
  })();
  const lockedUsd = lockedFee === null ? null : usdValue(lockedFee, usdPrice);

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
    // Only on step 2. A camera that opens while the user is still showing the device a code is
    // a camera that costs battery and attention to no purpose — and on some phones it takes
    // the screen.
    active: state.step === 'outgoing' && stageNow === 'scan',
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

  // Everything before the scan — naming, the request itself, the transaction fields — is a
  // normal screen and runs fine in a popup. It is the camera that cannot, so the hand-off
  // happens here rather than at the door.
  if (surface.kind === 'popup' && state.step === 'outgoing') {
    return (
      <>
        <Header title="签名请求" onBack={() => navigate({ name: 'home' })} />
        <div className="np-main">
          <Alert tone="info" title="需要摄像头">
            扫设备上的签名二维码要在完整页面里进行。
          </Alert>
          <Button block onClick={() => surface.openInTab?.(`/sign/${id}`)}>
            在新标签页里继续
          </Button>
        </div>
      </>
    );
  }

  if (state.step === 'connect') {
    const { request } = state;
    const account = accounts[settings.addressIndex] ?? accounts[0];
    const decide = (allow: boolean): void => {
      removePending(request.id);
      if (allow) addOrigin(request.origin);
      resolve(allow ? { result: null } : { error: { code: 4001, message: '用户拒绝了连接' } });
      navigate({ name: 'home' });
    };
    return (
      <>
        <Header title="连接请求" onBack={() => decide(false)} />
        <div className="np-main">
          <div className="np-card">
            <div className="np-label">网站</div>
            <div className="np-subtitle" style={{ marginTop: 6, wordBreak: 'break-all' }}>
              {request.origin}
            </div>
            {account ? (
              <>
                <div className="np-label" style={{ marginTop: 12 }}>
                  将共享的账户
                </div>
                <div className="np-mono" style={{ marginTop: 6 }}>
                  {account.address}
                </div>
              </>
            ) : null}
          </div>
          {/* Say what this step is *not*: the first question everyone asks here is whether
              they now have to go and fetch the phone. Connecting is bookkeeping. */}
          <Alert tone="info" title="这一步不用签名">
            连接只共享地址，不需要设备。之后每一次签名才要扫二维码，由离线设备确认。
          </Alert>
          <Button block onClick={() => decide(true)}>
            允许
          </Button>
          <Button variant="secondary" block onClick={() => decide(false)}>
            拒绝
          </Button>
        </div>
      </>
    );
  }

  if (state.step === 'missing') {
    return (
      <div className="np-main">
        <Alert tone="warn" title="请求已失效">
          这条签名请求不存在或已被处理。
        </Alert>
        <Button block onClick={() => navigate({ name: 'home' })}>
          回到钱包
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
        <Button block onClick={() => navigate({ name: 'send' })}>
          重新发送
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
            {stageNow === 'review'
              ? '确认交易'
              : activeRequest?.kind === 'personal_sign' || activeRequest?.kind === 'signTypedData'
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

        {/*
          A dApp can put any price in its request; this is where the user takes it back. A
          contract call often moves nothing at all, so the fee is the entire cost of it.

          Only here, and never again: the price is part of the bytes the device signs, and a
          choice offered next to a QR is a choice that can change what is already being signed.
        */}
        {stageNow === 'review' && message?.kind === 'tx' ? (
          <FeeSelector
            tiers={fee.tiers}
            tierId={fee.tierId}
            onSelect={fee.select}
            gas={BigInt(message.tx?.gas ?? '21000')}
            load={fee.load}
            feeError={fee.feeError}
            unit={nativeSymbol(settings.chainId)}
            pendingHint="正在读取这笔交易的 gas"
            usd={usdPrice}
          />
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

        {stageNow === 'review' ? null : (
          <>
            {lockedFee !== null ? (
              <div className="np-card np-card--sunken">
                <KeyValue
                  label="手续费上限"
                  value={`${formatEth(lockedFee)} ${nativeSymbol(settings.chainId)}${
                    lockedUsd === null ? '' : ` ≈ ${formatUsd(lockedUsd)}`
                  }`}
                />
              </div>
            ) : null}

            <div className="np-card np-card--sunken">
              <div className="np-label">第 1 步 · 让离线设备扫描这个二维码</div>
              <div className="np-body np-body--tight" style={{ marginTop: 6 }}>
                打开 NetProof Air →「扫描并签名」。设备会独立解析，并由你在手机上确认。
              </div>
            </div>

            {rebuilding ? (
              <Alert tone="info" title="正在按新的手续费重建请求">
                二维码暂时取下：价格变了，要签的交易也变了，旧的那张不能再扫。
              </Alert>
            ) : frames.length > 0 ? (
              <QrDisplay
                frames={frames}
                frameDurationMs={settings.qrFrameDurationMs}
                caption="用离线手机扫描这个二维码"
              />
            ) : null}

            {/*
              Step 2 appears when the user says step 1 is done. Both at once meant a camera
              pointing at a screen that was still waiting, and no moment at which the
              transaction became final.
            */}
            {stageNow === 'scan' ? (
              <>
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
              </>
            ) : null}
          </>
        )}
      </div>
      <div className="np-footer">
        {stageNow === 'review' ? (
          <Button
            block
            disabled={rebuilding || message === null}
            onClick={() => setStage('code')}
          >
            下一步
          </Button>
        ) : stageNow === 'code' ? (
          <Button block disabled={rebuilding} onClick={() => setStage('scan')}>
            下一步
          </Button>
        ) : null}
        <Button
          variant="ghost"
          onClick={() => {
            removePending(id);
            resolve({ error: { code: 4001, message: '用户拒绝了请求' } });
            refresh();
            navigate({ name: 'home' });
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
