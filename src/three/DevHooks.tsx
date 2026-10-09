import { useEffect } from 'react';
import { advance, useThree } from '@react-three/fiber';
import { useTwinStore, type PresetId } from '../store/useTwinStore';
import { runtime } from '../simulation/runtime';

/**
 * Dev-only helpers for deterministic visual QA:
 *   __dev.step(seconds, fps) — advance the render loop with a fixed timestep
 *   __dev.store            — the zustand store
 *   __dev.resume()         — hand control back to requestAnimationFrame
 *   __dev.shot(preset, s)  — jump to a camera preset and settle
 *   __dev.zoom(x, y, w, h) — overlay a magnified crop of the canvas (CSS px)
 *   __dev.clean(on)        — hide the UI chrome around the 3D view
 */
export function DevHooks() {
  const get = useThree((s) => s.get);
  useEffect(() => {
    const w = window as unknown as { __dev: unknown };
    const step = (seconds: number, fps = 30) => {
      const state = get();
      if (state.frameloop !== 'never') state.setFrameloop('never');
      let t = state.clock.elapsedTime;
      const n = Math.max(1, Math.round(seconds * fps));
      for (let i = 0; i < n; i++) {
        t += 1 / fps;
        advance(t, true, state);
      }
      return runtime.t;
    };
    const unzoom = () => {
      const i = document.getElementById('__zoomimg');
      if (i) i.style.display = 'none';
    };
    w.__dev = {
      store: useTwinStore,
      runtime,
      r3f: get,
      step,
      resume: () => get().setFrameloop('always'),
      shot: (preset: PresetId, secs = 3.2) => {
        unzoom();
        useTwinStore.getState().setPreset(preset);
        step(secs);
        return 'ok';
      },
      unzoom,
      zoom: (x: number, y: number, wd: number, h: number) => {
        const c = get().gl.domElement;
        step(1 / 30);
        const sx = c.width / c.clientWidth;
        const o = document.createElement('canvas');
        o.width = innerWidth;
        o.height = innerHeight;
        o.getContext('2d')!.drawImage(c, x * sx, y * sx, wd * sx, h * sx, 0, 0, o.width, o.height);
        let img = document.getElementById('__zoomimg') as HTMLImageElement | null;
        if (!img) {
          img = document.createElement('img');
          img.id = '__zoomimg';
          img.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:999999;pointer-events:none;';
          document.body.appendChild(img);
        }
        img.src = o.toDataURL('image/png');
        img.style.display = 'block';
        return 'zoomed';
      },
      clean: (on: boolean) => {
        let st = document.getElementById('__cleanst');
        if (!st) {
          st = document.createElement('style');
          st.id = '__cleanst';
          document.head.appendChild(st);
        }
        st.textContent = on ? '.app > *:not(.stage){visibility:hidden !important} .stage *{transition:none !important}' : '';
      },
    };
  }, [get]);
  return null;
}
