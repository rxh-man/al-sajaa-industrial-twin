import { useEffect, useRef } from 'react';
import { AD, AD_RECT, LAND_POLYS, type XZ } from '@/data/abudhabi';

/**
 * A live plan view of the twin for the hero. It draws the same road, building, park and land
 * data the 3D scene uses, with vehicles moving along the trunk roads. It is a 2D view, not the
 * WebGL scene, and it is labelled as such where it is used.
 */

const SEA = '#0b1b26';
const LAND = '#2a2a27';
const PARK = '#2e4a33';
const ROAD_CASE = '#16181c';
const ROAD: Record<string, string> = { trunk: '#e0b23a', primary: '#c9a23a', secondary: '#8a7d52', residential: '#5a574f', tertiary: '#5a574f' };
const BLDG: Record<string, string> = {
  house: '#b7aa92',
  residential: '#a89c86',
  building: '#7f8790',
  office: '#8fa2b3',
  mall: '#c48f5b',
  mosque: '#e9e4d8',
  school: '#c7b58f',
  hospital: '#e3e6ea',
  utility: '#6f7a6e',
  hotel: '#9db0bf',
  tower: '#8aa2b8',
};

function pathOf(ctx: CanvasRenderingContext2D, pts: XZ[], close = false) {
  ctx.beginPath();
  pts.forEach(([x, z], i) => (i ? ctx.lineTo(x, z) : ctx.moveTo(x, z)));
  if (close) ctx.closePath();
}

/** Draw everything that does not move, into an offscreen canvas in world coordinates. */
function drawStatic(ctx: CanvasRenderingContext2D, scale: number) {
  ctx.save();
  ctx.fillStyle = SEA;
  ctx.fillRect(AD_RECT.minX, AD_RECT.minZ, AD_RECT.maxX - AD_RECT.minX, AD_RECT.maxZ - AD_RECT.minZ);
  ctx.fillStyle = LAND;
  for (const poly of LAND_POLYS) {
    pathOf(ctx, poly, true);
    ctx.fill();
  }
  ctx.fillStyle = PARK;
  for (const p of AD.parks) {
    pathOf(ctx, p.p, true);
    ctx.fill();
  }
  // road casings, then the carriageways on top
  for (const r of AD.roads) {
    if (r.c === 'pedestrian' || r.c === 'service') continue;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = ROAD_CASE;
    ctx.lineWidth = (r.w + 0.5) * 1;
    pathOf(ctx, r.p);
    ctx.stroke();
  }
  for (const r of AD.roads) {
    if (r.c === 'pedestrian' || r.c === 'service') continue;
    ctx.strokeStyle = ROAD[r.c] ?? '#5a574f';
    ctx.lineWidth = r.w;
    pathOf(ctx, r.p);
    ctx.stroke();
  }
  for (const b of AD.buildings) {
    ctx.fillStyle = BLDG[b.k] ?? '#8c8a84';
    for (const [x0, z0, x1, z1] of b.b) ctx.fillRect(x0, z0, x1 - x0, z1 - z0);
  }
  ctx.restore();
  void scale;
}

/** Trunk and primary roads, sampled for moving vehicles. */
const LANES = AD.roads.filter((r) => (r.c === 'trunk' || r.c === 'primary' || r.c === 'secondary') && r.p.length > 3);

export function TwinPreview({ label }: { label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const bg = document.createElement('canvas');
    const bctx = bg.getContext('2d')!;
    let w = 0, h = 0, dpr = 1, raf = 0;
    let t0 = performance.now();

    // which road and where along it each vehicle is; deterministic start positions
    let seed = 7;
    const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
    const cars = Array.from({ length: 120 }, () => ({ r: Math.floor(rnd() * LANES.length), t: rnd(), v: 0.04 + rnd() * 0.06 }));

    const view = () => {
      const pad = 0.04;
      const worldW = AD_RECT.maxX - AD_RECT.minX;
      const worldH = AD_RECT.maxZ - AD_RECT.minZ;
      const s = Math.min((w * (1 - 2 * pad)) / worldW, (h * (1 - 2 * pad)) / worldH);
      const ox = (w - worldW * s) / 2 - AD_RECT.minX * s;
      const oy = (h - worldH * s) / 2 - AD_RECT.minZ * s;
      return { s, ox, oy };
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = Math.max(1, Math.round(rect.width));
      h = Math.max(1, Math.round(rect.height));
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      bg.width = canvas.width;
      bg.height = canvas.height;
      const v = view();
      bctx.setTransform(dpr * v.s, 0, 0, dpr * v.s, dpr * v.ox, dpr * v.oy);
      drawStatic(bctx, v.s);
    };

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - t0) / 1000);
      t0 = now;
      const v = view();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bg, 0, 0);
      ctx.setTransform(dpr * v.s, 0, 0, dpr * v.s, dpr * v.ox, dpr * v.oy);
      for (const c of cars) {
        if (!reduce) c.t += c.v * dt * 0.5;
        if (c.t > 1) c.t -= 1;
        const pts = LANES[c.r].p;
        const i = Math.min(pts.length - 2, Math.floor(c.t * (pts.length - 1)));
        const f = c.t * (pts.length - 1) - i;
        const [ax, az] = pts[i];
        const [bx, bz] = pts[i + 1];
        const x = ax + (bx - ax) * f;
        const z = az + (bz - az) * f;
        ctx.fillStyle = '#f2b441';
        ctx.beginPath();
        ctx.arc(x, z, 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = reduce ? 0 : requestAnimationFrame(frame);
    };

    resize();
    frame(performance.now());
    const ro = new ResizeObserver(() => {
      resize();
      if (reduce) frame(performance.now());
    });
    ro.observe(canvas);
    if (!reduce) raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={ref} className="al-preview" role="img" aria-label={label} />;
}
