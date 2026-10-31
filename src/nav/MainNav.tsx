import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Bot, Building2, ChevronDown, Leaf, Map as MapIcon, Network, Compass } from 'lucide-react';
import { useTwinStore } from '../store/useTwinStore';
import { useOpsStore } from '../opsAgent/store';
import { useSusStore } from '../sustainability/store';
import { useTourStore } from '../tour/store';
import type { LayerId } from '../data/networks';

/**
 * The grouped main navigation: City, Infrastructure, Sustainability, AI Operations and Planning. Every item calls
 * an existing action of the twin (camera presets, layer panel, X-ray, climate/air panels, the agent and the
 * Command Centre), so nothing is duplicated and nothing existing is hidden. Only one side panel (agent or
 * Command Centre) is open at a time.
 */

type Item = { label: string; hint?: string; run: () => void; on?: boolean };
type Group = { id: string; label: string; icon: React.ReactNode; items: Item[] };

export function openAgent(tab?: ReturnType<typeof useOpsStore.getState>['tab']) {
  useSusStore.getState().setOpen(false);
  useOpsStore.getState().setOpen(true);
  if (tab) useOpsStore.getState().setTab(tab);
}
export function openCentre(tab?: string) {
  useOpsStore.getState().setOpen(false);
  useSusStore.getState().setOpen(true);
  if (tab) useSusStore.getState().setTab(tab);
}

function useGroups(): Group[] {
  // subscribe only to the flags the menus show (the twin store also carries the fast-changing simulation)
  const v = useTwinStore(
    useShallow((q) => ({ activePreset: q.activePreset, exploded: q.exploded, sharjahMap: q.sharjahMap, layerPanel: q.layerPanel, xray: q.xray, focus: q.focus, airPanel: q.airPanel, climatePanel: q.climatePanel, railsCollapsed: q.railsCollapsed, future: q.future })),
  );
  const s = { ...useTwinStore.getState(), ...v };
  const ops = useOpsStore(useShallow((q) => ({ open: q.open, tab: q.tab })));
  const sus = useSusStore(useShallow((q) => ({ open: q.open, tab: q.tab })));
  const focusLayer = (l: LayerId) => {
    if (!s.xray) s.toggleXray();
    s.setFocus(l);
  };
  return [
    {
      id: 'city',
      label: 'City',
      icon: <Building2 size={14} />,
      items: [
        { label: 'City overview', hint: '0', run: () => s.resetView(), on: s.activePreset === 'city' },
        { label: 'Al Sajaa street level', run: () => s.setPreset('sector'), on: s.activePreset === 'sector' },
        { label: 'Etihad Rail and E611 interchange', run: () => s.focusPlace(-62, -48, 40) },
        { label: 'Al Sajaa Lagoons', run: () => s.focusPlace(20, 62, 55) },
        { label: 'Far Northern Industrial Zone', run: () => s.focusPlace(-60, -190, 90) },
        { label: 'Exploded view', hint: 'E', run: () => s.toggleExploded(), on: s.exploded },
        { label: 'Sharjah location map', run: () => s.setSharjahMap(!s.sharjahMap), on: s.sharjahMap },
      ],
    },
    {
      id: 'infra',
      label: 'Infrastructure',
      icon: <Network size={14} />,
      items: [
        { label: 'Infrastructure layers', hint: 'L', run: () => s.setLayerPanel(!s.layerPanel), on: s.layerPanel },
        { label: 'X-ray (see underground)', hint: 'X', run: () => s.toggleXray(), on: s.xray },
        { label: 'Underground view', run: () => s.setPreset('underground'), on: s.activePreset === 'underground' },
        { label: 'Water network', run: () => focusLayer('water'), on: s.focus === 'water' },
        { label: 'Electricity', run: () => focusLayer('electric'), on: s.focus === 'electric' },
        { label: 'Telecom', run: () => focusLayer('telecom'), on: s.focus === 'telecom' },
        { label: 'District cooling', run: () => focusLayer('cooling'), on: s.focus === 'cooling' },
        { label: 'Sewage', run: () => focusLayer('sewage'), on: s.focus === 'sewage' },
      ],
    },
    {
      id: 'sus',
      label: 'Sustainability',
      icon: <Leaf size={14} />,
      items: [
        { label: 'Sustainability Command Centre', run: () => openCentre('overview'), on: sus.open && sus.tab === 'overview' },
        { label: 'Industrial emissions', run: () => openCentre('industry'), on: sus.open && sus.tab === 'industry' },
        { label: 'Trees and green spaces', run: () => openCentre('green'), on: sus.open && sus.tab === 'green' },
        { label: 'Energy and water', run: () => openCentre('energy'), on: sus.open && sus.tab === 'energy' },
        { label: 'Air quality panel', run: () => s.setAirPanel(!s.airPanel), on: s.airPanel },
        { label: 'Climate panel (heat, solar, freight)', run: () => s.setClimatePanel(!s.climatePanel), on: s.climatePanel },
      ],
    },
    {
      id: 'ai',
      label: 'AI Operations',
      icon: <Bot size={14} />,
      items: [
        { label: 'AI Operations Agent', run: () => openAgent('agent'), on: ops.open && ops.tab === 'agent' },
        { label: 'Specialist agents', run: () => openAgent('specialists'), on: ops.open && ops.tab === 'specialists' },
        { label: 'Compare interventions', run: () => openAgent('compare'), on: ops.open && ops.tab === 'compare' },
        { label: 'Audit and explainability', run: () => openAgent('audit'), on: ops.open && ops.tab === 'audit' },
        { label: 'Twin agents rail (Watch … Verify)', run: () => s.setRailsCollapsed(!s.railsCollapsed), on: !s.railsCollapsed },
      ],
    },
    {
      id: 'plan',
      label: 'Planning',
      icon: <MapIcon size={14} />,
      items: [
        { label: 'New factory / development simulation', run: () => openCentre('development'), on: sus.open && sus.tab === 'development' },
        { label: 'Scenario levers (what-if)', run: () => openCentre('overview') },
        { label: '48-hour forecast', run: () => s.setFuture(!s.future), on: s.future },
        { label: 'Leak incident demo', run: () => s.setScenarioMenu(true) },
        { label: 'Adoption and roadmap', run: () => openAgent('adoption'), on: ops.open && ops.tab === 'adoption' },
      ],
    },
  ];
}

