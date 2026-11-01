import { create } from 'zustand';

/**
 * Shared environmental state: the wind used by the smoke plumes, the air model panels and (when available) the
 * external weather feed, plus the Air filters. Wind direction follows the air model's convention: the
 * direction the plume travels, degrees, vector (cos, sin) in scene x/z.
 */
export interface WindState {
  dirDeg: number;
  speedMs: number;
  /** where the wind comes from: an assumed default, the user, or an external observation */
  source: 'assumed' | 'user' | 'observed';
  observedAt?: string;
}

export interface AirFilters {
  categories: string[];
  /** minimum modelled CO₂, t/yr */
  minCo2: number;
  abatement: 'all' | 'none' | 'any';
}

interface EnvState {
  wind: WindState;
  setWind: (w: Partial<WindState>) => void;
  air: AirFilters;
  setAir: (a: AirFilters) => void;
  /** Layers panel: highlight network segments whose simulated health is below this (0 = off) */
  healthBelow: number;
  setHealthBelow: (v: number) => void;
}

export const NO_AIR_FILTERS: AirFilters = { categories: [], minCo2: 0, abatement: 'all' };

export const useEnv = create<EnvState>((set) => ({
  wind: { dirDeg: 21, speedMs: 4, source: 'assumed' },
  setWind: (w) => set((s) => ({ wind: { ...s.wind, ...w } })),
  air: NO_AIR_FILTERS,
  setAir: (air) => set({ air }),
  healthBelow: 0,
  setHealthBelow: (healthBelow) => set({ healthBelow }),
}));

export const airFilterMatch = (f: { category: { id: string }; co2T: number; mitigation: string }, a: AirFilters) =>
  (!a.categories.length || a.categories.includes(f.category.id)) && f.co2T >= a.minCo2 && (a.abatement === 'all' || (a.abatement === 'none' ? f.mitigation === 'none' : f.mitigation !== 'none'));
