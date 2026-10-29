"""Shared helpers for the whole-world scripts (validate-world.py, build-world-fixes.py).

Loads the world the app renders: the locked baseline (alsajaa.json, minus the inland-hidden coast road),
the procedural expansion, and optionally the corrections file (alsajaa-fixes.json), merged the same way
src/data/abudhabi.ts merges them. Scene units: 1 = 10 m.
"""
import json, math, pathlib, re
from collections import defaultdict

ROOT = pathlib.Path(__file__).resolve().parents[1]
FIXES_PATH = ROOT / 'src/data/alsajaa-fixes.json'
LAGOONS_PATH = ROOT / 'src/data/alsajaa-lagoons.json'
INTERCHANGE_PATH = ROOT / 'src/data/alsajaa-interchange.json'
RAIL_LAYOUT = json.loads((ROOT / 'src/data/rail-layout.json').read_text())


def _smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def station_weight(x):
    """mirror of railLayout.ts stationWeight"""
    w = 0.0
    for st in RAIL_LAYOUT['stations']:
        d = st['x0'] - x if x < st['x0'] else (x - st['x1'] if x > st['x1'] else 0.0)
        w = max(w, 1 - _smooth(d / RAIL_LAYOUT['blend']))
    return w


def track_offset(track_id, x):
    t = next(q for q in RAIL_LAYOUT['tracks'] if q['id'] == track_id)
    return t['offset'] + (t['stationOffset'] - t['offset']) * station_weight(x)


def rail_envelope(x):
    """[north, south] offsets of the double track plus ballast from the line's centre at x"""
    return (track_offset('westbound', x) - RAIL_LAYOUT['ballast'], track_offset('eastbound', x) + RAIL_LAYOUT['ballast'])

ELEV = re.compile(r'flyover|Ramp|Cloverleaf')
DECK_Y = 0.62          # AbuDhabiTraffic.tsx: elevated road deck height
RAIL_HALF = 0.45       # half width of the rail corridor including ballast
DRIVE = {'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street', 'service'}
KERB_TOL = 0.25        # a road end within (other half width + this) of another centre line is joined at the kerb


def load_world(with_fixes=True):
    base = json.loads((ROOT / 'src/data/alsajaa.json').read_text())
    ex = json.loads((ROOT / 'src/data/alsajaa-expansion.json').read_text())
    inland = 'ALSAJAA_INLAND = true' in (ROOT / 'src/config/overrides.ts').read_text()
    roads = [dict(r) for r in base['roads'] if not (inland and r['n'] == 'Corniche Street')] + [dict(r) for r in ex['roads']]
    buildings = [dict(b) for b in base['buildings'] + ex['buildings']]
    palms = [list(p) for p in base['palms'] + ex['palms']]
    rect = ex['meta']['combinedRect']
    fixes = None
    if with_fixes and FIXES_PATH.exists():
        fixes = json.loads(FIXES_PATH.read_text())
        apply_fixes(roads, buildings, palms, fixes)
    # the lagoon community (scripts/build-lagoons.py) joins after the corrections, as in abudhabi.ts
    lagoons = json.loads(LAGOONS_PATH.read_text()) if LAGOONS_PATH.exists() else None
    if lagoons:
        roads.extend(dict(r) for r in lagoons['roads'])
        palms.extend(list(p) for p in lagoons['palms'])
        lr = lagoons['meta']['rect']
        rect = {'minX': min(rect['minX'], lr['minX']), 'maxX': max(rect['maxX'], lr['maxX']), 'minZ': min(rect['minZ'], lr['minZ']), 'maxZ': max(rect['maxZ'], lr['maxZ'])}
    # the interchange (scripts/build-interchange.py) joins last
    inter = json.loads(INTERCHANGE_PATH.read_text()) if INTERCHANGE_PATH.exists() else None
    if inter:
        roads.extend(dict(r) for r in inter['roads'])
        palms.extend(list(p) for p in inter['palms'])
        ir = inter['meta']['rect']
        rect = {'minX': min(rect['minX'], ir['minX']), 'maxX': max(rect['maxX'], ir['maxX']), 'minZ': min(rect['minZ'], ir['minZ']), 'maxZ': max(rect['maxZ'], ir['maxZ'])}
    return {'roads': roads, 'buildings': buildings, 'palms': palms, 'rect': rect, 'fixes': fixes, 'lagoons': lagoons, 'interchange': inter}


