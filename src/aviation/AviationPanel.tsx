import { useEffect, useMemo } from 'react';
import { Plane, X } from 'lucide-react';
import { useAviationStore, type AviationTab } from './store';
import { AIRPORT, FLEET, FLIGHTS, hm, kpis, recommendReplacement, turnaround, type Flight } from './model';
import { useOpsStore } from '../opsAgent/store';
import { useSusStore } from '../sustainability/store';
import { usePark } from '../parknex/store';
import { useTwinStore } from '../store/useTwinStore';
import { AIRPORT_CENTRE } from './AviationScene';

const TABS: [AviationTab, string][] = [
  ['overview', 'Overview'],
  ['turnaround', 'Turnaround'],
  ['fleet', 'Ground fleet'],
  ['ai', 'AI recommendation'],
];

interface DemoStep { title: string; run: () => void }

const DEMO: DemoStep[] = [
  { title: 'Regional view: Sahra Aviation and Al Sajaa', run: () => useAviationStore.setState({ tab: 'overview', selectedFlight: 'SH204' }) },
  { title: 'Select the arriving aircraft SH204', run: () => useAviationStore.setState({ tab: 'turnaround', selectedFlight: 'SH204' }) },
  { title: 'Review the turnaround timeline', run: () => useAviationStore.setState({ tab: 'turnaround' }) },
  { title: 'Baggage tractor BT-01 fails', run: () => useAviationStore.getState().failBaggageTractor() },
  { title: 'AI recommends a replacement tractor', run: () => useAviationStore.setState({ tab: 'ai' }) },
  { title: 'Operator approves the replacement', run: () => useAviationStore.getState().assignReplacement() },
  { title: 'Revised departure forecast', run: () => useAviationStore.setState({ tab: 'turnaround' }) },
  { title: 'Ground fleet dashboard', run: () => useAviationStore.setState({ tab: 'fleet' }) },
];

