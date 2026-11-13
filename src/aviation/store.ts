import { create } from 'zustand';

export type AviationTab = 'overview' | 'turnaround' | 'fleet' | 'ai';

interface AviationState {
  open: boolean;
  tab: AviationTab;
  step: number;                    // guided demo step (0 = not started)
  selectedFlight: string;
  baggageTractorFailed: boolean;
  replacementAssigned: boolean;
  setOpen: (open: boolean) => void;
  setTab: (tab: AviationTab) => void;
  select: (id: string) => void;
  failBaggageTractor: () => void;
  assignReplacement: () => void;
  reset: () => void;
  setStep: (n: number) => void;
}

const INITIAL = { tab: 'overview' as AviationTab, selectedFlight: 'SH204', baggageTractorFailed: false, replacementAssigned: false, step: 0 };

export const useAviationStore = create<AviationState>()((set) => ({
  open: false,
  ...INITIAL,
  setOpen: (open) => set({ open }),
  setTab: (tab) => set({ tab }),
  select: (selectedFlight) => set({ selectedFlight }),
  failBaggageTractor: () => set({ baggageTractorFailed: true, replacementAssigned: false, tab: 'turnaround' }),
  assignReplacement: () => set({ replacementAssigned: true, tab: 'turnaround' }),
  reset: () => set({ ...INITIAL }),
  setStep: (step) => set({ step }),
}));
