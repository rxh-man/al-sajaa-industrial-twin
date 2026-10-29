#!/usr/bin/env python3
"""Builds src/data/alsajaa-lagoons.json: "Al Sajaa Lagoons", a master-planned waterfront villa community on the
open land south of the South Road (procedural; not survey data, not a real development).

Layout (scene units, 1 = 10 m; the plate already reaches z = 92 here):
  - a winding lagoon across the district with rounded ends, and a park lake
  - Lagoon Drive: a ring road on both banks that wraps round the lagoon's ends, plus one bridge across the middle
  - Lagoons North Road (z = 41) and Lagoons South Road (z = 87), joined to the ring by side streets
  - three entrances from the Al Sajaa South Road (at the ends of Streets 8, 14 and 20)
  - villas along every street, turned to follow its curve; the waterfront rows have pools and gardens to the water
  - a central park with a football pitch, a domed community centre and lawns; palms along the promenades
Roads share node ids at every junction (traffic turns there); src/data/abudhabi.ts merges them into the world.
Checked by scripts/validate-world.py (roads, villas vs roads and water, overlaps, connectivity).
"""
import json, math, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'src/data/alsajaa-lagoons.json'
R = lambda v: round(v, 3)
TAU = math.pi * 2

X0, X1 = -54.0, 104.0          # ring road ends (west, east)
CX0, CX1 = -47.0, 97.0         # lagoon ends (centres of the rounded caps)
ZN, ZS = 41.0, 87.0            # north and south boundary roads
GAP = 3.9                      # lagoon edge to ring road centre line


def zc(x):
    """lagoon centre line"""
    u = (x + 58) / 120
    return 65 + 7 * math.sin(TAU * u) + 2 * math.sin(TAU * (x + 58) / 47)


def hw(x):
    """lagoon half width"""
    return 2.2 + 0.6 * math.sin(TAU * (x + 58) / 63 + 1)


def ring_n(x):
    return zc(x) - hw(x) - GAP


def ring_s(x):
    return zc(x) + hw(x) + GAP


def xs(a, b, step):
    n = max(1, int(round((b - a) / step)))
    return [a + (b - a) * i / n for i in range(n + 1)]


ids = {}


def nid(x, z):
    key = (R(x), R(z))
    if key not in ids:
        ids[key] = f'lg_{R(x)}_{R(z)}'
    return ids[key]


def road(name, cls, pts, w=1.0, keep_ids=None):
    pts = [[R(x), R(z)] for x, z in pts]
    out = [pts[0]]
    for p in pts[1:]:
        if math.hypot(p[0] - out[-1][0], p[1] - out[-1][1]) > 1e-6:
            out.append(p)
    k = [(keep_ids or {}).get((p[0], p[1])) or nid(*p) for p in out]
    return {'n': name, 'c': cls, 'w': w, 'o': 0, 't': 0, 'p': out, 'k': k, 'lagoon': 1}


# ---- water --------------------------------------------------------------------------------------------
lag_x = xs(CX0, CX1, 1.0)
north_edge = [[x, zc(x) - hw(x)] for x in lag_x]
south_edge = [[x, zc(x) + hw(x)] for x in lag_x]
cap = lambda cx, cz, r, a0, a1: [[cx + r * math.cos(a), cz + r * math.sin(a)] for a in [a0 + (a1 - a0) * i / 12 for i in range(1, 12)]]
east_cap = cap(CX1, zc(CX1), hw(CX1), -math.pi / 2, math.pi / 2)
west_cap = cap(CX0, zc(CX0), hw(CX0), math.pi / 2, 3 * math.pi / 2)
lagoon = north_edge + east_cap + south_edge[::-1] + west_cap
lake = [[28 + 4.2 * math.cos(a), 44.6 + 1.6 * math.sin(a)] for a in [TAU * i / 32 for i in range(32)]]
water = [[[R(x), R(z)] for x, z in lagoon], [[R(x), R(z)] for x, z in lake]]

