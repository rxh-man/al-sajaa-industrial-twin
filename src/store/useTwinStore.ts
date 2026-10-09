import { create } from 'zustand';
import { computeSnapshot, controlledAt, type ScenarioControlled, type ShotId, type SimSnapshot } from '../simulation/engine';
import { telemetryAt, HISTORY_LENGTH, HISTORY_STEP } from '../simulation/telemetry';
import { runtime } from '../simulation/runtime';
import { T } from '../simulation/timeline';
import type { LayerId } from '../data/networks';
import { DEFAULT_POLICY, nextQuestion, questionsFor, type Answers, type AnsweredBy, type Autonomy, type Policy, type Question } from '../agents/brain';

export type PresetId = 'city' | 'sector' | 'underground' | 'failure' | 'impact';
export type Status = 'idle' | 'running' | 'paused' | 'finished';

export interface History {
  pressure: number[];
  moisture: number[];
  temp: number[];
  health: number[];
}

export type HoverInfo =
  | { kind: 'building'; id: number }
  | { kind: 'pipe'; layer: LayerId; variant: string; index: number }
  | { kind: 'sensor'; index: number }
  | { kind: 'sector'; id: string }
  | { kind: 'valve'; id: string };

export interface Selection {
  info: HoverInfo;
  point: [number, number, number];
}

const ALL_VISIBLE: Record<LayerId, boolean> = { electric: true, telecom: true, water: true, cooling: true, sewage: true };
const VIEW_DEFAULTS = { xray: false, trench: false, focus: null as LayerId | null, repairOpen: false };

interface TwinState {
  boot: 'loading' | 'intro' | 'ready';
  sceneReady: boolean;
  status: Status;
  snap: SimSnapshot;
  history: History;

  xray: boolean;
  /** X-ray state to restore after leaving +48H / compare */
  prevXray: boolean;
  trench: boolean;
  focus: LayerId | null;
  repairOpen: boolean;
  exploded: boolean;
  future: boolean;
  compare: null | 'none' | 'ai';
  visible: Record<LayerId, boolean>;

  shot: { id: ShotId; nonce: number };
  activePreset: PresetId | null;
  layerPanel: boolean;
  scenarioMenu: boolean;
  infoOpen: boolean;

  hover: HoverInfo | null;
  selection: Selection | null;
  hoverSector: string | null;

  /** How much the agents may do alone, and the operator's answers this run. */
  policy: Policy;
  answers: Answers;
  /** Set while the clock is held on a question for the operator. */
  awaiting: Question | null;
  setAutonomy: (a: Autonomy) => void;
  setSpendLimit: (v: number) => void;
  hold: (q: Question) => void;
  answer: (choice: string, by?: AnsweredBy) => void;

  setBoot: (b: TwinState['boot']) => void;
  setSceneReady: () => void;
  setSnap: (s: SimSnapshot) => void;
  pushHistory: () => void;
  regenerateHistory: () => void;

  run: () => void;
  pause: () => void;
  resume: () => void;
  togglePause: () => void;
  reset: () => void;
  finish: () => void;
  seek: (t: number) => void;
  skipToIncident: () => void;
  viewRepairPlan: () => void;
  applyControlled: (c: Partial<ScenarioControlled>) => void;

  requestShot: (id: ShotId) => void;
  setPreset: (id: PresetId) => void;
  resetView: () => void;
  toggleXray: () => void;
  toggleExploded: () => void;
  setFuture: (f: boolean) => void;
  setCompare: (c: null | 'none' | 'ai') => void;
  setFocus: (l: LayerId | null) => void;
  toggleVisible: (l: LayerId) => void;
  setLayerPanel: (open: boolean) => void;
  setScenarioMenu: (open: boolean) => void;
  setInfoOpen: (open: boolean) => void;
  setRepairOpen: (open: boolean) => void;

  setHover: (h: HoverInfo | null) => void;
  select: (s: Selection | null) => void;
  setHoverSector: (id: string | null) => void;
}

function buildHistory(t: number, wall: number, active: boolean): History {
  const h: History = { pressure: [], moisture: [], temp: [], health: [] };
  for (let k = HISTORY_LENGTH - 1; k >= 0; k--) {
    const dt = k * HISTORY_STEP;
    const tel = telemetryAt(Math.max(0, t - dt), wall - dt, active && t - dt >= 0);
    h.pressure.push(tel.pressureDev);
    h.moisture.push(tel.moistureDev);
    h.temp.push(tel.tempDev);
    h.health.push(tel.networkHealth);
  }
  return h;
}

const isActive = (s: Status) => s !== 'idle';

