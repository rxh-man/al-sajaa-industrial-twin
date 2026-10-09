// Turns the OpenStreetMap extract into the compact city file the 3D twin loads.
//   node scripts/build-abudhabi.mjs <abudhabi-osm.json> [src/data/abudhabi.json]
//
// The map is rotated (never mirrored) so downtown's street grid lines up with the scene
// axes, Khalifa Street runs along z = 0 through the origin (where the demo's leak is), and
// the Corniche sea sits on the +z side. 1 scene unit = 10 m.
// Map data © OpenStreetMap contributors, ODbL.
import { readFileSync, writeFileSync } from 'node:fs';

const [input, output = 'src/data/abudhabi.json'] = process.argv.slice(2);
if (!input) {
  console.error('usage: node scripts/build-abudhabi.mjs <abudhabi-osm.json> [out.json]');
  process.exit(1);
}
const osm = JSON.parse(readFileSync(input, 'utf8'));

const LAT0 = 24.487;
const LON0 = 54.357;
const KX = 111320 * Math.cos((LAT0 * Math.PI) / 180);
const KZ = 110574;
const local = (p) => [(p.lon - LON0) * KX, -(p.lat - LAT0) * KZ]; // metres, x east, z south
const UNIT = 10;
const RECT = { minX: -96, maxX: 96, minZ: -68, maxZ: 92 };
const TRENCH = { minX: -12, maxX: 12, minZ: -5, maxZ: 5 };
const TARGET = [70, -270]; // on Khalifa Street, north-east of the World Trade Center underpass
const r2 = (v) => Math.round(v * 100) / 100;

const ways = osm.elements.filter((e) => e.type === 'way' && e.geometry?.length);
const nameEn = (t) => t['name:en'] || AR_NAMES[t.name] || t.name || '';
const AR_NAMES = {
  'قصر الحصن': 'Qasr Al Hosn',
  'المستشفى الأهلي': 'Al Ahli Hospital',
  'جامع الشيخ زايد': 'Sheikh Zayed Mosque',
  'المركز التجاري العالمي . مول': 'World Trade Center Mall',
  'شارع الكورنيش': 'Corniche Street',
};

/* ------------------------------------------------------------------ */
/* 1. Frame: anchor on Khalifa Street                                  */
/* ------------------------------------------------------------------ */

const khalifa = ways.filter((w) => w.tags.highway && /^Khalifa Bin Zayed/.test(w.tags['name:en'] || '') && !w.tags.tunnel);
let anchor = null;
for (const w of khalifa) {
  const g = w.geometry.map(local);
  for (let i = 1; i < g.length; i++) {
    const [ax, az] = g[i - 1];
    const [bx, bz] = g[i];
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 30) continue;
    const t = Math.max(0, Math.min(1, ((TARGET[0] - ax) * (bx - ax) + (TARGET[1] - az) * (bz - az)) / (L * L)));
    const p = [ax + t * (bx - ax), az + t * (bz - az)];
    const d = Math.hypot(p[0] - TARGET[0], p[1] - TARGET[1]);
    if (!anchor || d < anchor.d) anchor = { d, p, dir: [(bx - ax) / L, (bz - az) / L], way: w.id };
  }
}
if (!anchor) throw new Error('Khalifa Street not found in the extract');
if (anchor.dir[0] < 0) anchor.dir = [-anchor.dir[0], -anchor.dir[1]];
const a = Math.atan2(anchor.dir[1], anchor.dir[0]);
const phi = Math.PI - a; // road → -x, sea (north-west) → +z
const C = Math.cos(phi);
const S = Math.sin(phi);
const O = anchor.p;
const toScene = ([x, z]) => {
  const dx = x - O[0];
  const dz = z - O[1];
  return [(dx * C - dz * S) / UNIT, (dx * S + dz * C) / UNIT];
};
const sceneOf = (geom) => geom.map((p) => toScene(local(p)));

/* ------------------------------------------------------------------ */
/* geometry helpers                                                    */
/* ------------------------------------------------------------------ */

