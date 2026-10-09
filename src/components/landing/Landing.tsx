import { AD } from '@/data/abudhabi';
import './landing.css';

const DISTRICT = [
  { n: '01', t: 'Logistics yards', d: 'Warehouses, container stacks and truck parks along the freight edge of the district.' },
  { n: '02', t: 'Car auction yards', d: 'Rows of sedans, SUVs and pickups, with the auction office at the gate.' },
  { n: '03', t: 'Labor camps', d: 'Prefab accommodation inside fenced compounds, with a mess hall and water tank.' },
  { n: '04', t: 'Plants and solar', d: 'Factory halls, tank farms and a solar field with its reservoir.' },
];

const NETWORKS = [
  { n: 'Electricity', c: '#c9892b', d: 'Feeders and duct banks' },
  { n: 'Telecom', c: '#3f8f6b', d: 'Fibre backbone and micro-duct' },
  { n: 'Water', c: '#2f6fa8', d: 'Potable mains and the leak sensors' },
  { n: 'Cooling', c: '#7a6fb8', d: 'Supply and return loops' },
  { n: 'Sewage', c: '#9a5b3c', d: 'Gravity mains and interceptors' },
];

const STEPS = [
  { t: 'Read', d: 'Sensors under the yards and camps report pressure, flow and load every few seconds.' },
  { t: 'Match', d: 'Small changes that look harmless on their own are linked into one finding, with the pipe and the spot.' },
  { t: 'Route', d: 'The team sees which yards, camps and roads are affected, and the crew route to the fault.' },
];

/** Schematic of the district: the grid, Emirates Road, the freight line and the utilities underneath. */
function DistrictPlan() {
  const blocks = [];
  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 6; j++) {
      blocks.push(<rect key={`${i}-${j}`} x={56 + i * 44} y={40 + j * 36} width={36} height={28} rx={2} className="al-plan-block" />);
    }
  }
  return (
    <svg viewBox="0 0 480 360" role="img" aria-label="Schematic plan of the Al Sajaa district: street grid, Emirates Road, the Etihad Rail line and underground networks" className="al-plan">
      <rect x="0" y="0" width="480" height="360" className="al-plan-bg" />
      {blocks}
      <path d="M22 40 C 34 120, 30 220, 46 330" className="al-plan-road" />
      <path d="M46 330 C 120 300, 240 310, 470 290" className="al-plan-road" />
      <path d="M0 312 H480" className="al-plan-rail" />
      <path d="M70 60 V300 M140 60 V300 M210 60 V300 M280 60 V300 M350 60 V300" className="al-plan-pipe" stroke="#c9892b" />
      <path d="M60 90 H380 M60 170 H380 M60 250 H380" className="al-plan-pipe" stroke="#2f6fa8" />
      <path d="M100 40 V290 M240 40 V290 M420 40 V290" className="al-plan-pipe" stroke="#3f8f6b" />
      <circle cx="132" cy="210" r="6" className="al-plan-dot" />
      <circle cx="298" cy="128" r="6" className="al-plan-dot" />
      <circle cx="406" cy="236" r="6" className="al-plan-dot" />
      <text x="142" y="214" className="al-plan-label">Yards</text>
      <text x="308" y="132" className="al-plan-label">Camps</text>
      <text x="416" y="240" className="al-plan-label">Solar</text>
      <text x="330" y="300" className="al-plan-label">Etihad Rail</text>
      <text x="34" y="26" className="al-plan-label">E611</text>
    </svg>
  );
}

export function Landing() {
  const stats = [
    { v: AD.buildings.length.toLocaleString('en-GB'), l: 'structures in the model' },
    { v: String(AD.roads.filter((r) => r.c !== 'rail').length), l: 'road segments' },
    { v: String(AD.parks.length), l: 'parks and green lots' },
    { v: '5', l: 'underground networks' },
  ];

  return (
    <div className="al">
      <header className="al-mast">
        <a className="al-name" href="#">
          Al Sajaa <span>/ digital twin</span>
        </a>
        <nav aria-label="Sections">
          <a href="#district">District</a>
          <a href="#underground">Underground</a>
          <a href="#how">Method</a>
        </nav>
      </header>

      <section className="al-hero">
        <div className="al-hero-text">
          <p className="al-eyebrow">Sharjah industrial district</p>
          <h1>The district above and the pipes below, in one model.</h1>
          <p className="al-deck">
            Yards, camps, a solar field, the Etihad Rail line and the water, sewage, power, telecom and cooling networks under the roads. Built to be looked at, walked through and tested before anything is dug up.
          </p>
          <div className="al-cta-row">
            <a className="al-btn-solid" href="#twin">Open the twin</a>
            <a className="al-btn-line" href="#underground">What is underneath</a>
          </div>
        </div>
        <figure className="al-hero-plan">
          <DistrictPlan />
          <figcaption>Schematic plan, not to scale. North is up.</figcaption>
        </figure>
      </section>

      <dl className="al-figures">
        {stats.map((s) => (
          <div key={s.l}>
            <dt>{s.v}</dt>
            <dd>{s.l}</dd>
          </div>
        ))}
      </dl>

      <section id="district" className="al-band">
        <h2>What is on the ground</h2>
        <ol className="al-rows">
          {DISTRICT.map((r) => (
            <li key={r.n}>
              <span className="al-row-n">{r.n}</span>
              <div>
                <h3>{r.t}</h3>
                <p>{r.d}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section id="underground" className="al-band al-band-split">
        <div>
          <h2>Underneath the roads</h2>
          <p>
            Five networks run under the streets, yards and camps. In the twin you can switch each one on or off, follow the flow, or pull the layers apart to read them one at a time.
          </p>
          <p>The Etihad Rail runs along the south edge with a station, signal masts and a level crossing at the freight road.</p>
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

      <section id="how" className="al-band">
        <h2>How the twin is used</h2>
        <div className="al-steps">
          {STEPS.map((s, i) => (
            <article key={s.t}>
              <span className="al-step-n">Step {i + 1}</span>
              <h3>{s.t}</h3>
              <p>{s.d}</p>
            </article>
          ))}
        </div>
      </section>

      <footer className="al-foot">
        <span>Simulated sensor data. The layout is procedural and based on an industrial-area plan, not a survey.</span>
        <a href="#twin">Open the twin</a>
      </footer>
    </div>
  );
}
