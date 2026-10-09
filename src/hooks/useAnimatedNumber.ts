import { useEffect, useRef, useState } from 'react';

/** Smoothly tweens a displayed number toward its target (critically damped). */
export function useAnimatedNumber(target: number, speed = 8) {
  const [value, setValue] = useState(target);
  const cur = useRef(target);
  const tgt = useRef(target);
  const raf = useRef(0);
  tgt.current = target;

  useEffect(() => {
    let last = performance.now();
    const tick = (now: number) => {
      // a frame timestamp can precede `last` (throttled / background tabs): never step backwards,
      // or the exponential grows instead of decaying
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      const next = tgt.current + (cur.current - tgt.current) * Math.exp(-speed * dt);
      cur.current = Math.abs(next - tgt.current) < 1e-3 ? tgt.current : next;
      setValue(cur.current);
      if (cur.current !== tgt.current) raf.current = requestAnimationFrame(tick);
    };
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, speed]);

  return value;
}
