import type { ReactNode } from 'react';
import { useState } from 'react';
import { Alert, Button, Header } from '../components/primitives';
import { TextField } from '@netproof/ui/text-field';
import { useSession } from '../state/session';
import { BuildCard, QrSpeedSettings, SolanaAccountSettings } from './settings/Preferences';

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
        <QrSpeedSettings
          fragmentLength={settings.qrFragmentLength}
          onChange={(qrFragmentLength, qrFrameDurationMs) => updateSettings({qrFragmentLength, qrFrameDurationMs})}
        />
        <SolanaAccountSettings
          count={settings.solanaAddressCount}
          onChange={(solanaAddressCount) => updateSettings({solanaAddressCount})}
        />
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