def road_y(r, i):
    """deck height of road r at point i (elevated roads without a profile sit at DECK_Y)"""
    if 'y' in r:
        return r['y'][i]
    return DECK_Y if is_elevated(r) else 0.0


def in_poly(x, z, poly):
    inside = False
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, zi = poly[i]; xj, zj = poly[j]
        if (zi > z) != (zj > z) and x < (xj - xi) * (z - zi) / (zj - zi) + xi:
            inside = not inside
        j = i
    return inside


def oriented_corners(cx, cz, yaw, w, d):
    ux, uz = math.sin(yaw), math.cos(yaw)
    vx, vz = uz, -ux
    return [(cx + ux * d * a + vx * w * b, cz + uz * d * a + vz * w * b) for a in (-0.5, 0, 0.5) for b in (-0.5, 0, 0.5)]


def apply_fixes(roads, buildings, palms, fx):
    """Mirror of applyFixes() in src/data/abudhabi.ts. Keep the two in step."""
    moves = {m['id']: m['to'] for m in fx.get('moveVertex', [])}
    drops = {d['id'] for d in fx.get('dropVertex', [])}
    inserts = fx.get('insertVertex', [])
    for r in roads:
        k = r.get('k') or []
        if not k:
            continue
        if any(i in moves for i in k) or (k[0] in drops or k[-1] in drops):
            p = [list(q) for q in r['p']]
            k = list(k)
            for i, kid in enumerate(k):
                if kid in moves:
                    p[i] = list(moves[kid])
            if k[-1] in drops and len(p) > 2:
                p, k = p[:-1], k[:-1]
            if k[0] in drops and len(p) > 2:
                p, k = p[1:], k[1:]
            r['p'], r['k'] = p, k
    cuts = {c['id'] for c in fx.get('cutVertex', [])}
    if cuts:
        out = []
        for r in roads:
            k = r.get('k') or []
            if not any(i in cuts for i in k):
                out.append(r)
                continue
            piece_p, piece_k = [], []
            for p_, k_ in zip(r['p'], k):
                if k_ in cuts:
                    if len(piece_p) >= 2:
                        out.append({**r, 'p': piece_p, 'k': piece_k})
                    piece_p, piece_k = [], []
                else:
                    piece_p.append(list(p_)); piece_k.append(k_)
            if len(piece_p) >= 2:
                out.append({**r, 'p': piece_p, 'k': piece_k})
        roads[:] = out
    for ins in inserts:
        for r in roads:
            k = r.get('k') or []
            for i in range(len(k) - 1):
                if (k[i], k[i + 1]) in ((ins['after'], ins['before']), (ins['before'], ins['after'])):
                    r['p'] = [list(q) for q in r['p']]
                    r['p'].insert(i + 1, list(ins['at']))
                    r['k'] = list(k[:i + 1]) + [ins['id']] + list(k[i + 1:])
                    break
            else:
                continue
            break
    roads.extend(dict(r) for r in fx.get('roads', []))
    for el in fx.get('elevate', []):
        for r in roads:
            if r.get('k') and r['k'][0] == el['firstId']:
                g, f, d = el['ground'], el['full'], el['deck']
                def yz(z):
                    t = max(0.0, min(1.0, (z - g) / (f - g)))
                    return round(d * t * t * (3 - 2 * t), 3)
                r['o'] = 1
                r['y'] = [yz(p[1]) for p in r['p']]
                # the raised part shares no node with the roads passing underneath
                r['k'] = [('el_' + k) if y > 0.05 else k for k, y in zip(r['k'], r['y'])]
    palms.extend(list(p) for p in fx.get('palmsAdd', []))
    over = {int(k): v for k, v in fx.get('buildings', {}).items()}
    for b in buildings:
        o = over.get(b['id'])
        if o:
            for key in ('b', 'h', 'y'):
                if key in o:
                    b[key] = o[key]
    moved = {(round(a[0], 3), round(a[1], 3)): c for a, c in fx.get('palms', [])}
    for p in palms:
        m = moved.get((round(p[0], 3), round(p[1], 3)))
        if m:
            p[0], p[1] = m


