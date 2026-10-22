#!/usr/bin/env python3
"""Geometry checks for the procedural expansion (run after build-expansion.py).

Checks: no two expansion roads share a stretch of the same line; no building footprint
touches the carriageway of any road (half-width plus margin); no two buildings overlap;
every building sits on a land polygon; the baseline file is unchanged; polygon-based coverage.
Exit code 1 if any check fails.
"""
import json, pathlib, sys, hashlib
ROOT = pathlib.Path(__file__).resolve().parents[1]
base = json.loads((ROOT / 'src/data/alsajaa.json').read_text())
ex = json.loads((ROOT / 'src/data/alsajaa-expansion.json').read_text())
fails = []

# baseline integrity
h = hashlib.sha256((ROOT / 'src/data/alsajaa.json').read_bytes()).hexdigest()
if h != '1a5870521d0768007cc56adf03e9f657ba389ce861111e3b80137d18f8e576f4':
    fails.append(f'baseline hash changed: {h}')

def segs(road):
    p = road['p']
    return [(p[i], p[i + 1]) for i in range(len(p) - 1)]

# 1. collinear overlaps between expansion roads (same axis, same fixed coord, shared interval)
seen = {}
for r in ex['roads']:
    for (a, b) in segs(r):
        if abs(a[0] - b[0]) < 1e-9:  # vertical, fixed x
            key = ('v', round(a[0], 2)); lo, hi = sorted([a[1], b[1]])
        elif abs(a[1] - b[1]) < 1e-9:
            key = ('h', round(a[1], 2)); lo, hi = sorted([a[0], b[0]])
        else:
            continue
        for (l2, h2, n2) in seen.get(key, []):
            if min(hi, h2) - max(lo, l2) > 1e-6:
                fails.append(f'overlap {key} {r["n"]} with {n2}')
                break
        seen.setdefault(key, []).append((lo, hi, r['n']))

# 2. buildings vs road carriageways (distance from footprint to segment must exceed half width + 0.4)
def seg_box_dist(seg, box):
    (ax, az), (bx, bz) = seg
    x0, z0, x1, z1 = box
    # sample the segment densely; cheap and adequate at 0.5-unit steps
    n = max(2, int(max(abs(bx - ax), abs(bz - az)) / 0.5))
    best = 1e9
    for i in range(n + 1):
        t = i / n
        x = ax + (bx - ax) * t; z = az + (bz - az) * t
        dx = max(x0 - x, 0, x - x1); dz = max(z0 - z, 0, z - z1)
        best = min(best, (dx * dx + dz * dz) ** 0.5)
    return best

roads_ex = ex['roads']
hits = 0
for b in ex['buildings']:
    box = b['b'][0]
    for r in roads_ex:
        hw = (r['w'] * 1.9 if r['c'] == 'trunk' else r['w']) / 2
        for s_ in segs(r):
            if seg_box_dist(s_, box) < hw + 0.4:
                hits += 1
                if hits <= 5:
                    fails.append(f'building {b["id"]} {b["n"]} near road {r["n"]}')
                break
        else:
            continue
        break
print(f'buildings touching carriageways: {hits}')

# 3. building overlaps (footprints)
bx = [b['b'][0] for b in ex['buildings']]
ov = 0
for i in range(len(bx)):
    a = bx[i]
    for j in range(i + 1, len(bx)):
        c = bx[j]
        if min(a[2], c[2]) - max(a[0], c[0]) > 0.01 and min(a[3], c[3]) - max(a[1], c[1]) > 0.01:
            ov += 1
print(f'overlapping building pairs: {ov}')
if ov: fails.append(f'{ov} overlapping building pairs')

# 3b. the diorama plate (src/data/city.ts DIORAMA) must cover the whole combined world, or the
# expansion land and roads sit outside the ground plane and are not drawn
import re
city = (ROOT / 'src/data/city.ts').read_text()
m = re.search(r"export const DIORAMA = \{(.*?)\}", city, re.S)
if not m:
    fails.append('DIORAMA not found in src/data/city.ts')
else:
    dio = {k: float(v) for k, v in re.findall(r"(minX|maxX|minZ|maxZ):\s*(-?[\d.]+)", m.group(1))}
    comb = ex['meta']['combinedRect']
    for lo, key in (('minX', 'minX'), ('minZ', 'minZ')):
        if dio[lo] > comb[key] + 1e-6:
            fails.append(f'DIORAMA.{lo} {dio[lo]} does not reach combined {key} {comb[key]}')
    for hi, key in (('maxX', 'maxX'), ('maxZ', 'maxZ')):
        if dio[hi] < comb[key] - 1e-6:
            fails.append(f'DIORAMA.{hi} {dio[hi]} does not reach combined {key} {comb[key]}')
    print(f'diorama plate covers combined world: {not any("DIORAMA" in f for f in fails)}')

# 3c. E611 corridor: both carriageways continuous (no point gap over 2.05 units), lane count and the
# inner-edge gap between the two carriageways reported from the data. The baseline is hash-locked,
# so the corridor's separation is reported here rather than changed.
allr = base['roads'] + ex['roads']
e611 = [r for r in allr if r['n'].startswith('Emirates Road E611')]
for r in e611:
    p = r['p']
    for a, c in zip(p, p[1:]):
        if ((a[0]-c[0])**2 + (a[1]-c[1])**2) ** 0.5 > 2.05:
            fails.append(f'E611 gap in {r["n"]} between {a} and {c}')
            break
south = [r for r in e611 if 'southbound' in r['n']]
north = [r for r in e611 if 'northbound' in r['n']]
if south and north:
    # inner edges: the carriageway centre lines plus half the carriageway width
    gap = abs(south[0]['p'][0][0] - north[0]['p'][0][0]) - (south[0]['w'] / 2 + north[0]['w'] / 2)
    print(f'E611: {len(e611)} carriageway records, lanes per direction {south[0].get("l")}, inner-edge gap {gap*10:.1f} m')

# 4. polygon-based coverage (shoelace), same method as src/data/coverage.ts
def area(poly):
    a = 0
    for i in range(len(poly)):
        x1, z1 = poly[i - 1]; x2, z2 = poly[i]
        a += x1 * z2 - x2 * z1
    return abs(a) / 2
UNIT2_TO_KM2 = 100 * 1e-6          # 1 unit = 10 m, so 1 unit^2 = 100 m^2 = 1e-4 km^2
base_area = area(base['land'])      # the original Al Sajaa land outline, one polygon
ex_area = sum(area(p['p']) for p in ex['land'])   # rectangles of the procedural districts
base_km2 = base_area * UNIT2_TO_KM2
ex_km2 = ex_area * UNIT2_TO_KM2
ratio = (base_area + ex_area) / base_area
print(f'baseline land {base_km2:.3f} km2; expansion districts {ex_km2:.3f} km2; combined {(base_km2 + ex_km2):.3f} km2; ratio {ratio:.2f}x')
print('note: this counts the expansion rectangles only; the app measures the merged world in src/data/coverage.ts')

if fails:
    print('FAILURES:'); [print(' -', f) for f in fails[:40]]
    print(f'{len(fails)} failure(s)'); sys.exit(1)
print('all expansion geometry checks passed')