export function openAviation() {
  useOpsStore.getState().setOpen(false);
  useSusStore.getState().setOpen(false);
  usePark.getState().setOpen(false);
  useAviationStore.getState().setOpen(true);
  useAviationStore.getState().setTab('overview');
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
  const scen = useMemo(() => ({ baggageTractorFailed, replacementAssigned }), [baggageTractorFailed, replacementAssigned]);
  const selected = useAviationStore((s) => s.selectedFlight);
  const select = useAviationStore((s) => s.select);

  // aviation is the primary view while open: close the other side panels and return the camera home
  useEffect(() => {
    if (!open) return;
    useOpsStore.getState().setOpen(false);
    useSusStore.getState().setOpen(false);
    usePark.getState().setOpen(false);
    useTwinStore.getState().focusPlace(AIRPORT_CENTRE.x, AIRPORT_CENTRE.z, 90);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const k = useMemo(() => kpis(scen), [scen]);
  if (!open) return null;

  const runStep = (n: number) => {
    const i = Math.max(0, Math.min(DEMO.length - 1, n));
    setStep(i + 1);
    DEMO[i].run();
  };

  return (
    <aside className="ops-panel av-panel" role="dialog" aria-labelledby="av-title">
      <header className="ops-head">
        <Plane size={20} aria-hidden />
        <div>
          <h3 id="av-title">SAHRA AVIATION</h3>
          <div className="ops-small ops-muted">{AIRPORT} · simulated</div>
        </div>
        <button className="ops-chip" onClick={close}>Return to Smart City</button>
        <button className="icon-btn" aria-label="Close" onClick={close}>
          <X size={16} />
        </button>
      </header>

      <nav className="ops-tabs" role="tablist" aria-label="Aviation views">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={`ops-tabbtn ${tab === id ? 'is-on' : ''}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>

      <div className="ops-scroll">
        {tab === 'overview' && <Overview k={k} selected={selected} onPick={(id) => (select(id), setTab('turnaround'))} scen={scen} />}
        {tab === 'turnaround' && <Turnaround flightId={selected} scen={scen} />}
        {tab === 'fleet' && <Fleet />}
        {tab === 'ai' && <Ai scen={scen} />}
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

function Kpi({ l, v, s }: { l: string; v: string; s?: string }) {
  return (
    <div className="sus-kpi">
      <div className="sus-kpi-top">{l}</div>
      <div className="sus-kpi-v">{v}</div>
      {s && <div className="ops-small ops-muted">{s}</div>}
    </div>
  );
}

function flightStatus(f: Flight, scen: { baggageTractorFailed: boolean; replacementAssigned: boolean }) {
  if (f.id === 'SH204' && scen.baggageTractorFailed && !scen.replacementAssigned) return 'Delayed';
  return f.status;
}

function Overview({ k, selected, onPick, scen }: { k: ReturnType<typeof kpis>; selected: string; onPick: (id: string) => void; scen: { baggageTractorFailed: boolean; replacementAssigned: boolean } }) {
  return (
    <div className="ops-tab">
      <div className="sus-kpis">
        <Kpi l="Flights today" v={String(k.flights)} s={`${k.arrivals} arrive by noon`} />
        <Kpi l="Stands occupied" v={`${k.onGround} of ${k.stands}`} s={`${k.standsFree} free`} />
        <Kpi l="Ground equipment" v={`${k.available} available`} s={`${k.busy} busy, ${k.gse} total`} />
        <Kpi l="SH204 turnaround" v={`${k.sh204Turnaround} min`} s={k.sh204Delay > 0 ? `+${k.sh204Delay} min vs plan` : 'on plan'} />
        <Kpi l="Passengers (simulated)" v={k.pax.toLocaleString('en-US')} />
        <Kpi l="Bags (simulated)" v={k.bags.toLocaleString('en-US')} />
      </div>
      <section className="ops-sec">
        <h4>Flight board (fictional)</h4>
        <div className="ops-table-wrap">
          <table className="ops-table">
            <thead><tr><th>Flight</th><th>Aircraft</th><th>Route</th><th>Stand</th><th>Arr</th><th>Dep</th><th>Status</th></tr></thead>
            <tbody>
              {FLIGHTS.map((f) => (
                <tr key={f.id} className={selected === f.id ? 'is-on' : ''} onClick={() => onPick(f.id)} style={{ cursor: 'pointer' }}>
                  <td>{f.id}</td><td>{f.reg} · {f.type}</td><td>{f.route}</td><td>{f.stand}</td><td>{hm(f.arrMin)}</td><td>{hm(f.depMin)}</td><td>{flightStatus(f, scen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="ops-small ops-muted">Fictional flights and registrations. No real flight tracking is connected.</p>
      </section>
    </div>
  );
}

function Turnaround({ flightId, scen }: { flightId: string; scen: { baggageTractorFailed: boolean; replacementAssigned: boolean } }) {
  const f = FLIGHTS.find((x) => x.id === flightId) ?? FLIGHTS[1];
  const tr = turnaround(f.arrMin, scen);
  const span = Math.max(1, tr.departAt - f.arrMin);
  return (
    <div className="ops-tab">
      <section className="ops-sec">
        <h4>{f.id} · {f.reg} · stand {f.stand}</h4>
        <p className="ops-small">Arrival {hm(f.arrMin)}. Estimated departure {hm(tr.departAt)} ({tr.delayMin > 0 ? `+${tr.delayMin} min vs plan` : 'on plan'}).</p>
        {scen.baggageTractorFailed && (
          <p className="ops-note">
            {scen.replacementAssigned
              ? 'Replacement tractor assigned. Baggage loading is back on plan.'
              : `Baggage loading delayed by 8 minutes. Current estimated departure delay: ${tr.delayMin} minutes.`}
          </p>
        )}
        <div className="av-gantt" role="img" aria-label={`Turnaround timeline for ${f.id}`}>
          {tr.rows.map((r) => (
            <div key={r.id} className="av-row">
              <span className="av-label">{r.label}</span>
              <div className="av-track">
                <div
                  className={`av-bar ${r.note ? 'is-alert' : ''}`}
                  style={{ left: `${((r.start - f.arrMin) / span) * 100}%`, width: `${Math.max(1.5, (r.dur / span) * 100)}%` }}
                  title={`${hm(r.start)} to ${hm(r.finish)}${r.note ? ` · ${r.note}` : ''}`}
                />
              </div>
              <span className="av-time">{hm(r.start)}–{hm(r.finish)}</span>
            </div>
          ))}
        </div>
        <p className="ops-small ops-muted">Simulated activity times. Each activity starts when its dependencies finish.</p>
      </section>
    </div>
  );
}

function Fleet() {
  return (
    <div className="ops-tab">
      <section className="ops-sec">
        <h4>Ground support equipment (simulated)</h4>
        <div className="ops-table-wrap">
          <table className="ops-table">
            <thead><tr><th>ID</th><th>Category</th><th>Status</th><th>Task</th><th>Utilisation</th></tr></thead>
            <tbody>
              {FLEET.map((g) => (
                <tr key={g.id}>
                  <td>{g.id}</td><td>{g.category}</td><td>{g.status}</td><td>{g.task}</td><td>{Math.round(g.utilisation * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Ai({ scen }: { scen: { baggageTractorFailed: boolean; replacementAssigned: boolean } }) {
  const rec = recommendReplacement();
  const tr = turnaround(FLIGHTS[1].arrMin, scen);
  const approve = useAviationStore((s) => s.assignReplacement);
  if (!scen.baggageTractorFailed) {
    return (
      <div className="ops-tab">
        <p className="ops-small">No active issues. Trigger the baggage tractor failure from the demo, or from the Turnaround tab, to see a recommendation.</p>
      </div>
    );
  }
  return (
    <div className="ops-tab">
      <section className="ops-sec">
        <h4>Detected issue</h4>
        <p className="ops-small">Baggage tractor BT-01 has failed while serving SH204.</p>
        <h4>Recommendation</h4>
        <p className="ops-small">{rec ? rec.text : 'No replacement tractor is available.'}</p>
        <ul className="ops-small">
          <li>Expected departure: {hm(tr.departAt)} ({tr.delayMin} min vs plan{scen.replacementAssigned ? ', after replacement' : ''})</li>
          <li>Confidence: {rec ? Math.round(rec.confidence * 100) : 0}%</li>
          <li>Approval required: operator must confirm before the tractor is assigned.</li>
        </ul>
        <button className="ops-btn primary" disabled={!rec || scen.replacementAssigned} onClick={approve}>
          {scen.replacementAssigned ? 'Replacement approved' : 'Approve replacement'}
        </button>
        <p className="ops-small ops-muted">Simulated decision. The system does not control real vehicles.</p>
      </section>
    </div>
  );
}
