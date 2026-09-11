import type { ReactNode } from 'react';
import { useState } from 'react';
import { Alert, Button, Header } from '../components/primitives';
import { useSession } from '../state/session';

/**
 * Settings.
 *
 * Deliberately short. A device that holds nothing but keys has very little to
 * configure, and every extra line here is a line the user has to read before they can
 * get back to the two things the device is for.
 */
export function DiagnosticsScreen({
  onBack,
  onWipe,
  onLock,
}: {
  onBack: () => void;
  onWipe: () => void;
  onLock: () => void;
}): ReactNode {
  const { settings, updateSettings, wipe } = useSession();
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [wipePhrase, setWipePhrase] = useState('');

  return (
    <>
      <Header title="设置" onBack={onBack} />
      <div className="np-main">
        <div className="np-card">
          <div className="np-label">扫码速度</div>
          <div className="np-chip-row" style={{ marginTop: 10 }}>
            {[
              { label: '稳健', value: 200, duration: 520 },
              { label: '均衡', value: 300, duration: 420 },
              { label: '快速', value: 500, duration: 320 },
            ].map((preset) => (
              <button
                key={preset.label}
                type="button"
                className={`np-chip${
                  settings.qrFragmentLength === preset.value ? ' np-chip--active' : ''
                }`}
                onClick={() =>
                  updateSettings({ qrFragmentLength: preset.value, qrFrameDurationMs: preset.duration })
                }
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className="np-body np-body--tight" style={{ marginTop: 8 }}>
            扫不上就换「稳健」。
          </div>
        </div>

        <div className="np-card">
          <div className="np-label">Solana 地址数量</div>
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
            Solana 没有可观察的账户公钥，所以导出的是地址本身。
          </div>
        </div>

        <Button block variant="secondary" onClick={onLock}>
          锁定设备
        </Button>

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
              <input
                className="np-input np-input--mono"
                value={wipePhrase}
                placeholder="ERASE"
                autoCapitalize="characters"
                onChange={(event) => setWipePhrase(event.target.value)}
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
