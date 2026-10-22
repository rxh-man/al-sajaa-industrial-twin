#!/usr/bin/env python3
"""Procedural three-side expansion of the Al Sajaa twin.

Reads the original baseline (src/data/alsajaa.json) read-only and writes
src/data/alsajaa-expansion.json. Every record here is generated procedurally
(meta.source says so); nothing is claimed as surveyed or verified geography.

Scene units: 1 unit = 10 m. Baseline rect: x -152..120, z -80..46.
Expansion districts (outside the baseline rect, on three sides):
  West   Logistics district    x -232..-152, z -80..26
  North  Mixed industry/infra  x -232..120,  z -150..-80
  East   Residential district  x 120..196,   z -72..24
Streets sit on the 8-unit grid of the colony, so the west district's rows line
up with Rahmaniya Road rows. Where a new street meets a baseline point, the new
record reuses that point's road key so the traffic graph joins the two.

Run:  python3 scripts/build-expansion.py
"""
import json
import math
import pathlib
import random

ROOT = pathlib.Path(__file__).resolve().parents[1]
BASE = ROOT / 'src/data/alsajaa.json'
OUT = ROOT / 'src/data/alsajaa-expansion.json'

base = json.loads(BASE.read_text())
R = random.Random(20261021)
GAP = 0.9
UNIT_M = 10.0

DISTRICTS = {
    'west': {'n': 'Western Logistics District', 'x0': -232.0, 'x1': -152.0, 'z0': -80.0, 'z1': 26.0},
    'north': {'n': 'Northern Mixed District', 'x0': -232.0, 'x1': 120.0, 'z0': -150.0, 'z1': -80.0},
    'east': {'n': 'Eastern Residential District', 'x0': 120.0, 'x1': 196.0, 'z0': -72.0, 'z1': 24.0},
    # second ring, added beyond the first three districts
    'farwest': {'n': 'Far Western Freight Yards', 'x0': -312.0, 'x1': -232.0, 'z0': -80.0, 'z1': 26.0},
    'farnorth': {'n': 'Far Northern Industrial Zone', 'x0': -232.0, 'x1': 120.0, 'z0': -230.0, 'z1': -150.0},
}
NORTH_EDGE = DISTRICTS['farnorth']['z0']  # E611 runs to the far north edge


def coast_z(x):
    return 34 + 2.2 * math.sin(x / 16) + 1.2 * math.sin(x / 5.3)


# baseline point -> road key, so new streets can join existing junctions exactly
point_key = {}
for r in base['roads']:
    for p, k in zip(r['p'], r['k']):
        point_key[(round(p[0], 2), round(p[1], 2))] = k


def key_for(x, z, district):
    k = point_key.get((round(x, 2), round(z, 2)))
    return k if k is not None else f'ex_{round(x, 2)}_{round(z, 2)}'


roads = []
buildings = []
parks = []
palms = []
places = []
labels = []
bid = 900000  # ids well above the baseline range (~100000 + 748)


def add_road(name, cls, pts, district, tag):
    keys = [key_for(p[0], p[1], district) for p in pts]
    roads.append({'n': name, 'c': cls, 'w': 1.0, 'o': 0, 't': 0, 'p': pts, 'k': keys,
                  'd': district, 'procedural': True, 'tag': tag})


def add_building(name, kind, h, x, z, w, d, district):
    global bid
    bid += 1
    buildings.append({'id': bid, 'n': name, 'k': kind, 'h': round(h, 2), 'y': 0,
                      'c': [round(x, 2), round(z, 2)],
                      'b': [[round(x - w / 2, 2), round(z - d / 2, 2), round(x + w / 2, 2), round(z + d / 2, 2)]],
                      'd': district, 'procedural': True})


def add_park(name, x0, x1, z0, z1, district):
    parks.append({'n': name, 'p': [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], 'd': district, 'procedural': True})


E611_XS = (-69.1, -66.9)   # the two E611 carriageways (baseline x at z = -60)


COVER = {}   # (axis, fixed coordinate) -> list of (start, end) intervals already drawn


