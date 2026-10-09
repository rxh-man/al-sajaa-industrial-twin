import { useEffect, type RefObject } from 'react';

/**
 * Calls `onDismiss` when the user presses outside `ref` (and outside any element
 * matching `ignoreSelector`, e.g. the toggle button that opened the popover).
 */
export function useDismiss(ref: RefObject<HTMLElement | null>, open: boolean, onDismiss: () => void, ignoreSelector?: string) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (!target) return;
      if (ref.current && ref.current.contains(target)) return;
      if (ignoreSelector && target.closest(ignoreSelector)) return;
      onDismiss();
    };
    // defer so the click that opened the popover does not immediately close it
    const id = window.setTimeout(() => window.addEventListener('pointerdown', onDown), 0);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [ref, open, onDismiss, ignoreSelector]);
}
