import type { ReactNode } from 'react';
import { useState } from 'react';
import { Alert, Button, Header } from '../components/primitives';
import { TextField } from '@netproof/ui/text-field';
import { QR_PRESET_ORDER } from '../lib/qrPresets';
import { lastScanReport } from '../lib/scanner';
import type { ScanPhase } from '../lib/scanner';
import { useSession } from '../state/session';

/**
 * Settings.
 *
 * Deliberately short. A device that holds nothing but keys has very little to
 * configure, and every extra line here is a line the user has to read before they can
 * get back to the two things the device is for.
 */
/**
 * The last scan, as numbers.
 *
 * Not on the scan screen — a resolution under a viewfinder is a number to read at the wrong
 * moment — but this is the first thing a person asked to help needs, and "it is blurry" is not
 * a debugging method. Empty until a scan has run in this session.
 */
const PHASE_LABEL: Record<ScanPhase, string> = {
  opening: '正在打开',
  live: '画面正常',
  searching: '没扫到二维码',
  'no-signal': '摄像头没有出画面',
  dark: '画面全黑（镜头被挡或环境太暗）',
  blank: '画面没有对比度',
  frozen: '画面卡住不动',
};

declare const __NP_BUILD__: string;

function CameraCard(): ReactNode {
  const report = lastScanReport();
  if (report === null) {
    return (
      <div className="np-card">
        <div className="np-label">版本</div>
        <div className="np-body np-body--tight np-num" style={{ marginTop: 6 }}>
          {__NP_BUILD__}
        </div>
      </div>
    );
  }
  const info = report.info;
  return (
    <div className="np-card">
      <div className="np-label">上次扫码</div>
      <div className="np-row np-row--between" style={{ marginTop: 8 }}>
        <span className="np-body">摄像头</span>
        <span className="np-body np-num">
          {info && info.width > 0
            ? `${info.width}×${info.height}${info.frameRate === null ? '' : ` @${info.frameRate}`}`
            : '未知'}
        </span>
      </div>
      <div className="np-row np-row--between">
        <span className="np-body">画面</span>
        <span className="np-body">{PHASE_LABEL[report.phase]}</span>
      </div>
      <div className="np-row np-row--between">
        <span className="np-body">已采样 / 已解出 / 读错</span>
        <span className="np-body np-num">
          {report.frames} / {report.decoded} / {report.rejected}
        </span>
      </div>
      <div className="np-row np-row--between">
        <span className="np-body">二维码每模块</span>
        <span className="np-body np-num">
          {report.estimate ? `${report.estimate.modulePx.toFixed(1)} 像素` : '没测到'}
        </span>
      </div>
      <div className="np-row np-row--between">
        <span className="np-body">解码输入 / 码区域</span>
        <span className="np-body np-num">
          {`${report.sampleSize.width}×${report.sampleSize.height}`}
          {report.codeSize ? ` / ${report.codeSize.width}×${report.codeSize.height}` : ' / 未找到'}
        </span>
      </div>
      <div className="np-row np-row--between">
        <span className="np-body">清晰度（码区域 / 整帧）</span>
        <span className="np-body np-num">
          {report.codeSharpness === null ? '—' : report.codeSharpness.toFixed(0)} /{' '}
          {report.sharpness.toFixed(0)}
        </span>
      </div>
      <div className="np-label" style={{ marginTop: 10 }}>
        版本
      </div>
      <div className="np-body np-body--tight np-num">{__NP_BUILD__}</div>
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
        <CameraCard />
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
