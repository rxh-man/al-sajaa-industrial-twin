import { create } from 'zustand';
import type { Highlight } from '../solutions/types';
import type { AgentRun } from './runtime';

/** UI state of the operations agent, kept apart from the twin's main store */
interface OpsState {
  open: boolean;
  setOpen: (v: boolean) => void;
  tab: 'agent' | 'specialists' | 'compare' | 'audit' | 'adoption';
  setTab: (t: OpsState['tab']) => void;
  run: AgentRun | null;
  setRun: (r: AgentRun | null) => void;
  /** what the 3D overlay draws: the plan's assets while planning, the executed option once approved */
  highlight: Highlight | null;
  /** ids/labels of the executed actions, drawn in the action colour */
  executed: boolean;
  /** session audit trail: one entry per plan, approval, rejection or blocked attempt */
  audit: AuditEntry[];
}

export interface AuditEntry {
  at: string;
  goal: string;
  workflow: string;
  scenarioId: string | null;
  inputsKey: string | null;
  state: AgentRun['state'];
  selected: string | null;
  approvedBy: string | null;
  tools: number;
  error: string | null;
}

export const useOpsStore = create<OpsState>((set) => ({
  open: false,
  tab: 'agent',
  setTab: (tab) => set({ tab }),
  setOpen: (open) => set(open ? { open } : { open, highlight: null }),
  run: null,
  setRun: (run) =>
    set((s) => ({
      run,
      highlight: run?.result?.highlight ?? null,
      executed: run?.state === 'executed' || run?.state === 'verified',
      audit:
        run && s.run !== run
          ? [
              ...s.audit,
              {
                at: new Date().toISOString(),
                goal: run.goal.text,
                workflow: run.goal.workflow?.title ?? '—',
                scenarioId: run.scenarioId,
                inputsKey: run.result?.inputsKey ?? null,
                state: run.state,
                selected: run.selected,
                approvedBy: run.execution?.approvedBy ?? null,
                tools: run.log.length,
                error: run.error,
              },
            ].slice(-50)
          : s.audit,
    })),
  audit: [],
  highlight: null,
  executed: false,
}));
