import { create } from 'zustand';
import { hm, SIM_NOW } from './model';
import type { Weather } from './ops';
import type { AuditEntry } from './intelligence';

export type AviationTab = 'command' | 'control' | 'flights' | 'turnaround' | 'passengers' | 'fleet' | 'cargo' | 'safety' | 'analytics' | 'whatif' | 'ai' | 'audit';

export const TAB_LABELS: [AviationTab, string][] = [
  ['command', 'Command'],
  ['control', 'Control centre'],
  ['flights', 'Flights'],
  ['turnaround', 'Turnaround'],
  ['passengers', 'Passengers and bags'],
  ['fleet', 'Ground fleet'],
  ['cargo', 'Cargo'],
  ['safety', 'Safety'],
  ['analytics', 'Analytics'],
  ['whatif', 'What-if'],
  ['ai', 'AI agents'],
  ['audit', 'Audit trail'],
];

interface AviationState {
  open: boolean;
  tab: AviationTab;
  step: number;                    // guided demo step (0 = not started)
  selectedFlight: string;
  baggageTractorFailed: boolean;
  replacementAssigned: boolean;
  weather: Weather;
  extraDelay: number;              // what-if: extra arrival delay in minutes
  bagsScale: number;               // what-if: bag load multiplier
  decisions: Record<string, 'approved' | 'rejected'>;
  audit: AuditEntry[];
  setOpen: (open: boolean) => void;
  setTab: (tab: AviationTab) => void;
  select: (id: string) => void;
  failBaggageTractor: () => void;
  assignReplacement: () => void;
  setWeather: (w: Weather) => void;
  setExtraDelay: (m: number) => void;
  setBagsScale: (x: number) => void;
  decide: (id: string, title: string, verdict: 'approved' | 'rejected') => void;
  log: (actor: AuditEntry['actor'], action: string, detail: string) => void;
  reset: () => void;
  setStep: (n: number) => void;
}

const INITIAL = {
  tab: 'command' as AviationTab,
  selectedFlight: 'SH204',
  baggageTractorFailed: false,
  replacementAssigned: false,
  weather: 'Clear' as Weather,
  extraDelay: 0,
  bagsScale: 1,
  decisions: {} as Record<string, 'approved' | 'rejected'>,
  audit: [] as AuditEntry[],
  step: 0,
};

const clock = () => hm(SIM_NOW);

export const useAviationStore = create<AviationState>()((set, get) => ({
  open: false,
  ...INITIAL,
  setOpen: (open) => set({ open }),
  setTab: (tab) => set({ tab }),
  select: (selectedFlight) => set({ selectedFlight }),
  log: (actor, action, detail) => {
    const seq = get().audit.length + 1;
    set({ audit: [...get().audit, { seq, time: clock(), actor, action, detail }] });
  },
  failBaggageTractor: () => {
    set({ baggageTractorFailed: true, replacementAssigned: false, tab: 'turnaround' });
    get().log('System', 'Equipment fault', 'Baggage tractor BT-01 failed while serving SH204 (simulated)');
  },
  assignReplacement: () => {
    set({ replacementAssigned: true, tab: 'turnaround', decisions: { ...get().decisions, 'rec-bt-replacement': 'approved' } });
    get().log('Operator', 'Approved recommendation', 'Replacement tractor assigned to SH204 baggage loading');
  },
  setWeather: (weather) => {
    set({ weather });
    get().log('Operator', 'Weather scenario changed', `Set to ${weather} (simulated)`);
  },
  setExtraDelay: (extraDelay) => set({ extraDelay }),
  setBagsScale: (bagsScale) => set({ bagsScale }),
  decide: (id, title, verdict) => {
    set({ decisions: { ...get().decisions, [id]: verdict } });
    get().log('Operator', verdict === 'approved' ? 'Approved recommendation' : 'Rejected recommendation', title);
  },
  reset: () => set({ ...INITIAL }),
  setStep: (step) => set({ step }),
}));
