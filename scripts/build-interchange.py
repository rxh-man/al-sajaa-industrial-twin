#!/usr/bin/env python3
"""Builds src/data/alsajaa-interchange.json: the Al Sajaa Interchange (procedural; not a real structure).

A two-level interchange on the open land south of the city, where Emirates Road E611 continues south:
  - level 1: the E611 main line on a flyover (7.5 m deck, 6.8 m clear) that climbs from z = 39 over 150 m (at
    most 7.5 %) and is back on the ground by z = 87; each carriageway has its own deck with parapets
  - level 0: a large two-lane roundabout under the flyover, with a landscaped centre island and palms
  - four one-way slip ramps at ground level: off the E611 before it climbs, onto it after it lands
  - the Al Sajaa Western Road west to the edge of the model, and a short link east into Al Sajaa Lagoons
Roads share node ids at every junction (traffic turns there). Elevated records carry a per-point height `y`,
which the decks, the piers and the traffic follow. scripts/validate-world.py checks the clearance wherever
roads cross at different levels.
"""
import json, math, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'src/data/alsajaa-interchange.json'
R = lambda v: round(v, 3)

CX, CZ = -68.0, 63.0     # roundabout centre, on the E611 line
RING_R = 7.5             # roundabout centre-line radius
RING_W = 1.6             # two lanes
DECK = 0.75              # flyover deck height (7.5 m: 6.8 m clear under the slab)
SB_X, NB_X = -66.9, -69.1
Z_RISE0, Z_RISE1 = 39.0, 54.0   # the main line climbs between these (full height before the roundabout's edge, z 54.7)
Z_FALL0, Z_FALL1 = 72.0, 87.0   # and comes down between these (after its far edge, z 71.3)
Z_SPLIT_N, Z_SPLIT_S = 41.0, 85.0   # slip ramps leave / join the main line here (at ground level)
Z_END = 92.0             # edge of the model (the plate)
WEST_END = -312.0

ids = {}


def nid(x, z, prefix='ix'):
    key = (R(x), R(z))
    if key not in ids:
        ids[key] = f'{prefix}_{R(x)}_{R(z)}'
    return ids[key]


def smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def main_y(z):
    if z <= Z_RISE0 or z >= Z_FALL1:
        return 0.0
    if z < Z_RISE1:
        return DECK * smooth((z - Z_RISE0) / (Z_RISE1 - Z_RISE0))
    if z > Z_FALL0:
        return DECK * (1 - smooth((z - Z_FALL0) / (Z_FALL1 - Z_FALL0)))
    return DECK


def zs(a, b, step=2.0):
    n = max(1, int(round(abs(b - a) / step)))
    return [a + (b - a) * i / n for i in range(n + 1)]


def road(name, cls, pts, w=1.0, fixed=None, **extra):
    pts = [[R(x), R(z)] for x, z in pts]
    k = [(fixed or {}).get((p[0], p[1])) or nid(*p) for p in pts]
    r = {'n': name, 'c': cls, 'w': w, 'o': 0, 't': 0, 'p': pts, 'k': k}
    r.update(extra)
    return r


roads = []
# E611 southbound (runs +z): ground from the old end at z = 34, flyover, ground to the edge
sb_ground_n = road('Emirates Road E611 southbound', 'trunk', [[SB_X, z] for z in zs(34.0, Z_SPLIT_N)], 1.9, {(SB_X, 34.0): 'e611a47'}, l=5, x=1)
sb_fly = road('Emirates Road E611 flyover southbound', 'trunk', [[SB_X, z] for z in zs(Z_SPLIT_N, Z_SPLIT_S, 1.0)], 1.9, l=5, x=1)
sb_fly['o'] = 1
sb_fly['y'] = [R(main_y(p[1])) for p in sb_fly['p']]
sb_ground_s = road('Emirates Road E611 southbound', 'trunk', [[SB_X, z] for z in zs(Z_SPLIT_S, Z_END)], 1.9, l=5, x=1)
# E611 northbound (runs -z): from the edge, flyover, to the old start at z = 34
nb_ground_s = road('Emirates Road E611 northbound', 'trunk', [[NB_X, z] for z in zs(Z_END, Z_SPLIT_S)], 1.9, l=5, x=1)
nb_fly = road('Emirates Road E611 flyover northbound', 'trunk', [[NB_X, z] for z in zs(Z_SPLIT_S, Z_SPLIT_N, 1.0)], 1.9, l=5, x=1)
nb_fly['o'] = 1
nb_fly['y'] = [R(main_y(p[1])) for p in nb_fly['p']]
# ends at the old northbound start (z = 34), sharing its node id so the two join
nb_ground_n = road('Emirates Road E611 northbound', 'trunk', [[NB_X, z] for z in zs(Z_SPLIT_N, 34.0)], 1.9, {(NB_X, 34.0): 'e611n0'}, l=5, x=1)
roads += [sb_ground_n, sb_fly, sb_ground_s, nb_ground_s, nb_fly, nb_ground_n]