def is_elevated(r):
    return r.get('o') == 1 or bool(ELEV.search(r['n']))


def segs(p):
    return [(p[i], p[i + 1]) for i in range(len(p) - 1)]


def pt_seg(p, a, b):
    ax, az = a; bx, bz = b
    dx, dz = bx - ax, bz - az
    L2 = dx * dx + dz * dz or 1e-12
    t = max(0.0, min(1.0, ((p[0] - ax) * dx + (p[1] - az) * dz) / L2))
    return math.hypot(p[0] - (ax + t * dx), p[1] - (az + t * dz))


def closest_on_seg(p, a, b):
    ax, az = a; bx, bz = b
    dx, dz = bx - ax, bz - az
    L2 = dx * dx + dz * dz or 1e-12
    t = max(0.0, min(1.0, ((p[0] - ax) * dx + (p[1] - az) * dz) / L2))
    return (ax + t * dx, az + t * dz)


def seg_box(a, b, box):
    """distance from a segment to an axis-aligned box [x0, z0, x1, z1] (sampled at 0.25 units)"""
    x0, z0, x1, z1 = box
    n = max(2, int(max(abs(b[0] - a[0]), abs(b[1] - a[1])) / 0.25))
    best = 1e9
    for i in range(n + 1):
        t = i / n
        x = a[0] + (b[0] - a[0]) * t; z = a[1] + (b[1] - a[1]) * t
        best = min(best, math.hypot(max(x0 - x, 0, x - x1), max(z0 - z, 0, z - z1)))
        if best == 0:
            break
    return best


def bbox(p, pad):
    xs = [q[0] for q in p]; zs = [q[1] for q in p]
    return (min(xs) - pad, min(zs) - pad, max(xs) + pad, max(zs) + pad)


def boxes_touch(a, b):
    return a[0] <= b[2] and b[0] <= a[2] and a[1] <= b[3] and b[1] <= a[3]


def at_grade(r):
    return r['c'] in DRIVE and r.get('t') != 1 and not is_elevated(r)


def road_segments(roads, pred):
    out = []
    for ri, r in enumerate(roads):
        if not pred(r):
            continue
        hw = r['w'] / 2
        for a, b in segs(r['p']):
            out.append((ri, a, b, bbox([a, b], hw + 0.05), hw))
    return out


