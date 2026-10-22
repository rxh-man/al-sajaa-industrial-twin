import { AD } from '@/data/abudhabi';
import { COVERAGE } from '@/data/coverage';
import { countCatalogue } from '@/three/buildingVariants';
import { VEHICLE_LENGTH } from '@/three/vehicles/vehicleModels';
import { TwinMark } from '@/components/ui/TwinMark';
import { TwinPreview } from './TwinPreview';
import './landing.css';

const DISTRICTS = [
  {
    tag: 'West',
    t: 'Logistics and freight',
    d: 'Warehouses, container stacks, truck depots and loading bays along the freight edge, with forklifts and reach stackers at work.',
    k: `${AD.buildings.filter((b) => b.procedural && b.n.includes('warehouse')).length} warehouses`,
  },
  {
    tag: 'North',
    t: 'Industry and utilities',
    d: 'Factory halls, workshops, substations and service corridors, with excavators and loaders parked at the plant edge.',
    k: 'Service roads and utility corridors',
  },
  {
    tag: 'East',
    t: 'Residential and community',
    d: 'Villas, townhouses and apartment blocks around parks, a mosque, a school and a district mall, joined to Emirates Road E88.',
    k: 'Villas, schools, mosques, parks',
  },
];

const CAPABILITIES = [
  { t: 'Traffic', d: 'Cars, buses and heavy trucks move on the road network with lanes, junctions, signals and a fast lane on Emirates Road.' },
  { t: 'Underground', d: 'Electricity, telecom, water, cooling and sewage run under the roads. Switch each network on, follow its flow or pull the layers apart.' },
  { t: 'Incidents', d: 'A water leak can be replayed on the twin, with the impact zone, the crew route and the valves to close.' },
  { t: 'Analytics', d: 'Telemetry, timelines and scenario comparisons, with simulated sensor data clearly labelled as such.' },
  { t: 'AI agents', d: 'Ask the twin a question in plain language. Agents can suggest actions, and an autonomy switch keeps you in control of what runs.' },
];

const NETWORKS = [
  { n: 'Electricity', c: '#f2b441', d: 'Feeders and duct banks' },
  { n: 'Telecom', c: '#4fd1c5', d: 'Fibre backbone and micro-duct' },
  { n: 'Water', c: '#5aa9e6', d: 'Potable mains and leak sensors' },
  { n: 'Cooling', c: '#9b8cf0', d: 'Supply and return loops' },
  { n: 'Sewage', c: '#c98a5e', d: 'Gravity mains and interceptors' },
];

const STEPS = [
  { t: 'Read', d: 'Sensors under the yards and camps report pressure, flow and load every few seconds.' },
  { t: 'Match', d: 'Small changes that look harmless on their own are linked into one finding, with the pipe and the spot.' },
  { t: 'Route', d: 'See which yards, camps and roads are affected, and the crew route to the fault.' },
];

const fmt = (n: number) => n.toLocaleString('en-GB');

export function Landing() {
  const stats = [
    { v: fmt(AD.buildings.length), l: 'structures modelled' },
    { v: String(countCatalogue()), l: 'building designs' },
    { v: String(Object.keys(VEHICLE_LENGTH).length), l: 'vehicle models' },
    { v: `${COVERAGE.ratio.toFixed(2)}×`, l: `land area, against ${COVERAGE.baseKm2.toFixed(2)} km² original` },
  ];

  return (
    <div className="al">
      <header className="al-mast">
        <a className="al-brand" href="#" aria-label="Al Sajaa Industrial Twin home">
          <TwinMark size={26} className="al-mark" />
          <span>Al Sajaa <em>Industrial Twin</em></span>
        </a>
        <nav aria-label="Sections">
          <a href="#districts">Districts</a>
          <a href="#underground">Underground</a>
          <a href="#capabilities">Capabilities</a>
        </nav>
        <a className="al-btn al-btn-sm" href="#twin">Open the twin</a>
      </header>

      <section className="al-hero">
        <div className="al-hero-copy">
          <p className="al-eyebrow">Sharjah · Al Sajaa</p>
          <h1>The district above, and the pipes below.</h1>
          <p className="al-deck">
            A living model of an industrial district: yards, labour camps, Etihad Rail and the five networks under its roads. Watch the traffic, follow a leak, and test a decision before anything is dug up.
          </p>
          <div className="al-cta">
            <a className="al-btn al-btn-solid" href="#twin">Open the twin</a>
            <a className="al-btn al-btn-ghost" href="#capabilities">See what it does</a>
          </div>
        </div>
        <figure className="al-stage">
          <TwinPreview label="Plan of the Al Sajaa district, with simulated traffic" />
          <figcaption>
            <span className="al-live" aria-hidden /> Plan view · moving traffic · procedural model, simulated data
          </figcaption>
        </figure>
      </section>

      <dl className="al-stats">
        {stats.map((s) => (
          <div key={s.l}>
            <dt>{s.v}</dt>
            <dd>{s.l}</dd>
          </div>
        ))}
      </dl>

      <section id="districts" className="al-section">
        <p className="al-kicker">Districts</p>
        <h2>Three districts around the original site</h2>
        <p className="al-lede">
          The original Al Sajaa scene stays as it was. Three procedural districts extend it on the west, north and east, measured at {COVERAGE.worldKm2.toFixed(1)} km² against {COVERAGE.baseKm2.toFixed(1)} km² for the original land.
        </p>
        <div className="al-districts">
          {DISTRICTS.map((d) => (
            <article key={d.tag} className="al-district">
              <span className="al-tag">{d.tag}</span>
              <h3>{d.t}</h3>
              <p>{d.d}</p>
              <span className="al-meta">{d.k}</span>
            </article>
          ))}
        </div>
      </section>

      <section id="underground" className="al-section al-split">
        <div>
          <p className="al-kicker">Underground</p>
          <h2>Underneath the roads</h2>
          <p className="al-lede">
            Five networks run under the streets, yards and camps. Each one can be switched on or off, followed along its route, or separated into its own layer.
          </p>
        </div>
        <ul className="al-networks">
          {NETWORKS.map((u) => (
            <li key={u.n}>
              <span className="al-swatch" style={{ background: u.c }} />
              <strong>{u.n}</strong>
              <em>{u.d}</em>
            </li>
          ))}
        </ul>
      </section>

      <section id="capabilities" className="al-section">
        <p className="al-kicker">Capabilities</p>
        <h2>One model for operations, not a dashboard on top of a map</h2>
        <ul className="al-caps">
          {CAPABILITIES.map((c) => (
            <li key={c.t}>
              <h3>{c.t}</h3>
              <p>{c.d}</p>
            </li>
          ))}
        </ul>
      </section>

      <section id="how" className="al-section">
        <p className="al-kicker">Method</p>
        <h2>How the twin is used</h2>
        <ol className="al-steps">
          {STEPS.map((s, i) => (
            <li key={s.t}>
              <span className="al-step-n">0{i + 1}</span>
              <h3>{s.t}</h3>
              <p>{s.d}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="al-closing">
        <h2>Open the twin and look around.</h2>
        <a className="al-btn al-btn-solid" href="#twin">Open the twin</a>
      </section>

      <footer className="al-foot">
        <span>Procedural layout based on an industrial-area plan, not a survey. Sensor, pipe, incident and forecast data are simulated. Verify service information with the official source.</span>
        <a href="#twin">Open the twin</a>
      </footer>
    </div>
  );
}
