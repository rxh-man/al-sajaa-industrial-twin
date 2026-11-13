import { useEffect, useMemo } from 'react';
import { Plane, X } from 'lucide-react';
import { useAviationStore, TAB_LABELS, type AviationTab } from './store';
import { AIRPORT } from './model';
import { Analytics, Audit, Cargo, Command, Control, Ai, Fleet, Flights, Passengers, Safety, Turnaround, WhatIf } from './AviationViews';
import { useOpsStore } from '../opsAgent/store';
import { useSusStore } from '../sustainability/store';
import { usePark } from '../parknex/store';
import { useTwinStore } from '../store/useTwinStore';
import { AIRPORT_CENTRE } from './AviationScene';
import './aviation.css';

interface DemoStep { title: string; run: () => void }

const DEMO: DemoStep[] = [
  { title: 'Command view: SH204 is on stand A5 with ground crews working', run: () => useAviationStore.setState({ tab: 'command', selectedFlight: 'SH204', clock: 9 * 60 + 58 }) },
  { title: 'Select SH204 and open its turnaround timeline', run: () => useAviationStore.setState({ tab: 'turnaround', selectedFlight: 'SH204' }) },
  { title: 'Baggage tractor BT-01 fails during loading', run: () => useAviationStore.getState().failBaggageTractor() },
  { title: 'Agents recommend a replacement tractor and show the delay', run: () => useAviationStore.setState({ tab: 'ai' }) },
  { title: 'Operator approves the replacement (human decision)', run: () => useAviationStore.getState().assignReplacement() },
  { title: 'Turnaround recovers: the 3D tractor is replaced', run: () => useAviationStore.setState({ tab: 'turnaround' }) },
  { title: 'Flights: revised departure for SH204 and stand A5 status', run: () => useAviationStore.setState({ tab: 'flights' }) },
  { title: 'Passengers and bags: handling impact', run: () => useAviationStore.setState({ tab: 'passengers' }) },
  { title: 'Audit trail records the failure and the approval', run: () => useAviationStore.setState({ tab: 'audit' }) },
];

export function openAviation() {
  useOpsStore.getState().setOpen(false);
  useSusStore.getState().setOpen(false);
  usePark.getState().setOpen(false);
  useAviationStore.getState().setOpen(true);
  useAviationStore.getState().setTab('command');
}

export function AviationPanel() {
  const open = useAviationStore((s) => s.open);
  const setOpen = useAviationStore((s) => s.setOpen);
  const close = () => {
    setOpen(false);
    useTwinStore.getState().resetView(); // back to the city view
  };
  const tab = useAviationStore((s) => s.tab);
  const setTab = useAviationStore((s) => s.setTab);
  const step = useAviationStore((s) => s.step);
  const setStep = useAviationStore((s) => s.setStep);
  const baggageTractorFailed = useAviationStore((s) => s.baggageTractorFailed);
  const replacementAssigned = useAviationStore((s) => s.replacementAssigned);
  const weather = useAviationStore((s) => s.weather);
  const extraDelay = useAviationStore((s) => s.extraDelay);
  const selected = useAviationStore((s) => s.selectedFlight);
  const scen = useMemo(() => ({ baggageTractorFailed, replacementAssigned }), [baggageTractorFailed, replacementAssigned]);

  // aviation is the primary view while open: close the other side panels and return the camera home
  useEffect(() => {
    if (!open) return;
    useOpsStore.getState().setOpen(false);
    useSusStore.getState().setOpen(false);
    usePark.getState().setOpen(false);
    useTwinStore.getState().focusPlace(AIRPORT_CENTRE.x + 34, AIRPORT_CENTRE.z, 90);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  const runStep = (n: number) => {
    const i = Math.max(0, Math.min(DEMO.length - 1, n));
    setStep(i + 1);
    DEMO[i].run();
  };
  const go = (t: AviationTab) => setTab(t);

  return (
    <aside className="ops-panel av-panel" role="dialog" aria-labelledby="av-title">
      <header className="ops-head">
        <Plane size={20} aria-hidden />
        <div>
          <h3 id="av-title">MRR AVIATION</h3>
          <div className="ops-small ops-muted">{AIRPORT} · simulated</div>
        </div>
        <button className="ops-chip" onClick={close}>Return to Smart City</button>
        <button className="icon-btn" aria-label="Close" onClick={close}>
          <X size={16} />
        </button>
      </header>

      <nav className="ops-tabs av-tabs" role="tablist" aria-label="Aviation views">
        {TAB_LABELS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={`ops-tabbtn ${tab === id ? 'is-on' : ''}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>

      <div className="ops-scroll">
        {tab === 'command' && <Command scen={scen} weather={weather} extraDelay={extraDelay} go={go} />}
        {tab === 'control' && <Control weather={weather} extraDelay={extraDelay} scen={scen} />}
        {tab === 'flights' && <Flights weather={weather} extraDelay={extraDelay} scen={scen} go={go} />}
        {tab === 'turnaround' && <Turnaround flightId={selected} scen={scen} />}
        {tab === 'passengers' && <Passengers scen={scen} />}
        {tab === 'fleet' && <Fleet />}
        {tab === 'cargo' && <Cargo />}
        {tab === 'safety' && <Safety scen={scen} />}
        {tab === 'analytics' && <Analytics scen={scen} weather={weather} extraDelay={extraDelay} />}
        {tab === 'whatif' && <WhatIf scen={scen} />}
        {tab === 'ai' && <Ai scen={scen} weather={weather} extraDelay={extraDelay} />}
        {tab === 'audit' && <Audit />}
      </div>

      <footer className="av-demo">
        <span className="ops-small ops-muted">{step ? `Demo ${step} of ${DEMO.length}: ${DEMO[step - 1].title}` : 'Guided demo: press Start'}</span>
        <div className="av-demo-btns">
          <button className="ops-btn" disabled={step <= 1} onClick={() => runStep(step - 2)}>Previous</button>
          <button className="ops-btn" onClick={() => (useAviationStore.getState().reset(), setStep(0))}>Restart</button>
          <button className="ops-btn primary" disabled={step >= DEMO.length} onClick={() => runStep(step)}>
            {step ? 'Next' : 'Start'}
          </button>
        </div>
      </footer>
    </aside>
  );
}
