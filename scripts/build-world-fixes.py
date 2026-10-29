#!/usr/bin/env python3
"""Builds src/data/alsajaa-fixes.json: corrections applied on top of the locked baseline and the expansion
(src/data/abudhabi.ts applies them; scripts/world_lib.py mirrors that for the checks).

The baseline file is never edited (its hash is checked, and the simulated utilities are authored in its
frame). Instead this script records small, reviewable corrections:
  - roads:          new connector and boundary roads. Their vertices reuse the node ids of the roads they
                    meet, so the traffic graph (AbuDhabiTraffic buildLinks) turns at the new junctions
  - insertVertex:   a vertex added to an existing road where a new road meets it mid-segment
  - dropVertex:     a dangling end vertex removed (a stub past the last junction)
  - moveVertex:     a vertex moved (a road that drifted into the rail corridor)
  - buildings:      footprint boxes trimmed or shifted off a carriageway or out of another footprint,
                    and the two rail platforms raised to the viaduct deck
  - palms:          palms moved off a carriageway or out of a building
Run: python3 scripts/build-world-fixes.py && python3 scripts/validate-world.py
"""
import json, math
from world_lib import (FIXES_PATH, seg_cross, rail_envelope, RAIL_LAYOUT, DRIVE, RAIL_HALF, load_world, apply_fixes, audit, segs, pt_seg, closest_on_seg,
                       seg_box, bbox, boxes_touch, is_elevated, at_grade, end_joined)

R = lambda v: round(v, 3)
raw = load_world(with_fixes=False)
roads, buildings, palms = raw['roads'], raw['buildings'], raw['palms']

# coordinate -> existing node id, so new roads share junction nodes with the roads they meet
coord_id = {}
for r in roads:
    for p, k in zip(r['p'], r.get('k') or []):
        coord_id.setdefault((R(p[0]), R(p[1])), k)


def node_id(x, z):
    return coord_id.get((R(x), R(z))) or f'fx_{R(x)}_{R(z)}'


def make_road(name, cls, pts, w=1.0):
    pts = [[R(x), R(z)] for x, z in pts]
    out = [pts[0]]
    for p in pts[1:]:
        if math.hypot(p[0] - out[-1][0], p[1] - out[-1][1]) > 1e-6:
            out.append(p)
    return {'n': name, 'c': cls, 'w': w, 'o': 0, 't': 0, 'p': out, 'k': [node_id(x, z) for x, z in out], 'fix': 1}


def along(x0, x1, z, extra=(), step=2.0):
    """points along z from x0 to x1 every `step`, plus the given x positions (existing junctions)"""
    xs = set()
    x = x0
    while x <= x1 + 1e-9:
        xs.add(R(x)); x += step
    xs |= {R(v) for v in extra}
    xs.add(R(x1))
    xs = sorted(xs)
    keep = []
    for v in xs:  # drop grid points that sit right next to a junction point
        if v in extra or v in (R(x0), R(x1)) or all(abs(v - e) > 0.6 for e in extra):
            keep.append(v)
    return [[v, z] for v in keep]


fx = {'meta': {'source': 'scripts/build-world-fixes.py', 'note': 'Corrections over the locked baseline and the expansion; see the script header.'},
      'moveVertex': [], 'dropVertex': [], 'insertVertex': [], 'roads': [], 'buildings': {}, 'palms': []}

by_name = {}
for r in roads:
    by_name.setdefault(r['n'], []).append(r)

# 1. Al Sajaa Road 1 drifts into the rail corridor (rail at z = -50.5): keep its kerb 0.15 clear of the ballast
#    by the station and the halt it also leaves room for the platform (z -49.9 to -49.1) beside the track
#    it follows the south edge of the double-track envelope, which widens round the island platforms
for r in by_name['Al Sajaa Road 1']:
    for p, k in zip(r['p'], r['k']):
        lim = -50.5 + max(RAIL_HALF, rail_envelope(p[0])[1]) + r['w'] / 2 + 0.15
        if p[1] < lim:
            fx['moveVertex'].append({'id': k, 'to': [p[0], R(lim)]})