/** The next question the clock has to stop at after `after` (none in Full auto). */
export function pendingQuestion(policy: Policy, answers: Answers, after = -Infinity): Question | null {
  return nextQuestion(policy, answers, after);
}

/** Re-read the open question under new limits: settle it if nobody needs asking now, else refresh it. */
function reask(policy: Policy, awaiting: Question | null, answers: Answers): Partial<TwinState> {
  if (!awaiting) return {};
  const q = questionsFor(policy).find((x) => x.id === awaiting.id);
  if (!q) return { awaiting: null, status: 'running', answers: { ...answers, [awaiting.id]: { choice: awaiting.recommended, by: 'agents' } } };
  return { awaiting: q };
}

export const useTwinStore = create<TwinState>()((set, get) => ({
  boot: 'loading',
  sceneReady: false,
  status: 'idle',
  snap: computeSnapshot(0, 0, false),
  history: buildHistory(0, 0, false),

  xray: false,
  prevXray: false,
  trench: false,
  focus: null,
  repairOpen: false,
  exploded: false,
  future: false,
  compare: null,
  visible: { ...ALL_VISIBLE },

  shot: { id: 'intro', nonce: 0 },
  activePreset: 'city',
  layerPanel: false,
  scenarioMenu: false,
  infoOpen: false,

  hover: null,
  selection: null,
  hoverSector: null,

  policy: DEFAULT_POLICY,
  answers: {},
  awaiting: null,
  setAutonomy: (autonomy) => {
    set((s) => ({ policy: { ...s.policy, autonomy } }));
    // Full auto settles the open question with the agents' pick; other modes re-ask it under the new rules
    const s = get();
    set(reask(s.policy, s.awaiting, s.answers));
  },
  setSpendLimit: (spendLimit) => {
    set((s) => ({ policy: { ...s.policy, spendLimit } }));
    const s = get();
    set(reask(s.policy, s.awaiting, s.answers));
  },
  hold: (awaiting) => set({ awaiting, status: 'paused' }),
  answer: (choice, by = 'you') => {
    const { awaiting, answers } = get();
    if (!awaiting) return;
    if (awaiting.choices.find((c) => c.id === choice)?.off) return;
    set({ answers: { ...answers, [awaiting.id]: { choice, by } }, awaiting: null, status: 'running' });
  },

  setBoot: (boot) => set({ boot }),
  setSceneReady: () => {
    if (import.meta.env.DEV) console.info(`[twin] scene ready at ${Math.round(performance.now())} ms`);
    set({ sceneReady: true });
  },
  setSnap: (snap) => set({ snap }),
  pushHistory: () => {
    const { snap, history } = get();
    const push = (arr: number[], v: number) => {
      const next = arr.length >= HISTORY_LENGTH ? arr.slice(1) : arr.slice();
      next.push(v);
      return next;
    };
    set({
      history: {
        pressure: push(history.pressure, snap.pressureDev),
        moisture: push(history.moisture, snap.moistureDev),
        temp: push(history.temp, snap.tempDev),
        health: push(history.health, snap.networkHealth),
      },
    });
  },
  regenerateHistory: () => set({ history: buildHistory(runtime.t, runtime.wall, isActive(get().status)) }),

  run: () => {
    runtime.t = 0;
    runtime.lastT = -1e-3;
    set({
      status: 'running',
      ...VIEW_DEFAULTS,
      exploded: false,
      future: false,
      compare: null,
      selection: null,
      scenarioMenu: false,
      visible: { ...ALL_VISIBLE },
      activePreset: 'city',
      answers: {},
      awaiting: null,
    });
    get().regenerateHistory();
    set({ snap: computeSnapshot(0, runtime.wall, true) });
  },
  pause: () => {
    if (get().status === 'running') set({ status: 'paused' });
  },
  resume: () => {
    if (get().awaiting) return;
    const s = get().status;
    if (s === 'paused') set({ status: 'running', future: false, compare: null });
    if (s === 'finished') get().run();
    if (s === 'idle') get().run();
  },
  togglePause: () => {
    const s = get().status;
    if (s === 'running') get().pause();
    else get().resume();
  },
  reset: () => {
    runtime.t = 0;
    runtime.lastT = -1;
    set({
      status: 'idle',
      ...VIEW_DEFAULTS,
      exploded: false,
      future: false,
      compare: null,
      selection: null,
      hover: null,
      visible: { ...ALL_VISIBLE },
      scenarioMenu: false,
      activePreset: 'city',
      answers: {},
      awaiting: null,
    });
    get().requestShot('city');
    get().regenerateHistory();
    set({ snap: computeSnapshot(0, runtime.wall, false) });
  },
  finish: () => set({ status: 'finished' }),
  seek: (t) => {
    // seeking past a question takes the agents' pick, except where a person must answer: the clock stops there
    const { policy } = get();
    const answers = { ...get().answers };
    let gate: Question | null = null;
    for (const q of questionsFor(policy)) {
      if (answers[q.id] || q.t > t) continue;
      if (q.waits) {
        gate = q;
        break;
      }
      answers[q.id] = { choice: q.recommended, by: 'default' };
    }
    const held = gate !== null;
    const clamped = gate ? gate.t : Math.max(0, Math.min(T.end, t));
    runtime.t = clamped;
    runtime.lastT = clamped;
    const c = controlledAt(clamped);
    set({
      status: held ? 'paused' : clamped >= T.end ? 'finished' : 'running',
      answers,
      awaiting: gate,
      xray: c.xray,
      trench: c.trench,
      focus: c.focus,
      repairOpen: c.repairOpen,
      exploded: false,
      future: false,
      compare: null,
      selection: null,
      scenarioMenu: false,
      visible: { ...ALL_VISIBLE },
    });
    if (c.shot) get().requestShot(c.shot === 'dive' ? 'failure' : c.shot === 'outro' ? 'city' : c.shot === 'follow' && clamped >= T.arrive ? 'approach' : c.shot);
    get().regenerateHistory();
    set({ snap: computeSnapshot(clamped, runtime.wall, true) });
  },
  skipToIncident: () => get().seek(T.leak + 0.4),
  viewRepairPlan: () => {
    const { status } = get();
    if (!isActive(status) || runtime.t < T.repair) get().seek(T.repair);
    set({ repairOpen: true });
  },
  applyControlled: (c) => {
    const { shot, ...rest } = c;
    set(rest);
    if (shot) get().requestShot(shot);
  },

  requestShot: (id) => {
    const preset: PresetId | null = id === 'city' || id === 'sector' || id === 'underground' || id === 'failure' || id === 'impact' ? id : id === 'outro' || id === 'intro' ? 'city' : id === 'dive' ? 'failure' : null;
    // 'follow' (chase camera on the crew truck) has no preset button
    set((s) => ({ shot: { id, nonce: s.shot.nonce + 1 }, activePreset: preset }));
  },
  setPreset: (id) => {
    if (get().exploded) set({ exploded: false });
    if (id === 'underground' || id === 'failure') set({ trench: true });
    get().requestShot(id);
  },
  resetView: () => {
    set({ exploded: false, focus: null, selection: null, future: false, compare: null });
    const { status } = get();
    // keep the scenario-owned cutaway while an incident is being investigated
    const incidentOpen = isActive(status) && runtime.t >= T.open && runtime.t < T.resolved;
    if (!incidentOpen) set({ xray: false, trench: false });
    get().requestShot('city');
  },
  toggleXray: () => set((s) => ({ xray: !s.xray })),
  toggleExploded: () => {
    const next = !get().exploded;
    set({ exploded: next, selection: null });
    get().requestShot(next ? 'exploded' : 'city');
  },
  setFuture: (future) => {
    const cur = get();
    if (future === cur.future) return;
    if (future && cur.status === 'running') set({ status: 'paused' });
    if (future) {
      set({ future: true, compare: null, prevXray: cur.xray, xray: false, trench: true });
      get().requestShot('impact');
    } else {
      set({ future: false, xray: cur.prevXray });
    }
  },
  setCompare: (compare) => {
    const wasOpen = get().compare !== null;
    set({ compare, future: false, selection: null });
    if (compare) {
      set({ xray: false, trench: true, focus: 'water' });
      if (!wasOpen) get().requestShot('impact');
    } else {
      set({ xray: false, trench: false, focus: null });
      get().requestShot('city');
    }
  },
  setFocus: (focus) => {
    set({ focus });
    const s = get();
    if (focus && !s.xray && !s.exploded) set({ xray: true });
  },
  toggleVisible: (l) => set((s) => ({ visible: { ...s.visible, [l]: !s.visible[l] } })),
  setLayerPanel: (layerPanel) => set({ layerPanel }),
  setScenarioMenu: (scenarioMenu) => set({ scenarioMenu }),
  setInfoOpen: (infoOpen) => set({ infoOpen }),
  setRepairOpen: (repairOpen) => set({ repairOpen }),

  setHover: (hover) => {
    const cur = get().hover;
    if (cur === hover) return;
    if (cur && hover && JSON.stringify(cur) === JSON.stringify(hover)) return;
    set({ hover });
  },
  select: (selection) => set({ selection }),
  setHoverSector: (hoverSector) => {
    if (get().hoverSector !== hoverSector) set({ hoverSector });
  },
}));

export const scenarioActive = () => isActive(useTwinStore.getState().status);
