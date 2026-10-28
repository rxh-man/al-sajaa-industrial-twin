import { useEffect, useMemo } from 'react';
import { X } from 'lucide-react';
import { useTwinStore } from '../../store/useTwinStore';
import { ASSUMPTIONS, WAREHOUSE_ROOF_RECORDS } from '../../data/climateAgents';
import { freightRouteFor } from '../../three/WarehouseRoofs';

const n = (v: number, d = 0) => v.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });

/** Details for the selected warehouse roof: layout area, assumed solar, scenario inclusion and freight route. */
export function RoofPanel() {
  const selection = useTwinStore((s) => s.selection);
  const select = useTwinStore((s) => s.select);
  const excluded = useTwinStore((s) => s.excludedRoofs);
  const toggleExcluded = useTwinStore((s) => s.toggleRoofExcluded);
  const routeRoof = useTwinStore((s) => s.routeRoof);
  const setRouteRoof = useTwinStore((s) => s.setRouteRoof);

  const id = selection?.info.kind === 'roof' ? selection.info.id : null;

  // Escape clears the roof selection from the keyboard as well as a click on empty space
  useEffect(() => {
    if (!id) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') select(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [id, select]);

  const roof = useMemo(() => (id ? WAREHOUSE_ROOF_RECORDS.find((r) => r.id === id) : undefined), [id]);
  const route = useMemo(() => (roof && routeRoof === roof.id ? freightRouteFor(roof.id) : null), [roof, routeRoof]);
  if (!roof) return null;

  const isIn = !excluded.includes(roof.id);
  const usable = roof.areaM2 * ASSUMPTIONS.roofUsableShare.v;
  const kwp = usable * ASSUMPTIONS.kwpPerM2.v;
  const kmOneWay = route ? (route.lengthUnits * 10) / 1000 : 0;
  const routeKey = `route-${roof.id}`;

  return (
    <section className="roof-panel" aria-labelledby={`${routeKey}-title`}>
      <header className="roof-head">
        <div>
          <p className="roof-kicker">Warehouse roof</p>
          <h3 id={`${routeKey}-title`}>{roof.id}</h3>
        </div>
        <button type="button" className="roof-close" onClick={() => select(null)} aria-label="Close roof panel">
          <X size={14} />
        </button>
      </header>
      <dl className="roof-rows">
        <div>
          <dt>Roof area (from layout)</dt>
          <dd>{n(roof.areaM2)} m²</dd>
        </div>
        <div>
          <dt>Usable area (assumed {Math.round(ASSUMPTIONS.roofUsableShare.v * 100)}%)</dt>
          <dd>{n(usable)} m²</dd>
        </div>
        <div>
          <dt>Solar potential (assumed)</dt>
          <dd>{n(kwp / 1000, 2)} MWp</dd>
        </div>
        <div>
          <dt>Shading</dt>
          <dd>Not modelled (treated as unshaded)</dd>
        </div>
      </dl>
      <label className="roof-toggle">
        <input type="checkbox" checked={isIn} onChange={() => toggleExcluded(roof.id)} />
        Include this roof in the proposed solar scenario
      </label>
      <button type="button" className="roof-route-btn" aria-pressed={routeRoof === roof.id} onClick={() => setRouteRoof(routeRoof === roof.id ? null : roof.id)}>
        {routeRoof === roof.id ? 'Hide freight route' : 'Show freight route to nearest factory'}
      </button>
      {routeRoof === roof.id && (
        <p className="roof-route-note" role="status">
          {route
            ? `Modelled route: ${n(kmOneWay, 1)} km one way on the road network. Modelled CO₂ per one-way truck trip ≈ ${n(kmOneWay * ASSUMPTIONS.kgCo2PerKm.v, 1)} kg (assumption: ${ASSUMPTIONS.kgCo2PerKm.v} kg/km). Shortest path only; not GPS or live traffic.`
            : 'No route found on the road model for this roof. No route is drawn.'}
        </p>
      )}
      <p className="roof-foot">Layout figures are computed from the scene. Solar values are labelled assumptions.</p>
    </section>
  );
}