const inRect = ([x, z], m = 0) => x >= RECT.minX - m && x <= RECT.maxX + m && z >= RECT.minZ - m && z <= RECT.maxZ + m;

function pointInPoly([x, z], poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Liang–Barsky: clip segment p→q to the rect (+margin); returns [t0, t1] or null. */
function clipSeg(p, q, m = 0) {
  let t0 = 0;
  let t1 = 1;
  const dx = q[0] - p[0];
  const dz = q[1] - p[1];
  const edges = [
    [-dx, p[0] - (RECT.minX - m)],
    [dx, RECT.maxX + m - p[0]],
    [-dz, p[1] - (RECT.minZ - m)],
    [dz, RECT.maxZ + m - p[1]],
  ];
  for (const [pp, qq] of edges) {
    if (pp === 0) {
      if (qq < 0) return null;
    } else {
      const r = qq / pp;
      if (pp < 0) t0 = Math.max(t0, r);
      else t1 = Math.min(t1, r);
      if (t0 > t1) return null;
    }
  }
  return [t0, t1];
}

const lerp2 = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];

/** Clip a polyline (with ids) to the rect; returns runs of { pts, ids }. */
function clipPolyline(pts, ids, prefix, m = 0) {
  const runs = [];
  let cur = null;
  let synth = 0;
  for (let i = 1; i < pts.length; i++) {
    const c = clipSeg(pts[i - 1], pts[i], m);
    if (!c) {
      cur = null;
      continue;
    }
    const [t0, t1] = c;
    if (!cur || t0 > 0) {
      cur = { pts: [t0 > 0 ? lerp2(pts[i - 1], pts[i], t0) : pts[i - 1]], ids: [t0 > 0 ? `${prefix}:${synth++}` : ids[i - 1]] };
      runs.push(cur);
    }
    cur.pts.push(t1 < 1 ? lerp2(pts[i - 1], pts[i], t1) : pts[i]);
    cur.ids.push(t1 < 1 ? `${prefix}:${synth++}` : ids[i]);
    if (t1 < 1) cur = null;
  }
  return runs.filter((r) => r.pts.length >= 2);
}

/** Douglas–Peucker that never drops a point flagged in `keep`. */
function simplify(pts, keep, tol) {
  const out = new Array(pts.length).fill(false);
  out[0] = out[pts.length - 1] = true;
  keep.forEach((k, i) => k && (out[i] = true));
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    let best = -1;
    let bd = 0;
    const [ax, az] = pts[s];
    const [bx, bz] = pts[e];
    const L = Math.hypot(bx - ax, bz - az) || 1e-9;
    for (let i = s + 1; i < e; i++) {
      const d = Math.abs((bx - ax) * (az - pts[i][1]) - (ax - pts[i][0]) * (bz - az)) / L;
      if (d > bd || out[i]) {
        if (out[i]) {
          stack.push([s, i], [i, e]);
          best = -2;
          break;
        }
        bd = d;
        best = i;
      }
    }
    if (best >= 0 && bd > tol) {
      out[best] = true;
      stack.push([s, best], [best, e]);
    }
  }
  return out;
}

/** Sutherland–Hodgman polygon clip against the rect. */
function clipPoly(poly) {
  const planes = [
    (p) => p[0] >= RECT.minX,
    (p) => p[0] <= RECT.maxX,
    (p) => p[1] >= RECT.minZ,
    (p) => p[1] <= RECT.maxZ,
  ];
  const isect = [
    (p, q) => lerp2(p, q, (RECT.minX - p[0]) / (q[0] - p[0])),
    (p, q) => lerp2(p, q, (RECT.maxX - p[0]) / (q[0] - p[0])),
    (p, q) => lerp2(p, q, (RECT.minZ - p[1]) / (q[1] - p[1])),
    (p, q) => lerp2(p, q, (RECT.maxZ - p[1]) / (q[1] - p[1])),
  ];
  let out = poly;
  for (let k = 0; k < 4; k++) {
    const inp = out;
    out = [];
    for (let i = 0; i < inp.length; i++) {
      const p = inp[i];
      const q = inp[(i + 1) % inp.length];
      const pin = planes[k](p);
      const qin = planes[k](q);
      if (pin) out.push(p);
      if (pin !== qin) out.push(isect[k](p, q));
    }
    if (!out.length) break;
  }
  return out;
}

