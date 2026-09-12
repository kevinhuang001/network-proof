import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  HDKey,
  PROTOCOL_VERSION,
  decodeMessage,
  deriveAddressFromXpub,
  derivePath,
  describePersonalMessage,
  describeTransaction,
  describeTypedData,
  autoFramesForMessage,
  singleFrameForMessage,
  fromHex,
  hashPersonalMessage,
  hashTypedDataPayload,
  mnemonicToSeed,
  publicKeyToAddress,
  shortAddress,
  signPersonalMessage,
  signTransaction,
  signTypedData,
  toHex,
} from '@netproof/core';
import type {
  EvmTransactionRequest,
  FrameCollectorProgress,
  SignRequestMessage,
  SignResponseMessage,
  TransactionSummary,
} from '@netproof/core';
import { Alert, Badge, Button, Header, KeyValue, PasswordField, haptic } from '../components/primitives';
import { CameraStage, QrDisplay } from '../components/QrDisplay';
import { isAbortError } from '../lib/camera';
import { ROBUST_FALLBACK_MS } from '../lib/qrPresets';
import { useRobustQrFallback } from '../lib/useRobustQrFallback';
import { scanHint, startQrScan } from '../lib/scanner';
import type { ScanStatus } from '../lib/scanner';
import type { ScanHandle } from '../lib/scanner';
import { useSession } from '../state/session';

/**
 * The signing flow: scan a request, understand it, sign it, show the answer.
 *
 * The security-critical property of this file: the review screen and the signer
 * consume the *same* decoded object. There is no second parser and no path that
 * signs raw bytes supplied by the companion, so what the user reads on the review
 * screen is exactly what gets signed.
 */

export function ScanRequestScreen({
  onDecoded,
  onBack,
}: {
  onDecoded: (request: SignRequestMessage) => void;
  onBack: () => void;
}): ReactNode {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scanRef = useRef<ScanHandle | null>(null);
  const [progress, setProgress] = useState<FrameCollectorProgress | null>(null);
  /** What the camera is doing, as opposed to what the decode progress implies it is doing. */
  const [status, setStatus] = useState<ScanStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (!started) return;
    let cancelled = false;
    // See CaptureScreen: StrictMode runs this effect twice, and both runs used to leave
    // a second camera stream open. The controller cancels the first cleanly.
    const controller = new AbortController();
    void (async () => {
      try {
        const handle = await startQrScan({
          video: videoRef.current!,
          expectedType: 'NP-REQ',
          signal: controller.signal,
          onProgress: (next) => {
            if (!cancelled) setProgress(next);
          },
          onStatus: (next) => {
            if (!cancelled) setStatus(next);
          },
          onComplete: (payload) => {
            if (cancelled) return;
            handle.stop();
            try {
              const message = decodeMessage(payload);
              if (message.t !== 'req') throw new Error('扫描到的不是签名请求');
              haptic([10, 40, 10]);
              onDecoded(message);
            } catch (caught) {
              setError((caught as Error).message);
            }
          },
          onError: (caught) => {
            if (!cancelled) setError(caught.message);
          },
        });
        if (cancelled) {
          handle.stop();
          return;
        }
        scanRef.current = handle;
      } catch (caught) {
        // An interrupted start is our own shutdown, not a camera failure.
        if (!cancelled && !isAbortError(caught)) setError((caught as Error).message);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
      scanRef.current?.stop();
      scanRef.current = null;
    };
  }, [started, onDecoded]);

  const fraction = progress && progress.total > 0 ? progress.solved / progress.total : 0;

  return (
    <>
      <Header title="扫描签名请求" onBack={onBack} />
      <div className="np-main">
        {!started ? (
          <>
            <h2 className="np-headline">扫描插件钱包的二维码</h2>
            <p className="np-body">在插件钱包里发起请求，扫它显示的二维码。</p>
          </>
        ) : (
          <CameraStage
            videoRef={videoRef}
            hint={scanHint({ status, progress })}
            progressLabel={progress?.total ? `${progress.solved}/${progress.total} 分片` : '等待二维码'}
            progressValue={fraction}
            tone={fraction >= 1 ? 'up' : 'neutral'}
          />
        )}

        {error ? <Alert tone="danger">{error}</Alert> : null}
        {progress && progress.rejectedFrames > 3 ? (
          <Alert tone="warn" title="扫到了别的二维码">
            摄像头读出了二维码，但它不是这次要签名的请求（类型不符或属于另一次传输）。
            请确认插件钱包屏幕上显示的就是当前这笔请求。
          </Alert>
        ) : null}
        {progress && progress.duplicateFrames > 10 ? (
          <Alert tone="warn">重复扫到同一帧，请确认插件钱包的二维码动画正在播放。</Alert>
        ) : null}
      </div>
      {!started ? (
        <div className="np-footer">
          <Button block onClick={() => setStarted(true)}>
            打开摄像头
          </Button>
        </div>
      ) : null}
    </>
  );
}

