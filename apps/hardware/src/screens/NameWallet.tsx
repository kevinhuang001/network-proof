import type { ReactNode } from 'react';
import { useState } from 'react';
import { Button, Header } from '../components/primitives';
import { WalletIcon } from '../components/icons';

/**
 * Name a wallet before saving it.
 *
 * A device that holds several wallets needs names, not fingerprints — the
 * fingerprint is what the *companion* verifies, but "哪一个是我的主钱包" is a
 * question only a human-readable label answers.
 *
 * Kept as a field on the final step rather than a screen of its own: one more tap
 * for a one-word input is friction without benefit.
 */
export function NameWalletScreen({
  title,
  subtitle,
  actionLabel,
  defaultName,
  busy,
  onBack,
  onConfirm,
}: {
  title: string;
  subtitle: string;
  actionLabel: string;
  defaultName: string;
  busy?: boolean;
  onBack: () => void;
  onConfirm: (name: string) => void;
}): ReactNode {
  const [name, setName] = useState(defaultName);
  const trimmed = name.trim();

  return (
    <>
      <Header title={title} subtitle={subtitle} onBack={onBack} />
      <div className="np-main">
        <div className="np-field">
          <label className="np-label" htmlFor="wallet-name">
            钱包名称
          </label>
          <div className="np-row">
            <span className="np-icon-btn" style={{ border: 0, background: 'var(--np-bg-sunken)' }}>
              <WalletIcon size={18} />
            </span>
            <input
              id="wallet-name"
              className="np-input np-grow"
              value={name}
              autoFocus
              maxLength={24}
              placeholder="例如：主钱包"
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && trimmed.length > 0) onConfirm(trimmed);
              }}
            />
          </div>
          <div className="np-body np-body--tight">只显示在这台设备上，不会发给插件钱包。</div>
        </div>
      </div>
      <div className="np-footer">
        <Button block disabled={trimmed.length === 0 || busy} onClick={() => onConfirm(trimmed)}>
          {actionLabel}
        </Button>
      </div>
    </>
  );
}
