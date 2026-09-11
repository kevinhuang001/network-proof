import type { ReactNode } from 'react';
import { useRef, useState } from 'react';
import { AnchoredMenu } from '@netproof/ui/anchored-menu';
import { GearIcon, LockIcon, MoreIcon } from './icons';

/**
 * The device's top-right menu.
 *
 * Before this, the icon was a gear that jumped straight to Settings, and "lock the device"
 * lived *inside* Settings as a full-width button — a security action sitting in the middle of
 * a screen full of preferences, one stray tap from the eraser. Both now live one level up, in
 * the menu a phone user already expects behind three dots.
 *
 * The lock entry is rendered only when there is something to lock, so the welcome screen
 * (nothing unlocked yet) offers Settings alone rather than a dead item.
 */
export function DeviceMenu({
  onSettings,
  onLock,
}: {
  onSettings: () => void;
  /** Omit when the device is already locked. */
  onLock?: () => void;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const choose = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <div className="np-menu">
      <button
        ref={triggerRef}
        type="button"
        className="np-icon-btn np-icon-btn--plain"
        onClick={() => setOpen((previous) => !previous)}
        aria-label="更多"
        aria-expanded={open}
      >
        <MoreIcon size={22} />
      </button>

      <AnchoredMenu open={open} trigger={triggerRef} onClose={() => setOpen(false)}>
        <button type="button" className="np-menu__item" role="menuitem" onClick={choose(onSettings)}>
          <GearIcon size={18} />
          <span className="np-grow">设置</span>
        </button>
        {onLock ? (
          <button type="button" className="np-menu__item" role="menuitem" onClick={choose(onLock)}>
            <LockIcon size={18} />
            <span className="np-grow">锁定设备</span>
          </button>
        ) : null}
      </AnchoredMenu>
    </div>
  );
}
