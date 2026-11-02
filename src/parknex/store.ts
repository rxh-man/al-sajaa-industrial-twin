import { create } from 'zustand';
import { BASE_OPS, COST_DEFAULTS, REV_DEFAULTS, type CostInputs, type MaintScope, type OpsState, type ProposalStatus, type RevenueInputs } from './model';

/** PARKNEX UI and operating state, shared by the dashboard, the 3D scene and the agent. */

export interface MaintItem {
  id: string;
  facility: string;
  scope: MaintScope;
  row?: number;
  startH: number;
  hours: number;
}

export interface Proposal {
  id: string;
  oppId: string;
  x: number;
  z: number;
  w: number;
  d: number;
  bays: number;
  status: ProposalStatus;
  /** construction progress 0–1 */
  progress: number;
  history: { status: ProposalStatus; note: string; seq: number }[];
  capex: number;
  roiPct: number;
  payback: number | null;
}

export interface EventCfg {
  type: string;
  venue: string;
  attendance: number;
  vehPerAttendee: number;
  startH: number;
  durationH: number;
  vipBays: number;
  reservedBays: number;
  tariff: number;
  active: boolean;
}

interface ParkState {
  open: boolean;
  setOpen: (v: boolean) => void;
  tab: string;
  setTab: (t: string) => void;
  facility: string | null;
  selectFacility: (id: string | null) => void;
  bay: string | null;
  selectBay: (id: string | null) => void;
  ops: Omit<OpsState, 'maintenance'>;
  setOps: (o: Partial<Omit<OpsState, 'maintenance'>>) => void;
  maint: MaintItem[];
  addMaint: (m: MaintItem) => void;
  removeMaint: (id: string) => void;
  event: EventCfg;
  setEvent: (e: Partial<EventCfg>) => void;
  playing: boolean;
  setPlaying: (v: boolean) => void;
  audio: boolean;
  setAudio: (v: boolean) => void;
  cost: CostInputs;
  setCost: (c: Partial<CostInputs>) => void;
  rev: RevenueInputs;
  setRev: (r: Partial<RevenueInputs>) => void;
  selectedOpp: string | null;
  selectOpp: (id: string | null) => void;
  proposals: Proposal[];
  upsertProposal: (p: Proposal) => void;
}

export const usePark = create<ParkState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  tab: 'overview',
  setTab: (tab) => set({ tab }),
  facility: null,
  selectFacility: (facility) => set({ facility, bay: null }),
  bay: null,
  selectBay: (bay) => set({ bay }),
  ops: { hour: 10, tariffMul: {}, eventVehicles: {}, released: {}, reserveShare: BASE_OPS.reserveShare },
  setOps: (o) => set((s) => ({ ops: { ...s.ops, ...o } })),
  maint: [],
  addMaint: (m) => set((s) => ({ maint: [...s.maint.filter((x) => x.id !== m.id), m] })),
  removeMaint: (id) => set((s) => ({ maint: s.maint.filter((x) => x.id !== id) })),
  event: { type: 'Concert', venue: 'event', attendance: 6000, vehPerAttendee: 0.35, startH: 19, durationH: 3, vipBays: 20, reservedBays: 30, tariff: 30, active: false },
  setEvent: (e) => set((s) => ({ event: { ...s.event, ...e } })),
  playing: false,
  setPlaying: (playing) => set({ playing }),
  audio: false,
  setAudio: (audio) => set({ audio }),
  cost: COST_DEFAULTS,
  setCost: (c) => set((s) => ({ cost: { ...s.cost, ...c } })),
  rev: REV_DEFAULTS,
  setRev: (r) => set((s) => ({ rev: { ...s.rev, ...r } })),
  selectedOpp: null,
  selectOpp: (selectedOpp) => set({ selectedOpp }),
  proposals: [],
  upsertProposal: (p) => set((s) => ({ proposals: [...s.proposals.filter((x) => x.id !== p.id), p] })),
}));

/** the full OpsState the model needs, from the store (maintenance items → bay/row/facility keys) */
export function opsFrom(s: Pick<ParkState, 'ops' | 'maint' | 'event'>): OpsState {
  const m = new Set<string>();
  for (const x of s.maint) {
    const active = ((s.ops.hour - x.startH + 24) % 24) < x.hours;
    if (!active) continue;
    if (x.scope === 'facility') m.add(`${x.facility}:all`);
    else if (x.scope === 'row') m.add(`${x.facility}:row${x.row ?? 0}`);
  }
  const eventVehicles = { ...s.ops.eventVehicles };
  return { ...s.ops, maintenance: m, eventVehicles };
}
