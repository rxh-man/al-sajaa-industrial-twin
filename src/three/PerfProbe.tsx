import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';

/**
 * Dev-only: measures CPU time per frame, split into frame logic (all useFrame
 * subscribers before the composer) and render submission. Read via window.__perf.
 */
export function PerfProbe() {
  const t0 = useRef(0);
  const t1 = useRef(0);
  const logic = useRef<number[]>([]);
  const total = useRef<number[]>([]);
  const gl = useThree((s) => s.gl);
  useFrame(() => {
    t0.current = performance.now();
    const w = window as unknown as { __perfReset?: () => void };
    if (!w.__perfReset)
      w.__perfReset = () => {
        logic.current = [];
        total.current = [];
      };
  }, -1000);
  useFrame(() => {
    t1.current = performance.now();
  }, 0.5);
  useFrame(() => {
    const end = performance.now();
    const push = (arr: number[], v: number) => {
      arr.push(v);
      if (arr.length > 120) arr.shift();
    };
    push(logic.current, t1.current - t0.current);
    push(total.current, end - t0.current);
    const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
    (window as unknown as { __perf: unknown }).__perf = {
      logicMs: +avg(logic.current).toFixed(2),
      totalMs: +avg(total.current).toFixed(2),
      totalMax: +Math.max(...total.current).toFixed(2),
      programs: gl.info.programs?.length,
      geometries: gl.info.memory.geometries,
    };
  }, 1000);
  return null;
}