# ---- roads -------------------------------------------------------------------------------------------
side_x = [-46.0, -30.0, -14.0, 2.0, 50.0, 66.0, 82.0, 98.0]           # side streets (the park spans x 8..40 on the north)
side_x_s = [-46.0, -30.0, -14.0, 2.0, 18.0, 34.0, 50.0, 66.0, 82.0, 98.0]
ENTR = [(-6.86, 30.0, 'v7_41'), (39.65, 34.0, 'v13_43'), (87.71, 30.0, 'v19_41')]  # South Road junctions
BRIDGE_X = 26.0
roads = []
ring_north = [[x, ring_n(x)] for x in sorted(set(xs(X0, X1, 2.0) + side_x + [BRIDGE_X]))]
ring_south = [[x, ring_s(x)] for x in sorted(set(xs(X0, X1, 2.0) + side_x_s + [BRIDGE_X]))]
# ring ends run straight between the boundary roads, round the lagoon's caps
roads.append(road('Lagoon Drive North', 'secondary', ring_north))
roads.append(road('Lagoon Drive South', 'secondary', ring_south))
for x, name in ((X0, 'Lagoons West Avenue'), (X1, 'Lagoons East Avenue')):
    # boundary road to boundary road, through the ring's two ends
    pts = sorted([[x, z] for z in xs(ZN, ZS, 2.0)] + [[x, ring_n(x)], [x, ring_s(x)]], key=lambda p: p[1])
    roads.append(road(name, 'secondary', pts))
north_x = sorted(set(xs(X0, X1, 2.0) + side_x + [e[0] for e in ENTR]))
roads.append(road('Lagoons North Road', 'secondary', [[x, ZN] for x in north_x]))
roads.append(road('Lagoons South Road', 'secondary', [[x, ZS] for x in sorted(set(xs(X0, X1, 2.0) + side_x_s))]))
# crescents: a curving lane through the middle of each wide block, parallel to Lagoon Drive, from side street
# to side street (so both ends are junctions), with villas on both sides
mid_n = lambda x: (ZN + ring_n(x)) / 2
mid_s = lambda x: (ZS + ring_s(x)) / 2
cres_n, cres_s = [], []
for xa, xb in zip(side_x, side_x[1:]):
    if xb - xa > 20 or not all(ring_n(x) - ZN >= 9.4 for x in xs(xa, xb, 1.0)):
        continue
    cres_n.append((xa, xb))
    roads.append(road(f'Lagoons North Crescent {int(xa)}', 'residential', [[x, mid_n(x)] for x in xs(xa, xb, 2.0)]))
for xa, xb in zip(side_x_s, side_x_s[1:]):
    if xb - xa > 20 or not all(ZS - ring_s(x) >= 9.4 for x in xs(xa, xb, 1.0)):
        continue
    cres_s.append((xa, xb))
    roads.append(road(f'Lagoons South Crescent {int(xa)}', 'residential', [[x, mid_s(x)] for x in xs(xa, xb, 2.0)]))
# side streets carry a vertex wherever a crescent meets them
for x in side_x:
    extra = [mid_n(x) for xa, xb in cres_n if x in (xa, xb)]
    zs = sorted(set([R(z) for z in xs(ZN, ring_n(x), 2.0)][1:-1] + [R(z) for z in extra]))
    roads.append(road(f'Lagoons North Lane {int(x)}', 'residential', [[x, ZN]] + [[x, z] for z in zs] + [[x, ring_n(x)]]))
for x in side_x_s:
    extra = [mid_s(x) for xa, xb in cres_s if x in (xa, xb)]
    zs = sorted(set([R(z) for z in xs(ring_s(x), ZS, 2.0)][1:-1] + [R(z) for z in extra]))
    roads.append(road(f'Lagoons South Lane {int(x)}', 'residential', [[x, ring_s(x)]] + [[x, z] for z in zs] + [[x, ZS]]))
for x, z, sid in ENTR:
    pts = [[x, z]] + [[x, q] for q in xs(z, ZN, 2.0)][1:-1] + [[x, ZN]]
    roads.append(road(f'Lagoons Gate {int(round(x))}', 'secondary', pts, keep_ids={(R(x), R(z)): sid}))
bridge = road('Lagoon Bridge', 'residential', [[BRIDGE_X, ring_n(BRIDGE_X)], [BRIDGE_X, zc(BRIDGE_X)], [BRIDGE_X, ring_s(BRIDGE_X)]])
bridge['bridge'] = 1
roads.append(bridge)

# ---- geometry helpers ------------------------------------------------------------------------------------
segs_all = [(r, r['p'][i], r['p'][i + 1]) for r in roads for i in range(len(r['p']) - 1)]


def pt_seg(p, a, b):
    dx, dz = b[0] - a[0], b[1] - a[1]
    L2 = dx * dx + dz * dz or 1e-12
    t = max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2))
    return math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dz))


def kerb(p):
    return min(pt_seg(p, a, b) - r['w'] / 2 for r, a, b in segs_all)


def in_poly(x, z, poly):
    inside = False
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, zi = poly[i]; xj, zj = poly[j]
        if (zi > z) != (zj > z) and x < (xj - xi) * (z - zi) / (zj - zi) + xi:
            inside = not inside
        j = i
    return inside