export function ReviewScreen({
  request,
  onSigned,
  onBack,
}: {
  request: SignRequestMessage;
  onSigned: (response: SignResponseMessage) => void;
  onBack: () => void;
}): ReactNode {
  const { wallet, mnemonic, passphrase, passphraseRequired, rekey } = useSession();
  const [manualPassphrase, setManualPassphrase] = useState('');
  const [showRaw, setShowRaw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Driven by what the *wallet* requires, not by what the session happens to hold.
  // The old check used the exported `passphraseProtected`, which is computed from the
  // session passphrase — so unlocking with an empty passphrase suppressed this prompt
  // entirely and the user only found out via an unexplained address mismatch.
  const needsPassphrase = passphraseRequired && passphrase.length === 0;
  const effectivePassphrase = passphrase.length > 0 ? passphrase : manualPassphrase;

  const decoded: { summary: TransactionSummary | null; error: string | null } = useMemo(() => {
    if (request.kind !== 'tx' || !request.tx) return { summary: null, error: null };
    try {
      return { summary: describeTransaction(toEvmRequest(request)), error: null };
    } catch (caught) {
      return { summary: null, error: (caught as Error).message };
    }
  }, [request]);

  const messageSummary = useMemo(() => {
    if (request.kind === 'msg') {
      const bytes = request.message?.hex
        ? fromHex(request.message.hex)
        : new TextEncoder().encode(request.message?.text ?? '');
      return describePersonalMessage(request.message?.text ?? '', toHex(hashPersonalMessage(bytes), true));
    }
    if (request.kind === 'typed' && request.typed) {
      return describeTypedData(request.typed, toHex(hashTypedDataPayload(request.typed), true));
    }
    return null;
  }, [request]);

  // Confirm the request names an account this device actually holds, using public
  // data only. This runs before any signature exists, so a companion cannot ask
  // for a signature from an account the user never approved.
  const addressCheck = useMemo(() => {
    if (!wallet) return { status: 'mismatch' as const, reason: '没有已解锁的钱包' };
    return checkRequestAccount(wallet.accounts, request.path, request.address);
  }, [wallet, request.path, request.address]);

  const sign = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    // Yield a frame so the button paints its busy state before the CPU-bound
    // PBKDF2 (2048 rounds) and the ECDSA signature run.
    await new Promise((resolve) => window.setTimeout(resolve, 20));
    try {
      if (!mnemonic) throw new Error('钱包未解锁');
      const response = signRequest(request, mnemonic, effectivePassphrase);
      if (manualPassphrase.length > 0 && passphrase.length === 0) rekey(manualPassphrase);
      haptic(30);
      onSigned(response);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const warnings = [...(decoded.summary?.warnings ?? []), ...(messageSummary?.warnings ?? [])];
  const danger = warnings.filter((warning) => warning.level === 'danger');
  const rest = warnings.filter((warning) => warning.level !== 'danger');

  return (
    <>
      <Header title="确认签名" onBack={onBack} action={<Badge tone="warn">离线签名</Badge>} />
      <div className="np-main">
        {request.origin ? (
          <div className="np-card np-card--sunken">
            <div className="np-label">请求来源</div>
            <div className="np-subtitle" style={{ marginTop: 4 }}>
              {request.origin}
            </div>
          </div>
        ) : null}

        {danger.map((warning) => (
          <Alert key={warning.code} tone="danger" title="高风险">
            {warning.message}
          </Alert>
        ))}

        {decoded.error ? <Alert tone="danger" title="无法解析这笔交易">{decoded.error}</Alert> : null}

        {decoded.summary ? (
          <>
            <div className="np-card np-card--hero">
              <div className="np-label">签名内容 · 交易</div>
              <div className="np-hero-amount" style={{ marginTop: 6, fontSize: 30 }}>
                {decoded.summary.valueFormatted}
              </div>
              <div className="np-body" style={{ color: 'rgba(255,255,255,.6)', marginTop: 8 }}>
                最大可能支出 {decoded.summary.maxTotalCostFormatted}
              </div>
            </div>

            <div className="np-card">
              <KeyValue label="网络" value={`${decoded.summary.chainName} (${decoded.summary.chainId})`} />
              <KeyValue
                label="收款方"
                value={
                  decoded.summary.to
                    ? shortAddress(decoded.summary.to, 10, 8)
                    : '合约部署（无收款方）'
                }
                mono
                tone={decoded.summary.toKind === 'contract-creation' ? 'warn' : undefined}
              />
              <KeyValue label="类型" value={decoded.summary.type === 'eip1559' ? 'EIP-1559' : 'Legacy'} />
              <KeyValue label="Nonce" value={decoded.summary.nonce} />
              <KeyValue label="Gas 上限" value={decoded.summary.gas.toString()} />
              <KeyValue label="Gas 价格" value={decoded.summary.feePerGasLabel} />
              <KeyValue label="数据长度" value={`${decoded.summary.dataLength} 字节`} />
            </div>

            {decoded.summary.call ? (
              <div className="np-card">
                <div className="np-row np-row--between">
                  <span className="np-label">调用解析</span>
                  <Badge tone={decoded.summary.call.standard === 'unknown' ? 'warn' : 'accent'}>
                    {decoded.summary.call.standard}
                  </Badge>
                </div>
                <div className="np-title" style={{ marginTop: 6 }}>
                  {decoded.summary.call.name}
                </div>
                <div className="np-mono np-ink-3">{decoded.summary.call.signature}</div>
                <hr className="np-divider" style={{ margin: '12px 0' }} />
                {decoded.summary.call.parameters.map((parameter) => (
                  <KeyValue
                    key={`${parameter.name}-${parameter.value}`}
                    label={parameter.name}
                    value={
                      parameter.type === 'address'
                        ? shortAddress(parameter.value, 10, 8)
                        : parameter.value.length > 26
                          ? `${parameter.value.slice(0, 26)}…`
                          : parameter.value
                    }
                    mono
                    tone={parameter.value.includes('无限') ? 'down' : undefined}
                  />
                ))}
              </div>
            ) : null}
          </>
        ) : null}

        {messageSummary ? (
          <div className="np-card">
            <div className="np-label">{messageSummary.title}</div>
            <pre
              className="np-mono"
              style={{
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                margin: '10px 0 0',
                maxHeight: 220,
                overflow: 'auto',
              }}
            >
              {messageSummary.body}
            </pre>
          </div>
        ) : null}

        {rest.map((warning) => (
          <Alert key={warning.code} tone={warning.level === 'warn' ? 'warn' : 'info'}>
            {warning.message}
          </Alert>
        ))}

        <div className="np-card">
          <KeyValue label="签名账户" value={shortAddress(request.address, 8, 6)} mono />
          <KeyValue label="派生路径" value={request.path} mono />
          <div className="np-row" style={{ marginTop: 10 }}>
            <Badge
              tone={
                addressCheck.status === 'verified' ? 'up' : addressCheck.status === 'unverified' ? 'warn' : 'down'
              }
            >
              {addressCheck.status === 'verified'
                ? '账户校验通过'
                : addressCheck.status === 'unverified'
                  ? '该路径无法用 xpub 校验'
                  : '账户校验失败'}
            </Badge>
          </div>
          {addressCheck.status === 'mismatch' ? <Alert tone="danger">{addressCheck.reason}</Alert> : null}
          {addressCheck.status === 'unverified' ? <Alert tone="warn">{addressCheck.reason}</Alert> : null}
        </div>

        <button
          type="button"
          className="np-btn np-btn--ghost"
          onClick={() => setShowRaw((value) => !value)}
        >
          {showRaw ? '隐藏原始数据' : '查看将要签名的原始数据'}
        </button>
        {showRaw ? (
          <div className="np-address">{decoded.summary?.unsignedSerialized ?? request.claim}</div>
        ) : null}

        {needsPassphrase ? (
          <div className="np-card">
            <div className="np-label">BIP39 Passphrase</div>
            <p className="np-body np-body--tight">
              这台设备的钱包启用了 passphrase，但本次会话没有载入。请输入，
              否则推导出的是<span className="np-ink">不带 passphrase 的那个钱包</span>——
              请求里的地址会对不上，签名会被拒绝。
            </p>
            <PasswordField
              value={manualPassphrase}
              onChange={setManualPassphrase}
              placeholder="第 25 个词"
            />
            <div className="np-body np-body--tight" style={{ marginTop: 8 }}>
              输入后将仅保留在本次会话内存中，锁定即清除。
            </div>
          </div>
        ) : null}

        {error ? <Alert tone="danger">{error}</Alert> : null}

        <div className="np-alert np-alert--info">
          <span className="np-alert__icon" aria-hidden>
            ℹ
          </span>
          <div className="np-grow">
            签名哈希 <span className="np-mono">{(decoded.summary?.signingHash ?? messageSummary?.digest ?? '—').slice(0, 24)}…</span>
            <br />
            插件钱包会用同一个哈希校验签名，任何字段不符都会被拒绝。
          </div>
        </div>
      </div>
      <div className="np-footer">
        <Button block disabled={busy || addressCheck.status === 'mismatch'} onClick={() => void sign()}>
          {busy ? '正在签名…' : '确认签名'}
        </Button>
        <Button variant="ghost" onClick={onBack}>
          取消
        </Button>
      </div>
    </>
  );
}

export function SignatureScreen({
  response,
  onDone,
}: {
  response: SignResponseMessage;
  onDone: () => void;
}): ReactNode {
  const { settings, wallet } = useSession();
  // Same fallback as the login code, with a shorter fuse: by the time a signature is on
  // screen the user is already holding the phone over it, so silence means trouble.
  const scanSpeed = useRobustQrFallback(true, ROBUST_FALLBACK_MS.signature, {
    fragmentLength: settings.qrFragmentLength,
    frameDurationMs: settings.qrFrameDurationMs,
  });
  const frames = useMemo(
    () =>
      // Same reasoning as the companion's request code: a signature is small enough to be one
      // static code, and a static code is one the webcam can catch whenever it is ready.
      singleFrameForMessage('NP-SIG', response)?.frames ??
      autoFramesForMessage('NP-SIG', response, scanSpeed.preset.fragmentLength).frames,
    [response, scanSpeed.preset.fragmentLength],
  );

  return (
    <>
      <Header title="签名结果" action={<Badge tone="up">已签名</Badge>} />
      <div className="np-main">
        <QrDisplay
          frames={frames}
          frameDurationMs={scanSpeed.preset.frameDurationMs}
          caption={scanSpeed.downgraded ? '已切到稳健速度 · 让插件钱包扫描取回签名' : '让插件钱包扫描取回签名'}
        />
        <div className="np-card">
          <KeyValue
            label="类型"
            value={response.kind === 'tx' ? '交易' : response.kind === 'typed' ? 'EIP-712' : '文本消息'}
          />
          <KeyValue label="签名地址" value={shortAddress(response.address, 8, 6)} mono />
          <KeyValue label="内容哈希" value={`${response.digest.slice(0, 26)}…`} mono />
          <KeyValue label="钱包指纹" value={wallet?.masterFingerprint ?? '—'} mono />
        </div>
        <Alert tone="info" title="接下来">
          插件钱包扫描完成后会自动广播交易（或返回签名结果）。这台设备始终保持离线，不需要也不应该联网确认。
        </Alert>
      </div>
      <div className="np-footer">
        <Button block onClick={onDone}>
          完成
        </Button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function toEvmRequest(request: SignRequestMessage): EvmTransactionRequest {
  const tx = request.tx;
  if (!tx) throw new Error('请求中没有交易内容');
  return {
    type: tx.type,
    chainId: request.chainId,
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

/**
 * Derive the key for the requested path and sign. The derived address is compared
 * against the address in the request *before* anything is signed, so a request
 * that names a path and an address that do not agree is refused outright.
 */
function signRequest(
  request: SignRequestMessage,
  mnemonic: string,
  passphrase: string,
): SignResponseMessage {
  const seed = mnemonicToSeed(mnemonic, passphrase);
  const root = HDKey.fromMasterSeed(seed);
  const node = derivePath(root, request.path);
  if (!node.privateKey || !node.publicKey) throw new Error('无法从该路径派生私钥');
  const address = publicKeyToAddress(node.publicKey);
  if (address.toLowerCase() !== request.address.toLowerCase()) {
    throw new Error(`派生地址 ${address} 与请求中的 ${request.address} 不一致，已拒绝签名`);
  }

  if (request.kind === 'tx') {
    const signed = signTransaction(toEvmRequest(request), node.privateKey);
    return {
      t: 'sig',
      v: PROTOCOL_VERSION,
      id: request.id,
      ok: true,
      kind: 'tx',
      address: signed.from,
      claim: request.claim,
      digest: signed.hash,
      raw: signed.rawTransaction,
    };
  }

  if (request.kind === 'msg') {
    const bytes = request.message?.hex
      ? fromHex(request.message.hex)
      : new TextEncoder().encode(request.message?.text ?? '');
    const signature = signPersonalMessage(bytes, node.privateKey);
    return {
      t: 'sig',
      v: PROTOCOL_VERSION,
      id: request.id,
      ok: true,
      kind: 'msg',
      address,
      claim: request.claim,
      digest: toHex(hashPersonalMessage(bytes), true),
      signature: signature.serialized,
    };
  }

  if (request.kind === 'typed' && request.typed) {
    const signature = signTypedData(request.typed, node.privateKey);
    return {
      t: 'sig',
      v: PROTOCOL_VERSION,
      id: request.id,
      ok: true,
      kind: 'typed',
      address,
      claim: request.claim,
      digest: toHex(hashTypedDataPayload(request.typed), true),
      signature: signature.serialized,
    };
  }

  throw new Error(`不支持或缺少内容的请求类型：${request.kind}`);
}

export type AccountCheckStatus = 'verified' | 'unverified' | 'mismatch';

/**
 * Check that a request names an account this device holds, using public data only.
 *
 * Three outcomes, not two:
 *  - `verified`   — a standard BIP44 path whose address matches the exported xpub.
 *  - `unverified` — a path we cannot cross-check with an exported xpub (Ledger
 *                   Live, legacy chains, or an account we did not export). Signing
 *                   is still allowed, but the user is warned.
 *  - `mismatch`   — the path and the claimed address disagree. This is the
 *                   attack-shaped case and it blocks signing entirely.
 */
export function checkRequestAccount(
  accounts: { xpub: string; scheme: string; account: number }[],
  path: string,
  claimedAddress: string,
): { status: AccountCheckStatus; reason: string } {
  const match = /^m\/44'\/60'\/(\d+)'\/(\d+)\/(\d+)$/u.exec(path);
  if (!match) {
    return {
      status: 'unverified',
      reason: `路径 ${path} 不属于标准 BIP44 形式，无法用已导出的 xpub 校验。签名前请自行核对地址。`,
    };
  }
  const account = Number(match[1]);
  const index = Number(match[3]);
  const entry = accounts.find(
    (candidate) => candidate.scheme === 'bip44' && candidate.account === account,
  );
  if (!entry) {
    return {
      status: 'unverified',
      reason: `请求使用了账户 ${account}，但设备未导出该账户的 xpub，无法自动校验。`,
    };
  }
  const expected = deriveAddressFromXpub(entry.xpub, 'bip44', account, index).address;
  if (expected.toLowerCase() !== claimedAddress.toLowerCase()) {
    return {
      status: 'mismatch',
      reason: `路径 ${path} 对应地址 ${shortAddress(expected, 8, 6)}，与请求声明的 ${shortAddress(claimedAddress, 8, 6)} 不一致。可能是插件钱包被篡改，已阻止签名。`,
    };
  }
  return { status: 'verified', reason: '' };
}


