import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useMotionValueEvent, useReducedMotion, useSpring, useTransform } from 'motion/react';
import { Check, CheckCircle2, Loader, OctagonAlert, Pause, Play, Radar, RotateCcw, SkipForward, TriangleAlert, Wrench, X } from 'lucide-react';
import { useTwinStore } from '../../store/useTwinStore';
import { useDismiss } from '../../hooks/useDismiss';
import { T } from '../../simulation/timeline';
import { runtime } from '../../simulation/runtime';
import { INCIDENT } from '../../data/incident';
import { useRimMask } from '../ui/ai-lights/useAiLights';
import { EVEN_STOPS } from '../ui/ai-lights/mask';
import { RimGlow } from '../ui/ai-lights/RimGlow';
import '../../styles/ai-lights.css';

/** The idle call to action: a minimal pill with a constant light-blue AI-lights halo round its rim. */
function RunButton({ onClick }: { onClick: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const layers = useRimMask(ref, { stops: EVEN_STOPS });
  return (
    <button ref={ref} className="run-btn ai-lights is-constant" onClick={onClick}>
      <RimGlow layers={layers} />
      <span className="run-face">
        <Play size={14} className="run-icon" fill="currentColor" aria-hidden />
        <span className="run-title">Play the demo</span>
      </span>
    </button>
  );
}

const TONE_ICON = {
  ok: CheckCircle2,
  info: Wrench,
  warn: Radar,
  alert: OctagonAlert,
  success: CheckCircle2,
};

/** Top-centre narration of what the AI is doing right now. */
export function ScenarioCaption() {
  const caption = useTwinStore((s) => s.snap.caption);
  const active = useTwinStore((s) => s.snap.active);
  const future = useTwinStore((s) => s.future);
  const compare = useTwinStore((s) => s.compare);
  if (!active || future || compare) return null;
  const Icon = caption.key === 'correlate' || caption.key === 'localize' ? Loader : TONE_ICON[caption.tone];
  return (
    <div className="caption-wrap" aria-live="polite">
      <div key={caption.key} className={`caption tone-${caption.tone}`}>
        <Icon size={16} className={caption.key === 'correlate' || caption.key === 'localize' ? 'spin' : ''} />
        <div className="caption-title">{caption.title}</div>
      </div>
    </div>
  );
}

const STAGES = [
  { label: 'Detect', from: T.anomaly, to: T.leak },
  { label: 'Predict', from: T.leak, to: T.impact },
  { label: 'Prioritize', from: T.impact, to: T.plan },
  { label: 'Plan', from: T.plan, to: T.resolved },
];

/* ---------------- the progress rail ----------------
   The landing page's rail (components/ui/rail-toc) laid along the playback bar: a dashed track, the
   travelled part drawn solid, a node under each stage, and the same plane on the same spring. */

const TRAVEL_SPRING = { stiffness: 140, damping: 26, mass: 0.6 };
const PLANE = 'M12 2 20.5 21 12 17.5 3.5 21z';
const PLANE_HOLE = 5;
const RAIL_Y = 10;
const node = (i: number) => (i + 0.5) / STAGES.length;

/** Where on the rail (0..1) the plane sits at scenario time t: on a stage's node as it begins, gliding to the next. */
function railAt(t: number) {
  if (t <= STAGES[0].from) return node(0) * Math.max(0, t / STAGES[0].from);
  for (let i = 0; i < STAGES.length; i++) {
    const st = STAGES[i];
    if (t < st.to) {
      const next = i + 1 < STAGES.length ? node(i + 1) : 1;
      return node(i) + (next - node(i)) * ((t - st.from) / (st.to - st.from));
    }
  }
  return 1;
}

function ProgressRail() {
  const ref = useRef<HTMLDivElement>(null);
  const holeRef = useRef<SVGCircleElement>(null);
  const [w, setW] = useState(0);
  const [reached, setReached] = useState(0);
  const reduce = useReducedMotion();
  const target = useMotionValue(railAt(runtime.t));
  const travel = useSpring(target, TRAVEL_SPRING);
  const at = reduce ? target : travel;
  const x = useTransform(at, (v) => v * w);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setW(el.offsetWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // follow the clock every frame; the spring smooths seeks and skips
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      target.set(railAt(runtime.t));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  useMotionValueEvent(at, 'change', (v) => {
    holeRef.current?.setAttribute('cx', `${v * w}`);
    setReached(STAGES.filter((_, i) => node(i) <= v + 0.002).length);
  });

  return (
    <div className="rail-track" ref={ref} aria-hidden>
      {w > 0 && (
        <svg className="rail-svg" width={w} height={RAIL_Y * 2}>
          <mask id="rail-hole" maskUnits="userSpaceOnUse" x={-8} y={-8} width={w + 16} height={RAIL_Y * 2 + 16}>
            <rect x={-8} y={-8} width={w + 16} height={RAIL_Y * 2 + 16} fill="white" />
            <circle ref={holeRef} cx={at.get() * w} cy={RAIL_Y} r={PLANE_HOLE} fill="black" />
          </mask>
          <g mask="url(#rail-hole)">
            <line x1={0} y1={RAIL_Y} x2={w} y2={RAIL_Y} className="rail-dash" strokeDasharray="2 5" />
            <motion.line x1={0} y1={RAIL_Y} x2={w} y2={RAIL_Y} className="rail-fill" style={{ pathLength: at }} />
            {STAGES.map((st, i) => (
              <circle key={st.label} cx={node(i) * w} cy={RAIL_Y} r={i < reached ? 3 : 3.25} className={`rail-node ${i < reached ? 'is-reached' : ''}`} />
            ))}
          </g>
        </svg>
      )}
      {w > 0 && (
        <motion.div className="rail-plane" style={{ x, y: RAIL_Y, rotate: 90 }}>
          <svg viewBox="0 0 24 24" width={16} height={16}>
            <path d={PLANE} fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
        </motion.div>
      )}
    </div>
  );
}

/** Bottom-centre: one strong "run" button, then a playback bar that doubles as the AI pipeline. */
export function ScenarioTransport() {
  const status = useTwinStore((s) => s.status);
  const run = useTwinStore((s) => s.run);
  const togglePause = useTwinStore((s) => s.togglePause);
  const reset = useTwinStore((s) => s.reset);
  const skip = useTwinStore((s) => s.skipToIncident);
  const seek = useTwinStore((s) => s.seek);
  const t = useTwinStore((s) => s.snap.t);
  const exploded = useTwinStore((s) => s.exploded);
  const trackRef = useRef<HTMLDivElement>(null);
  if (status === 'idle') {
    if (exploded) return null;
    return (
      <div className="transport is-idle">
        <RunButton onClick={run} />
        <button className="link-btn skip-link" onClick={skip}>
          Skip to the problem
          <SkipForward size={13} />
        </button>
      </div>
    );
  }

  const onSeek = (e: React.MouseEvent) => {
    const r = trackRef.current?.getBoundingClientRect();
    if (!r) return;
    seek(((e.clientX - r.left) / r.width) * T.end);
  };

  return (
    <div className="transport">
      <button className="icon-btn" onClick={togglePause} aria-label={status === 'running' ? 'Pause' : 'Play'} title="Space">
        {status === 'running' ? <Pause size={15} /> : <Play size={15} />}
      </button>
      <button className="icon-btn" onClick={reset} aria-label="Reset demo" title="Reset (R)">
        <RotateCcw size={15} />
      </button>
      <button className="icon-btn" onClick={skip} aria-label="Skip to the problem" title="Skip to the problem">
        <SkipForward size={15} />
      </button>
      <div className="track" ref={trackRef} onClick={onSeek} role="slider" aria-label="Scenario timeline" aria-valuemin={0} aria-valuemax={T.end} aria-valuenow={Math.round(t)} tabIndex={0}>
        <ProgressRail />
        <div className="track-stages">
          {STAGES.map((st) => {
            const state = t >= st.to ? 'done' : t >= st.from ? 'active' : 'pending';
            return (
              <span key={st.label} className={`track-stage is-${state}`}>
                {state === 'done' && <Check size={11} strokeWidth={3} />}
                {st.label}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Header "Scenario" popover. */
export function ScenarioMenu() {
  const open = useTwinStore((s) => s.scenarioMenu);
  const setOpen = useTwinStore((s) => s.setScenarioMenu);
  const run = useTwinStore((s) => s.run);
  const skip = useTwinStore((s) => s.skipToIncident);
  const reset = useTwinStore((s) => s.reset);
  const viewRepairPlan = useTwinStore((s) => s.viewRepairPlan);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), [setOpen]);
  useDismiss(ref, open, close, '[data-popover-toggle="scenario"]');
  if (!open) return null;
  return (
    <div className="popover scenario-menu" role="dialog" aria-label="Scenario" ref={ref}>
      <div className="popover-head">
        <div>
          <div className="popover-kicker">Demo</div>
          <div className="popover-title">{INCIDENT.scenarioName}</div>
        </div>
        <button className="icon-btn sm" onClick={() => setOpen(false)} aria-label="Close">
          <X size={13} />
        </button>
      </div>
      <div className="menu-actions">
        <button className="btn-primary" onClick={run}>
          <Play size={15} /> Run from start
        </button>
        <button className="btn-ghost" onClick={skip}>
          <SkipForward size={14} /> Skip to the problem
        </button>
        <button className="btn-ghost" onClick={viewRepairPlan}>
          <Wrench size={14} /> Jump to repair plan
        </button>
        <button className="btn-ghost" onClick={reset}>
          <RotateCcw size={14} /> Reset
        </button>
      </div>
    </div>
  );
}

/** Red-tinted frame + banner while viewing the predicted future. */
export function FutureOverlay() {
  const future = useTwinStore((s) => s.future);
  const setFuture = useTwinStore((s) => s.setFuture);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (future) setShown(true);
    else {
      const id = setTimeout(() => setShown(false), 500);
      return () => clearTimeout(id);
    }
  }, [future]);
  if (!shown) return null;
  return (
    <div className={`future-frame ${future ? 'is-on' : ''}`}>
      <div className="future-banner" role="status">
        <TriangleAlert size={16} />
        <div className="future-title">In 48 hours, if nobody acts</div>
        <button className="btn-ghost sm" onClick={() => setFuture(false)}>
          Back to now
        </button>
      </div>
    </div>
  );
}