export function MainNav() {
  const groups = useGroups();
  const [open, setOpen] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const startTour = useTourStore((s) => s.start);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(null);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div className="mnav" ref={ref}>
      {groups.map((g) => (
        <div key={g.id} className="mnav-group">
          <button className={`seg-btn mnav-trigger ${open === g.id ? 'is-on' : ''} ${g.items.some((i) => i.on) ? 'has-on' : ''}`} aria-haspopup="menu" aria-expanded={open === g.id} onClick={() => setOpen(open === g.id ? null : g.id)}>
            {g.icon}
            <span className="mnav-label">{g.label}</span>
            <ChevronDown size={12} aria-hidden />
          </button>
          {open === g.id && (
            <div className="mnav-menu popover" role="menu" aria-label={g.label}>
              {g.items.map((it) => (
                <button
                  key={it.label}
                  role="menuitemcheckbox"
                  aria-checked={!!it.on}
                  className={`mnav-item ${it.on ? 'is-on' : ''}`}
                  onClick={() => {
                    it.run();
                    setOpen(null);
                  }}
                >
                  <span className="mnav-dot" aria-hidden />
                  <span>{it.label}</span>
                  {it.hint && <kbd>{it.hint}</kbd>}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
      <button className="seg-btn mnav-tour" onClick={() => startTour()} title="Guided judge demonstration">
        <Compass size={14} />
        <span className="mnav-label">Judge tour</span>
      </button>
    </div>
  );
}
