import { create } from 'zustand';

/**
 * User-selectable rendering tier. 'auto' keeps the original behaviour (start high, step down on slow frames).
 *  - high:   full geometry, shadows, ambient occlusion, MSAA, device pixel ratio up to 1.75
 *  - medium: full geometry, shadows, no ambient occlusion or MSAA, pixel ratio 1
 *  - low:    simplified distant geometry, no shadows, no post-processing, no rooftop detail, pixel ratio 0.75
 * Every tier keeps all functionality (panels, agents, overlays, selection); only rendering cost changes.
 */
export type Tier = 'auto' | 'high' | 'medium' | 'low';

const KEY = 'al-sajaa-quality-tier';
const load = (): Tier => {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'high' || v === 'medium' || v === 'low' || v === 'auto' ? v : 'auto';
  } catch {
    return 'auto';
  }
};

interface TierState {
  tier: Tier;
  setTier: (t: Tier) => void;
}

export const useTier = create<TierState>((set) => ({
  tier: typeof window === 'undefined' ? 'auto' : load(),
  setTier: (tier) => {
    try {
      localStorage.setItem(KEY, tier);
    } catch {
      /* private mode: keep it for this session only */
    }
    set({ tier });
  },
}));

/** what each tier means for the renderer */
export function tierSettings(tier: Tier, autoQuality: 'high' | 'low', autoDpr: number) {
  if (tier === 'high') return { scene: 'high' as const, effects: 'high' as const, shadows: true, details: true, dpr: Math.min(window.devicePixelRatio || 1, 1.75) };
  if (tier === 'medium') return { scene: 'high' as const, effects: 'low' as const, shadows: true, details: true, dpr: 1 };
  if (tier === 'low') return { scene: 'low' as const, effects: 'off' as const, shadows: false, details: false, dpr: 0.75 };
  return { scene: autoQuality, effects: autoQuality, shadows: true, details: true, dpr: autoDpr };
}
