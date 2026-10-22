import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { AD, UNNAMED_COAST_ROAD } from '../data/abudhabi';
import { DISTRICT_SEA_LABEL, type RealStreet } from '../data/geo';
import { live } from '../simulation/runtime';
import { FadeHtml } from './labels/FadeHtml';
import { SERVICE_BY_PLACE } from '../data/serviceGuide';
import { UNVERIFIED_PLACES } from '../data/verification';
import { ALSAJAA_INLAND } from '../config/overrides';
import { useTwinStore } from '../store/useTwinStore';

const LANDMARK_ROLES = new Set(['landmark', 'mall', 'mosque', 'hospital']);

/**
 * Screen-space collision: labels are projected each frame and a label is hidden when it overlaps a
 * higher-priority label or leaves the viewport. Priority: landmarks > street names > area names.
 * Text boxes are estimated from the character count (no DOM measuring), which is approximate.
 */
const PRIORITY = { landmark: 3, street: 2, area: 1 } as const;
const CHAR_PX = 7.2;
const PAD_PX = 18;
const LABEL_H = 24;
const EDGE_PX = 6;

interface LabelItem {
  id: string;
  prio: number;
  pos: [number, number, number];
  text: string;
}

/** Street labels from the map data → verified English / Arabic names. Empty: no Al Sajaa street has a verified Arabic name here yet. */
const BY_OSM: Record<string, RealStreet> = {};

/** Real street (English / Arabic) and landmark names, shown from the overview and faded out for close-ups and X-ray. */
export function MapLabels() {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const visible = useRef(new Map<string, number>());
  const far = () => {
    const h = camera.position.y;
    return Math.max(0, Math.min(1, (h - 34) / 14)) * (1 - live.xray) * (1 - live.exploded) * (1 - live.pois);
  };
  const landmarks = AD.places.filter((p) => LANDMARK_ROLES.has(p.role));
  // the data lists some landmarks twice (a place and an area label); the landmark wins, so the name shows once
  const landmarkNames = new Set(landmarks.map((p) => p.n));
  const areaLabels = AD.labels.filter((l) => !landmarkNames.has(l.n) && !(ALSAJAA_INLAND && l.n === UNNAMED_COAST_ROAD));

  const items: LabelItem[] = [
    ...areaLabels.map((l) => {
      const s = BY_OSM[l.n];
      return { id: `l:${l.n}`, prio: s ? PRIORITY.street : PRIORITY.area, pos: [l.x, 0.4, l.z] as [number, number, number], text: s ? s.short : l.n };
    }),
    ...landmarks.map((p) => ({ id: `p:${p.n}`, prio: PRIORITY.landmark, pos: [p.x, p.h + 0.9, p.z] as [number, number, number], text: p.n })),
    ...(ALSAJAA_INLAND ? [] : [{ id: 'sea', prio: PRIORITY.area, pos: [-30, 0.4, 66] as [number, number, number], text: DISTRICT_SEA_LABEL.name }]),
  ];

  const tmp = useRef(new Vector3());
  useFrame(() => {
    // runs before the labels' own frame callbacks (lower priority value runs first)
    const boxes: { id: string; prio: number; x0: number; y0: number; x1: number; y1: number }[] = [];
    for (const it of items) {
      const v = tmp.current.set(it.pos[0], it.pos[1], it.pos[2]).project(camera);
      if (v.z > 1 || v.z < -1) {
        visible.current.set(it.id, 0);
        continue;
      }
      const cx = (v.x * 0.5 + 0.5) * size.width;
      const cy = (-v.y * 0.5 + 0.5) * size.height;
      const w = it.text.length * CHAR_PX + PAD_PX;
      boxes.push({ id: it.id, prio: it.prio, x0: cx - w / 2, y0: cy - LABEL_H / 2, x1: cx + w / 2, y1: cy + LABEL_H / 2 });
    }
    // priority first, then id, so the same labels win on every frame (no flicker from ties)
    boxes.sort((a, b) => b.prio - a.prio || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const kept: typeof boxes = [];
    for (const b of boxes) {
      const offscreen = b.x0 < EDGE_PX || b.y0 < EDGE_PX || b.x1 > size.width - EDGE_PX || b.y1 > size.height - EDGE_PX;
      const clash = kept.some((k) => b.x0 < k.x1 && b.x1 > k.x0 && b.y0 < k.y1 && b.y1 > k.y0);
      const show = !offscreen && !clash;
      if (show) kept.push(b);
      visible.current.set(b.id, show ? 1 : 0);
    }
  }, -1);

  const shown = (id: string) => visible.current.get(id) ?? 1;

  return (
    <group>
      {areaLabels.map((l) => {
        const s = BY_OSM[l.n];
        const id = `l:${l.n}`;
        return (
          <FadeHtml key={l.n} position={[l.x, 0.4, l.z]} opacity={() => far() * shown(id)} zIndex={6} center>
            <div className="street-sign">
              <span className="street-sign-en">{s ? s.short : l.n}</span>
              {s && (
                <span className="street-sign-ar" lang="ar" dir="rtl">
                  {s.ar}
                </span>
              )}
            </div>
          </FadeHtml>
        );
      })}
      {landmarks.map((p) => {
        const id = `p:${p.n}`;
        return (
          <FadeHtml key={p.n} position={[p.x, p.h + 0.9, p.z]} opacity={() => far() * shown(id)} zIndex={7} center>
            <span
              className={`map-place ${SERVICE_BY_PLACE.has(p.n) ? 'is-service' : ''}`}
              role={SERVICE_BY_PLACE.has(p.n) ? 'button' : undefined}
              tabIndex={SERVICE_BY_PLACE.has(p.n) ? 0 : undefined}
              onClick={() => SERVICE_BY_PLACE.has(p.n) && useTwinStore.getState().openService(p.n)}
              onKeyDown={(e) => {
                if (SERVICE_BY_PLACE.has(p.n) && (e.key === 'Enter' || e.key === ' ')) useTwinStore.getState().openService(p.n);
              }}
            >
              {p.n.replace(' / The Mall', ' Mall')}
              {UNVERIFIED_PLACES.has(p.n) && <em className="unverified"> · unverified</em>}
            </span>
          </FadeHtml>
        );
      })}
      {!ALSAJAA_INLAND && (
      <FadeHtml position={[-30, 0.4, 66]} opacity={() => far() * shown('sea')} zIndex={6} center>
        <div className="sea-label">
          <span>{DISTRICT_SEA_LABEL.name}</span>
          <span lang="ar" dir="rtl">
            {DISTRICT_SEA_LABEL.ar}
          </span>
        </div>
      </FadeHtml>
      )}
    </group>
  );
}
