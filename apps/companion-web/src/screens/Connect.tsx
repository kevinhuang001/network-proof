import type { ReactNode } from 'react';
import { useCallback, useRef, useState } from 'react';
import {
  FrameCollector,
  buildXpubMessage,
  decodeMessage,
  type FrameCollectorProgress,
  type XpubExportMessage,
} from '@netproof/core';
import { walletFromXpubMessage } from '@netproof/companion';
import { useCompanion } from '../App';
import {
  Alert,
  Badge,
  Button,
  CameraPanel,
  KeyValue,
  shortAddress as short,
  useQrScanner,
} from '../ui/kit';

/**
 * Pairing: scan the device's `NP-XPUB` QR.
 *
 * The collector is held in a ref rather than component state because frames arrive
 * from a camera callback and must accumulate across re-renders — losing it would
 * reset the transfer every time a progress badge updated.
 */
export function ConnectScreen(): ReactNode {
  const { wallet, pair, navigate, show } = useCompanion();
  const collectorRef = useRef(new FrameCollector('NP-XPUB'));
  const [scanning, setScanning] = useState(true);
  const [preview, setPreview] = useState<XpubExportMessage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onText = useCallback((text: string) => {
    const collector = collectorRef.current;
    const progress = collector.addText(text);
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
    pair(walletFromXpubMessage(preview), preview.chainId);
    show('已导入 xpub');
    navigate({ name: 'home' });
  };

  return (
    <>
      <div className="np-main">
        <h2 className="np-headline">连接硬件钱包</h2>

        {!preview ? (
          <>
            <Alert tone="info" title="在离线手机上">
              打开 NetProof Air →「导出 xpub · 供插件钱包扫码登录」，然后把手机的动画二维码对准这个摄像头。
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
            <Alert tone="up" title="读取成功">
              已从 {preview.device.name} 导入 {preview.accounts.length} 个账户级 xpub。
            </Alert>
            <div className="np-card">
              <KeyValue label="钱包指纹" value={preview.fingerprint} mono />
              <KeyValue label="设备" value={`${preview.device.name} · ${preview.device.model}`} />
              <KeyValue
                label="BIP39 Passphrase"
                value={preview.passphraseProtected ? '已启用（每次签名都需在手机上输入）' : '未启用'}
                tone={preview.passphraseProtected ? 'warn' : undefined}
              />
              <KeyValue
                label="根 xpub"
                value={preview.rootXpub === preview.accounts[0]?.xpub ? '未导出（更私密）' : '已导出'}
              />
            </div>

            <div className="np-list">
              {preview.schemes.map((scheme) => {
                const count = preview.accounts.filter((entry) => entry.scheme === scheme.id).length;
                return (
                  <div className="np-list__item np-list__item--static" key={scheme.id}>
                    <div className="np-grow">
                      <div className="np-subtitle">{scheme.label}</div>
                      <div className="np-body np-body--tight np-mono">
                        {scheme.receive.replace('{account}', '0').replace('{index}', 'i')}
                      </div>
                    </div>
                    <Badge tone="accent">{count} 个账户</Badge>
                  </div>
                );
              })}
            </div>

            <div className="np-card">
              <div className="np-label">前 3 个地址</div>
              <div className="np-list" style={{ marginTop: 8 }}>
                {preview.accounts
                  .filter((entry) => entry.scheme === 'bip44')
                  .slice(0, 3)
                  .map((account) => (
                    <div className="np-list__item np-list__item--static" key={account.xpubPath}>
                      <div className="np-grow">
                        <div className="np-mono">{short(account.firstAddress, 10, 8)}</div>
                        <div className="np-body np-body--tight">{account.firstAddressPath}</div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            {preview.passphraseProtected ? (
              <Alert tone="warn" title="这台设备启用了 passphrase">
                每次签名时都需要在手机上输入 passphrase。请确认你记得它——丢了它，助记词也救不回来。
              </Alert>
            ) : null}

            {wallet ? (
              <Alert tone="info">
                已配对的钱包将被替换（当前指纹 {wallet.masterFingerprint}）。
              </Alert>
            ) : null}
          </>
        ) : null}
      </div>

      <div className="np-footer">
        {preview ? (
          <>
            <Button block onClick={confirm}>
              保存并完成配对
            </Button>
            <Button variant="ghost" onClick={() => setPreview(null)}>
              重新扫描
            </Button>
          </>
        ) : (
          <Button variant="ghost" onClick={() => navigate({ name: 'home' })}>
            返回总览
          </Button>
        )}
      </div>
    </>
  );
}

export { buildXpubMessage };
export type { FrameCollectorProgress };
