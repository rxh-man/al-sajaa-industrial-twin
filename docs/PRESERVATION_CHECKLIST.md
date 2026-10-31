# Preservation checklist

Baseline: `main` at `c9c697f` (97 passing tests, all world geometry checks passing). Every item below must still
work after each change; it is re-checked before every push.

| Area | Check | How |
|---|---|---|
| City geometry | overlaps, dead ends, one road network, ≤ 4 rail crossings (bridged), level clearance ≥ 5 m, lagoon conflicts, palms | `python3 scripts/validate-world.py` |
| City data | world fixes fingerprint, streetscape placement, rail layout | `tests/world.test.ts` |
| Rail | two tracks, a train each way, station stops | `tests/world.test.ts`, browser |
| Underground utilities | five networks, X-ray, layer panel, focus per network | browser (Infrastructure menu) |
| Incident demo | run / skip to the problem / repair plan / reset | browser (Demo menu, judge tour step 2) |
| Climate & air panels | heat, solar roofs, freight optimiser, air plumes | `tests/integration.test.ts`, browser |
| Roofs | roof picking and inclusion | `tests/roof*.test.ts`, `tests/warehouseRoofs.test.ts` |
| Freight route | road graph routing | `tests/freightRoute.test.ts` |
| Twin agents rail | Watch, Diagnose, Plan, Patch, Dispatch, Verify; Ask Twin | browser |
| AI Operations Agent | eight-step loop, operator/viewer approval, audit log, Compare and Adoption tabs, three demos | `tests/opsAgent.test.ts`, browser |
| Camera | presets (0 overview), focus on place, follow | browser |
| Translations | English / Arabic, RTL | browser |
| Keyboard | Space, X, E, L, R, 0, Esc | browser |

## Behaviour changes made on purpose (not regressions)

- The header's three view buttons (Overview, Layers, AI Agent) moved into the grouped menus (City → City overview,
  Infrastructure → Infrastructure layers, AI Operations → AI Operations Agent). The Demo button stays in place.
  Keyboard shortcuts are unchanged.
- Factory CO₂ in the Air/Climate panels now comes from the facility model (category, size, hours, fuel, process)
  instead of three fixed levels (900 / 2,200 / 4,200 t).
- Tree counts in the Air/Climate panels now count the trees actually placed in the city (streetscape and lagoon
  trees) instead of 97 trees from an older, unrendered layout. Oxygen per tree is now derived from the CO₂ uptake
  (32/44) so the two figures are consistent; the previous 118 kg O₂ per tree was inconsistent with 22 kg CO₂.
- One test expectation changed: an energy-outage goal used to be "not implemented yet"; it now plans.
