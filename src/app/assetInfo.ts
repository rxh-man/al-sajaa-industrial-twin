import { BUILDING_BY_ID, SECTOR_BY_ID, BUILDINGS, buildingLabel, sectorAt } from '../data/city';
import { AD, AD_BUILDING_ID0, type AdKind } from '../data/abudhabi';
import { findSegment, LAYERS, INCIDENT_SEGMENT_ID } from '../data/networks';
import { SENSORS, SENSOR_TYPE_LABEL } from '../data/sensors';
import { INCIDENT, IMPACT, VALVES } from '../data/incident';
import type { HoverInfo } from '../store/useTwinStore';
import type { SimSnapshot } from '../simulation/engine';
import { sensorState } from '../three/SensorNodes';
import { live } from '../simulation/runtime';

export type Tone = 'ok' | 'warn' | 'alert' | 'info';

export interface InfoRow {
  label: string;
  value: string;
  tone?: Tone;
  mono?: boolean;
  /** shown in the compact hover card */
  key?: boolean;
}

export interface AssetInfo {
  kicker: string;
  title: string;
  subtitle?: string;
  tone: Tone;
  status: string;
  rows: InfoRow[];
  color?: string;
}

const fmt = (v: number, d = 1) => (v >= 0 ? `+${v.toFixed(d)}` : v.toFixed(d));

const KIND_LABEL: Record<AdKind, string> = {
  mosque: 'Mosque',
  mall: 'Shopping mall',
  hospital: 'Hospital',
  school: 'School',
  fort: 'Cultural site',
  roof: 'Canopy',
  utility: 'Utility building',
  hotel: 'Hotel',
  house: 'House',
  office: 'Offices',
  tower: 'Tower',
  residential: 'Apartments',
  building: 'Building',
};

/** A real downtown building from OpenStreetMap. */
function describePlace(id: number, snap: SimSnapshot): AssetInfo | null {
  const b = AD.buildings[id - AD_BUILDING_ID0];
  if (!b) return null;
  const d = Math.hypot(b.c[0] - IMPACT.center.x, b.c[1] - IMPACT.center.z);
  const inZone = snap.impact && !snap.resolved && d <= IMPACT.radius;
  return {
    kicker: KIND_LABEL[b.k],
    title: b.n || KIND_LABEL[b.k],
    subtitle: `Area ${sectorAt(b.c[0], b.c[1])?.id ?? '—'} · ${Math.round(d * 10)} m from the leak`,
    tone: inZone ? 'warn' : 'ok',
    status: inZone ? 'In affected zone' : 'Normal',
    rows: [
      { label: 'Height', value: `${Math.round(b.h * 10)} m`, key: true },
      { label: 'Water service', value: inZone ? 'At risk if the main fails' : 'Normal', tone: inZone ? 'warn' : 'ok', key: true },
      { label: 'Map', value: 'OpenStreetMap' },
    ],
  };
}

