import type { ReactNode } from 'react';
import { useCompanion } from '../App';
import { Button } from '../ui/kit';
import { BrandMark } from '../ui/brand';

/**
 * The companion's empty state.
 *
 * With no device paired there is nothing to observe, so the wallet shows one screen
 * with one action instead of an empty shell with disabled pills. No balance, no
 * account list, no chrome that describes nothing.
 */
export function StartScreen(): ReactNode {
  const { navigate } = useCompanion();

  return (
    <div className="np-fullscreen">
      <div className="np-fullscreen__top">
        <button
          type="button"
          className="np-icon-btn np-icon-btn--plain"
          onClick={() => navigate({ name: 'settings' })}
          aria-label="设置"
        >
          ⚙
        </button>
      </div>

      <div className="np-fullscreen__body">
        <span className="np-brand-mark">
          <BrandMark size={44} />
        </span>
        <h1 className="np-headline">NetProof</h1>
        <p className="np-body" style={{ maxWidth: 260 }}>
          观察钱包。私钥在离线设备上，这里只保存公开信息。
        </p>
      </div>

      <div className="np-fullscreen__actions">
        <Button block onClick={() => navigate({ name: 'connect' })}>
          扫码连接硬件钱包
        </Button>
      </div>
    </div>
  );
}
