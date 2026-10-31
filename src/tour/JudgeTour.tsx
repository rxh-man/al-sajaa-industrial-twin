import { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Compass, X } from 'lucide-react';
import { useTwinStore } from '../store/useTwinStore';
import { useOpsStore } from '../opsAgent/store';
import { useSusStore } from '../sustainability/store';
import { approve, DEMO_GOALS, plan } from '../opsAgent/runtime';
import { runDevelopment, DEV_DEFAULTS } from '../sustainability/development';
import { openAgent, openCentre } from '../nav/MainNav';
import { useTourStore } from './store';
import { FACILITIES } from '../sustainability/facilities';

/**
 * The judge demonstration: ten steps that tell one story through the real application. Each step calls the same
 * actions a user would (camera, incident timeline, the agent's plan/approve, the Command Centre, the development
 * model); nothing is pre-recorded, so the numbers shown are the models' own.
 */

interface Step {
  title: string;
  body: string;
  enter: () => void;
  /** an optional action the judge can trigger from the card */
  act?: { label: string; run: () => void; done?: () => boolean };
}

const twin = () => useTwinStore.getState();
const ops = () => useOpsStore.getState();
const sus = () => useSusStore.getState();

export const STEPS: Step[] = [
  {
    title: 'Explore Al Sajaa',
    body: `A procedural twin of the Al Sajaa industrial district, Sharjah: ${FACILITIES.length} modelled industrial facilities, homes and lagoon villas, Etihad Rail, the E611 interchange and five underground utility networks. Drag to orbit, scroll to zoom.`,
    enter: () => {
      ops().setOpen(false);
      sus().setOpen(false);
      twin().resetView();
    },
  },
  {
    title: 'Discover an issue',
    body: 'Simulated sensors near the main road report a pressure drop and wet ground: the twin\'s scripted water-main incident. Look under the road in X-ray.',
    enter: () => {
      twin().skipToIncident();
    },
  },
  {
    title: 'Ask the AI Operations Agent',
    body: 'The goal is typed in plain words. The agent reads it with deterministic rules (no language model is connected), finds the Water Incident workflow, and calls its tools.',
    enter: () => {
      openAgent('agent');
      ops().setRun(plan(DEMO_GOALS[0].goal));
      const h = ops().run?.result?.highlight.focus;
      if (h) twin().focusPlace(h.x, h.z, h.r);
    },
  },
  {
    title: 'Watch it analyse',
    body: 'Task status shows each step: assets and simulated sensors inspected, the leak model run, every tool call logged. The map shows the leaking main, the isolation valves and the crew route from the depot.',
    enter: () => openAgent('agent'),
  },
  {
    title: 'Compare alternatives',
    body: 'Three interventions against the reactive baseline, with absolute and percentage change for every KPI, the weights behind the choice, and what the model cannot estimate.',
    enter: () => openAgent('compare'),
  },
  {
    title: 'Approve the intervention',
    body: 'Nothing happens without a human. A viewer is blocked; an operator approves. Approve in the panel, or use the button below (operator "Judge").',
    enter: () => openAgent('agent'),
    act: {
      label: 'Approve as operator',
      run: () => {
        const r = ops().run;
        if (r && r.state === 'awaiting-approval') ops().setRun(approve(r, { by: 'Judge', role: 'operator' }));
      },
      done: () => ['executed', 'verified'].includes(ops().run?.state ?? ''),
    },
  },
  {
    title: 'Watch the city change',
    body: 'The approved action is applied to the simulated twin: the isolation is drawn on the network and the agent re-runs the model independently to verify it.',
    enter: () => {
      openAgent('agent');
      const h = ops().run?.result?.highlight.focus;
      if (h) twin().focusPlace(h.x, h.z, h.r * 0.8);
    },
  },
  {
    title: 'Inspect the measured-in-model impact',
    body: 'Verification lists which targets were met, what changed, and the remaining risks — including what would need real data. All figures are simulated.',
    enter: () => openAgent('audit'),
  },
  {
    title: 'Sustainability Command Centre',
    body: 'City-wide modelled carbon balance: every industrial facility has its own category, size, hours, fuel and abatement. Click a card to see it on the map; move the levers to test policies.',
    enter: () => {
      openCentre('overview');
      sus().setLayer('facilities');
      twin().focusPlace(-60, -160, 120);
    },
  },
  {
    title: 'Plan a new development',
    body: 'What if 15 metal-fabrication plants are built in the Far Northern Industrial Zone? They are sited on vacant, road-accessible land and compared with and without a mitigation package.',
    enter: () => {
      openCentre('development');
      const r = runDevelopment(DEV_DEFAULTS);
      sus().setDevInputs(DEV_DEFAULTS);
      sus().setDev(r);
      sus().setLayer('development');
      if (r.sites.length) twin().focusPlace(r.sites[0].x, r.sites[0].z, 45);
    },
  },
];

export function JudgeTour() {
  const active = useTourStore((s) => s.active);
  const step = useTourStore((s) => s.step);
  const go = useTourStore((s) => s.go);
  const stop = useTourStore((s) => s.stop);
  const runState = useOpsStore((s) => s.run?.state);
  const entered = useRef(-1);
  useEffect(() => {
    if (!active) {
      entered.current = -1;
      return;
    }
    if (entered.current === step) return;
    entered.current = step;
    STEPS[step].enter();
  }, [active, step]);
  if (!active) return null;
  const s = STEPS[step];
  const done = s.act?.done?.() ?? false;
  return (
    <div className="tour-card" role="dialog" aria-labelledby="tour-title" aria-live="polite">
      <div className="tour-head">
        <Compass size={15} aria-hidden />
        <span className="ops-small ops-muted">
          Judge tour · {step + 1} / {STEPS.length}
        </span>
        <button className="icon-btn sm" aria-label="Exit tour" onClick={stop}>
          <X size={13} />
        </button>
      </div>
      <h4 id="tour-title">{s.title}</h4>
      <p>{s.body}</p>
      {s.act && (
        <button className="ops-btn primary" disabled={done} onClick={s.act.run} data-state={runState}>
          {done ? 'Approved ✓' : s.act.label}
        </button>
      )}
      <div className="tour-nav">
        <button className="ops-btn" disabled={step === 0} onClick={() => go(step - 1)}>
          <ChevronLeft size={14} /> Back
        </button>
        <div className="tour-dots" aria-hidden>
          {STEPS.map((_, i) => (
            <span key={i} className={i === step ? 'is-on' : i < step ? 'is-done' : ''} />
          ))}
        </div>
        {step < STEPS.length - 1 ? (
          <button className="ops-btn primary" onClick={() => go(step + 1)}>
            Next <ChevronRight size={14} />
          </button>
        ) : (
          <button className="ops-btn primary" onClick={stop}>
            Finish
          </button>
        )}
      </div>
    </div>
  );
}
