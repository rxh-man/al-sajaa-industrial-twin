import { useEffect, useMemo, useState } from 'react';
import { Activity, Car, Factory, Gauge, Leaf, ParkingSquare, TrafficCone, Zap } from 'lucide-react';
import { cityKpis } from '../../parknex/model';
import { opsFrom, usePark } from '../../parknex/store';
import { snapshot } from '../../sustainability/model';
import { useSusStore } from '../../sustainability/store';
import { SignalRail } from './SignalRail';

/**
 * The left rail with selectable live views: the original Sensors, plus Parking, CO₂, Traffic and city KPIs.
 * "Live" is a SIMULATED feed: values follow the models at the current time of day (Gulf time, or the PARKNEX
 * clock while it is playing), sampled every 2 s with a short history. No real sensors are connected.
 */
type View = 'sensors' | 'parking' | 'co2' | 'traffic' | 'kpis';
const VIEWS: [View, string][] = [
  ['sensors', 'Sensors'],
  ['parking', 'Parking'],
  ['co2', 'CO₂'],
  ['traffic', 'Traffic'],
  ['kpis', 'KPIs'],
];
const n = (v: number, d = 0) => v.toLocaleString('en-US', { maximumFractionDigits: d });
/** traffic share by hour of day (commute peaks), illustrative */
const TRAFFIC = [0.2, 0.15, 0.12, 0.12, 0.18, 0.35, 0.7, 0.95, 1, 0.85, 0.75, 0.75, 0.78, 0.76, 0.75, 0.82, 0.95, 1, 0.9, 0.7, 0.55, 0.45, 0.35, 0.25];
const at = (a: number[], h: number) => a[Math.floor(h) % 24] * (1 - (h % 1)) + a[(Math.floor(h) + 1) % 24] * (h % 1);

function useLiveHour() {
  const playing = usePark((s) => s.playing);
  const parkHour = usePark((s) => s.ops.hour);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 2000);
    return () => clearInterval(id);
  }, []);
  if (playing) return parkHour;
  const d = new Date(now);
  return (d.getUTCHours() + 4 + d.getUTCMinutes() / 60) % 24; // Gulf time
}

/** keeps the last 30 samples of a value */
function useHistory(v: number) {
  const [h, setH] = useState<number[]>([]);
  useEffect(() => setH((p) => [...p.slice(-29), v]), [v]);
  return h;
}

