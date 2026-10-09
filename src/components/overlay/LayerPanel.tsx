import { Eye, EyeOff, Layers, X } from 'lucide-react';
import { useTwinStore } from '../../store/useTwinStore';
import { LAYERS, LAYER_ORDER } from '../../data/networks';

export function LayerPanel() {
  const open = useTwinStore((s) => s.layerPanel);
  const setOpen = useTwinStore((s) => s.setLayerPanel);
  const focus = useTwinStore((s) => s.focus);
  const visible = useTwinStore((s) => s.visible);
  const setFocus = useTwinStore((s) => s.setFocus);
  const toggleVisible = useTwinStore((s) => s.toggleVisible);

  if (!open) return null;

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
      <ul className="layer-list">
        {LAYER_ORDER.map((id) => {
          const l = LAYERS[id];
          const isFocus = focus === id;
          const dimmed = focus !== null && !isFocus;
          return (
            <li key={id} className={`layer-row ${isFocus ? 'is-focus' : ''} ${dimmed ? 'is-dim' : ''} ${visible[id] ? '' : 'is-off'}`} style={{ ['--c' as string]: l.color }}>
              <button className="layer-main" onClick={() => setFocus(isFocus ? null : id)} aria-pressed={isFocus} title={`Emphasize ${l.label}`}>
                <span className="layer-swatch" />
                <span className="layer-name">{l.label}</span>
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