const area = (poly) => Math.abs(poly.reduce((s, p, i) => s + p[0] * poly[(i + 1) % poly.length][1] - poly[(i + 1) % poly.length][0] * p[1], 0)) / 2;
const centroid = (poly) => poly.reduce((c, p) => [c[0] + p[0] / poly.length, c[1] + p[1] / poly.length], [0, 0]);
const hash = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/* ------------------------------------------------------------------ */
/* 2. Coast → land polygon                                             */
/* ------------------------------------------------------------------ */

const coastWays = ways.filter((w) => w.tags.natural === 'coastline');
const byFirst = new Map(coastWays.map((w) => [w.nodes[0], w]));
const used = new Set();
const chains = [];
for (const w of coastWays) {
  if (used.has(w.id)) continue;
  // walk back to the start of this chain
  let start = w;
  const seen = new Set([w.id]);
  for (;;) {
    const prev = coastWays.find((o) => o.nodes[o.nodes.length - 1] === start.nodes[0] && !seen.has(o.id));
    if (!prev) break;
    seen.add(prev.id);
    start = prev;
  }
  const chain = [];
  let cur = start;
  while (cur && !used.has(cur.id)) {
    used.add(cur.id);
    const g = sceneOf(cur.geometry);
    chain.push(...(chain.length ? g.slice(1) : g));
    cur = byFirst.get(cur.nodes[cur.nodes.length - 1]);
  }
  chains.push(chain);
}

const wtc = ways.find((w) => w.tags.shop === 'mall' && /World Trade/.test(w.tags['name:en'] || w.tags.name || ''));
const landProbe = wtc ? centroid(sceneOf(wtc.geometry)) : [0, -20];

const perim = ([x, z]) => {
  const W = RECT.maxX - RECT.minX;
  const H = RECT.maxZ - RECT.minZ;
  if (Math.abs(z - RECT.minZ) < 1e-6) return x - RECT.minX;
  if (Math.abs(x - RECT.maxX) < 1e-6) return W + (z - RECT.minZ);
  if (Math.abs(z - RECT.maxZ) < 1e-6) return W + H + (RECT.maxX - x);
  return 2 * W + H + (RECT.maxZ - z);
};
const CORNERS = [
  [RECT.minX, RECT.minZ],
  [RECT.maxX, RECT.minZ],
  [RECT.maxX, RECT.maxZ],
  [RECT.minX, RECT.maxZ],
];
const PER = 2 * (RECT.maxX - RECT.minX + RECT.maxZ - RECT.minZ);

let land = null;
let coast = [];
for (const chain of chains) {
  const ids = chain.map((_, i) => i);
  const runs = clipPolyline(chain, ids, 'coast');
  for (const run of runs) {
    const s = run.pts[0];
    const e = run.pts[run.pts.length - 1];
    const onEdge = (p) => Math.abs(p[0] - RECT.minX) < 1e-6 || Math.abs(p[0] - RECT.maxX) < 1e-6 || Math.abs(p[1] - RECT.minZ) < 1e-6 || Math.abs(p[1] - RECT.maxZ) < 1e-6;
    if (!onEdge(s) || !onEdge(e) || run.pts.length < 4) continue;
    const ps = perim(s);
    const pe = perim(e);
    const walk = (from, to, forward) => {
      const out = [];
      const corners = CORNERS.map((c) => [c, perim(c)]);
      const dist = (p) => (forward ? (p - from + PER) % PER : (from - p + PER) % PER);
      const span = dist(to);
      corners
        .filter(([, p]) => dist(p) > 1e-6 && dist(p) < span - 1e-6)
        .sort((x, y) => dist(x[1]) - dist(y[1]))
        .forEach(([c]) => out.push(c));
      return out;
    };
    const polyA = [...run.pts, ...walk(pe, ps, true)];
    const polyB = [...run.pts, ...walk(pe, ps, false)];
    const pick = pointInPoly(landProbe, polyA) ? polyA : pointInPoly(landProbe, polyB) ? polyB : null;
    if (pick && (!land || area(pick) > area(land))) {
      land = pick;
      coast = run.pts;
    }
  }
}
if (!land) throw new Error('could not build the land polygon from the coastline');
const onLand = (p) => pointInPoly(p, land);