def split_uncovered(axis, fixed, samples):
    """Split a sampled line into runs that do not lie on a street already drawn at the same
    coordinate, so two districts never draw the same stretch of road twice."""
    spans = COVER.setdefault((axis, fixed), [])
    runs, cur = [], []
    for v in samples:
        if any(a + 1e-6 < v < b - 1e-6 for a, b in spans):
            if len(cur) >= 2:
                runs.append(cur)
            cur = []
            continue
        cur.append(v)
    if len(cur) >= 2:
        runs.append(cur)
    for run in runs:
        spans.append((run[0], run[-1]))
    return runs


def grid_streets(name, dist, did, extra_rows=()):
    """Grid streets every 8 units across a district, lines aligned to the 8-unit colony grid.
    Points are sampled every 2 units so that junctions with baseline roads land on exact points."""
    xs = [dist['x0'] + 8 * i for i in range(int((dist['x1'] - dist['x0']) // 8) + 1)]
    zs = sorted(set([dist['z0'] + 8 * j for j in range(int((dist['z1'] - dist['z0']) // 8) + 1)] + list(extra_rows)))
    zsamp = [round(dist['z0'] + 2 * k, 2) for k in range(int((dist['z1'] - dist['z0']) // 2) + 1)]
    for i, x in enumerate(xs):
        cls = 'secondary' if i % 3 == 0 else 'residential'
        for n, run in enumerate(split_uncovered('z', round(x, 2), zsamp)):
            pts = [[round(x, 2), z] for z in run]
            add_road(f'{name} Street {i + 1}' + (f' part {n + 1}' if n else ''), cls, pts, did, f'{did}-v{i}')
    for j, z in enumerate(zs):
        xsamp = [round(dist['x0'] + 2 * k, 2) for k in range(int((dist['x1'] - dist['x0']) // 2) + 1)]
        if did in ('north', 'farnorth'):
            xsamp = sorted(set(xsamp) | set(E611_XS))
        cls = 'secondary' if j % 3 == 0 else 'residential'
        for n, run in enumerate(split_uncovered('x', round(z, 2), xsamp)):
            pts = [[x, round(z, 2)] for x in run]
            add_road(f'{name} Road {j + 1}' + (f' part {n + 1}' if n else ''), cls, pts, did, f'{did}-h{j}')


RESERVED = set()   # (cell x, cell z) keys held for landmarks, so no plot is placed there


def block_fill(dist, did, kinds):
    """Fill every 8-unit cell of a district with plots of its land use. Cells are clipped to the
    district edge, so a plot never runs over the boundary street."""
    x = dist['x0']
    while x < dist['x1'] - 1e-6:
        z = dist['z0']
        while z < dist['z1'] - 1e-6:
            if (round(x, 2), round(z, 2)) not in RESERVED:
                x0, x1 = x + GAP, min(x + 8, dist['x1']) - GAP
                z0, z1 = z + GAP, min(z + 8, dist['z1']) - GAP
                if x1 - x0 >= 4 and z1 - z0 >= 4 and z1 < coast_z((x0 + x1) / 2) - 2.5:
                    mx, mz = (x0 + x1) / 2, (z0 + z1) / 2
                    kinds(did, mx, mz, x1 - x0, z1 - z0)
            z += 8
        x += 8


def logistics_block(did, mx, mz, w, d):
    r = R.random()
    if r < 0.45:
        add_building('Logistics warehouse', 'building', R.uniform(0.8, 1.0), mx, mz - d * 0.2, w * 0.92, d * 0.5, did)
        add_building('Loading office', 'office', R.uniform(0.5, 0.7), mx, mz + d * 0.3, w * 0.5, d * 0.25, did)
    elif r < 0.75:
        for k in range(R.randint(2, 4)):
            add_building('Container stack', 'building', R.uniform(0.35, 0.45),
                         mx - w * 0.36 + k * w * 0.24, mz, w * 0.14, d * 0.7, did)
    else:
        add_building('Truck depot', 'building', R.uniform(0.5, 0.6), mx, mz, w * 0.9, d * 0.8, did)


def mixed_block(did, mx, mz, w, d):
    r = R.random()
    if r < 0.3:
        add_building('Workshop', 'building', R.uniform(0.6, 0.9), mx, mz, w * 0.85, d * 0.75, did)
    elif r < 0.55:
        add_building('Factory hall', 'building', R.uniform(0.9, 1.2), mx, mz, w * 0.9, d * 0.7, did)
    elif r < 0.75:
        add_building('Service office', 'office', R.uniform(1.0, 1.4), mx, mz, w * 0.6, d * 0.6, did)
    elif r < 0.9:
        add_building('Substation', 'utility', 0.5, mx, mz, w * 0.6, d * 0.6, did)
    else:
        add_park('Industrial green buffer', mx - w / 2, mx + w / 2, mz - d / 2, mz + d / 2, did)


def residential_block(did, mx, mz, w, d):
    r = R.random()
    if r < 0.4:
        add_building('Emirati villa', 'house', R.uniform(0.7, 0.9), mx, mz, w * 0.62, d * 0.5, did)
        palms.append([round(mx + w * 0.35, 2), round(mz + d * 0.3, 2), 1.0])
    elif r < 0.7:
        add_building('Townhouse', 'residential', R.uniform(0.6, 0.8), mx, mz, w * 0.75, d * 0.6, did)
    elif r < 0.85:
        add_building('Apartment block', 'residential', R.uniform(1.2, 1.6), mx, mz, w * 0.7, d * 0.7, did)
    else:
        add_park('Community park', mx - w / 2, mx + w / 2, mz - d / 2, mz + d / 2, did)


KIND_FOR = {'west': logistics_block, 'north': mixed_block, 'east': residential_block,
            'farwest': logistics_block, 'farnorth': mixed_block}

# Public landmarks sit at the centre of their own 8-unit cell, so they never cross a street.
# Each cell is reserved before the plots are filled, so no plot overlaps a landmark.
LANDMARK_CELLS = [
    # (cell x0, cell z0, name, kind, height, role)
    (144.0, -64.0, 'Community mosque', 'mosque', 2.0, 'mosque'),
    (168.0, 0.0, 'District school', 'school', 1.2, 'landmark'),
    (176.0, -24.0, 'District mall', 'mall', 1.2, 'mall'),
]
# Court and Police Station: no facility is confirmed in the OpenStreetMap extracts, so they are labelled
# markers at the district centre (no building is invented).
DISTRICT_CENTRE = (-16.0, -17.0)  # centre of the baseline rectangle
for nm, dz in (('Court (to be placed manually)', 3.0), ('Police Station (to be placed manually)', -3.0)):
    places.append({'role': 'landmark', 'n': nm, 'x': DISTRICT_CENTRE[0], 'z': DISTRICT_CENTRE[1] + dz, 'h': 1.0})

for cx0, cz0, nm, kind, h, role in LANDMARK_CELLS:
    RESERVED.add((round(cx0, 2), round(cz0, 2)))
    cx, cz = cx0 + 4.0, cz0 + 4.0
    add_building(nm, kind, h, cx, cz, 8 - 2 * (GAP + 0.6), 8 - 2 * (GAP + 0.6), 'east')
    places.append({'role': role, 'n': nm if kind != 'mosque' else 'Community mosque (east)', 'x': cx, 'z': cz, 'h': h + 1.0})

# the east district's first row joins the baseline E88 end point (x = 120)
e88_end = [r for r in base['roads'] if r['n'] == 'Emirates Road E88'][-1]['p'][-1]
for did, dist in DISTRICTS.items():
    if did in ('farwest', 'farnorth'):
        pass  # second ring: its own grid, deduplicated against the first ring
    grid_streets(dist['n'], dist, did, extra_rows=[round(e88_end[1], 2)] if did == 'east' else ())
    block_fill(dist, did, KIND_FOR[did])
    labels.append({'n': dist['n'], 'x': round((dist['x0'] + dist['x1']) / 2, 2),
                   'z': round(dist['z0'] + 2.0, 2), 'a': 0.0})

# land: rectangles of the three districts, clipped to the coast on the south side
land_polys = []
for did, dist in DISTRICTS.items():
    poly = [[dist['x0'], dist['z0']], [dist['x1'], dist['z0']], [dist['x1'], dist['z1']], [dist['x0'], dist['z1']]]
    land_polys.append({'d': did, 'p': poly})

# Emirates Road E611 continues north from the baseline end at z = -60 to the north edge (z = -150).
# Each carriageway keeps its baseline direction and lane count; its first point reuses the baseline key.
N_STEPS = int(round((-60 - NORTH_EDGE) / 2))
south_ext = [[-66.9, z] for z in [round(NORTH_EDGE + 2 * k, 2) for k in range(0, N_STEPS + 1)]]   # north edge .. -60, flows +z
north_ext = [[-69.1, z] for z in [round(-60 - 2 * k, 2) for k in range(0, N_STEPS + 1)]]          # -60 .. north edge, flows -z
for nm, pts_, tag in (('Emirates Road E611 southbound', south_ext, 'e611a_ext'),
                      ('Emirates Road E611 northbound', north_ext, 'e611n_ext')):
    roads.append({'n': nm, 'c': 'trunk', 'w': 1.9, 'o': 0, 't': 0, 'l': 5, 'x': 1, 'p': pts_,
                  'k': [key_for(q[0], q[1], 'north') for q in pts_], 'd': 'north', 'procedural': True, 'tag': tag})

# Specification: at least 50 m (5 units) of grass between a highway and any building.
# Plots that fall inside that verge are removed, which leaves a clear grass strip along E611.
GRASS_BUFFER = 5.0


def dist_to_segment(px, pz, ax, az, bx, bz):
    dx, dz = bx - ax, bz - az
    t = 0.0 if dx == dz == 0 else max(0.0, min(1.0, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)))
    return math.hypot(ax + dx * t - px, az + dz * t - pz)


def box_clear_of_highway(box):
    x0, z0, x1, z1 = box
    for r in roads:
        if r['c'] != 'trunk':
            continue
        half = r['w'] / 2 + GRASS_BUFFER
        pts = r['p']
        for (ax, az), (bx, bz) in zip(pts, pts[1:]):
            # sample the footprint at 0.5-unit steps; a building is clear if no sample is inside the verge
            for i in range(int((x1 - x0) / 0.5) + 1):
                for j in range(int((z1 - z0) / 0.5) + 1):
                    px, pz = x0 + i * 0.5 * (x1 - x0) / max(1, int((x1 - x0) / 0.5)), z0 + j * 0.5 * (z1 - z0) / max(1, int((z1 - z0) / 0.5))
                    if dist_to_segment(px, pz, ax, az, bx, bz) < half:
                        return False
    return True


_before = len(buildings)
buildings[:] = [b_ for b_ in buildings if box_clear_of_highway(b_['b'][0])]
print(f'removed {_before - len(buildings)} plots inside the {GRASS_BUFFER}-unit highway verge')

# bounds of the combined world (baseline + expansion)
all_x = [v for d in DISTRICTS.values() for v in (d['x0'], d['x1'])]
all_z = [v for d in DISTRICTS.values() for v in (d['z0'], d['z1'])]
new_rect = {'minX': min(all_x + [base['meta']['rect']['minX']]), 'maxX': max(all_x + [base['meta']['rect']['maxX']]),
            'minZ': min(all_z + [base['meta']['rect']['minZ']]), 'maxZ': max(all_z + [base['meta']['rect']['maxZ']])}

expansion_area = sum((d['x1'] - d['x0']) * (d['z1'] - d['z0']) for d in DISTRICTS.values())
base_area = (base['meta']['rect']['maxX'] - base['meta']['rect']['minX']) * (base['meta']['rect']['maxZ'] - base['meta']['rect']['minZ'])
data = {
    'meta': {
        'source': 'Procedural expansion of the Al Sajaa layout (not survey or OSM data)',
        'procedural': True,
        'unitMeters': UNIT_M,
        'baselineRect': base['meta']['rect'],
        'combinedRect': new_rect,
        'baseAreaUnits': base_area,
        'expansionAreaUnits': expansion_area,
        'coverageRatio': round((base_area + expansion_area) / base_area, 2),
        'districts': DISTRICTS,
    },
    'land': land_polys,
    'roads': roads,
    'buildings': buildings,
    'parks': parks,
    'palms': palms,
    'places': places,
    'labels': labels,
}
OUT.write_text(json.dumps(data, separators=(',', ':')) + '\n')
print(f"roads {len(roads)} buildings {len(buildings)} parks {len(parks)} palms {len(palms)} "
      f"places {len(places)} labels {len(labels)} land {len(land_polys)}")
print(f"base area {base_area} units2, expansion {expansion_area} units2, "
      f"combined/base = {data['meta']['coverageRatio']}x")