def water_dist(x, z):
    """distance to open water (0 inside)"""
    if any(in_poly(x, z, w) for w in water):
        return 0.0
    best = 1e9
    for w in water:
        for i in range(len(w)):
            best = min(best, pt_seg((x, z), w[i], w[(i + 1) % len(w)]))
    return best


def corners(cx, cz, yaw, w, d):
    ux, uz = math.sin(yaw), math.cos(yaw)       # along the depth (front to back)
    vx, vz = uz, -ux                            # along the width
    out = []
    for a in (-0.5, 0.5):
        for b in (-0.5, 0.5):
            out.append((cx + ux * d * a + vx * w * b, cz + uz * d * a + vz * w * b))
    out.append((cx, cz))
    for a in (-0.5, 0.5):
        out.append((cx + ux * d * a, cz + uz * d * a))
        out.append((cx + vx * w * a, cz + vz * w * a))
    return out


PARK = (8.0, ZN + 0.6, 40.0, 49.6)          # x0, z0, x1, z1 (north of the ring, by the lake)
def in_park(x, z):
    return PARK[0] - 0.4 < x < PARK[2] + 0.4 and PARK[1] - 0.4 < z < PARK[3] + 0.4


# ---- villas ---------------------------------------------------------------------------------------------
villas = []
cars = []
CAR_KINDS = ['largeSuv', 'suv', 'luxurySedan', 'sedan', 'crossover', 'boxSuv', 'largeSuv', 'coupe', 'sedan', 'suv']
placed = []        # (x, z, r) discs for spacing


def free(cs, r_clear):
    for x, z in cs:
        if kerb((x, z)) < 0.18 or water_dist(x, z) < 0.25 or in_park(x, z):
            return False
        if not (X0 - 1.5 < x < X1 + 1.5 and ZN - 0.5 < z < ZS + 0.5):
            return False
    cx, cz = cs[4]
    return all(math.hypot(cx - px, cz - pz) > r_clear + pr for px, pz, pr in placed)


TINTS = [[0.95, 0.94, 0.91], [0.93, 0.92, 0.88], [0.97, 0.96, 0.93], [0.9, 0.86, 0.78], [0.88, 0.82, 0.72]]
h = 0
for r in roads:
    if r.get('bridge') or r['n'].startswith('Lagoons Gate'):
        continue
    pts = r['p']
    for i in range(len(pts) - 1):
        a, b = pts[i], pts[i + 1]
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        if L < 1e-6:
            continue
        tx, tz = (b[0] - a[0]) / L, (b[1] - a[1]) / L
        s = 0.8
        while s < L:
            px, pz = a[0] + tx * s, a[1] + tz * s
            s += 1.55
            for side in (1, -1):
                nx, nz = -tz * side, tx * side
                W, D = 1.2, 1.0
                SET = 0.78  # front setback: a car parks across the frontage
                off = r['w'] / 2 + SET + D / 2
                cx, cz = px + nx * off, pz + nz * off
                yaw = math.atan2(-nx, -nz)          # the villa's front faces the road
                h += 1
                waterfront = water_dist(cx - nx * 0, cz) < 3.2
                if not free(corners(cx, cz, yaw, W + 0.15, D + 0.15), 0.62):
                    continue
                pool = None
                bx, bz = cx + nx * (D / 2 + 0.45), cz + nz * (D / 2 + 0.45)
                if free(corners(bx, bz, yaw, 0.6, 0.35), 0.0) and water_dist(bx, bz) > 0.35:
                    pool = [R(bx), R(bz), R(yaw), 0.6, 0.35]
                tint = TINTS[(h * 7) % len(TINTS)]
                villas.append({'x': R(cx), 'z': R(cz), 'yaw': R(yaw), 'w': W, 'd': D, 'h': 0.62 if (h % 3) else 0.78, 'tint': tint, 'pool': pool, 'wf': 1 if waterfront else 0, 'upper': 1 if h % 2 else 0})
                placed.append((cx, cz, 0.62))
                # the car on the frontage (most villas), parallel to the street
                kx, kz = px + nx * (r['w'] / 2 + 0.38), pz + nz * (r['w'] / 2 + 0.38)
                if h % 10 < 7 and all(kerb(c) > 0.03 for c in corners(kx, kz, math.atan2(tx, tz) + math.pi / 2, 0.76, 0.32)):
                    placed.append((kx, kz, 0.3))
                    cars.append({'kind': CAR_KINDS[(h * 5) % len(CAR_KINDS)], 'x': R(kx), 'z': R(kz), 'yaw': R(math.atan2(tx, tz)), 'paint': (h * 3) % 12})

