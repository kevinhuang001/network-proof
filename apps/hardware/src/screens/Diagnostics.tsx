declare const __NP_BUILD__: string;

import type { ReactNode } from 'react';
import { useState } from 'react';
import { Alert, Button, Header } from '../components/primitives';
import { TextField } from '@netproof/ui/text-field';
import { QR_PRESET_ORDER } from '../lib/qrPresets';
import { decoderSelfTest } from '../lib/photoScan';
import { useSession } from '../state/session';

/**
 * Settings.
 *
 * Deliberately short. A device that holds nothing but keys has very little to
 * configure, and every extra line here is a line the user has to read before they can
 * get back to the two things the device is for.
 */
/**
 * The decoder's own self-test.
 *
 * 「一直不行一直不行」 is a fair thing to say after this many rounds, and 「是不是你的二维码识别有
 * 问题啊」 is a fair question. It is also one this screen can answer without a camera: the phone
 * builds a QR code, turns it into a JPEG the way a photograph arrives, and reads it back through
 * the same code that reads photographs. A failure here is mine; a pass moves the whole
 * conversation to the camera.
 */
function DecoderSelfTest(): ReactNode {
  const [result, setResult] = useState<{ ok: boolean; steps: { name: string; ok: boolean; detail: string }[] } | null>(
    null,
  );
  const [running, setRunning] = useState(false);

  return (
    <div className="np-card">
      <div className="np-label">扫码自检</div>
      <div className="np-body np-body--tight" style={{ marginTop: 6 }}>
        不用相机：本机生成一张二维码，转成 JPEG，再用读照片的同一段代码读回来。
      </div>
      <Button
        variant="secondary"
        size="small"
        disabled={running}
        onClick={() => {
          setRunning(true);
          void decoderSelfTest().then((next) => {
            setResult(next);
            setRunning(false);
          });
        }}
      >
        {running ? '正在自检…' : '运行自检'}
      </Button>
      {result ? (
        <div style={{ marginTop: 10 }}>
          <Alert tone={result.ok ? 'info' : 'danger'} title={result.ok ? '解码链路正常' : '解码链路有问题（是软件的问题）'}>
            {result.ok
              ? '本机的二维码识别是好的，问题在照片或相机那一侧。'
              : '软件自己读不出自己画的二维码，请把这一屏拍下来。'}
          </Alert>
          {result.steps.map((step) => (
            <div className="np-body np-body--tight" key={step.name}>
              {`${step.ok ? '✓' : '✗'} ${step.name}：${step.detail}`}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Which build this is, so "install the new one" is answerable from the screen. */
function BuildCard(): ReactNode {
  return (
    <div className="np-card">
      <div className="np-label">版本</div>
      <div className="np-body np-body--tight np-num" style={{ marginTop: 6 }}>
        {__NP_BUILD__}
      </div>
    </div>
  );
}

export function DiagnosticsScreen({
  onBack,
  onWipe,
}: {
  onBack: () => void;
  onWipe: () => void;
}): ReactNode {
  const { settings, updateSettings, wipe } = useSession();
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [wipePhrase, setWipePhrase] = useState('');

  return (
    <>
      <Header title="设置" onBack={onBack} />
      <div className="np-main">
        <BuildCard />
        <DecoderSelfTest />
        <div className="np-card">
          <div className="np-label">扫码速度</div>
          <div className="np-chip-row" style={{ marginTop: 10 }}>
            {QR_PRESET_ORDER.map(({ label, preset }) => (
              <button
                key={label}
                type="button"
                className={`np-chip${
                  settings.qrFragmentLength === preset.fragmentLength ? ' np-chip--active' : ''
                }`}
                onClick={() =>
                  updateSettings({
                    qrFragmentLength: preset.fragmentLength,
                    qrFrameDurationMs: preset.frameDurationMs,
                  })
                }
              >
                {label}
              </button>
            ))}
          </div>
          <div className="np-body np-body--tight" style={{ marginTop: 8 }}>
            扫不上会自动切到「稳健」。
          </div>
        </div>

        <div className="np-card">
          <div className="np-label">Solana 默认登录派生数量</div>
          <div className="np-chip-row" style={{ marginTop: 10 }}>
            {[5, 10, 20].map((count) => (
              <button
                key={count}
                type="button"
                className={`np-chip${settings.solanaAddressCount === count ? ' np-chip--active' : ''}`}
                onClick={() => updateSettings({ solanaAddressCount: count })}
              >
                {count}
              </button>
            ))}
          </div>
          <div className="np-body np-body--tight" style={{ marginTop: 8 }}>
            Solana 没有可观察的账户公钥，导出的是地址本身，这里定登录时导出几个。
          </div>
        </div>

        <div className="np-card">
          <div className="np-label">危险操作</div>
          <p className="np-body np-body--tight" style={{ marginTop: 6 }}>
            删除本机全部钱包，<span className="np-ink">无法恢复</span>。
          </p>
          {!confirmWipe ? (
            <Button variant="danger-soft" block onClick={() => setConfirmWipe(true)}>
              擦除这台设备
            </Button>
          ) : (
            <div className="np-stack">
              <Alert tone="danger" title="最后确认">
                请输入 <span className="np-mono">ERASE</span> 以确认擦除。
              </Alert>
              <TextField
                className="np-input np-input--mono"
                lang="en"
                value={wipePhrase}
                placeholder="ERASE"
                onChange={setWipePhrase}
              />
              <Button
                variant="danger"
                block
                disabled={wipePhrase !== 'ERASE'}
                onClick={() => {
                  wipe();
                  onWipe();
                }}
              >
                永久擦除
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setConfirmWipe(false);
                  setWipePhrase('');
                }}
              >
                取消
              </Button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
