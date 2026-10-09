import { useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import { Activity, ShieldCheck } from 'lucide-react';
import { CityScene } from '../three/CityScene';
import { viewInsets } from '../three/CameraRig';
import { EXPOSURE } from '../three/sceneConfig';
import { POSES } from '../data/cameras';
import { useTwinStore } from '../store/useTwinStore';
import { Header } from '../components/dashboard/Header';
import { SignalRail } from '../components/dashboard/SignalRail';
import { AgentsPanel } from '../components/agents/AgentsPanel';
import { LayerPanel } from '../components/overlay/LayerPanel';
import { CameraPresets, ViewToggles } from '../components/overlay/ViewControls';
import { FutureOverlay, ScenarioCaption, ScenarioMenu, ScenarioTransport } from '../components/overlay/ScenarioOverlay';
import { CompareOverlay } from '../components/overlay/CompareOverlay';
import { ForecastCard } from '../components/overlay/ForecastCard';
import { HoverTooltip } from '../components/overlay/HoverTooltip';
import { BootSequence } from '../components/overlay/BootSequence';
import { useShortcuts } from '../hooks/useShortcuts';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { MAP_CREDIT } from '../data/abudhabi';
import '../styles/layout.css';
import '../styles/panels.css';
import '../styles/overlays.css';
import '../styles/world.css';
import '../styles/geo.css';
import '../styles/twin.css';
import '../styles/agents.css';

function useViewportInsets(ref: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      viewInsets.left = r.left;
      viewInsets.right = window.innerWidth - r.right;
      viewInsets.top = r.top;
      viewInsets.bottom = window.innerHeight - r.bottom;
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [ref]);
}

export function App() {
  const boot = useTwinStore((s) => s.boot);
  const select = useTwinStore((s) => s.select);
  const phase = useTwinStore((s) => s.snap.phase);
  const [dpr, setDpr] = useState(() => Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 1.5));
  const [quality, setQuality] = useState<'high' | 'low'>('high');
  const viewportRef = useRef<HTMLDivElement>(null);
  const compact = useMediaQuery('(max-width: 1100px)');
  const [drawer, setDrawer] = useState<null | 'left' | 'right'>(null);

  useViewportInsets(viewportRef);
  useShortcuts();

  useEffect(() => {
    if (!compact) setDrawer(null);
  }, [compact]);

  return (
    <div className={`app boot-${boot} ${compact ? 'is-compact' : ''} ${drawer ? `drawer-${drawer}` : ''} phase-${phase.toLowerCase()}`}>
      <div className="stage" role="application" aria-label="Interactive 3D twin of the Al Sajaa industrial district: yards, labor camps, Etihad Rail and five underground utility networks">
        <Canvas
          shadows
          dpr={dpr}
          camera={{ fov: 34, near: 0.4, far: 2400, position: POSES.intro.pos }}
          gl={{ antialias: false, powerPreference: 'high-performance', stencil: false }}
          onCreated={({ gl }) => {
            gl.toneMappingExposure = EXPOSURE;
          }}
          onPointerMissed={() => select(null)}
        >
          {/* only steps down on genuinely slow frames (displays capped at 30 Hz stay at full quality) */}
          <PerformanceMonitor
            bounds={() => [24, 50]}
            flipflops={2}
            onDecline={() => {
              setDpr(1);
              setQuality('low');
            }}
            onIncline={() => setDpr(Math.min(window.devicePixelRatio || 1, 1.75))}
          />
          <CityScene quality={quality} />
        </Canvas>
      </div>

      <Header />

      <aside className="rail rail-l panel panel-enter" style={{ ['--enter-delay' as string]: '80ms' }} aria-label="Live signals">
        <SignalRail />
      </aside>
      <aside className="rail rail-r panel-enter" style={{ ['--enter-delay' as string]: '160ms' }} aria-label="Twin agents">
        {!compact && <CameraPresets />}
        <AgentsPanel />
      </aside>

      <div className="viewport" ref={viewportRef}>
        <div className="vp-tl panel-enter" style={{ ['--enter-delay' as string]: '300ms' }}>
          <LayerPanel />
        </div>
        <div className="vp-tc">
          <ScenarioCaption />
          <CompareOverlay />
        </div>
        <div className="vp-tr panel-enter" style={{ ['--enter-delay' as string]: '340ms' }}>
          <ViewToggles />
          {compact && <CameraPresets />}
        </div>
        <div className="vp-bl">
          <ForecastCard />
        </div>
        <div className="vp-bc panel-enter" style={{ ['--enter-delay' as string]: '420ms' }}>
          <ScenarioTransport />
        </div>
        <FutureOverlay />
      </div>

      {compact && (
        <div className="drawer-toggles">
          <button className={`ov-chip ${drawer === 'left' ? 'is-on' : ''}`} onClick={() => setDrawer(drawer === 'left' ? null : 'left')}>
            <Activity size={14} /> Signals
          </button>
          <button className={`ov-chip ${drawer === 'right' ? 'is-on' : ''}`} onClick={() => setDrawer(drawer === 'right' ? null : 'right')}>
            <ShieldCheck size={14} /> Agents
          </button>
        </div>
      )}

      <a className="map-credit" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
        {MAP_CREDIT}
      </a>

      <ScenarioMenu />
      <HoverTooltip />
      <BootSequence />
    </div>
  );
}
