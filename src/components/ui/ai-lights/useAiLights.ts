import { useEffect, useRef, useState, type RefObject } from 'react';
import { RIM_LAYERS, RIM_STOPS, buildMask, padOf, radiusOf, type MaskStop } from './mask';

export type Layer = { mask: string; pad: number; ring?: number };

/**
 * Builds the rim's mask layers from the element's measured box and computed radius (rebuilt after it
 * settles). The stops are the opacity round the rim: RIM_STOPS lights a third of it (the pulse),
 * EVEN_STOPS all of it (a constant halo).
 */
export function useRimMask(ref: RefObject<HTMLElement | null>, { settleMs = 120, stops = RIM_STOPS }: { settleMs?: number; stops?: MaskStop[] } = {}): Layer[] {
  const [layers, setLayers] = useState<Layer[]>([]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const build = () => {
      const box = el.getBoundingClientRect();
      if (!box.width || !box.height) return;
      const radius = radiusOf(el);
      setLayers(
        RIM_LAYERS.map((l) => ({
          mask: buildMask({ width: box.width, height: box.height, radius, strokeWidth: l.strokeWidth, blur: l.blur, alpha: l.alpha, ring: l.ring, stops }),
          pad: padOf(l.strokeWidth, l.blur),
          ring: l.ring,
        })).filter((l) => l.mask),
      );
    };
    build();
    // fonts change the box: rebuild once they are in
    document.fonts?.ready.then(build).catch(() => {});
    let settle: number | null = null;
    const ro = new ResizeObserver(() => {
      if (settle !== null) window.clearTimeout(settle);
      settle = window.setTimeout(build, settleMs);
    });
    ro.observe(el);
    return () => {
      if (settle !== null) window.clearTimeout(settle);
      ro.disconnect();
    };
  }, [ref, settleMs, stops]);

  return layers;
}

/**
 * Fires the one-shot pulse every `pulseMs + gapMs`: flips data-playing false → true across two
 * frames (in one frame the writes coalesce and nothing restarts). Pauses offscreen and in a hidden
 * tab; under reduced motion the light never fires.
 */
export function useAiPulse(ref: RefObject<HTMLElement | null>, { pulseMs = 1600, gapMs = 1800 }: { pulseMs?: number; gapMs?: number } = {}) {
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let onScreen = false;
    let alive = true;

    const clear = () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
    };
    const pulse = () => {
      if (!alive) return;
      if (!reduced.matches) {
        rollPalette(host);
        host.dataset.playing = 'false';
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            if (alive && !reduced.matches) host.dataset.playing = 'true';
          }),
        );
      }
      timer.current = window.setTimeout(pulse, pulseMs + gapMs);
    };
    const sync = () => {
      const should = onScreen && !document.hidden;
      if (should) {
        if (timer.current === null) timer.current = window.setTimeout(pulse, 400);
      } else {
        clear();
        host.dataset.playing = 'false';
      }
    };

    const io = new IntersectionObserver((es) => {
      onScreen = es.some((e) => e.isIntersecting);
      sync();
    });
    io.observe(host);
    document.addEventListener('visibilitychange', sync);
    return () => {
      alive = false;
      clear();
      io.disconnect();
      document.removeEventListener('visibilitychange', sync);
    };
  }, [ref, pulseMs, gapMs]);
}

const ARC_MIN = 90;
const ARC_MAX = 190;

function hsl(h: number, s: number, l: number, a = 1): string {
  const hue = ((h % 360) + 360) % 360;
  return a === 1 ? `hsl(${hue.toFixed(1)} ${s}% ${l}%)` : `hsl(${hue.toFixed(1)} ${s}% ${l}% / ${a})`;
}

/** A fresh run of hues for each pulse, along an arc of the colour wheel. */
export function rollPalette(el: HTMLElement) {
  const anchor = Math.random() * 360;
  const arc = (ARC_MIN + Math.random() * (ARC_MAX - ARC_MIN)) * (Math.random() < 0.5 ? -1 : 1);
  const at = (t: number) => anchor + arc * t;
  const s = el.style;
  s.setProperty('--ai-c1', hsl(at(0), 96, 48));
  s.setProperty('--ai-c2', hsl(at(0.18), 52, 80));
  s.setProperty('--ai-c3', hsl(at(0.4), 98, 55));
  s.setProperty('--ai-c4', hsl(at(0.66), 96, 52));
  s.setProperty('--ai-c5', hsl(at(0.88), 94, 50));
  s.setProperty('--ai-c6', hsl(at(1), 90, 72, 0.8));
  s.setProperty('--ai-tail', hsl(at(-0.12), 70, 76, 0.63));
}