# 1b. the rail line has four grade-separated passways only (RailTrain.tsx bridges them): Emirates Road E611 and
#     Al Sajaa Streets 4, 13 and 19. Every other street that crossed the track stops either side of it, at
#     Al Sajaa Road 1 to the south and the Rail Frontage Road to the north, so traffic turns along the line
#     to the nearest underpass. cutVertex removes a vertex and splits the road there.
PASSWAYS = {'Emirates Road E611 southbound', 'Emirates Road E611 northbound', 'Al Sajaa Street 4', 'Al Sajaa Street 13', 'Al Sajaa Street 19'}
rail = next(r for r in roads if r['c'] == 'rail')
# the track used to start and end on the boundary streets at x = -152 and x = 120: it now stops at buffers
# just short of their kerbs instead of running onto them
for end, step in ((0, 1), (-1, -1)):
    p, k = rail['p'][end], rail['k'][end]
    for o in roads:
        if o is rail or o['c'] not in DRIVE:
            continue
        d = min(pt_seg(p, a, b) for a, b in segs(o['p']))
        if d < o['w'] / 2 + RAIL_HALF:
            nx = rail['p'][end + step][0] - p[0]
            L = abs(nx) or 1
            to = [R(p[0] + nx / L * (o['w'] / 2 + RAIL_HALF + 0.3 - d)), p[1]]
            fx['moveVertex'].append({'id': k, 'to': to})
            rail['p'] = [list(q) for q in rail['p']]
            rail['p'][end] = to
            break
rail_segs = segs(rail['p'])
for r in roads:
    if r['c'] not in DRIVE or r['n'] in PASSWAYS or r.get('t') == 1 or is_elevated(r):
        continue
    if not any(seg_cross(a, b, c, d) for a, b in segs(r['p']) for c, d in rail_segs):
        continue  # runs beside the line (Al Sajaa Road 1) or stops short of it: nothing to cut
    for p, k in zip(r['p'], r['k']):
        if min(pt_seg(p, c, d) for c, d in rail_segs) < r['w'] / 2 + RAIL_HALF + 0.6:
            fx.setdefault('cutVertex', []).append({'id': k})

# 2. west and far-west district streets run 20 m past their last junction (z = 24) to the land edge: end them there
for r in roads:
    if (r['n'].startswith('Western Logistics District Street') or r['n'].startswith('Far Western Freight Yards Street')) \
            and abs(r['p'][-1][1] - 26.0) < 1e-6 and abs(r['p'][-2][1] - 24.0) < 1e-6:
        fx['dropVertex'].append({'id': r['k'][-1]})

# 2b. Rahmaniya streets run 20 m past their last junction (z = -48) onto the track at z = -50: end them at the junction
for r in roads:
    if r['n'].startswith('Rahmaniya Street') and abs(r['p'][0][1] + 50) < 1e-6 and abs(r['p'][1][1] + 48) < 1e-6:
        fx['dropVertex'].append({'id': r['k'][0]})

# 3. rail frontage road (z = -52): the central streets cross the rail and stopped here; the two rail access
#    streets already lead from this line to Emirates Road E88
stub_n = [r['p'][0] for r in roads if r['n'].startswith('Al Sajaa Street') and abs(r['p'][0][1] + 52) < 1e-6]
acc = [r['p'][0] for r in roads if r['n'].startswith('Rail access street')]
fx['roads'].append(make_road('Al Sajaa Rail Frontage Road', 'secondary',
                             along(-66.9, 120.0, -52.0, extra=[p[0] for p in stub_n + acc] + [-66.9, 120.0])))

# 4. northern district: its streets stopped at z = -80 (the district edge) with no road there east of x = -152
north_x = [r['p'][-1][0] for r in roads if r['n'].startswith('Northern Mixed District Street') and abs(r['p'][-1][1] + 80) < 1e-6 and r['p'][-1][0] > -152]
fx['roads'].append(make_road('Northern Mixed District Road 10', 'secondary', along(-152.0, 120.0, -80.0, extra=north_x + [-66.9, -69.1])))