function Spark({ data }: { data: number[] }) {
  if (data.length < 2) return <svg className="lv-spark" />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * 100},${28 - ((v - min) / (max - min || 1)) * 24}`).join(' ');
  return (
    <svg className="lv-spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden>
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Card({ icon, label, value, sub, tone = 'ok', hist }: { icon: React.ReactNode; label: string; value: string; sub?: string; tone?: 'ok' | 'warn' | 'alert'; hist: number[] }) {
  return (
    <article className={`sig-card tone-${tone === 'alert' ? 'alert' : tone === 'warn' ? 'warn' : 'ok'} lv-card`}>
      <header className="sig-head">
        <span className="sig-icon" aria-hidden>
          {icon}
        </span>
        <span className="sig-label">{label}</span>
      </header>
      <div className="sig-row">
        <span className="sig-value tnum">{value}</span>
        <Spark data={hist} />
      </div>
      {sub && <div className="lv-sub">{sub}</div>}
    </article>
  );
}

function ParkingView({ hour }: { hour: number }) {
  const ops = usePark((s) => s.ops);
  const maint = usePark((s) => s.maint);
  const event = usePark((s) => s.event);
  const k = useMemo(() => cityKpis(opsFrom({ ops: { ...ops, hour: usePark.getState().playing ? ops.hour : hour }, maint, event })), [ops, maint, event, hour]);
  const hOcc = useHistory(Math.round(k.occupancy * 1000) / 10);
  const hFree = useHistory(k.available);
  const hRev = useHistory(Math.round(k.revenuePerH));
  const hIn = useHistory(Math.round(k.entriesPerH));
  const open = (tab: string) => (usePark.getState().setOpen(true), usePark.getState().setTab(tab));
  return (
    <>
      <Card icon={<ParkingSquare size={14} />} label="Occupancy" value={`${n(k.occupancy * 100)} %`} sub={`${n(k.occupied)} of ${n(k.capacity)} bays`} tone={k.occupancy > 0.9 ? 'alert' : k.occupancy > 0.8 ? 'warn' : 'ok'} hist={hOcc} />
      <Card icon={<Car size={14} />} label="Free spaces" value={n(k.available)} sub={`${n(k.reserved)} reserved · ${n(k.maintenance)} maintenance`} hist={hFree} />
      <Card icon={<Activity size={14} />} label="Entries / h" value={n(k.entriesPerH)} sub={`${n(k.exitsPerH)} exits/h · wait ${n(k.avgWaitMin, 1)} min`} hist={hIn} />
      <Card icon={<Zap size={14} />} label="Revenue / h" value={`AED ${n(k.revenuePerH)}`} sub={`today AED ${n(k.revenueToday)} · sensors ${n(k.sensorsOffline + k.sensorsFaulty)} issues`} hist={hRev} />
      {k.per.map((p) => (
        <button key={p.id} className="lv-row" onClick={() => (usePark.getState().selectFacility(p.id), open('facilities'))}>
          <span>{p.name.replace('PARKNEX ', '')}</span>
          <span className="lv-meter">
            <span style={{ width: `${p.occupancy * 100}%`, background: p.occupancy > 0.9 ? '#ef4444' : p.occupancy > 0.75 ? '#f59e0b' : '#22c55e' }} />
          </span>
          <b>{n(p.available)}</b>
        </button>
      ))}
    </>
  );
}

function Co2View({ hour }: { hour: number }) {
  const levers = useSusStore((s) => s.levers);
  const snap = useMemo(() => snapshot(levers), [levers]);
  // tonnes per hour now: industry by operating share, traffic by the hourly profile, buildings by a cooling curve
  const t = TRAFFIC.reduce((a, b) => a + b, 0) / 24;
  const ind = (snap.carbon.industryT / 8760) * (hour >= 6 && hour < 22 ? 1.25 : 0.5);
  const veh = (snap.carbon.vehiclesT / 8760) * (at(TRAFFIC, hour) / t);
  const bld = (snap.carbon.buildingsT / 8760) * (0.75 + 0.5 * Math.max(0, Math.sin(((hour - 6) / 24) * Math.PI * 2)));
  const total = ind + veh + bld - (snap.carbon.solarCutT / 8760) * Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI)) * 2;
  const hT = useHistory(Math.round(total * 10) / 10);
  const hI = useHistory(Math.round(ind * 10) / 10);
  const hV = useHistory(Math.round(veh * 10) / 10);
  const hB = useHistory(Math.round(bld * 10) / 10);
  return (
    <>
      <Card icon={<Leaf size={14} />} label="CO₂ now (city)" value={`${n(total, 1)} t/h`} sub={`net ${n(snap.carbon.netT / 1000, 1)} kt/yr modelled`} hist={hT} />
      <Card icon={<Factory size={14} />} label="Industry" value={`${n(ind, 1)} t/h`} sub={`${snap.facilities.length} facilities`} hist={hI} />
      <Card icon={<Car size={14} />} label="Road traffic" value={`${n(veh, 1)} t/h`} hist={hV} />
      <Card icon={<Zap size={14} />} label="Buildings (cooling)" value={`${n(bld, 1)} t/h`} hist={hB} />
      <button className="lv-link" onClick={() => useSusStore.getState().setOpen(true)}>
        Open the Sustainability Command Centre →
      </button>
    </>
  );
}

function TrafficView({ hour }: { hour: number }) {
  const share = at(TRAFFIC, hour);
  const snap = useMemo(() => snapshot(), []);
  const vehH = (snap.traffic.vehKmYear / 365 / 24) * (share / (TRAFFIC.reduce((a, b) => a + b, 0) / 24)) / 8; // ~8 km average trip
  const congestion = Math.min(1, share ** 2 * 1.1);
  const speed = 60 * (1 - 0.55 * congestion);
  const hV = useHistory(Math.round(vehH));
  const hC = useHistory(Math.round(congestion * 100));
  const hS = useHistory(Math.round(speed));
  return (
    <>
      <Card icon={<Car size={14} />} label="Vehicles on the network" value={n(vehH)} sub="trips per hour, modelled" hist={hV} />
      <Card icon={<TrafficCone size={14} />} label="Congestion index" value={`${n(congestion * 100)}`} sub={congestion > 0.8 ? 'peak: delays on main corridors' : congestion > 0.5 ? 'moderate' : 'free-flowing'} tone={congestion > 0.8 ? 'alert' : congestion > 0.5 ? 'warn' : 'ok'} hist={hC} />
      <Card icon={<Gauge size={14} />} label="Average speed" value={`${n(speed)} km/h`} sub="arterials, modelled" hist={hS} />
      <Card icon={<Activity size={14} />} label="Freight movements" value={n(snap.facilities.reduce((a, f) => a + f.trucksDay, 0) * at(TRAFFIC, hour) / 14)} sub="trucks per hour" hist={hV.map((v) => v * 0.1)} />
    </>
  );
}

function KpiView({ hour }: { hour: number }) {
  const ops = usePark((s) => s.ops);
  const k = useMemo(() => cityKpis(opsFrom({ ops: { ...ops, hour }, maint: [], event: usePark.getState().event })), [ops, hour]);
  const snap = useMemo(() => snapshot(), []);
  const hP = useHistory(Math.round(k.occupancy * 100));
  const rows: [string, string][] = [
    ['Parking occupancy', `${n(k.occupancy * 100)} %`],
    ['Free parking spaces', n(k.available)],
    ['Parking revenue today', `AED ${n(k.revenueToday)}`],
    ['Net CO₂ (modelled)', `${n(snap.carbon.netT / 1000, 1)} kt/yr`],
    ['Trees and palms', n(snap.green.total)],
    ['Water use', `${n(snap.water.totalM3Day)} m³/day`],
    ['Electricity demand', `${n(snap.energy.demandMWh / 8760, 1)} MW avg`],
    ['Solar share', `${n((snap.energy.solarMWh / snap.energy.demandMWh) * 100, 2)} %`],
    ['Industrial facilities', n(snap.facilities.length)],
    ['Parking sensors offline', n(k.sensorsOffline + k.sensorsFaulty)],
  ];
  return (
    <>
      <Card icon={<Activity size={14} />} label="City pulse" value={`${n(at(TRAFFIC, hour) * 100)}`} sub="activity index (traffic + parking)" hist={hP} />
      <div className="lv-table">
        {rows.map(([l, v]) => (
          <div key={l}>
            <span>{l}</span>
            <b>{v}</b>
          </div>
        ))}
      </div>
    </>
  );
}

export function LiveRail() {
  const [view, setView] = useState<View>(() => {
    try {
      return (localStorage.getItem('al-sajaa-rail-view') as View) || 'sensors';
    } catch {
      return 'sensors';
    }
  });
  const hour = useLiveHour();
  const pick = (v: View) => {
    setView(v);
    try {
      localStorage.setItem('al-sajaa-rail-view', v);
    } catch {
      /* fine */
    }
  };
  return (
    <>
      <div className="lv-tabs" role="tablist" aria-label="Live views">
        {VIEWS.map(([id, l]) => (
          <button key={id} role="tab" aria-selected={view === id} className={view === id ? 'is-on' : ''} onClick={() => pick(id)}>
            {l}
          </button>
        ))}
      </div>
      {view === 'sensors' ? (
        <SignalRail />
      ) : (
        <div className="rail-inner">
          <header className="rail-head">
            <span className="rail-title">{VIEWS.find((v) => v[0] === view)![1]} · live</span>
            <span className="lv-time tnum">
              {String(Math.floor(hour)).padStart(2, '0')}:{String(Math.floor((hour % 1) * 60)).padStart(2, '0')}
            </span>
          </header>
          <div className="sig-grid">
            {view === 'parking' && <ParkingView hour={hour} />}
            {view === 'co2' && <Co2View hour={hour} />}
            {view === 'traffic' && <TrafficView hour={hour} />}
            {view === 'kpis' && <KpiView hour={hour} />}
          </div>
          <p className="lv-note">Simulated live feed from the twin's models — not real sensor data.</p>
        </div>
      )}
    </>
  );
}