/* ------------------------------------------------------------------ */
/* 3. Roads                                                            */
/* ------------------------------------------------------------------ */

const nodeUse = new Map();
const roadWays = ways.filter((w) => w.tags.highway);
for (const w of roadWays) for (const id of new Set(w.nodes)) nodeUse.set(id, (nodeUse.get(id) ?? 0) + 1);

function roadWidth(t) {
  const cls = t.highway;
  const oneway = t.oneway === 'yes';
  const lanes = parseFloat(t.lanes) || ({ trunk: oneway ? 3 : 6, primary: oneway ? 3 : 4, secondary: oneway ? 2 : 4, tertiary: oneway ? 2 : 2, residential: 2, unclassified: 2, living_street: 1.6, pedestrian: 1.2 }[cls] ?? 2);
  const shoulder = /^(trunk|primary)$/.test(cls) ? 1.4 : 0.6;
  return r2((lanes * 3.4 + shoulder) / UNIT);
}

const roads = [];
for (const w of roadWays) {
  const pts = sceneOf(w.geometry);
  for (const run of clipPolyline(pts, w.nodes, `w${w.id}`, 1)) {
    const keep = run.ids.map((id) => typeof id === 'number' && (nodeUse.get(id) ?? 0) > 1);
    const mask = simplify(run.pts, keep, 0.12);
    const p = run.pts.filter((_, i) => mask[i]).map(([x, z]) => [r2(x), r2(z)]);
    const k = run.ids.filter((_, i) => mask[i]).map(String);
    roads.push({ n: nameEn(w.tags), c: w.tags.highway, w: roadWidth(w.tags), o: w.tags.oneway === 'yes' ? 1 : 0, t: w.tags.tunnel ? 1 : 0, p, k });
  }
}

/* ------------------------------------------------------------------ */
/* 4. Buildings → axis-aligned boxes                                   */
/* ------------------------------------------------------------------ */

const isMosque = (t) => t.building === 'mosque' || (t.amenity === 'place_of_worship' && (t.religion === 'muslim' || /mosque|masjid|مسجد|جامع/i.test(t.name || t['name:en'] || '')));
function kindOf(t, hM) {
  if (isMosque(t)) return 'mosque';
  if (t.shop === 'mall' || /\bmall\b/i.test(t['name:en'] || '')) return 'mall';
  if (t.amenity === 'hospital' || t.building === 'hospital') return 'hospital';
  if (t.amenity === 'school' || t.building === 'school') return 'school';
  if (t.building === 'civic' || t.historic) return 'fort';
  if (t.building === 'roof') return 'roof';
  if (t.building === 'utility' || t.building === 'industrial') return 'utility';
  if (t.tourism === 'hotel' || /hotel/i.test(t.name || '')) return 'hotel';
  if (t.building === 'house' || t.building === 'detached') return 'house';
  if (t.building === 'office' || t.building === 'commercial' || t.building === 'retail' || t.building === 'mixed_use') return hM > 60 ? 'tower' : 'office';
  if (hM > 60) return 'tower';
  if (t.building === 'apartments' || t.building === 'residential') return 'residential';
  return 'building';
}

function heightM(t, id) {
  const h = parseFloat(t.height);
  if (h > 0) return h;
  const lv = parseFloat(t['building:levels']);
  if (lv > 0) return lv * 3.4 + 1.5;
  const v = hash(id);
  if (t.building === 'house' || t.building === 'detached') return 6 + v * 3;
  if (isMosque(t)) return 9;
  if (t.building === 'roof') return 5;
  if (t.building === 'utility' || t.building === 'industrial') return 7 + v * 3;
  if (t.building === 'apartments' || t.building === 'residential') return 26 + v * 26;
  return 18 + v * 24;
}

