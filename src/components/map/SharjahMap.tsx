import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { X } from 'lucide-react';
import { useTwinStore } from '../../store/useTwinStore';

/**
 * Sharjah emirate basemap. Vector map tiles from OpenFreeMap (style: liberty), drawn with MapLibre GL.
 * This is a basemap for orientation only. The 3D scene is a procedural layout, not built from OpenStreetMap.
 */

const STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const SHARJAH_CENTRE: [number, number] = [55.5, 25.35];
/** rough bounds of the emirate, padded, to keep the view on Sharjah */
const SHARJAH_BOUNDS: [[number, number], [number, number]] = [
  [54.2, 24.8],
  [56.6, 25.95],
];
/** the Al Sajaa scene centre used by the twin */
const AL_SAJAA: [number, number] = [55.6435, 25.3306];

export function SharjahMap() {
  const setOpen = useTwinStore((s) => s.setSharjahMap);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const map = new maplibregl.Map({
      container: ref.current,
      style: STYLE,
      center: SHARJAH_CENTRE,
      zoom: 9.6,
      maxBounds: SHARJAH_BOUNDS,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    const el = document.createElement('div');
    el.className = 'sj-marker';
    el.title = 'Al Sajaa scene centre (approximate)';
    new maplibregl.Marker({ element: el })
      .setLngLat(AL_SAJAA)
      .setPopup(new maplibregl.Popup({ offset: 12 }).setText('Al Sajaa scene centre (approximate, not a survey point)'))
      .addTo(map);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      map.remove();
    };
  }, [setOpen]);

  return (
    <div className="sharjah-map" role="dialog" aria-label="Sharjah emirate map">
      <div ref={ref} className="sharjah-map-canvas" />
      <div className="sharjah-map-head">
        <span>Sharjah emirate · map tiles by OpenFreeMap</span>
        <button className="icon-btn sm" onClick={() => setOpen(false)} aria-label="Close map">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
