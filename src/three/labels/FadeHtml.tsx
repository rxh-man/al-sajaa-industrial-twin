import { useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';

interface Props {
  position: [number, number, number];
  /** called every frame; 0 hides the label, 1 shows it fully */
  opacity: () => number;
  children: ReactNode;
  className?: string;
  zIndex?: number;
  center?: boolean;
}

/**
 * World-anchored HTML label whose visibility is driven per-frame from the
 * simulation runtime (no React re-render), with a soft fade/scale transition.
 */
export function FadeHtml({ position, opacity, children, className, zIndex = 10, center = false }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef(-1);
  useFrame(() => {
    const el = ref.current;
    if (!el) return;
    const o = Math.max(0, Math.min(1, opacity()));
    if (Math.abs(o - last.current) < 0.004) return;
    last.current = o;
    el.style.opacity = o.toFixed(3);
    el.style.transform = `translateY(${((1 - o) * 6).toFixed(2)}px) scale(${(0.96 + o * 0.04).toFixed(3)})`;
    el.style.visibility = o < 0.01 ? 'hidden' : 'visible';
    el.style.pointerEvents = o > 0.5 ? 'auto' : 'none';
  });
  return (
    <Html position={position} zIndexRange={[zIndex, zIndex]} center={center} style={{ pointerEvents: 'none' }}>
      <div ref={ref} className={className} style={{ opacity: 0, visibility: 'hidden', willChange: 'opacity, transform' }}>
        {children}
      </div>
    </Html>
  );
}