# ---- palms along the promenades and boulevards ---------------------------------------------------------------
palms = []
def try_palm(x, z, s=0.9):
    if kerb((x, z)) < 0.2 or water_dist(x, z) < 0.15 or in_park(x, z) and not (PARK[0] < x < PARK[2]):
        return
    if any(math.hypot(x - px, z - pz) < 0.45 + pr for px, pz, pr in placed):
        return
    palms.append([R(x), R(z), s])
    placed.append((x, z, 0.2))
# lagoon promenade: both banks, 0.55 back from the water
for edge in (north_edge, south_edge):
    for i in range(0, len(edge) - 1, 2):
        (x, z), (x2, z2) = edge[i], edge[i + 1]
        L = math.hypot(x2 - x, z2 - z) or 1
        nx, nz = -(z2 - z) / L, (x2 - x) / L
        for sgn in (1, -1):
            px, pz = x + nx * 0.55 * sgn, z + nz * 0.55 * sgn
            if water_dist(px, pz) > 0.3:
                try_palm(px, pz, 0.95)
# gate boulevards: a palm row each side
for r in roads:
    if r['n'].startswith('Lagoons Gate'):
        for (x, z) in r['p'][1:-1]:
            try_palm(x - 0.85, z, 1.0)
            try_palm(x + 0.85, z, 1.0)
# park: palms around the lawns
for x in xs(PARK[0] + 0.5, PARK[2] - 0.5, 1.6):
    for z in (PARK[1] + 0.3, PARK[3] - 0.3):
        if kerb((x, z)) > 0.25:
            palms.append([R(x), R(z), 0.9])

# ---- shade trees in the back gardens and block interiors ----------------------------------------------------
trees = []
pool_pts = [(v['pool'][0], v['pool'][1]) for v in villas if v['pool']]
for gx in xs(X0 + 1.0, X1 - 1.0, 1.25):
    for gz in xs(ZN + 1.0, ZS - 1.0, 1.25):
        jx = gx + 0.35 * math.sin(gz * 12.9898 + gx * 78.233)
        jz = gz + 0.35 * math.sin(gx * 39.346 + gz * 11.135)
        if kerb((jx, jz)) < 0.7 or water_dist(jx, jz) < 0.6 or in_park(jx, jz):
            continue
        if any(math.hypot(jx - px, jz - pz) < 0.85 + pr for px, pz, pr in placed):
            continue
        if any(math.hypot(jx - px, jz - pz) < 0.5 for px, pz in pool_pts):
            continue
        if (int(gx * 7 + gz * 13) % 5) == 0:
            continue  # leave some gaps
        trees.append({'x': R(jx), 'z': R(jz), 's': R(0.8 + 0.4 * abs(math.sin(jx * 3.1 + jz)))})
        placed.append((jx, jz, 0.3))

# ---- park ---------------------------------------------------------------------------------------------------
pitch = {'x0': 10.0, 'z0': 42.4, 'x1': 20.5, 'z1': 49.0}
centre = {'x': 34.0, 'z': 46.0, 'w': 5.0, 'd': 3.6, 'h': 0.9}
lawns = [[[PARK[0], PARK[1]], [PARK[2], PARK[1]], [PARK[2], PARK[3]], [PARK[0], PARK[3]]]]

data = {
    'meta': {'source': 'scripts/build-lagoons.py', 'note': 'Procedural community (not survey data, not a real development)',
             'rect': {'minX': X0 - 2, 'maxX': X1 + 2, 'minZ': ZN - 2, 'maxZ': ZS + 2}, 'unitMeters': 10},
    'roads': [{k: v for k, v in r.items() if k != 'lagoon'} for r in roads],
    'water': water,
    'villas': villas,
    'cars': cars,
    'palms': palms,
    'trees': trees,
    'lawns': lawns,
    'pitch': pitch,
    'centre': centre,
    'bridges': [{'x': BRIDGE_X, 'z0': R(zc(BRIDGE_X) - hw(BRIDGE_X) - 0.4), 'z1': R(zc(BRIDGE_X) + hw(BRIDGE_X) + 0.4), 'w': 1.2}],
    'places': [{'role': 'landmark', 'n': 'Al Sajaa Lagoons', 'x': 26.0, 'z': R(zc(26.0)), 'h': 1.0, 'm': 0}],
}
OUT.write_text(json.dumps(data, separators=(',', ':')) + '\n')
print(f"trees {len(trees)} · cars {len(cars)} · roads {len(roads)} · villas {len(villas)} (pools {sum(1 for v in villas if v['pool'])}, waterfront {sum(v['wf'] for v in villas)}) · palms {len(palms)}")