export function describe(info: HoverInfo, snap: SimSnapshot): AssetInfo | null {
  switch (info.kind) {
    case 'building': {
      if (info.id >= AD_BUILDING_ID0) return describePlace(info.id, snap);
      const b = BUILDING_BY_ID.get(info.id);
      if (!b) return null;
      const d = Math.hypot(b.x - IMPACT.center.x, b.z - IMPACT.center.z);
      const inZone = snap.impact && !snap.resolved && d <= IMPACT.radius;
      return {
        kicker: b.code,
        title: b.name,
        subtitle: `Sector ${b.sector} · ${buildingLabel(b.kind)}`,
        tone: inZone ? 'warn' : 'ok',
        status: inZone ? 'In affected zone' : 'Nominal',
        rows: [
          { label: 'Height', value: `${Math.round(b.height * 10)} m · ${b.floors} floors` },
          { label: b.kind === 'office' ? 'Workers (day)' : 'Est. occupants', value: b.occupants > 0 ? b.occupants.toLocaleString('en-US') : '—' },
          { label: 'Water service', value: inZone ? 'At risk if main fails' : 'Normal', tone: inZone ? 'warn' : 'ok' },
        ],
      };
    }
    case 'sector': {
      const s = SECTOR_BY_ID.get(info.id);
      if (!s) return null;
      const bs = BUILDINGS.filter((b) => b.sector === s.id);
      const residents = bs.reduce((a, b) => a + b.occupants, 0);
      const incident = s.id === 'B-12' && snap.anomaly && !snap.resolved;
      return {
        kicker: 'SECTOR',
        title: s.id,
        subtitle: s.kind === 'park' ? 'Public park' : s.kind === 'yard' ? 'Utility yard' : s.kind === 'campus' ? 'Education campus' : 'Urban block',
        tone: incident ? (snap.localized ? 'alert' : 'warn') : 'ok',
        status: incident ? (snap.localized ? 'Incident' : 'Anomaly') : 'Nominal',
        rows: [
          { label: 'Buildings', value: String(bs.length) },
          { label: 'Residents', value: residents.toLocaleString('en-US') },
          { label: 'Sensors online', value: s.id === 'B-12' ? '6 / 6' : `${2 + (s.index % 4)} / ${2 + (s.index % 4)}` },
        ],
      };
    }
    case 'pipe': {
      const seg = findSegment(info.layer, info.variant, info.index);
      if (!seg) return null;
      const layer = LAYERS[seg.layer];
      const incident = seg.id === INCIDENT_SEGMENT_ID;
      if (incident) {
        const repaired = snap.repairStep >= 6;
        const isolated = snap.repairStep >= 1 && snap.repairStep < 6;
        const active = snap.anomaly && !repaired;
        return {
          kicker: 'ASSET',
          title: seg.id,
          subtitle: `${layer.label} main · Khalifa Street`,
          tone: repaired ? 'ok' : active ? 'alert' : 'ok',
          status: repaired ? 'Repaired' : isolated ? 'Isolated' : active ? (snap.localized ? 'Leak detected' : 'Abnormal') : 'Normal',
          color: layer.color,
          rows: [
            { label: 'Material', value: seg.meta.material },
            { label: 'Diameter', value: `${seg.meta.diameterMm} mm` },
            { label: 'Install year', value: String(seg.meta.installYear) },
            { label: 'Pressure', value: `${snap.pressureBar.toFixed(2)} bar`, mono: true, key: true },
            { label: 'Deviation', value: `${fmt(snap.pressureDev)}%`, tone: Math.abs(snap.pressureDev) > 1 ? 'warn' : undefined, mono: true, key: true },
            { label: 'Health', value: repaired ? '96%' : `${seg.meta.health}%`, tone: repaired ? 'ok' : 'alert', key: true },
            { label: 'Predicted failure', value: repaired ? '—' : snap.localized ? `${INCIDENT.failureWindow[0]}–${INCIDENT.failureWindow[1]} h` : 'Assessing…', tone: repaired ? undefined : 'alert', key: true },
          ],
        };
      }
      const flowWord = seg.layer === 'electric' ? 'Load' : seg.layer === 'telecom' ? 'Utilisation' : 'Flow';
      const flowVal = seg.layer === 'electric' ? `${52 + (seg.index * 7) % 30}%` : seg.layer === 'telecom' ? `${31 + (seg.index * 11) % 40}%` : `${180 + (seg.index * 37) % 260} L/s`;
      const rerouting = seg.reroute && live.reroute > 0.3;
      return {
        kicker: 'ASSET',
        title: seg.id,
        subtitle: `${layer.label} · ${seg.meta.spec}`,
        tone: rerouting ? 'info' : 'ok',
        status: rerouting ? 'Carrying rerouted flow' : 'Normal',
        color: layer.color,
        rows: [
          { label: 'Material', value: seg.meta.material },
          { label: 'Diameter', value: `${seg.meta.diameterMm} mm` },
          { label: 'Install year', value: String(seg.meta.installYear) },
          { label: flowWord, value: flowVal, mono: true },
          { label: 'Health', value: `${seg.meta.health}%`, tone: 'ok' },
          { label: 'Length', value: `${Math.round(seg.length * 10)} m` },
        ],
      };
    }
    case 'sensor': {
      const s = SENSORS[info.index];
      if (!s) return null;
      const st = sensorState(s);
      const tone: Tone = st === 2 ? 'alert' : st === 1 ? 'warn' : 'ok';
      const status = st === 2 ? 'Abnormal' : st === 1 ? 'Drifting' : 'Normal';
      const rows: InfoRow[] = [];
      if (s.type === 'pressure') {
        const factor = !s.cluster ? 0 : s.id === 'P-17' ? 1 : s.id === 'P-14' ? 0.55 : 0.72;
        const dev = snap.pressureDev * factor;
        const bar = INCIDENT.pressureBaselineBar * (1 + dev / 100) - (s.cluster ? 0 : (s.index % 5) * 0.03);
        rows.push({ label: 'Pressure', value: `${bar.toFixed(2)} bar`, mono: true });
        rows.push({ label: 'Deviation', value: `${fmt(dev)}%`, mono: true, tone: Math.abs(dev) > 1 ? tone : undefined });
      } else if (s.type === 'moisture') {
        const dev = snap.moistureDev * (s.id === 'M-06' ? 1 : 0.82);
        rows.push({ label: 'Soil moisture', value: `${(21 + dev * 0.21).toFixed(1)}% VWC`, mono: true });
        rows.push({ label: 'Deviation', value: `${fmt(dev, 0)}%`, mono: true, tone: dev > 3 ? tone : undefined });
      } else if (s.type === 'temperature') {
        rows.push({ label: 'Ground temp.', value: `${(31 * (1 + snap.tempDev / 100)).toFixed(2)} °C`, mono: true });
        rows.push({ label: 'Deviation', value: `${fmt(snap.tempDev)}%`, mono: true, tone: snap.tempDev > 1 ? tone : undefined });
      } else if (s.type === 'flow') {
        rows.push({ label: 'Flow', value: `${(412 * (1 + snap.flowImbalance / 100)).toFixed(0)} L/s`, mono: true });
        rows.push({ label: 'Imbalance', value: `${fmt(snap.flowImbalance)}%`, mono: true });
      } else if (s.type === 'voltage') {
        rows.push({ label: 'Voltage', value: `${(11 + (s.index % 3) * 0.02).toFixed(2)} kV`, mono: true });
        rows.push({ label: 'Load', value: `${58 + (s.index * 3) % 20}%`, mono: true });
      } else if (s.type === 'fiber') {
        rows.push({ label: 'Optical loss', value: `${(0.21 + (s.index % 4) * 0.01).toFixed(2)} dB/km`, mono: true });
        rows.push({ label: 'Utilisation', value: `${36 + (s.index * 5) % 30}%`, mono: true });
      } else if (s.type === 'level') {
        rows.push({ label: 'Fill level', value: `${28 + (s.index * 7) % 22}%`, mono: true });
        rows.push({ label: 'H₂S', value: `${(1.2 + (s.index % 3) * 0.3).toFixed(1)} ppm`, mono: true });
      } else {
        rows.push({ label: 'Supply temp.', value: `${(5.5 + (s.index % 3) * 0.1).toFixed(1)} °C`, mono: true });
        rows.push({ label: 'ΔT', value: `${(7.8 + (s.index % 4) * 0.2).toFixed(1)} K`, mono: true });
      }
      rows.push({ label: 'Status', value: status, tone });
      return {
        kicker: LAYERS[s.layer].label.toUpperCase(),
        title: `${SENSOR_TYPE_LABEL[s.type]} ${s.id}`,
        tone,
        status,
        color: LAYERS[s.layer].color,
        rows,
      };
    }
    case 'valve': {
      const vdef = VALVES.find((v) => v.id === info.id);
      if (!vdef) return null;
      const closing = vdef.isolation && live.valves > 0.05;
      const st = closing ? (live.valves > 0.95 ? 'Closed' : 'Closing') : 'Open';
      return {
        kicker: 'ISOLATION VALVE',
        title: vdef.id,
        subtitle: 'Gate valve · 600 mm · remote actuated',
        tone: closing ? 'warn' : 'ok',
        status: st,
        color: LAYERS.water.color,
        rows: [
          { label: 'Position', value: closing ? `${Math.round((1 - live.valves) * 100)}% open` : '100% open', mono: true },
          { label: 'Last exercised', value: vdef.isolation ? '14 days ago' : '3 months ago' },
        ],
      };
    }
  }
}