function rasterBoxes(ring) {
  const xs = ring.map((p) => p[0]);
  const zs = ring.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const z0 = Math.min(...zs);
  const w = Math.max(...xs) - x0;
  const d = Math.max(...zs) - z0;
  let last = [];
  for (let cs = Math.max(0.12, Math.max(w, d) / 60), tries = 0; tries < 5; tries++, cs *= 1.5) {
    const nx = Math.max(1, Math.round(w / cs));
    const nz = Math.max(1, Math.round(d / cs));
    const cw = w / nx;
    const cd = d / nz;
    const open = new Map();
    const rects = [];
    for (let j = 0; j <= nz; j++) {
      const runs = [];
      if (j < nz) {
        let start = -1;
        for (let i = 0; i <= nx; i++) {
          const inside = i < nx && pointInPoly([x0 + (i + 0.5) * cw, z0 + (j + 0.5) * cd], ring);
          if (inside && start < 0) start = i;
          if (!inside && start >= 0) {
            runs.push(`${start},${i}`);
            start = -1;
          }
        }
      }
      const next = new Map();
      for (const key of runs) next.set(key, open.get(key) ?? j);
      for (const [key, j0] of open) {
        if (next.has(key)) continue;
        const [i0, i1] = key.split(',').map(Number);
        rects.push([r2(x0 + i0 * cw), r2(z0 + j0 * cd), r2(x0 + i1 * cw), r2(z0 + j * cd)]);
      }
      open.clear();
      for (const [k, v] of next) open.set(k, v);
    }
    last = rects.filter(([a1, b1, a2, b2]) => (a2 - a1) * (b2 - b1) > 0.02);
    if (rects.length <= 40) return last;
  }
  // very irregular footprints keep their coarsest approximation instead of disappearing
  return last;
}

const overlapsTrench = ([x1, z1, x2, z2]) => x2 > TRENCH.minX && x1 < TRENCH.maxX && z2 > TRENCH.minZ && z1 < TRENCH.maxZ;
const buildings = [];
for (const w of ways.filter((e) => e.tags.building && e.tags.building !== 'tent')) {
  const ring = sceneOf(w.geometry);
  const c = centroid(ring);
  if (!inRect(c, -0.5) || !onLand(c)) continue;
  const hM = heightM(w.tags, w.id);
  const kind = kindOf(w.tags, hM);
  const boxes = rasterBoxes(ring).filter((b) => !overlapsTrench(b));
  if (!boxes.length) continue;
  const roof = kind === 'roof';
  buildings.push({
    id: w.id,
    n: nameEn(w.tags),
    k: kind,
    h: r2(roof ? 0.06 : hM / UNIT),
    y: roof ? r2(hM / UNIT - 0.06) : 0,
    c: [r2(c[0]), r2(c[1])],
    b: boxes,
  });
}

/* ------------------------------------------------------------------ */
/* 5. Parks                                                            */
/* ------------------------------------------------------------------ */

const parks = [];
for (const w of ways.filter((e) => /^(park|garden)$/.test(e.tags.leisure || '') || e.tags.landuse === 'grass')) {
  const poly = clipPoly(sceneOf(w.geometry).slice(0, -1));
  if (poly.length < 3 || area(poly) < 0.6) continue;
  parks.push({ n: nameEn(w.tags), p: poly.map(([x, z]) => [r2(x), r2(z)]) });
}

/* ------------------------------------------------------------------ */
/* 6. Palms: Corniche promenade, road medians, parks                   */
/* ------------------------------------------------------------------ */

