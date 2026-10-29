import { create } from 'zustand';
import type { Highlight } from '../solutions/types';
import type { AgentRun } from './runtime';

/** UI state of the operations agent, kept apart from the twin's main store */
interface OpsState {
  open: boolean;
  setOpen: (v: boolean) => void;
  run: AgentRun | null;
  setRun: (r: AgentRun | null) => void;
  /** what the 3D overlay draws: the plan's assets while planning, the executed option once approved */
  highlight: Highlight | null;
  /** ids/labels of the executed actions, drawn in the action colour */
  executed: boolean;
}

export const useOpsStore = create<OpsState>((set) => ({
  open: false,
  setOpen: (open) => set(open ? { open } : { open, highlight: null }),
  run: null,
  setRun: (run) =>
    set({
      run,
      highlight: run?.result?.highlight ?? null,
      executed: run?.state === 'executed' || run?.state === 'verified',
    }),
  highlight: null,
  executed: false,
}));
