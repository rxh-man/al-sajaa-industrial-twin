import { useEffect, useRef } from 'react';
import { useTwinStore } from '../../store/useTwinStore';
import { describe } from '../../app/assetInfo';
import { AssetCardBody } from '../ui/AssetCardBody';

/** Compact card following the cursor while hovering assets in the twin. */
export function HoverTooltip() {
  const hover = useTwinStore((s) => s.hover);
  const selection = useTwinStore((s) => s.selection);
  const snap = useTwinStore((s) => s.snap);
  const ref = useRef<HTMLDivElement>(null);
  const pos = useRef({ x: -999, y: -999 });

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      pos.current = { x: e.clientX, y: e.clientY };
      const el = ref.current;
      if (!el) return;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      let x = e.clientX + 18;
      let y = e.clientY + 18;
      if (x + w > window.innerWidth - 8) x = e.clientX - w - 14;
      if (y + h > window.innerHeight - 8) y = e.clientY - h - 14;
      el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  const same = hover && selection && JSON.stringify(hover) === JSON.stringify(selection.info);
  const data = hover && !same ? describe(hover, snap) : null;

  return (
    <div ref={ref} className={`hover-tip ${data ? 'is-on' : ''}`} aria-hidden={!data}>
      {data && (
        <>
          <AssetCardBody data={data} compact />
        </>
      )}
    </div>
  );
}
