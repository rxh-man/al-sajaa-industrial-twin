import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { pendingQuestion, useTwinStore } from '../store/useTwinStore';
import { runtime, live, DAMP, LINEAR, dampTowards, moveTowards } from '../simulation/runtime';
import { computeSnapshot, computeTargets, EVENTS, type VisualTargets } from '../simulation/engine';
import { T, ramp } from '../simulation/timeline';
import { HISTORY_STEP } from '../simulation/telemetry';
import { LAYER_ORDER } from '../data/networks';
import { G } from './shaders/globals';
import { IMPACT } from '../data/incident';
import { SECTOR_BY_ID } from '../data/city';
import { Color } from 'three';

const AMBER = new Color('#ffb547');
const RED = new Color('#ff4d3d');
const GREEN = new Color('#34d399');
const tmpColor = new Color();
const B12 = SECTOR_BY_ID.get('B-12')!.index;

/**
 * Drives the scenario clock, fires timeline events, damps visual state and
 * pushes it into the shared shader uniforms — once per frame, outside React.
 */
export function SimulationDriver() {
  const snapAcc = useRef(0);
  const histAcc = useRef(0);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const st = useTwinStore.getState();
    runtime.wall += dt;
    runtime.time += dt;

    const active = st.status !== 'idle';
    if (st.status === 'running') {
      let next = Math.min(T.end, runtime.t + dt);
      // the agents stop here and put a question to the operator
      const gate = pendingQuestion(st.policy, st.answers, runtime.lastT);
      const holdHere = gate !== null && gate.t > runtime.lastT && gate.t <= next;
      if (holdHere) next = gate.t;
      runtime.t = next;
      for (const e of EVENTS) {
        if (e.t > runtime.lastT && e.t <= runtime.t) st.applyControlled(e.set);
      }
      runtime.lastT = runtime.t;
      if (holdHere) st.hold(gate);
      else if (runtime.t >= T.end) st.finish();
    }

    const s = useTwinStore.getState();
    const targets = computeTargets(runtime.t, {
      active,
      xray: s.xray,
      trench: s.trench,
      exploded: s.exploded,
      future: s.future,
      compare: s.compare,
    });
    (Object.keys(targets) as (keyof VisualTargets)[]).forEach((k) => {
      const lin = LINEAR[k];
      if (lin !== undefined) live[k] = moveTowards(live[k], targets[k], lin, dt);
      else live[k] = dampTowards(live[k], targets[k], DAMP[k] ?? 5, dt);
    });
    for (const l of LAYER_ORDER) {
      live.layerDim[l] = dampTowards(live.layerDim[l], s.focus && s.focus !== l ? 1 : 0, 4, dt);
      live.layerVis[l] = dampTowards(live.layerVis[l], s.visible[l] ? 1 : 0, 6, dt);
    }

    // ---- shared uniforms ----
    G.uTime.value = runtime.time;
    // the surface ghosts both in X-ray and in the exploded view (so stacked layers stay visible)
    G.uXray.value = Math.max(live.xray, live.exploded * 0.94);
    G.uTrench.value = live.trench;
    G.uExploded.value = live.exploded * live.exploded * (3 - 2 * live.exploded);
    G.uFuture.value = live.future;
    G.uBurst.value = live.burst;
    G.uHealed.value = live.healed;
    const zoneR = IMPACT.radius + (IMPACT.futureRadius - IMPACT.radius) * Math.max(live.future, live.burst);
    G.uImpactRadius.value = live.impact * zoneR;
    // the impact picture recedes once the crew is working on it
    const repairing = active && s.compare !== 'none' ? ramp(runtime.t, T.repair, T.repair + 1.6) * 0.6 : 0;
    G.uImpactStrength.value = Math.min(1, live.impact * 1.5) * (1 - repairing);
    G.uMoisture.value = live.moisture;
    G.uRoadAlert.value = live.road;
    G.uSectorAlert.value = live.sectorAlert;
    G.uAlertSector.value = live.sectorAlert > 0.01 ? B12 : -1;
    tmpColor.copy(AMBER).lerp(RED, live.sectorSeverity).lerp(GREEN, live.healed);
    G.uSectorColor.value.copy(tmpColor);

    const hover = s.hover;
    G.uHoverBuilding.value = hover?.kind === 'building' ? hover.id : -1;
    const sel = s.selection?.info;
    G.uSelectedBuilding.value = sel?.kind === 'building' ? sel.id : -1;
    G.uHoverSector.value = s.hoverSector ? SECTOR_BY_ID.get(s.hoverSector)?.index ?? -1 : -1;

    // ---- UI snapshot (throttled) ----
    snapAcc.current += dt;
    if (snapAcc.current > 1 / 12) {
      snapAcc.current = 0;
      st.setSnap(computeSnapshot(runtime.t, runtime.wall, active));
    }
    histAcc.current += dt;
    if (histAcc.current >= HISTORY_STEP) {
      histAcc.current -= HISTORY_STEP;
      st.pushHistory();
    }
  }, -10);

  return null;
}
