import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTwinStore, type MotionLevel } from '../../store/useTwinStore';

const MOTION_LABEL: Record<MotionLevel, string> = { full: 'Full motion', reduced: 'Reduced motion', off: 'Motion off' };

/** Collapse control and animation level, at the top of the left sidebar. */
export function SidebarHeader() {
  const motion = useTwinStore((s) => s.motion);
  const setMotion = useTwinStore((s) => s.setMotion);
  const setCollapsed = useTwinStore((s) => s.setRailsCollapsed);
  return (
    <div className="sidebar-head">
      <div className="sidebar-motion">
        <label htmlFor="motion-level">Animation</label>
        <select id="motion-level" value={motion} onChange={(e) => setMotion(e.target.value as MotionLevel)}>
          {(Object.keys(MOTION_LABEL) as MotionLevel[]).map((m) => (
            <option key={m} value={m}>
              {MOTION_LABEL[m]}
            </option>
          ))}
        </select>
      </div>
      <button type="button" className="sidebar-btn" onClick={() => setCollapsed(true)} aria-label="Collapse sidebar" title="Collapse sidebar">
        <ChevronLeft size={14} />
      </button>
    </div>
  );
}

/** Shown in the corner while the left sidebar is collapsed. */
export function SidebarOpenButton() {
  const collapsed = useTwinStore((s) => s.railsCollapsed);
  const setCollapsed = useTwinStore((s) => s.setRailsCollapsed);
  if (!collapsed) return null;
  return (
    <button type="button" className="sidebar-open" onClick={() => setCollapsed(false)} aria-label="Expand sidebar" title="Expand sidebar">
      <ChevronRight size={16} />
    </button>
  );
}
