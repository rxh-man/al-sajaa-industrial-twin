import { useCallback, useEffect, useRef, useState } from 'react';
import { Info, Layers, LayoutGrid, PlayCircle } from 'lucide-react';
import { useTwinStore } from '../../store/useTwinStore';
import { useDismiss } from '../../hooks/useDismiss';
import { TwinMark } from '../ui/TwinMark';
import { MAP_CREDIT } from '../../data/abudhabi';
import { PLACE } from '../../data/geo';

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="hdr-clock" title={`${PLACE.city} local time (Gulf Standard Time, UTC+4)`}>
      <span className="mono tnum">{now.toLocaleTimeString('en-GB', { hour12: false, timeZone: PLACE.timeZone })}</span>
      <span className="hdr-tz">{PLACE.timeZoneLabel}</span>
    </div>
  );
}

function StatusPill() {
  const phase = useTwinStore((s) => s.snap.phase);
  const localized = useTwinStore((s) => s.snap.localized);
  const future = useTwinStore((s) => s.future);
  const awaiting = useTwinStore((s) => s.awaiting);
  let tone = 'ok';
  let text = 'Everything is running normally';
  if (phase === 'ANOMALY' || phase === 'CORRELATION' || (phase === 'DETECTION' && !localized)) {
    tone = 'warn';
    text = 'Checking something odd in area B-12';
  } else if (phase === 'DETECTION' || phase === 'PREDICTION' || phase === 'PRIORITIZATION' || phase === 'ACTION_PLAN') {
    tone = 'alert';
    text = 'Water pipe problem in area B-12';
  } else if (phase === 'MITIGATION') {
    tone = 'info';
    text = 'Repair under way in area B-12';
  } else if (phase === 'RESOLVED') {
    tone = 'ok';
    text = 'Fixed before it broke';
  }
  if (awaiting) {
    tone = 'warn';
    text = 'The agents have a question for you';
  }
  if (future) {
    tone = 'alert';
    text = 'What happens in 48 hours if nobody acts';
  }
  return (
    <div className={`hdr-status tone-${tone}`} role="status" aria-live="polite">
      <span className="live-dot" aria-hidden />
      <span className="hdr-live">Live city model</span>
      <span className="hdr-sep" aria-hidden />
      <span className="hdr-status-text">{text}</span>
    </div>
  );
}

export function Header() {
  const layerPanel = useTwinStore((s) => s.layerPanel);
  const setLayerPanel = useTwinStore((s) => s.setLayerPanel);
  const scenarioMenu = useTwinStore((s) => s.scenarioMenu);
  const setScenarioMenu = useTwinStore((s) => s.setScenarioMenu);
  const resetView = useTwinStore((s) => s.resetView);
  const activePreset = useTwinStore((s) => s.activePreset);
  const infoOpen = useTwinStore((s) => s.infoOpen);
  const setInfoOpen = useTwinStore((s) => s.setInfoOpen);
  const infoRef = useRef<HTMLDivElement>(null);
  const closeInfo = useCallback(() => setInfoOpen(false), [setInfoOpen]);
  useDismiss(infoRef, infoOpen, closeInfo, '[data-popover-toggle="info"]');

  return (
    <header className="hdr panel-enter" style={{ ['--enter-delay' as string]: '0ms' }}>
      <a className="hdr-brand" href="#" aria-label="Al Sajaa twin home">
        <TwinMark size={30} className="twin-mark" />
        <div>
          <div className="hdr-title">Al Sajaa Twin</div>
          <div className="hdr-tagline">The city that fixes itself first</div>
        </div>
      </a>

      <StatusPill />

      <div className="hdr-right">
        <nav className="seg" aria-label="Views">
          <button className={`seg-btn ${activePreset === 'city' ? 'is-on' : ''}`} onClick={() => resetView()} title="Overview (0)">
            <LayoutGrid size={14} />
            Overview
          </button>
          <button className={`seg-btn ${layerPanel ? 'is-on' : ''}`} onClick={() => setLayerPanel(!layerPanel)} aria-pressed={layerPanel} title="Infrastructure layers (L)">
            <Layers size={14} />
            Layers
          </button>
          <button className={`seg-btn ${scenarioMenu ? 'is-on' : ''}`} onClick={() => setScenarioMenu(!scenarioMenu)} aria-pressed={scenarioMenu} title="Scenario" data-popover-toggle="scenario">
            <PlayCircle size={14} />
            Demo
          </button>
        </nav>
        <Clock />
        <div className="hdr-info">
          <button className="icon-btn" aria-label="About this demo" aria-expanded={infoOpen} onClick={() => setInfoOpen(!infoOpen)} data-popover-toggle="info">
            <Info size={16} />
          </button>
          {infoOpen && (
            <div className="popover hdr-info-pop" role="dialog" ref={infoRef}>
              <div className="popover-title">About this demo</div>
              <p>The Al Sajaa streets, yards, camps, solar farm and Etihad Rail are a procedural layout based on an industrial-area plan, not a survey. The pipes, sensors, crews and the leak are made up for the demo. Nothing is connected to a real network.</p>
              <p className="muted">
                Keys: <kbd>Space</kbd> play or pause · <kbd>X</kbd> X-ray · <kbd>E</kbd> exploded view · <kbd>R</kbd> start over
              </p>
              <p className="muted">{MAP_CREDIT}</p>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