const segs = roads.flatMap((r) => r.p.slice(1).map((q, i) => ({ a: r.p[i], b: q, hw: r.w / 2 })));
const boxesAll = buildings.flatMap((b) => b.b);
const nearRoad = (p, pad) =>
  segs.some(({ a: s, b: e, hw }) => {
    const L2 = (e[0] - s[0]) ** 2 + (e[1] - s[1]) ** 2 || 1e-9;
    const t = Math.max(0, Math.min(1, ((p[0] - s[0]) * (e[0] - s[0]) + (p[1] - s[1]) * (e[1] - s[1])) / L2));
    return Math.hypot(p[0] - s[0] - t * (e[0] - s[0]), p[1] - s[1] - t * (e[1] - s[1])) < hw + pad;
  });
const inBox = (p, pad = 0.3) => boxesAll.some(([x1, z1, x2, z2]) => p[0] > x1 - pad && p[0] < x2 + pad && p[1] > z1 - pad && p[1] < z2 + pad);
const okPalm = (p) => inRect(p, -1) && onLand(p) && !inBox(p) && !nearRoad(p, 0.35) && !(p[0] > TRENCH.minX && p[0] < TRENCH.maxX && p[1] > TRENCH.minZ && p[1] < TRENCH.maxZ);

const palms = [];
const addAlong = (r, side, offset, step) => {
  for (let i = 1; i < r.p.length; i++) {
    const [ax, az] = r.p[i - 1];
    const [bx, bz] = r.p[i];
    const L = Math.hypot(bx - ax, bz - az);
    const nx = (-(bz - az) / L) * side;
    const nz = ((bx - ax) / L) * side;
    for (let s = step / 2; s < L; s += step) {
      const p = [ax + ((bx - ax) * s) / L + nx * (r.w / 2 + offset), az + ((bz - az) * s) / L + nz * (r.w / 2 + offset)];
      if (okPalm(p)) palms.push([r2(p[0]), r2(p[1]), r2(0.85 + hash(p[0] * 13 + p[1]) * 0.35)]);
    }
  }
};
for (const r of roads) {
  if (r.n === 'Corniche Street') {
    addAlong(r, 1, 0.9, 1.7);
    addAlong(r, -1, 0.9, 1.7);
  } else if (/^(trunk|primary)$/.test(r.c)) {
    addAlong(r, 1, 0.55, 2.6);
    addAlong(r, -1, 0.55, 2.6);
  }
}
for (const park of parks) {
  const xs = park.p.map((p) => p[0]);
  const zs = park.p.map((p) => p[1]);
  for (let x = Math.min(...xs); x < Math.max(...xs); x += 2.1)
    for (let z = Math.min(...zs); z < Math.max(...zs); z += 2.1) {
      const p = [x + (hash(x * 7 + z) - 0.5) * 1.2, z + (hash(z * 5 - x) - 0.5) * 1.2];
      if (pointInPoly(p, park.p) && okPalm(p)) palms.push([r2(p[0]), r2(p[1]), r2(0.8 + hash(p[0] + p[1] * 3) * 0.4)]);
    }
}
const PALM_CAP = 1600;
const palmsOut = palms.length > PALM_CAP ? palms.filter((_, i) => i % Math.ceil(palms.length / PALM_CAP) === 0) : palms;

/* ------------------------------------------------------------------ */
/* 7. Places and street labels                                         */
/* ------------------------------------------------------------------ */

const findB = (re) => buildings.find((b) => re.test(b.n));
const place = (b, role) => (b ? { role, n: b.n, x: b.c[0], z: b.c[1], h: b.h, m: Math.round(Math.hypot(b.c[0], b.c[1]) * UNIT) } : null);
const utility = buildings.filter((b) => b.k === 'utility').sort((p, q) => Math.hypot(q.c[0], q.c[1]) - Math.hypot(p.c[0], p.c[1]))[0];
const places = [
  place(findB(/Ahalia Hospital|Ahli Hospital/), 'hospital'),
  place(findB(/Al Muna Primary/), 'school'),
  place(utility, 'depot'),
  place(findB(/Electrical Substation/), 'substation'),
  place(findB(/^Etisalat Tower$/), 'exchange'),
  place(findB(/World Trade Center/), 'mall'),
  place(findB(/Hamdan Center/), 'mall'),
  place(findB(/Madinat Zayed Shopping Centre$/), 'mall'),
  place(findB(/Al Mariah Mall/), 'mall'),
  place(findB(/^The Landmark$/), 'landmark'),
  place(findB(/Qasr Al Hosn/), 'landmark'),
  place(findB(/^Sama Tower$/), 'landmark'),
  place(findB(/Sheikh Khalifa Mosque/), 'mosque'),
  place(findB(/Sheikh Zayed Mosque/), 'mosque'),
  place(findB(/Abu Dhabi Investment Authority/), 'landmark'),
  place(findB(/Abu Dhabi Chamber/), 'landmark'),
].filter(Boolean);