def ring_pt(deg):
    a = math.radians(deg)
    # counter-clockwise seen from above with north (-z) up: UAE right-hand traffic
    return [CX + RING_R * math.cos(a), CZ - RING_R * math.sin(a)]


ring = road('Al Sajaa Interchange Roundabout', 'primary', [ring_pt(d) for d in [i * 7.5 for i in range(48)] + [0.0]], RING_W)
roads.append(ring)

# slip ramps (one-way, x = 1: the point order is the driving direction)
roads.append(road('E611 southbound exit ramp', 'primary', [[SB_X, Z_SPLIT_N], [-65.2, 43.0], [-63.8, 46.0], [-63.8, 52.0], ring_pt(60)], 1.0, x=1))
roads.append(road('E611 southbound entry ramp', 'primary', [ring_pt(300), [-63.8, 74.0], [-63.8, 80.0], [-65.2, 83.0], [SB_X, Z_SPLIT_S]], 1.0, x=1))
roads.append(road('E611 northbound exit ramp', 'primary', [[NB_X, Z_SPLIT_S], [-70.8, 83.0], [-72.2, 80.0], [-72.2, 74.0], ring_pt(240)], 1.0, x=1))
roads.append(road('E611 northbound entry ramp', 'primary', [ring_pt(120), [-72.2, 52.0], [-72.2, 46.0], [-70.8, 43.0], [NB_X, Z_SPLIT_N]], 1.0, x=1))

# Al Sajaa Western Road (west to the edge) and the east link into Al Sajaa Lagoons
west = [ring_pt(180)] + [[x, CZ] for x in zs(CX - RING_R - 2.0, WEST_END)]
roads.append(road('Al Sajaa Western Road', 'secondary', west, 1.4))
roads.append(road('Al Sajaa Interchange east link', 'secondary', [ring_pt(0), [-58.0, CZ]], 1.4, {(-58.0, CZ): 'lg_-58.0_63.0'}))

# ---- landscaping: the centre island, palms round it, lawns in the quadrants -----------------------------------
island_r = RING_R - RING_W / 2 - 0.35
palms = []
for i in range(36):
    a = math.radians(i * 10 + 5)
    x, z = CX + (island_r - 0.45) * math.cos(a), CZ - (island_r - 0.45) * math.sin(a)
    if NB_X - 1.6 < x < SB_X + 1.6:
        continue  # under the flyover
    palms.append([R(x), R(z), 1.0])
loops = []
for dx, dz in ((-3.6, -3.4), (3.6, -3.4), (-3.6, 3.4), (3.6, 3.4)):
    loops.append({'x': R(CX + dx), 'z': R(CZ + dz), 'r': 1.6})

data = {
    'meta': {'source': 'scripts/build-interchange.py', 'note': 'Procedural interchange (not a real structure)',
             'rect': {'minX': WEST_END, 'maxX': -56.0, 'minZ': 34.0, 'maxZ': Z_END}, 'deck': DECK, 'centre': [CX, CZ], 'ringR': RING_R, 'ringW': RING_W,
             'island': R(island_r)},
    'roads': roads,
    'palms': palms,
    'loops': loops,
}
OUT.write_text(json.dumps(data, separators=(',', ':')) + '\n')
print(f"roads {len(roads)} · palms {len(palms)} · deck {DECK} · flyover z {Z_RISE0}-{Z_FALL1}")
