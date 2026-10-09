import { useEffect } from 'react';
import { useTwinStore, type PresetId } from '../store/useTwinStore';

const PRESETS: PresetId[] = ['city', 'sector', 'underground', 'failure', 'impact'];

export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const s = useTwinStore.getState();
      if (s.boot !== 'ready') return;
      const k = e.key.toLowerCase();
      if (k === ' ') {
        if ((e.target as HTMLElement | null)?.tagName === 'BUTTON') return;
        e.preventDefault();
        if (s.status === 'idle' || s.status === 'finished') s.run();
        else s.togglePause();
      } else if (k === 'r') s.reset();
      else if (k === 'x') s.toggleXray();
      else if (k === 'e') s.toggleExploded();
      else if (k === 'l') s.setLayerPanel(!s.layerPanel);
      else if (k === 'f') {
        if (s.snap.localized && !s.snap.resolved) s.setFuture(!s.future);
      } else if (k === '0') s.resetView();
      else if (k >= '1' && k <= '5') s.setPreset(PRESETS[Number(k) - 1]);
      else if (k === 'escape') {
        if (s.compare) s.setCompare(null);
        else if (s.future) s.setFuture(false);
        else s.select(null);
        s.setScenarioMenu(false);
        s.setInfoOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
