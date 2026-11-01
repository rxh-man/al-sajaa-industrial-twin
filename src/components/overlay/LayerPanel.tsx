import { useState } from 'react';
import { Eye, EyeOff, Layers, X } from 'lucide-react';
import { NETWORKS } from '../../data/networks';
import { useEnv } from '../../env/store';
import '../../styles/opsAgent.css';
import '../../styles/sustainability.css';
import { useTwinStore } from '../../store/useTwinStore';
import { LAYERS, LAYER_ORDER } from '../../data/networks';

export function LayerPanel() {
  const open = useTwinStore((s) => s.layerPanel);
  const setOpen = useTwinStore((s) => s.setLayerPanel);
  const focus = useTwinStore((s) => s.focus);
  const visible = useTwinStore((s) => s.visible);
  const setFocus = useTwinStore((s) => s.setFocus);
  const toggleVisible = useTwinStore((s) => s.toggleVisible);

  const [q, setQ] = useState('');
  const minHealth = useEnv((e) => e.healthBelow);
  const setMinHealth = useEnv((e) => e.setHealthBelow);
  if (!open) return null;
  // asset status filter: how many segments per layer fall below the chosen health (simulated asset health)
  const below = (id: string) => (minHealth ? NETWORKS.filter((n) => n.layer.id === id).reduce((a, n) => a + n.segments.filter((sg) => sg.meta.health < minHealth).length, 0) : 0);
  const shown = LAYER_ORDER.filter((id) => !q || LAYERS[id].label.toLowerCase().includes(q.toLowerCase()));
  const hidden = LAYER_ORDER.filter((id) => !visible[id]).length;
  const setAll = (on: boolean) => LAYER_ORDER.forEach((id) => visible[id] !== on && toggleVisible(id));

  return (
    <section className="ov-panel layer-panel" aria-label="Infrastructure layers">
      <header className="ov-head">
        <span className="ov-title">
          <Layers size={13} /> Layers
        </span>
        <button className="icon-btn sm" onClick={() => setOpen(false)} aria-label="Hide layers">
          <X size={13} />
        </button>
      </header>
      <div className="layer-tools">
        <input className="air-search" type="search" placeholder="Search networks" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search networks" />
        <div className="ops-row ops-small">
          <span>
            {LAYER_ORDER.length - hidden} of {LAYER_ORDER.length} shown{hidden > 0 && <span className="sus-count">{hidden} off</span>}
          </span>
          <button className="ops-chip" onClick={() => setAll(true)}>
            Show all
          </button>
          <button className="ops-chip" onClick={() => setAll(false)}>
            Hide all
          </button>
        </div>
        <label className="ops-range ops-small">
          <span>
            Flag assets below health <b>{minHealth || '—'}</b>
            {minHealth ? ' %' : ''}
          </span>
          <input type="range" min={0} max={95} step={5} value={minHealth} onChange={(e) => setMinHealth(Number(e.target.value))} aria-label="Asset health threshold" />
        </label>
      </div>
      {shown.length === 0 && <p className="ops-small ops-muted">No network matches “{q}”.</p>}
      <ul className="layer-list">
        {shown.map((id) => {
          const l = LAYERS[id];
          const isFocus = focus === id;
          const dimmed = focus !== null && !isFocus;
          return (
            <li key={id} className={`layer-row ${isFocus ? 'is-focus' : ''} ${dimmed ? 'is-dim' : ''} ${visible[id] ? '' : 'is-off'}`} style={{ ['--c' as string]: l.color }}>
              <button className="layer-main" onClick={() => setFocus(isFocus ? null : id)} aria-pressed={isFocus} title={`Emphasize ${l.label}`}>
                <span className="layer-swatch" />
                <span className="layer-name">{l.label}</span>
                {minHealth > 0 && <span className="ops-small ops-wait">{below(id)} below</span>}
              </button>
              <button className="icon-btn sm" onClick={() => toggleVisible(id)} aria-label={`${visible[id] ? 'Hide' : 'Show'} ${l.label}`} aria-pressed={visible[id]}>
                {visible[id] ? <Eye size={13} /> : <EyeOff size={13} />}
              </button>
            </li>
          );
        })}
      </ul>
      {focus && (
        <footer className="layer-foot">
          <button className="link-btn" onClick={() => setFocus(null)}>
            Show all
          </button>
        </footer>
      )}
    </section>
  );
}
