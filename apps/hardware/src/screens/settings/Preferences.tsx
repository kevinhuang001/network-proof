import type { ReactNode } from 'react';
import { QR_PRESET_ORDER } from '../../lib/qrPresets';

declare const __NP_BUILD__: string;

export function BuildCard(): ReactNode {
  return (
    <div className="np-card np-card--raised">
      <div className="np-row np-row--between">
        <span className="np-label">版本信息</span>
        <span className="np-badge np-badge--up">离线设备</span>
      </div>
      <div className="np-body np-body--tight np-num" style={{ marginTop: 12, overflowWrap: 'anywhere' }}>
        {__NP_BUILD__}
      </div>
      <p className="np-body np-body--tight" style={{ marginTop: 8 }}>
        密钥只保存在本机；设备不需要联网即可签名。
      </p>
    </div>
  );
}

export function QrSpeedSettings({fragmentLength, onChange}: {
  fragmentLength: number;
  onChange: (fragmentLength:number, frameDurationMs:number) => void;
}): ReactNode {
  return (
    <section className="np-card">
      <h2 className="np-subtitle">二维码传输速度</h2>
      <p className="np-body np-body--tight" style={{ margin: '7px 0 12px' }}>
        影响本机向插件展示动态二维码的密度和切换速度。无法扫码时自动使用稳健模式。
      </p>
      <div className="np-chip-row" role="group" aria-label="二维码传输速度">
        {QR_PRESET_ORDER.map(({ label, preset }) => (
          <button key={label} type="button"
            aria-pressed={fragmentLength === preset.fragmentLength}
            className={`np-chip${fragmentLength === preset.fragmentLength ? ' np-chip--active' : ''}`}
            onClick={() => onChange(preset.fragmentLength, preset.frameDurationMs)}>
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}

export function SolanaAccountSettings({count, onChange}: {
  count: number;
  onChange: (count: number) => void;
}): ReactNode {
  return (
    <section className="np-card">
      <h2 className="np-subtitle">Solana 登录地址数量</h2>
      <div className="np-chip-row" role="group" aria-label="Solana 登录地址数量" style={{ marginTop: 12 }}>
        {[5, 10, 20].map((option) => (
          <button key={option} type="button" aria-pressed={count === option}
            className={`np-chip${count === option ? ' np-chip--active' : ''}`}
            onClick={() => onChange(option)}>{option}</button>
        ))}
      </div>
      <p className="np-body np-body--tight" style={{ marginTop: 10 }}>
        Solana 使用手机明确导出的地址，不支持由在线端无限派生。
      </p>
    </section>
  );
}