console.log('Qasr Al Hosn kept:', !!findB(/Qasr Al Hosn/), '· The Landmark kept:', !!findB(/^The Landmark$/));
const LABEL_ROADS = ['Corniche Street', 'Khalifa Bin Zayed The First Street', 'Hamdan Bin Mohammed Street', 'Sheikh Rashid Bin Saeed Street', 'Zayed The First Street', 'Sultan Bin Zayed The First Street'];
const labels = [];
for (const name of LABEL_ROADS) {
  let best = null;
  for (const r of roads.filter((x) => x.n === name && !x.t)) {
    for (let i = 1; i < r.p.length; i++) {
      const [ax, az] = r.p[i - 1];
      const [bx, bz] = r.p[i];
      const L = Math.hypot(bx - ax, bz - az);
      const mid = [(ax + bx) / 2, (az + bz) / 2];
      const score = L - Math.hypot(mid[0], mid[1]) * 0.15;
      if (L > 6 && inRect(mid, -6) && (!best || score > best.score)) best = { score, x: r2(mid[0]), z: r2(mid[1]), a: r2(Math.atan2(bz - az, bx - ax)) };
    }
  }
  if (best) labels.push({ n: name.replace(/ Street$/, ' St').replace('Bin Zayed The First', 'Bin Zayed I').replace('Zayed The First', 'Zayed I'), x: best.x, z: best.z, a: best.a });
}

/* ------------------------------------------------------------------ */

const out = {
  meta: {
    source: 'Map data © OpenStreetMap contributors (ODbL)',
    fetched: osm.fetched ?? null,
    origin: { lat: LAT0 - O[1] / KZ, lon: LON0 + O[0] / KX },
    rotationDeg: r2((phi * 180) / Math.PI),
    unitMeters: UNIT,
    rect: RECT,
  },
  land: land.map(([x, z]) => [r2(x), r2(z)]),
  coast: coast.map(([x, z]) => [r2(x), r2(z)]),
  roads,
  buildings,
  parks,
  palms: palmsOut,
  places,
  labels,
};
writeFileSync(output, JSON.stringify(out));

const tall = [...buildings].sort((p, q) => q.h - p.h).slice(0, 5).map((b) => `${b.n || b.k} ${Math.round(b.h * UNIT)} m`);
console.log(`wrote ${output}: ${roads.length} roads, ${buildings.length} buildings (${buildings.reduce((s, b) => s + b.b.length, 0)} boxes), ${parks.length} parks, ${palmsOut.length} palms`);
console.log('rotation', out.meta.rotationDeg, 'deg · origin', out.meta.origin, '· land points', land.length, '· coast points', coast.length);
console.log('coast z range', r2(Math.min(...coast.map((p) => p[1]))), '→', r2(Math.max(...coast.map((p) => p[1]))));
console.log('tallest:', tall.join(' · '));
console.log('places:', places.map((p) => `${p.role}:${p.n}@(${p.x},${p.z}) ${p.m} m`).join(' | '));
console.log('labels:', labels.map((l) => `${l.n}@(${l.x},${l.z})`).join(' | '));
const near = roads.filter((r) => /^Khalifa/.test(r.n)).flatMap((r) => r.p.filter((p) => Math.abs(p[0]) < 15).map((p) => p[1]));
console.log('Khalifa carriageway z near the origin:', [...new Set(near.map((z) => r2(z)))].slice(0, 12));