def seg_cross(a, b, c, d):
    den = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0])
    if abs(den) < 1e-12:
        return False
    t = ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / den
    u = ((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / den
    return 0 <= t <= 1 and 0 <= u <= 1


def end_joined(e, i, roads, drv, bxs):
    """True when road i's end point e meets another drivable road (centre line or kerb), or itself (a loop)."""
    r = roads[i]
    if len(r['p']) > 2 and math.hypot(r['p'][0][0] - r['p'][-1][0], r['p'][0][1] - r['p'][-1][1]) < 1e-6:
        return True  # closed ring (roundabout)
    for j in drv:
        if j == i:
            continue
        bj = bxs[j]
        if not (bj[0] - 1.5 <= e[0] <= bj[2] + 1.5 and bj[1] - 1.5 <= e[1] <= bj[3] + 1.5):
            continue
        tol = roads[j]['w'] / 2 + KERB_TOL
        if min(pt_seg(e, a, b) for a, b in segs(roads[j]['p'])) < tol:
            return True
    return False


def audit(world):
    roads, buildings, palms, rect = world['roads'], world['buildings'], world['palms'], world['rect']
    rep = {k: [] for k in ('levels', 'lagoon', 'rail_crossings', 'on_carriageway', 'overlaps', 'on_rail', 'along_rail', 'under_deck', 'palms_on_road', 'palms_in_building', 'dead_ends', 'components')}
    rsegs_all = road_segments(roads, lambda r: r['c'] in DRIVE and r.get('t') != 1)

    for b in buildings:
        if b.get('y', 0) >= DECK_Y - 0.05:
            continue  # raised over the road (a platform on the rail viaduct)
        for box in b['b']:
            for ri, a, c, sb, hw in rsegs_all:
                if not boxes_touch(sb, box):
                    continue
                r = roads[ri]
                d = seg_box(a, c, box)
                if d >= hw - 0.05:
                    continue
                if is_elevated(r):
                    if b['h'] + b.get('y', 0) > DECK_Y - 0.05:
                        rep['under_deck'].append((b['id'], b['n'], r['n']))
                else:
                    rep['on_carriageway'].append((b['id'], b['n'], r['n'], round(hw - d, 2)))
                break
    rep['on_carriageway'] = sorted(set(rep['on_carriageway']))
    rep['under_deck'] = sorted(set(rep['under_deck']))

    allboxes = [(b['id'], box) for b in buildings for box in b['b']]
    grid = defaultdict(list)
    for i, (_, bx) in enumerate(allboxes):
        for gx in range(int(bx[0] // 8), int(bx[2] // 8) + 1):
            for gz in range(int(bx[1] // 8), int(bx[3] // 8) + 1):
                grid[(gx, gz)].append(i)
    seen = set()
    for cell in grid.values():
        for ii in range(len(cell)):
            for jj in range(ii + 1, len(cell)):
                i, j = cell[ii], cell[jj]
                ida, a = allboxes[i]; idb, c = allboxes[j]
                if ida == idb or (i, j) in seen:
                    continue
                seen.add((i, j))
                if min(a[2], c[2]) - max(a[0], c[0]) > 0.02 and min(a[3], c[3]) - max(a[1], c[1]) > 0.02:
                    rep['overlaps'].append((min(ida, idb), max(ida, idb)))
    rep['overlaps'] = sorted(set(rep['overlaps']))

    rail = next((r for r in roads if r['c'] == 'rail'), None)
    if rail:
        rs = segs(rail['p'])
        rb = bbox(rail['p'], RAIL_HALF + 0.1)
        cz = rail['p'][0][1]
        x_lo, x_hi = rail['p'][0][0], rail['p'][-1][0]
        for b in buildings:
            if 'platform' in b['n'] and b['n'].startswith('Etihad Rail'):
                continue  # the island platforms stand between the tracks
            for box in b['b']:
                if box[2] < x_lo or box[0] > x_hi:
                    continue
                hit = False
                for k in range(11):
                    x = min(max(box[0] + (box[2] - box[0]) * k / 10, x_lo), x_hi)
                    n, so = rail_envelope(x)
                    if box[1] < cz + so and box[3] > cz + n:
                        hit = True
                        break
                if hit:
                    rep['on_rail'].append((b['id'], b['n']))
                    break
        for r in roads:
            if r is rail or r.get('t') == 1 or is_elevated(r) or r['c'] not in DRIVE:
                continue
            run = 0.0
            for a, c in segs(r['p']):
                L = math.hypot(c[0] - a[0], c[1] - a[1]) or 1e-9
                mid = ((a[0] + c[0]) / 2, (a[1] + c[1]) / 2)
                if not (rail['p'][0][0] <= mid[0] <= rail['p'][-1][0]):
                    continue
                n, so = rail_envelope(mid[0])
                cz = rail['p'][0][1]
                if mid[1] - r['w'] / 2 < cz + so and mid[1] + r['w'] / 2 > cz + n:
                    Lr = 1.0
                    cos = abs(c[0] - a[0]) / L  # the line runs along x
                    if cos > 0.7:  # parallel: sharing the corridor, not crossing it
                        run += L
            if run > 1.0:
                rep['along_rail'].append((r['n'], round(run, 1)))

    # rail crossings: distinct places where drivable roads cross the line (a divided highway counts once)
    rep['rail_crossings'] = []
    if rail:
        pts = []
        for r in roads:
            if r['c'] not in DRIVE or r.get('t') == 1 or is_elevated(r):
                continue
            for a, b in segs(r['p']):
                for c, d in segs(rail['p']):
                    if seg_cross(a, b, c, d):
                        pts.append((c[0] + (d[0] - c[0]) * 0.5, r['n']))
        pts.sort()
        for x, n in pts:
            if rep['rail_crossings'] and abs(rep['rail_crossings'][-1][0] - x) < 4.0:
                rep['rail_crossings'][-1][1].add(n)
            else:
                rep['rail_crossings'].append([x, {n}])
        rep['rail_crossings'] = [(round(x, 1), sorted(ns)) for x, ns in rep['rail_crossings']]

    for pi, (x, z, *_rest) in enumerate(palms):
        for ri, a, c, sb, hw in rsegs_all:
            if sb[0] <= x <= sb[2] and sb[1] <= z <= sb[3] and at_grade(roads[ri]) and pt_seg((x, z), a, c) < hw + 0.1:
                rep['palms_on_road'].append((pi, round(x, 2), round(z, 2), roads[ri]['n']))
                break
    pgrid = defaultdict(list)
    for i, (_, bx) in enumerate(allboxes):
        for gx in range(int(bx[0] // 8), int(bx[2] // 8) + 1):
            for gz in range(int(bx[1] // 8), int(bx[3] // 8) + 1):
                pgrid[(gx, gz)].append(i)
    for pi, (x, z, *_rest) in enumerate(palms):
        for i in pgrid.get((int(x // 8), int(z // 8)), []):
            bid, bx = allboxes[i]
            if bx[0] + 0.05 < x < bx[2] - 0.05 and bx[1] + 0.05 < z < bx[3] - 0.05:
                rep['palms_in_building'].append((pi, round(x, 2), round(z, 2), bid))
                break

    # where two roads cross in plan without sharing a node, they must be at least 5 m apart in height
    elev = [r for r in roads if r['c'] in DRIVE and (is_elevated(r) or 'y' in r)]
    for e in elev:
        eb = bbox(e['p'], 0)
        for o in roads:
            if o is e or o['c'] not in DRIVE or o.get('t') == 1 or not boxes_touch(eb, bbox(o['p'], 0)):
                continue
            shared = set(e.get('k') or []) & set(o.get('k') or [])
            for i, (a, b) in enumerate(segs(e['p'])):
                for j, (c, d) in enumerate(segs(o['p'])):
                    den = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0])
                    if abs(den) < 1e-12:
                        continue
                    t = ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / den
                    u = ((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / den
                    if not (0 <= t <= 1 and 0 <= u <= 1):
                        continue
                    # crossings at a shared node are junctions
                    if (t < 1e-6 and e['k'][i] in shared) or (t > 1 - 1e-6 and e['k'][i + 1] in shared):
                        continue
                    ye = road_y(e, i) + (road_y(e, i + 1) - road_y(e, i)) * t
                    yo = road_y(o, j) + (road_y(o, j + 1) - road_y(o, j)) * u
                    if abs(ye - yo) < 0.5:
                        rep['levels'].append((e['n'], o['n'], round(a[0] + (b[0] - a[0]) * t, 2), round(a[1] + (b[1] - a[1]) * t, 2), round(abs(ye - yo), 2)))
    rep['levels'] = sorted(set(rep['levels']))

    lg = world.get('lagoons')
    if lg:
        water = lg['water']
        wseg = [(w[i], w[(i + 1) % len(w)]) for w in water for i in range(len(w))]
        wet = lambda x, z: any(in_poly(x, z, w) for w in water)
        wdist = lambda x, z: 0.0 if wet(x, z) else min(pt_seg((x, z), a, b) for a, b in wseg)
        lsegs = [s for s in rsegs_all if s[3][3] > 36]
        kerb = lambda x, z: min((pt_seg((x, z), a, c) - hw for ri, a, c, sb, hw in lsegs if sb[0] - 2 < x < sb[2] + 2 and sb[1] - 2 < z < sb[3] + 2), default=9)
        for v in lg['villas']:
            for x, z in oriented_corners(v['x'], v['z'], v['yaw'], v['w'], v['d']):
                if kerb(x, z) < 0.05:
                    rep['lagoon'].append(('villa on a carriageway', v['x'], v['z'])); break
                if wdist(x, z) < 0.1:
                    rep['lagoon'].append(('villa in the water', v['x'], v['z'])); break
        cs = sorted((v['x'], v['z']) for v in lg['villas'])
        for i in range(len(cs)):
            for j in range(i + 1, len(cs)):
                if cs[j][0] - cs[i][0] > 1.3:
                    break
                if math.hypot(cs[j][0] - cs[i][0], cs[j][1] - cs[i][1]) < 1.15:
                    rep['lagoon'].append(('villas overlap', cs[i], cs[j]))
        for c in lg['cars']:
            if kerb(c['x'], c['z']) < 0.0:
                rep['lagoon'].append(('car on a carriageway', c['x'], c['z']))
        for r in lg['roads']:
            if r.get('bridge'):
                continue
            for a, b in segs(r['p']):
                for t in (0, 0.5, 1):
                    x, z = a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t
                    if wdist(x, z) < r['w'] / 2:
                        rep['lagoon'].append(('road in the water', r['n'], round(x, 2), round(z, 2)))
        for p in lg['palms']:
            if wet(p[0], p[1]):
                rep['lagoon'].append(('palm in the water', p[0], p[1]))
        # plot walls: off the carriageways and out of the water
        for q in lg.get('plots', []):
            for x, z in oriented_corners(q['x'], q['z'], q['yaw'], q['w'] - 0.04, q['d'] - 0.04):
                if kerb(x, z) < 0.08:
                    rep['lagoon'].append(('plot wall on a carriageway', q['x'], q['z'])); break
                if wdist(x, z) < 0.15:
                    rep['lagoon'].append(('plot in the water', q['x'], q['z'])); break
        # the mosque in the park stands on dry land
        c = lg['centre']
        for sx in (-1, 0, 1):
            for sz in (-1, 0, 1):
                x, z = c['x'] + sx * c['w'] / 2, c['z'] + sz * c['d'] / 2
                if wdist(x, z) < 0.2:
                    rep['lagoon'].append(('mosque in the water', x, z))
        # no AD building inside the community (it is laid out on open land)
        lr = lg['meta']['rect']
        for b in buildings:
            for q in b['b']:
                if q[2] > lr['minX'] and q[0] < lr['maxX'] and q[3] > lr['minZ'] + 1 and q[1] < lr['maxZ']:
                    rep['lagoon'].append(('building inside the community', b['id'], b['n']))

    drv = [i for i, r in enumerate(roads) if r['c'] in DRIVE and len(r['p']) >= 2]
    bxs = {i: bbox(roads[i]['p'], 0) for i in drv}
    parent = {i: i for i in drv}

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for ii, i in enumerate(drv):
        bi = bbox(roads[i]['p'], roads[i]['w'] / 2 + KERB_TOL)
        for j in drv[ii + 1:]:
            if not boxes_touch(bi, bbox(roads[j]['p'], roads[j]['w'] / 2 + KERB_TOL)):
                continue
            pi_, pj = roads[i]['p'], roads[j]['p']
            near = any(min(pt_seg(e, a, b) for a, b in segs(pj)) < roads[j]['w'] / 2 + KERB_TOL for e in (pi_[0], pi_[-1])) or \
                any(min(pt_seg(e, a, b) for a, b in segs(pi_)) < roads[i]['w'] / 2 + KERB_TOL for e in (pj[0], pj[-1]))
            if not near:
                near = any(seg_cross(a, b, c, d) for a, b in segs(pi_) for c, d in segs(pj))
            if near:
                parent[find(i)] = find(j)
    comps = defaultdict(list)
    for i in drv:
        comps[find(i)].append(i)
    lens = []
    for c in comps.values():
        L = sum(sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in segs(roads[i]['p'])) for i in c)
        lens.append((round(L, 1), [roads[i]['n'] for i in c][:4]))
    rep['components'] = sorted(lens, key=lambda s: -s[0])

    for i in drv:
        r = roads[i]
        for e in (r['p'][0], r['p'][-1]):
            if min(abs(e[0] - rect['minX']), abs(e[0] - rect['maxX']), abs(e[1] - rect['minZ']), abs(e[1] - rect['maxZ'])) < 1.0:
                continue  # leaves the model at its edge: the road carries on beyond it
            if not end_joined(e, i, roads, drv, bxs):
                rep['dead_ends'].append((r['n'], r['c'], [round(e[0], 2), round(e[1], 2)]))
    return rep
