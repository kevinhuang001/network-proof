import type { ReactNode } from 'react';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * A dropdown that is anchored to its trigger and paints above everything.
 *
 * Both properties were broken by the same thing. Rendering the panel inside the header put it
 * in the header's stacking *and* containing block — `backdrop-filter` on a sticky header does
 * that — so the panel could be painted over by page content, and the click-catcher sized
 * itself to the header instead of the screen, which meant tapping anywhere else left the menu
 * open. Portalling to the body escapes both, and the panel is then positioned from the
 * trigger's own bounding box, so it stays next to the button it belongs to wherever that
 * button happens to be — including inside a centred phone-width card on a desktop.
 */
export function AnchoredMenu({
  open,
  trigger,
  onClose,
  children,
  labelledBy,
}: {
  open: boolean;
  /** The element the panel hangs from. */
  trigger: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  children: ReactNode;
  labelledBy?: string;
}): ReactNode {
  const [box, setBox] = useState<{ top: number; right: number } | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const measure = useCallback(() => {
    const element = trigger.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    setBox({
      top: rect.bottom + 6,
      // Keep it on screen: never closer than 8px to the right edge.
      right: Math.max(8, window.innerWidth - rect.right),
    });
  }, [trigger]);

  useLayoutEffect(() => {
    if (!open) {
      setBox(null);
      return;
    }
    measure();
    window.addEventListener('resize', measure);
    // Capture phase, so a scroll inside any ancestor is seen too.
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [open, measure]);

  useLayoutEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <>
      {/* Transparent, full-viewport, and above the page: the point of a dropdown is that you
          can still see what you were looking at, so it dims nothing — but it must catch the
          tap that dismisses it. */}
      <div className="np-menu__scrim" onClick={onClose} />
      <div
        ref={panelRef}
        className="np-menu__panel"
        role="menu"
        {...(labelledBy !== undefined ? { 'aria-labelledby': labelledBy } : {})}
        style={box ? { top: box.top, right: box.right } : { visibility: 'hidden' }}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}
