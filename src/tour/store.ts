import { create } from 'zustand';

export type TourId = 'judge' | 'parknex';

interface TourState {
  active: boolean;
  which: TourId;
  step: number;
  start: (which?: TourId) => void;
  go: (n: number) => void;
  stop: () => void;
}

export const useTourStore = create<TourState>((set) => ({
  active: false,
  which: 'judge',
  step: 0,
  start: (which = 'judge') => set({ active: true, step: 0, which }),
  go: (step) => set({ step }),
  stop: () => set({ active: false }),
}));
