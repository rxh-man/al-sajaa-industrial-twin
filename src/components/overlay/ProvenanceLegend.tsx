/**
 * Provenance legend for the main view: what the map is, what is simulated, and what must be verified.
 * Plain text, always visible, so no one has to hover to learn the status of the data.
 */
export function ProvenanceLegend() {
  return (
    <aside className="provenance" aria-label="Data status">
      <p className="prov-title">Data status</p>
      <ul>
        <li>
          <span className="prov-tag prov-layout">Layout</span> Procedural model based on an industrial-area plan. Not survey data.
        </li>
        <li>
          <span className="prov-tag prov-sim">Simulated</span> Sensors, pipes, incident and 48-hour forecast.
        </li>
        <li>
          <span className="prov-tag prov-verify">To verify</span> Service information. Check the official source before you go.
        </li>
      </ul>
    </aside>
  );
}
