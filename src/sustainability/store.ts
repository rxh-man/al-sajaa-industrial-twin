import { create } from 'zustand';
import { BASE_LEVERS, type Levers } from './model';
import { DEV_DEFAULTS, type DevInputs, type DevResult } from './development';

/**
 * State of the Sustainability Command Centre: open/tab, scenario levers, filters, the development simulation,
 * and what is highlighted on the 3D map. Kept apart from the twin's main store.
 */

export type MapLayer = 'none' | 'facilities' | 'trees' | 'traffic' | 'solar' | 'water' | 'heat' | 'development';

export interface Filters {
  categories: string[];
  districts: string[];
  mitigation: 'all' | 'none' | 'any';
  minCo2: number;
}

export const NO_FILTERS: Filters = { categories: [], districts: [], mitigation: 'all', minCo2: 0 };

interface SusState {
  open: boolean;
  setOpen: (v: boolean) => void;
  tab: string;
  setTab: (t: string) => void;
  levers: Levers;
  setLevers: (l: Levers) => void;
  filters: Filters;
  setFilters: (f: Filters) => void;
  layer: MapLayer;
  setLayer: (l: MapLayer) => void;
  /** a single facility picked in a ranking (building id) */
  picked: number | null;
  pick: (id: number | null) => void;
  devInputs: DevInputs;
  setDevInputs: (d: DevInputs) => void;
  dev: DevResult | null;
  setDev: (r: DevResult | null) => void;
  /** show the mitigated variant of the development on the map */
  devMitigated: boolean;
  setDevMitigated: (v: boolean) => void;
}

export const useSusStore = create<SusState>((set) => ({
  open: false,
  setOpen: (open) => set(open ? { open } : { open, layer: 'none', picked: null }),
  tab: 'overview',
  setTab: (tab) => set({ tab }),
  levers: BASE_LEVERS,
  setLevers: (levers) => set({ levers }),
  filters: NO_FILTERS,
  setFilters: (filters) => set({ filters }),
  layer: 'none',
  setLayer: (layer) => set({ layer }),
  picked: null,
  pick: (picked) => set({ picked }),
  devInputs: DEV_DEFAULTS,
  setDevInputs: (devInputs) => set({ devInputs }),
  dev: null,
  setDev: (dev) => set({ dev }),
  devMitigated: false,
  setDevMitigated: (devMitigated) => set({ devMitigated }),
}));

/** facilities passing the filters (pure, so the panel and the map agree) */
export function applyFilters<T extends { category: { id: string }; district: string; mitigation: string; co2T: number }>(list: T[], f: Filters): T[] {
  return list.filter(
    (x) =>
      (!f.categories.length || f.categories.includes(x.category.id)) &&
      (!f.districts.length || f.districts.includes(x.district)) &&
      (f.mitigation === 'all' || (f.mitigation === 'none' ? x.mitigation === 'none' : x.mitigation !== 'none')) &&
      x.co2T >= f.minCo2,
  );
}
