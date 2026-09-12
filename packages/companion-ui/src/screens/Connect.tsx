import type { ReactNode } from 'react';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  FrameCollector,
  buildXpubMessage,
  decodeMessage,
  type FrameCollectorProgress,
  type XpubExportMessage,
} from '@netproof/core';
import { deriveAddressFromXpub } from '@netproof/core';
import { walletFromXpubMessage } from '@netproof/companion';
import { TextField } from '@netproof/ui/text-field';
import { useCompanion } from '../App';
import { useSurface } from '../surface';
import {
  Alert,
  Button,
  CameraPanel,
  Header,
  KeyValue,
  shortAddress as short,
  useQrScanner,
} from '../ui/kit';

/**
 * Pairing: scan the device's login QR, which carries the account xpubs.
 *
 * The collector is held in a ref rather than component state because frames arrive
 * from a camera callback and must accumulate across re-renders — losing it would
 * reset the transfer every time a progress badge updated.
 */
export function ConnectScreen(): ReactNode {
  const { wallets, pair, navigate, show, hasPasscode } = useCompanion();
  const surface = useSurface();
  const collectorRef = useRef(new FrameCollector('NP-XPUB'));
  const [scanning, setScanning] = useState(true);
  const [preview, setPreview] = useState<XpubExportMessage | null>(null);
  // A paired wallet is a named thing — with several, "NetProof Air" repeated three times
  // tells the user nothing about which one they are looking at.
  const [name, setName] = useState('');

  /*
   * The first few addresses, derived from the exported key.
   *
   * This used to list `preview.accounts`, which is the *export* — one key now, so one row,
   * next to a heading that promised three. The addresses a user recognises are the key's
   * children, and showing them is also the first proof that the derivation works.
   */
  const firstAddresses = useMemo(() => {
    if (!preview) return [];
    const account = preview.accounts.find((entry) => entry.scheme === 'bip44');
    if (!account) return [];
    return [0, 1, 2].flatMap((index) => {
      try {
        return [deriveAddressFromXpub(account.xpub, 'bip44', 0, index, account.xpubPath)];
      } catch {
        return [];
      }
    });
  }, [preview]);
  const [error, setError] = useState<string | null>(null);

  const onText = useCallback((text: string) => {
    const collector = collectorRef.current;
    const progress = collector.addText(text);
    if (collector.complete) {
      try {
        const message = decodeMessage(collector.result());
        if (message.t !== 'xpub') throw new Error('扫描到的不是登录二维码');
        setPreview(message);
        setScanning(false);
      } catch (caught) {
        setError((caught as Error).message);
      }
    }
    return {
      decoded: 0,
      rejected: progress.rejectedFrames,
      solved: progress.solved,
      total: progress.total,
      hint: progress.hint,
    };
  }, []);

  const { videoRef, state, error: cameraError } = useQrScanner({
    active: scanning && !preview,
    expectedType: 'NP-XPUB',
    onText,
  });

  const confirm = (): void => {
    if (!preview) return;
    pair(walletFromXpubMessage(preview), preview.chainId, name.trim());
    show('已添加钱包');
    // The first wallet has to be given a passcode before it can be used. It is not a
    // suggestion: a companion wallet with no lock is readable by anyone who opens the browser,
    // and that decision is made once, here, rather than left for a later settings screen the
    // user may never open.
    navigate(hasPasscode ? { name: 'home' } : { name: 'set-passcode', required: true });
  };

  // A popup cannot hold a camera prompt: it closes the moment it loses focus, and the
  // permission dialog takes focus. So the flow moves to a tab, in one tap.
  if (surface.kind === 'popup') {
    return (
      <>
        <Header title="添加钱包" onBack={() => navigate({ name: 'home' })} />
        <div className="np-main">
          <Alert tone="info" title="需要摄像头">
            扫码要在完整页面里进行。
          </Alert>
          <Button block onClick={() => surface.openInTab?.('/connect')}>
            在新标签页里扫码
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="添加钱包" onBack={() => navigate({ name: 'home' })} />
      <div className="np-main">

        {!preview ? (
          <>
            <Alert tone="info" title="在离线手机上">
              打开 NetProof Air →「登录插件钱包」，把手机上的二维码对准这个摄像头。
            </Alert>
            <CameraPanel
              videoRef={videoRef}
              hint={state.hint}
              solved={state.solved}
              total={state.total}
              error={cameraError}
            />
            {state.decoded > 0 ? (
              <div className="np-body np-body--tight np-center">
                已解码 {state.decoded} 帧，忽略 {state.rejected} 帧
              </div>
            ) : null}
            {error ? <Alert tone="danger">{error}</Alert> : null}

            <Button
              variant="ghost"
              onClick={() => {
                collectorRef.current.reset();
                setError(null);
              }}
            >
              重置扫描进度
            </Button>

          </>
        ) : null}

        {preview ? (
          <>
            {/* The fingerprint is the identity; the device's own name is the scanner's
                name for itself, which the user just scanned and is about to replace with a
                name of their own. */}
            <Alert tone="up" title="读取成功">
              指纹 {preview.fingerprint}
            </Alert>

            {/*
              One xpub, and the accounts derived from it.
              
              The scheme list and the "N 个账户级 xpub" badge are gone. The device exports
              one BIP44 account key, and account i is `m/44'/60'/0'/0/i` — derivable without
              limit from that key, so a count here was never a cap on anything, and three
              schemes was a choice whose only possible effect was landing the user on an
              address they did not recognise.
            */}
            <div className="np-card">
              {/* Required, and left empty on purpose: a default would be accepted without
                  being read, and with two devices paired "NetProof Air" twice is no name. */}
              <div className="np-label">钱包名称（必填）</div>
              <TextField
                className="np-input"
                style={{ marginTop: 8 }}
                value={name}
                maxLength={24}
                placeholder="例如：主钱包"
                onChange={setName}
              />
            </div>

            <div className="np-card">
              <KeyValue label="派生路径" value="m/44'/60'/0'/0/i" mono />
            </div>

            <div className="np-card">
              <div className="np-label">前 3 个地址</div>
              <div className="np-list" style={{ marginTop: 8 }}>
                {firstAddresses.map((entry) => (
                  <div className="np-list__item np-list__item--static" key={entry.path}>
                    <div className="np-grow">
                      <div className="np-mono">{short(entry.address, 10, 8)}</div>
                      <div className="np-body np-body--tight">{entry.path}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {wallets.some((entry) => entry.id === preview.fingerprint) ? (
              <Alert tone="info">这个钱包已经配过，会更新它。</Alert>
            ) : null}
          </>
        ) : null}
      </div>

      <div className="np-footer">
        {preview ? (
          <>
            <Button block disabled={name.trim().length === 0} onClick={confirm}>
              添加这个钱包
            </Button>
            <Button variant="secondary" onClick={() => setPreview(null)}>
              重新扫描
            </Button>
          </>
        ) : null}
      </div>
    </>
  );
}

export { buildXpubMessage };
export type { FrameCollectorProgress };
