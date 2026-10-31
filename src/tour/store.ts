import { create } from 'zustand';

interface TourState {
  active: boolean;
  step: number;
  start: () => void;
  go: (n: number) => void;
  stop: () => void;
}

export const useTourStore = create<TourState>((set) => ({
  active: false,
  step: 0,
  start: () => set({ active: true, step: 0 }),
  go: (step) => set({ step }),
  stop: () => set({ active: false }),
}));
