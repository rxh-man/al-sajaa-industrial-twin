import { Boxes, Building2, Crosshair, Layers3, Map, RotateCcw, ScanEye, Siren, TriangleAlert } from 'lucide-react';
import { useTwinStore, type PresetId } from '../../store/useTwinStore';
import { PRESET_LABELS } from '../../data/cameras';

const PRESET_ICON: Record<PresetId, React.ReactNode> = {
  city: <Map size={14} />,
  sector: <Building2 size={14} />,
  underground: <Layers3 size={14} />,
  failure: <Crosshair size={14} />,
  impact: <Siren size={14} />,
};

export function CameraPresets() {
  const active = useTwinStore((s) => s.activePreset);
  const setPreset = useTwinStore((s) => s.setPreset);
  const resetView = useTwinStore((s) => s.resetView);
  return (
    <div className="ov-bar presets" role="toolbar" aria-label="Camera presets">
      {PRESET_LABELS.map((p, i) => (
        <button key={p.id} className={`preset-btn icon-only ${active === p.id ? 'is-on' : ''}`} onClick={() => setPreset(p.id)} title={`${p.label} — ${p.hint} (${i + 1})`} aria-label={p.label} aria-pressed={active === p.id}>
          {PRESET_ICON[p.id]}
        </button>
      ))}
      <span className="bar-sep" aria-hidden />
      <button className="preset-btn icon-only" onClick={resetView} title="Reset view (0)" aria-label="Reset view">
        <RotateCcw size={14} />
      </button>
    </div>
  );
}

export function ViewToggles() {
  const xray = useTwinStore((s) => s.xray);
  const toggleXray = useTwinStore((s) => s.toggleXray);
  const exploded = useTwinStore((s) => s.exploded);
  const toggleExploded = useTwinStore((s) => s.toggleExploded);
  const future = useTwinStore((s) => s.future);
  const setFuture = useTwinStore((s) => s.setFuture);
  const localized = useTwinStore((s) => s.snap.localized);
  const resolved = useTwinStore((s) => s.snap.resolved);
  const canFuture = localized && !resolved;

  return (
    <div className="ov-stack toggles">
      <div className="ov-bar" role="toolbar" aria-label="View modes">
        <button className={`toggle-btn ${xray ? 'is-on' : ''}`} onClick={toggleXray} aria-pressed={xray} title="See through the city (X)">
          <ScanEye size={15} />
          <span>X-ray</span>
        </button>
        <button className={`toggle-btn ${exploded ? 'is-on' : ''}`} onClick={toggleExploded} aria-pressed={exploded} title="Separate the infrastructure layers (E)">
          <Boxes size={15} />
          <span>Exploded</span>
        </button>
      </div>
      <div className={`ov-bar time-seg ${canFuture ? '' : 'is-disabled'}`} role="group" aria-label="Time">
        <button className={`time-btn ${!future ? 'is-on' : ''}`} onClick={() => setFuture(false)} disabled={!canFuture} aria-pressed={!future}>
          Now
        </button>
        <button
          className={`time-btn is-future ${future ? 'is-on' : ''}`}
          onClick={() => setFuture(true)}
          disabled={!canFuture}
          aria-pressed={future}
          title={canFuture ? 'Simulate the predicted state if no action is taken (F)' : 'Available once a failure is predicted'}
        >
          <TriangleAlert size={13} />
          +48H
        </button>
      </div>
    </div>
  );
}
