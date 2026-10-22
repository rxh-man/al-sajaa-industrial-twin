"""Checks the station parking in src/data/parking.json against the combined world.

Fails when the parking, its access lane or pedestrian link overlaps a road (with its half-width),
a building footprint, the rail band, a park, or leaves the combined world bounds.
Run: python3 scripts/validate-parking.py   (exit code 1 on any failure)
"""
import json
import sys

BASE = json.load(open('src/data/alsajaa.json'))
EXP = json.load(open('src/data/alsajaa-expansion.json'))
P = json.load(open('src/data/parking.json'))
x0, z0, x1, z1 = P['rect']
fails = []
MARGIN = 0.3  # 3 m clearance around the parking rectangle


def inside_rect(x, z, pad):
    return x0 - pad <= x <= x1 + pad and z0 - pad <= z <= z1 + pad


def seg_hits_rect(a, b, pad, half=0.0):
    (ax, az), (bx, bz) = a, b
    n = max(2, int(max(abs(bx - ax), abs(bz - az)) / 0.05))
    for i in range(n + 1):
        t = i / n
        if inside_rect(ax + (bx - ax) * t, az + (bz - az) * t, pad + half):
            return True
    return False


def polyline_hits_rect(pts, pad, half=0.0):
    return any(seg_hits_rect(pts[i], pts[i + 1], pad, half) for i in range(len(pts) - 1))


roads = BASE['roads'] + EXP['roads']
for r in roads:
    half = (r.get('w') or 1.0) / 2
    # a rail band is wider than its line once ballast is painted (see groundMap.ts: w + 0.9 / 2)
    if r['c'] == 'rail':
        half = (r.get('w') or 1.0) / 2 + 0.45
    if polyline_hits_rect(r['p'], MARGIN, half):
        fails.append(f"parking within {half + MARGIN:.2f} units of road {r['n']} ({r['c']})")

for name, d in (('base', BASE), ('exp', EXP)):
    for bl in d['buildings']:
        for rect in bl.get('b', []):
            bx0, bz0, bx1, bz1 = rect
            if not (bx1 < x0 - MARGIN or bx0 > x1 + MARGIN or bz1 < z0 - MARGIN or bz0 > z1 + MARGIN):
                fails.append(f"parking overlaps building {bl['n']} ({name})")

for name, d in (('base', BASE), ('exp', EXP)):
    for p in d.get('parks', []):
        xs = [q[0] for q in p['p']]
        zs = [q[1] for q in p['p']]
        if not (max(xs) < x0 or min(xs) > x1 or max(zs) < z0 or min(zs) > z1):
            fails.append(f"parking overlaps park {p.get('n')} ({name})")

# the lane and walk must reach the parking and the station side of E88
for key in ('access', 'walk'):
    pts = P[key]
    if not (inside_rect(*pts[0], 0.0) or inside_rect(*pts[-1], 0.0)):
        fails.append(f"{key} does not touch the parking rectangle")

# combined world bounds (baseline rect and expansion rect)
bounds = [BASE['meta']['rect'], EXP['meta']['rect']] if 'rect' in EXP.get('meta', {}) else [BASE['meta']['rect']]
WORLD = {'minX': min(b['minX'] for b in bounds), 'maxX': max(b['maxX'] for b in bounds),
         'minZ': min(b['minZ'] for b in bounds), 'maxZ': max(b['maxZ'] for b in bounds)}
if not (WORLD['minX'] <= x0 and x1 <= WORLD['maxX'] and WORLD['minZ'] <= z0 and z1 <= WORLD['maxZ']):
    fails.append(f"parking outside combined bounds {WORLD}")

print(f"parking rect {P['rect']}: {len(roads)} road records, world {WORLD}")
if fails:
    for f in fails:
        print('FAIL', f)
    sys.exit(1)
print('PASS parking clear of roads, buildings, rail and parks; inside world bounds')