# 5. south road: the central and Rahmaniya streets end along the old coast line (the hidden Corniche ran there).
#    It passes through their ends, steps round the Rahmaniya Mall, and joins the two E611 carriageway ends.
south_c = sorted((r['p'][-1] for r in roads if r['n'].startswith('Al Sajaa Street') and r['p'][-1][1] > 28), key=lambda p: p[0])
south_r = sorted((r['p'][-1] for r in roads if r['n'].startswith('Rahmaniya Street') and r['p'][-1][1] > 28), key=lambda p: p[0])
pts = []
for p in south_r:
    pts.append(p)
    if abs(p[0] + 102) < 1e-6:
        pts.append([-102.0, 32.0])  # north of the mall's south wall (z 31.1)
pts += [[-69.1, 34.0], [-66.9, 34.0]] + south_c
fx['roads'].append(make_road('Al Sajaa South Road', 'secondary', pts))

# 6. Rahmaniya joins the rest of the city: links east to Emirates Road E611 and west to the logistics district
for z in (-48.0, -24.0, 0.0, 24.0):
    fx['roads'].append(make_road(f'Rahmaniya Road link {int(z)}', 'secondary', [[-78.0, z], [-69.1, z]]))
for z in (-48.0, -32.0, -24.0, -16.0, -8.0, 0.0, 8.0, 16.0, 24.0):
    fx['roads'].append(make_road(f'Rahmaniya west link {int(z)}', 'residential', [[-152.0, z], [-150.0, z]]))


def world_now():
    w = load_world(with_fixes=False)
    apply_fixes(w['roads'], w['buildings'], w['palms'], fx)
    return w


