import { useTwinStore } from '../store/useTwinStore';
import { useOpsStore } from '../opsAgent/store';
import { useSusStore } from '../sustainability/store';
import { COST_DEFAULTS, eventPlan, facilityById, FACILITIES, opportunities, tenantRelease } from './model';
import { opsFrom, usePark } from './store';

/** The PARKNEX demonstration: 19 steps through the real panels and models (no scripted numbers). */
const P = () => usePark.getState();
const fly = (id: string, r = 22) => {
  const f = facilityById(id);
  if (f) useTwinStore.getState().focusPlace(f.site.x, f.site.z, r);
};
const open = (tab: string) => {
  useOpsStore.getState().setOpen(false);
  useSusStore.getState().setOpen(false);
  P().setOpen(true);
  P().setTab(tab);
};

export const PARKNEX_STEPS: { title: string; body: string; titleAr?: string; bodyAr?: string; enter: () => void; act?: { label: string; run: () => void; done?: () => boolean } }[] = [
  { title: 'Al Sajaa from above', body: 'The smart city twin. PARKNEX runs a network of parking facilities across it.', enter: () => (P().setOpen(false), useTwinStore.getState().resetView()) },
  { title: 'PARKNEX Central', body: 'The flagship facility: illuminated PARKNEX sign with live availability, barriers, ANPR cameras and pay stations at the entrance.', enter: () => fly('central', 14) },
  { title: 'A city-wide network', body: `${FACILITIES.length} facilities: ${FACILITIES.map((f) => f.name.replace('PARKNEX ', '')).join(', ')}. Every bay is coloured by its live (simulated) status.`, enter: () => useTwinStore.getState().focusPlace(-40, -60, 140) },
  { title: 'Central Command Centre', body: 'Capacity, occupancy, sessions, sensors, entries and revenue for the whole network, from one model.', enter: () => open('overview') },
  { title: 'Availability now', body: 'Press play to run the simulated clock: occupancy follows each facility’s demand profile through the day.', enter: () => (open('overview'), P().setPlaying(true)) },
  { title: 'Sensors and infrastructure', body: 'Bay sensors (with offline and faulty units), ANPR, barriers, guidance signs and EV chargers.', enter: () => (P().setPlaying(false), open('sensors')) },
  { title: 'Paid parking and revenue', body: 'Tariffs, sessions, revenue per bay and a pricing simulator showing how price moves occupancy and income. Simulated, not transactions.', enter: () => open('revenue') },
  { title: 'Event surge', body: 'A 6,000-person concert at the Event Arena: vehicle demand, capacity within 3 km, shortage, surges and the guidance plan.', enter: () => (open('events'), fly('event', 30)), act: { label: 'Run the event', run: () => { const e = P().event; const p = eventPlan(e, opsFrom(P())); const ve: Record<string, number> = {}; for (const a of p.allocation) ve[a.id] = a.vehicles; P().setOps({ hour: e.startH, eventVehicles: ve }); P().setEvent({ active: true }); }, done: () => P().event.active } },
  { title: 'Tenant space optimisation', body: '', enter: () => open('tenants') },
  { title: 'Maintenance impact', body: 'Close a row or a barrier: affected spaces, revenue at risk, alternative capacity and the lowest-demand window.', enter: () => (P().setEvent({ active: false }), P().setOps({ eventVehicles: {} }), open('maintenance')) },
  { title: 'Development & expansion', body: 'Where the city needs more parking: demand from nearby offices, shops and homes against free supply.', enter: () => open('development') },
  { title: 'Insufficient parking found', body: `Top opportunity: ${opportunities()[0]?.district ?? '—'} (score ${opportunities()[0]?.score ?? '—'}).`, enter: () => { const o = opportunities()[0]; if (o) (P().selectOpp(o.id), useTwinStore.getState().focusPlace(o.site.x, o.site.z, 30)); } },
  { title: 'Select the site', body: 'Land area, road access, nearby demand, constraints and proposed capacity.', enter: () => open('development') },
  { title: 'Construction cost', body: 'Editable AED assumptions: land, civil works, lighting, barriers, ANPR, sensors, payment, EV chargers, landscaping, contingency.', enter: () => { const o = opportunities()[0]; if (o) P().setCost({ ...COST_DEFAULTS, bays: o.capacity, siteM2: o.areaM2 }); open('roi'); } },
  { title: 'Revenue forecast', body: 'Occupancy, tariff, hours and stay give daily, monthly and annual revenue and net operating income.', enter: () => open('roi') },
  { title: 'Payback and ROI', body: 'Conservative, base and optimistic scenarios and a five-year projection. Estimates, not guaranteed returns.', enter: () => open('roi') },
  { title: 'Simulated approval', body: 'Feasibility → proposal → submission → decision against the simulated authority criteria. Use the workflow buttons in the panel.', enter: () => open('roi') },
  { title: 'Construction', body: 'After approval, “Begin construction” shows the site taking shape stage by stage until it is operational.', enter: () => { const o = opportunities()[0]; if (o) useTwinStore.getState().focusPlace(o.site.x, o.site.z, 28); } },
  { title: 'Back to the command centre', body: 'All outcomes stay connected: 3D bays, facility boards, dashboard and the Parking Intelligence Agent.', enter: () => open('overview') },
];
// tenant step text depends on the model
PARKNEX_STEPS[8] = {
  title: 'Tenant space optimisation',
  body: (() => {
    const f = facilityById('residential') ?? FACILITIES[0];
    const t = tenantRelease(f, { protectPct: 10, maxRelease: 60, visitorDemand: 50, hours: 8, tariff: f.tariffHour });
    return `${f.name}: ${t.allocated} tenant bays, ${t.expected} expected in use during working hours; up to ${t.eligible} can be offered to visitors after a ${t.protectedBays}-bay protection buffer.`;
  })(),
  enter: () => (open('tenants'), fly('residential')),
};
