import { useEffect, useRef } from 'react';

/** requestAnimationFrame loop for DOM content rendered outside the R3F reconciler (e.g. inside drei <Html>). */
export function useRaf(cb: () => void) {
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => {
    let id = 0;
    const loop = () => {
      ref.current();
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, []);
}