# 6b. a cut can leave a short stub past the last road it crossed (Street 20 runs on past Road 1 where Road 1
#     bends north): that end moves back to the crossing, which step 7 then makes a shared junction
w = world_now()
drv = [i for i, r in enumerate(w['roads']) if r['c'] in DRIVE and len(r['p']) >= 2]
bxs = {i: bbox(w['roads'][i]['p'], 0) for i in drv}
cut_ids = {c['id'] for c in fx.get('cutVertex', [])}
for i in drv:
    r = w['roads'][i]
    for end in (0, -1):
        e = r['p'][end]
        if end_joined(e, i, w['roads'], drv, bxs):
            continue
        a, b = (r['p'][0], r['p'][1]) if end == 0 else (r['p'][-1], r['p'][-2])
        best = None
        for j in drv:
            if j == i:
                continue
            for c, d in segs(w['roads'][j]['p']):
                den = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0])
                if abs(den) < 1e-12:
                    continue
                t = ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / den
                u = ((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / den
                if 0 <= t <= 1 and 0 <= u <= 1 and (best is None or t < best):
                    best = t
        if best is not None:
            to = [R(a[0] + (b[0] - a[0]) * best), R(a[1] + (b[1] - a[1]) * best)]
            fx['moveVertex'].append({'id': r['k'][end], 'to': to})

# 7. road ends that stop at a kerb (or on a centre line) without a shared node: add a short connector to the
#    centre line and a vertex there, so the junction is real for traffic too
w = world_now()
drv = [i for i, r in enumerate(w['roads']) if r['c'] in DRIVE and len(r['p']) >= 2]
uses = {}
for r in w['roads']:
    for k in r.get('k') or []:
        uses[k] = uses.get(k, 0) + 1
done = set()
for i in drv:
    r = w['roads'][i]
    for end in (0, -1):
        e, k = r['p'][end], r['k'][end]
        if uses.get(k, 0) > 1 or k in done:
            continue
        best = None
        for j in drv:
            if j == i:
                continue
            o = w['roads'][j]
            if not boxes_touch(bbox(o['p'], o['w'] / 2 + 0.6), (e[0], e[1], e[0], e[1])):
                continue
            for si, (a, b) in enumerate(segs(o['p'])):
                d = pt_seg(e, a, b)
                if d < o['w'] / 2 + 0.4 and (best is None or d < best[0]):
                    best = (d, j, si)
        if best is None:
            continue
        d, j, si = best
        o = w['roads'][j]
        a, b = o['p'][si], o['p'][si + 1]
        c = closest_on_seg(e, a, b)
        # snap to an existing vertex when the foot of the perpendicular is close to one
        if d < 0.05 and math.hypot(c[0] - a[0], c[1] - a[1]) >= 0.3 and math.hypot(c[0] - b[0], c[1] - b[1]) >= 0.3:
            # the end already lies on the other road's centre line: share the node, no connector
            fx['insertVertex'].append({'after': o['k'][si], 'before': o['k'][si + 1], 'at': [R(e[0]), R(e[1])], 'id': k})
            done.add(k)
            continue
        if math.hypot(c[0] - a[0], c[1] - a[1]) < 0.3:
            cid = o['k'][si]; c = a
        elif math.hypot(c[0] - b[0], c[1] - b[1]) < 0.3:
            cid = o['k'][si + 1]; c = b
        else:
            cid = f'fx_{R(c[0])}_{R(c[1])}'
            fx['insertVertex'].append({'after': o['k'][si], 'before': o['k'][si + 1], 'at': [R(c[0]), R(c[1])], 'id': cid})
        conn = {'n': r['n'], 'c': r['c'], 'w': r['w'], 'o': 0, 't': 0, 'p': [[R(e[0]), R(e[1])], [R(c[0]), R(c[1])]], 'k': [k, cid], 'fix': 1}
        if r.get('l'):
            conn['w'] = min(r['w'], 1.0)
        fx['roads'].append(conn)
        done.add(k)

# 8. island platforms between the two tracks at the station and the halt, long enough for the whole train
P = RAIL_LAYOUT['platform']
for st in RAIL_LAYOUT['stations']:
    fx['buildings'][str(st['platformId'])] = {'b': [[st['x0'], P['z0'], st['x1'], P['z1']]], 'h': P['h'], 'y': 0}

# 8b. the reservoir was drawn under a labour camp and factory halls across four blocks; it moves, at its full
#     size, to the open land north of Emirates Road E88 by the solar fields (nothing else references it)
for b in buildings:
    if b['n'] == 'Reservoir' and b['id'] == 100345:
        fx['buildings'][str(b['id'])] = {'b': [[76.0, -74.0, 90.0, -64.0]]}

# 9. footprints: trim (or for small props, shift) boxes off at-grade carriageways, then out of each other
REPEATED = ('cars', 'sedans', 'SUVs', 'pickups', 'Solar panel field', 'Container stack')
PROPS = ('sign', 'signal')
MARGIN = 0.1


def clear_of(box, a, b, hw, shift):
    """pieces of the box left once the carriageway (plus MARGIN) is cleared: a box the road passes through is
    split in two; one it only clips is trimmed; a small prop is shifted off as a whole"""
    x0, z0, x1, z1 = box
    cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
    c = closest_on_seg((cx, cz), a, b)
    vertical = abs(b[1] - a[1]) >= abs(b[0] - a[0])
    need = hw + MARGIN
    if vertical:
        lo, hi = c[0] - need, c[0] + need
        if shift:
            return [[x0 - (x1 - lo), z0, lo, z1]] if cx < c[0] else [[hi, z0, x1 + (hi - x0), z1]]
        return [q for q in ([x0, z0, min(x1, lo), z1], [max(x0, hi), z0, x1, z1]) if q[2] - q[0] > 0.3]
    lo, hi = c[1] - need, c[1] + need
    if shift:
        return [[x0, z0 - (z1 - lo), x1, lo]] if cz < c[1] else [[x0, hi, x1, z1 + (hi - z0)]]
    return [q for q in ([x0, z0, x1, min(z1, lo)], [x0, max(z0, hi), x1, z1]) if q[3] - q[1] > 0.3]


def valid(box):
    return box[2] - box[0] > 0.12 and box[3] - box[1] > 0.12


log = []
for it in range(6):
    w = world_now()
    rsegs = [(ri, a, b, bbox([a, b], r['w'] / 2 + 0.05), r['w'] / 2) for ri, r in enumerate(w['roads']) if at_grade(r) for a, b in segs(r['p'])]
    changed = False
    for bld in w['buildings']:
        if bld.get('y', 0) >= 0.55:
            continue  # raised above the road (platform on the viaduct)
        boxes = [list(x) for x in bld['b']]
        new = []
        queue = list(boxes)
        while queue:
            box = queue.pop()
            hit = None
            for ri, a, b, sb, hw in rsegs:
                if boxes_touch(sb, box) and seg_box(a, b, box) < hw - 0.05:
                    hit = (ri, a, b, hw)
                    break
            if not hit:
                new.append([R(v) for v in box])
                continue
            ri, a, b, hw = hit
            changed = True
            area = (box[2] - box[0]) * (box[3] - box[1])
            if any(s in bld['n'] for s in REPEATED) and area < 0.3:
                log.append((bld['id'], bld['n'], w['roads'][ri]['n'], 'drop item', [R(v) for v in box], None))
                continue  # a parked car (or a stack) standing in the lane
            small = any(s in bld['n'] for s in PROPS) or area < 0.08
            pieces = clear_of(box, a, b, hw, shift=small)
            log.append((bld['id'], bld['n'], w['roads'][ri]['n'], 'shift' if small else ('split' if len(pieces) > 1 else 'trim'), [R(v) for v in box], [[R(v) for v in q] for q in pieces]))
            queue.extend(q for q in pieces if valid(q))
        # a single-footprint building is one structure: a road can trim it but never cut it in pieces,
        # so it keeps the largest clear piece (the landmark fits its block)
        if len(bld['b']) == 1 and len(new) > 1:
            new = [max(new, key=lambda q: (q[2] - q[0]) * (q[3] - q[1]))]
        if changed and new != [list(x) for x in bld['b']]:
            if not new:
                new = [list(x) for x in bld['b']][:0] or [[R(v) for v in bld['b'][0]]]
            fx['buildings'].setdefault(str(bld['id']), {})['b'] = new
    # overlaps: the lower-priority box gives way along its shallower overlap
    w = world_now()
    rep = audit(w)
    B = {b['id']: b for b in w['buildings']}

    def rank(b):
        n = b['n']
        if any(s in n for s in REPEATED):
            return 0
        if b['h'] < 0.1:
            return 1  # flat: reservoirs, solar fields
        if 'fence' in n:
            return 2
        # otherwise the smaller footprint gives way
        return 3 + sum((q[2] - q[0]) * (q[3] - q[1]) for q in b['b']) / 1000.0

    for ida, idb in rep['overlaps']:
        a, b = B[ida], B[idb]
        lo, hi = (a, b) if rank(a) <= rank(b) else (b, a)
        cur = fx['buildings'].get(str(lo['id']), {}).get('b') or [list(x) for x in lo['b']]
        out = []
        for box in cur:
            for hb in hi['b']:
                ox = min(box[2], hb[2]) - max(box[0], hb[0])
                oz = min(box[3], hb[3]) - max(box[1], hb[1])
                if ox <= 0.02 or oz <= 0.02:
                    continue
                if (box[2] - box[0]) * (box[3] - box[1]) < 1.0 and rank(lo) >= 3:
                    # a small structure (water tank, kiosk) moves out whole instead of being notched
                    if ox <= oz:
                        dx = (hb[0] - 0.05 - box[2]) if (box[0] + box[2]) / 2 < (hb[0] + hb[2]) / 2 else (hb[2] + 0.05 - box[0])
                        box = [box[0] + dx, box[1], box[2] + dx, box[3]]
                    else:
                        dz = (hb[1] - 0.05 - box[3]) if (box[1] + box[3]) / 2 < (hb[1] + hb[3]) / 2 else (hb[3] + 0.05 - box[1])
                        box = [box[0], box[1] + dz, box[2], box[3] + dz]
                    changed = True
                    log.append((lo['id'], lo['n'], f"{hi['id']} {hi['n']}", 'overlap shift', None, [R(v) for v in box]))
                    continue
                if ox <= oz:
                    if (box[0] + box[2]) / 2 < (hb[0] + hb[2]) / 2:
                        box = [box[0], box[1], hb[0] - 0.05, box[3]]
                    else:
                        box = [hb[2] + 0.05, box[1], box[2], box[3]]
                else:
                    if (box[1] + box[3]) / 2 < (hb[1] + hb[3]) / 2:
                        box = [box[0], box[1], box[2], hb[1] - 0.05]
                    else:
                        box = [box[0], hb[3] + 0.05, box[2], box[3]]
                changed = True
                log.append((lo['id'], lo['n'], f"{hi['id']} {hi['n']}", 'overlap trim', None, [R(v) for v in box]))
            if valid(box):
                out.append([R(v) for v in box])
        if out:
            fx['buildings'].setdefault(str(lo['id']), {})['b'] = out
    if not changed:
        break

# 10. palms: off carriageways and out of buildings, to the nearest spot clear of both
w = world_now()
rep = audit(w)
rsegs = [(a, b, r['w'] / 2) for r in w['roads'] if at_grade(r) for a, b in segs(r['p'])]
allb = [bb for b in w['buildings'] for bb in b['b']]


def clear(x, z):
    if any(bb[0] - 0.2 < x < bb[2] + 0.2 and bb[1] - 0.2 < z < bb[3] + 0.2 for bb in allb):
        return False
    return all(pt_seg((x, z), a, b) > hw + 0.3 for a, b, hw in rsegs if abs(a[0] - x) < 30 and abs(a[1] - z) < 30)


bad = {(x, z) for _, x, z, *_ in rep['palms_on_road']} | {(x, z) for _, x, z, *_ in rep['palms_in_building']}
orig = {(round(p[0], 2), round(p[1], 2)): p for p in palms}
for (x, z) in sorted(bad):
    p = orig.get((x, z))
    if not p:
        continue
    to = None
    for rad in [i * 0.25 for i in range(1, 40)]:
        for ang in range(0, 360, 15):
            cx, cz = x + rad * math.cos(math.radians(ang)), z + rad * math.sin(math.radians(ang))
            if clear(cx, cz):
                to = [R(cx), R(cz)]
                break
        if to:
            break
    if to:
        fx['palms'].append([[p[0], p[1]], to])

# fingerprint of the corrected world, checked by tests/world.test.ts against src/data/abudhabi.ts (keeps the
# TypeScript merge and the Python mirror in step)
w = world_now()
fx['meta']['expect'] = {
    'roads': len(w['roads']),
    'buildings': len(w['buildings']),
    'roadPoints': sum(len(r['p']) for r in w['roads']),
    'roadSum': R(sum(p[0] + 2 * p[1] for r in w['roads'] for p in r['p'])),
    'boxSum': R(sum(q[0] + q[1] + q[2] + q[3] for b in w['buildings'] for q in b['b'])),
    'palmSum': R(sum(p[0] + p[1] for p in w['palms'])),
}

FIXES_PATH.write_text(json.dumps(fx, separators=(',', ':')) + '\n')
print(f"roads added {len(fx['roads'])} · vertices moved {len(fx['moveVertex'])} dropped {len(fx['dropVertex'])} inserted {len(fx['insertVertex'])}"
      f" · buildings corrected {len(fx['buildings'])} · palms moved {len(fx['palms'])}")
big = [l for l in log if l[3] == 'trim' and l[4] and l[5] and max(abs(l[4][i] - l[5][0][i]) for i in range(4)) > 0.6]
from collections import Counter
print(f'footprint edits: {len(log)}', dict(Counter(l[3] for l in log)), f'; trims deeper than 6 m: {len(big)}')
for l in big[:30]:
    print('   ', l)
