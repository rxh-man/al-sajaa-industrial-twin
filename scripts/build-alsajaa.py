"""Generate Al Sajaa (Sharjah industrial district) in the AD JSON schema used by Al Sajaa Twin's renderer.

Scene units: 1 = 10 m (same as abudhabi.json). Roads run along x and z; the Gulf lies on the +z side.
Output: src/data/alsajaa.json. Everything here is procedural, not survey data.
"""
import json, math, random, os

R = random.Random(23)
OUT = os.path.join(os.path.dirname(__file__), '..', 'src', 'data', 'alsajaa.json')

def coastZ(x):
    return 34 + 2.2 * math.sin(x / 16) + 1.2 * math.sin(x / 5.3)

HWY_X = {-68}                          # Emirates Road E611 corridor (straight, no curvature)
HWY_EDGE_W, HWY_EDGE_E = -70.05, -65.95  # outer paved edges of the two E611 carriageways (5 lanes each)
GRASS_MIN = 5.0                          # 50 m of grass (1 unit = 10 m) between the highway and anything built
HWY_GRASS_E = round(HWY_EDGE_E + GRASS_MIN - (-68), 2)   # east blocks start 50 m off the highway edge
X = [-68] + [-56 + 8 * i for i in range(15)] + [64, 72, 80, 88, 96, 104, 112]   # north-south arterials
E88_Z = -57
SOLAR = (70.0, 116.0, -44.0, -12.0)                 # solar farm rectangle (x0, x1, z0, z1)                           # Emirates Road E88 runs along the south edge, below the rail
Z = [-48 + 8 * j for j in range(10)]   # east-west streets, includes z = 0 (Khalifa)
GAP = 0.9                              # half road width (local streets)

def vx(i, z):
    if X[i] in HWY_X:
        return X[i]
    return X[i] + 1.2 * math.sin((z - X[i]) / 20)

def hz(j, x):
    amp = 0.0 if Z[j] == 0 else 1.4
    return Z[j] + amp * math.sin((x + Z[j]) / 24)

roads = []
buildings = []
parks = []
palms = []
bid = 100000  # ids unused by procedural code; renderer offsets with AD_BUILDING_ID0 anyway

# ---------- roads ----------
def clip_to_land(pts):
    out = []
    for x, z in pts:
        if z > coastZ(x) - 1.5:
            break
        out.append([round(x, 2), round(z, 2)])
    return out

for i in range(1, len(X)):
    pts = clip_to_land([[vx(i, z), z] for z in [-52 + 2 * k for k in range(0, 51)]])
    if len(pts) < 3:
        continue
    cls = 'trunk' if i % 3 == 0 else 'secondary' if i % 3 == 1 else 'residential'
    roads.append({'n': f'Al Sajaa Street {i + 1}', 'c': cls, 'w': 1.8 if cls == 'trunk' else 1.0,
                  'o': 0, 't': 0, 'p': pts, 'k': [f'v{i}_{k}' for k in range(len(pts))]})

for j in range(len(Z)):
    pts = []
    for k in range(0, 94):
        x = -66 + 2 * k
        z = hz(j, x)
        if z > coastZ(x) - 1.5:
            break
        pts.append([round(x, 2), round(z, 2)])
    if len(pts) < 3:
        continue
    if Z[j] == 0:
        name, cls, w = 'Khalifa Bin Zayed Street', 'trunk', 1.8
    else:
        cls = 'trunk' if j % 3 == 0 else 'secondary' if j % 3 == 1 else 'residential'
        name, w = f'Al Sajaa Road {j + 1}', (1.8 if cls == 'trunk' else 1.0)
    roads.append({'n': name, 'c': cls, 'w': w, 'o': 0, 't': 0, 'p': pts, 'k': [f'h{j}_{k}' for k in range(len(pts))]})

# Corniche-style boulevard along the coast
corn = [[x, round(coastZ(x) - 2.2, 2)] for x in [-60 + 2 * k for k in range(61)]]
roads.append({'n': 'Corniche Street', 'c': 'trunk', 'w': 1.8, 'o': 1, 't': 0, 'p': corn,
              'k': [f'c{k}' for k in range(len(corn))]})

# ---------- Emirates Road E611 (west), E88 (south), ramps and the Tasheel roundabout ----------
south_stub = [[-68, z] for z in (-60, -58, -56)]
bridge_pts = [[-68, z] for z in range(-56, -43, 2)]        # flyover over the Etihad Rail
north_pts = clip_to_land([[-68, z] for z in range(-44, 40, 2)])
def hw(name, c, w, o, pts, key):
    roads.append({'n': name, 'c': c, 'w': w, 'o': o, 't': 0, 'p': pts,
                  'k': [f'{key}{k}' for k in range(len(pts))]})
north_near = [p for p in north_pts if p[1] <= -30]
north_far = [p for p in north_pts if p[1] >= -30]
e88 = [[x, round(E88_Z + 1.5 * math.sin((x + 68) / 25), 2)] for x in range(-68, 122, 2)]
hw('Emirates Road E88', 'trunk', 2.4, 0, [p for p in e88 if p[0] <= -40], 'e88i')
hw('Emirates Road E88', 'trunk', 2.4, 0, [p for p in e88 if p[0] >= -40], 'e88')
# Emirates Road E611: two carriageways, 1.1 units either side of the centre line (a 3 m median), five lanes each
e611_c = clip_to_land([[-68, z] for z in range(-60, 40, 2)])
car_south = [[round(q[0] + 1.1, 2), q[1]] for q in e611_c]
car_north = [[round(q[0] - 1.1, 2), q[1]] for q in e611_c][::-1]
for nm, pts_, key in (('Emirates Road E611 southbound', car_south, 'e611a'), ('Emirates Road E611 northbound', car_north, 'e611n')):
    roads.append({'n': nm, 'c': 'trunk', 'w': 1.9, 'o': 0, 't': 0, 'l': 5, 'x': 1, 'p': pts_,
                  'k': [f'{key}{k}' for k in range(len(pts_))]})
TASHEEL = (84.0, 18.0, 3.6)                                  # roundabout centre and radius
ring = [[round(TASHEEL[0] + TASHEEL[2] * math.cos(t), 2), round(TASHEEL[1] + TASHEEL[2] * math.sin(t), 2)]
        for t in [2 * math.pi * k / 16 for k in range(17)]]
hw('Tasheel Roundabout', 'secondary', 1.0, 0, ring, 'tash')

# ---------- building helpers ----------
def boxes_for(kind, x, z, w, d):
    x0, x1, z0, z1 = x - w / 2, x + w / 2, z - d / 2, z + d / 2
    if kind == 'L':
        return [[x0, z0, x1, z0 + d * .5], [x0, z0 + d * .5, x0 + w * .5, z1]]
    if kind == 'U':
        return [[x0, z0, x1, z0 + d * .3], [x0, z0, x0 + w * .28, z1], [x1 - w * .28, z0, x1, z1]]
    if kind == 'cross':   # octagon / round approximated as a cross
        return [[x0 + w * .22, z0, x1 - w * .22, z1], [x0, z0 + d * .22, x1, z1 - d * .22]]
    return [[x0, z0, x1, z1]]

def add_building(name, kind, h, x, z, w, d, shape='rect'):
    global bid
    bid += 1
    buildings.append({'id': bid, 'n': name, 'k': kind, 'h': round(h, 2), 'y': 0,
                      'c': [round(x, 2), round(z, 2)],
                      'b': [[round(v, 2) for v in bx] for bx in boxes_for(shape, x, z, w, d)]})

SHAPES = ['rect', 'rect', 'L', 'U', 'cross']

def split(x, z, w, d, depth, out):
    if depth >= 2 or min(w, d) < 5.0:
        out.append((x, z, w, d)); return
    if w >= d:
        c = w * R.uniform(.4, .6)
        split(x - w / 2 + c / 2, z, c, d, depth + 1, out)
        split(x + w / 2 - (w - c) / 2, z, w - c, d, depth + 1, out)
    else:
        c = d * R.uniform(.4, .6)
        split(x, z - d / 2 + c / 2, w, c, depth + 1, out)
        split(x, z + d / 2 - (d - c) / 2, w, d - c, depth + 1, out)

def fill_lot(x, z, w, d, cat):
    gap = .3
    w, d = w - 2 * gap, d - 2 * gap
    if min(w, d) < 2.2:
        if R.random() < .5:
            add_building('Villa', 'house', R.uniform(.4, .6), x, z, w * .7, d * .6)
        else:
            park(x, z, w, d)
        return
    if R.random() < .07:
        park(x, z, w, d); return
    if min(w, d) >= 3.0 and R.random() < .06:
        add_building('Al Sajaa Mosque', 'mosque', 1.6, x, z, min(w, d) * .8, min(w, d) * .8)
        return
    big = min(w, d) >= 3.0
    if cat == 'res':
        if not big:
            add_building('Residential', 'residential', R.uniform(1.5, 2.6), x, z, w, d); return
        r = R.random()
        if r < .02:
            add_building('Tower', 'tower', R.uniform(3, 4), x, z, w, d, R.choice(SHAPES))
        elif r < .45:
            add_building('Workshop block', 'building', R.uniform(.7, 1.0), x, z, w, d, R.choice(SHAPES))
        elif r < .75:
            add_building('Office block', 'office', R.uniform(1.0, 1.5), x, z, w, d, R.choice(SHAPES))
        else:
            add_building('Residential', 'residential', R.uniform(1.5, 2.6), x, z, w, d, R.choice(SHAPES))
    elif cat == 'mix':
        if big and R.random() < .4:
            add_building('Mall', 'mall', .8, x, z, w, d, R.choice(['rect', 'U']))
        elif big and R.random() < .5:
            add_building('Hotel', 'hotel', R.uniform(1.2, 2.0), x, z, w, d, R.choice(SHAPES))
        else:
            add_building('Residential', 'residential', R.uniform(1.5, 2.6), x, z, w, d, R.choice(SHAPES))
    else:
        r = R.random()
        if r < .35:
            add_building('Factory hall', 'building', R.uniform(.7, 1.1), x, z, w, d, R.choice(['rect', 'L']))
        elif r < .55:
            add_building('Warehouse', 'building', R.uniform(.6, .9), x, z, w, d)
        elif r < .75:
            add_building('Tank farm', 'utility', R.uniform(1.2, 1.8), x, z, w, d)
        elif r < .9:
            add_building('Plant', 'utility', R.uniform(1.5, 2.4), x, z, w, d, 'cross')
        else:
            add_building('Container yard', 'building', .5, x, z, w, d)

def park(x, z, w, d):
    p = [[round(x - w / 2, 2), round(z - d / 2, 2)], [round(x + w / 2, 2), round(z - d / 2, 2)],
         [round(x + w / 2, 2), round(z + d / 2, 2)], [round(x - w / 2, 2), round(z + d / 2, 2)]]
    parks.append({'n': 'Park', 'p': p})
    for _ in range(max(2, int(w * d / 4))):
        palms.append([round(R.uniform(x - w / 2 + .3, x + w / 2 - .3), 2),
                      round(R.uniform(z - d / 2 + .3, z + d / 2 - .3), 2), round(R.uniform(.9, 1.2), 2)])

def add_raw(name, kind, h, cx, cz, boxes):
    global bid
    bid += 1
    buildings.append({'id': bid, 'n': name, 'k': kind, 'h': round(h, 2), 'y': 0,
                      'c': [round(cx, 2), round(cz, 2)],
                      'b': [[round(v, 2) for v in bx] for bx in boxes]})

yard_marks = {}

def yard_logistics(x, z, w, d):
    # warehouse on the north side, container stacks to the south, truck park in between
    add_building('Logistics warehouse', 'building', R.uniform(.8, 1.0), x, z + d * .33, w * .95, d * .3)
    cont = []
    for ix in range(int(w // .75)):
        for iz in range(int((d * .42) // .42)):
            if R.random() < .6:
                cx = x - w / 2 + .4 + ix * .75
                cz = z - d / 2 + .3 + iz * .42
                cont.append([cx - .3, cz - .18, cx + .3, cz + .18])
    if cont:
        add_raw('Container stack', 'building', .5, x, z - d * .25, cont)
    trucks = []
    for k in range(int(w // 1.4)):
        tx = x - w / 2 + .8 + k * 1.4
        if R.random() < .75:
            trucks.append([tx - .45, z + .02 * d - .15, tx + .45, z + .02 * d + .15])
    if trucks:
        add_raw('Truck park', 'building', .35, x, z, trucks)
    yard_marks.setdefault('logistics', (x, z))

def yard_auction(x, z, w, d):
    # rows of parked cars: sedans, SUVs and pickup trucks, each in its own colour band
    kinds = {'Auction sedans': (.36, .2, .16), 'Auction SUVs': (.44, .23, .22), 'Auction pickups': (.52, .25, .28)}
    buckets = {k: [] for k in kinds}
    for iz in range(int((d - 1.2) // .6)):
        for ix in range(int((w - 1.6) // .55)):
            if R.random() < .88:
                cx = x - w / 2 + .9 + ix * .55
                cz = z - d / 2 + .8 + iz * .6
                name = R.choice(list(kinds))
                L, W, _ = kinds[name]
                buckets[name].append([cx - W / 2, cz - L / 2, cx + W / 2, cz + L / 2])
    for name, boxes in buckets.items():
        if boxes:
            add_raw(name, 'building', kinds[name][2], x, z, boxes)
    add_building('Auction office', 'building', .7, x, z - d / 2 + .6, w * .5, 1.0)
    yard_marks.setdefault('auction', (x, z))

def labor_camp(x, z, w, d):
    # prefab accommodation blocks inside a fenced compound, mess hall and water tank
    blocks_ = []
    for r in range(2):
        for c in range(int((w - 1.2) // 1.25)):
            bx = x - w / 2 + .7 + c * 1.25
            bz = z - d / 4 + r * d / 2
            blocks_.append([bx - .45, bz - .6, bx + .45, bz + .6])
    add_raw('Labor accommodation', 'residential', .7, x, z, blocks_)
    fence = [[x - w / 2, z - d / 2, x + w / 2, z - d / 2 + .15], [x - w / 2, z + d / 2 - .15, x + w / 2, z + d / 2],
             [x - w / 2, z - d / 2, x - w / 2 + .15, z + d / 2], [x + w / 2 - .15, z - d / 2, x + w / 2, z + d / 2]]
    add_raw('Labor camp fence', 'utility', .25, x, z, fence)
    add_building('Mess hall', 'building', .45, x + w * .3, z + d * .38, w * .3, d * .16)
    add_building('Water tank', 'utility', .9, x - w * .32, z + d * .38, .6, .6)
    yard_marks.setdefault('camp', (x, z))

def r2_yard(mx, mz, w, d):
    """Turn an industrial block into a logistics yard, car auction yard or labor camp (about 45% of industrial blocks)."""
    r = R.random()
    if r < .18:
        yard_logistics(mx, mz, w, d)
    elif r < .32:
        yard_auction(mx, mz, w, d)
    elif r < .42:
        labor_camp(mx, mz, w, d)
    else:
        return False
    return True

# ---------- blocks ----------
blocks = 0
for i in range(len(X) - 1):
    for j in range(len(Z) - 1):
        cz0 = (Z[j] + Z[j + 1]) / 2
        cx = (vx(i, cz0) + vx(i + 1, cz0)) / 2
        gl = HWY_GRASS_E if X[i] in HWY_X else GAP
        gr = HWY_GRASS_E if X[i + 1] in HWY_X else GAP
        x0, x1 = vx(i, cz0) + gl, vx(i + 1, cz0) - gr
        z0, z1 = hz(j, cx) + GAP, hz(j + 1, cx) - GAP
        w, d = x1 - x0, z1 - z0
        if w < 4 or d < 4:
            continue
        mx, mz = (x0 + x1) / 2, (z0 + z1) / 2
        if math.hypot(mx - 84, mz - 12) < 13:
            continue
        if SOLAR[0] < mx < SOLAR[1] and SOLAR[2] < mz < SOLAR[3]:
            continue
        if mz + d / 2 > coastZ(mx) - 2.5:
            continue
        r = R.random()
        cat = 'res' if r < .4 else 'mix' if r < .65 else 'ind'
        if cat == 'ind' and r2_yard(mx, mz, w, d):
            blocks += 1
            continue
        lots = []
        split(mx, mz, w, d, 0, lots)
        for lx, lz, lw, ld in lots:
            fill_lot(lx, lz, lw, ld, cat)
        blocks += 1

# grass strips either side of Emirates Road E611: at least 50 m of grass between the highway and any building
for vx0, vx1 in ((-77.6, HWY_EDGE_W + 0.05), (HWY_EDGE_E - 0.05, HWY_EDGE_E + GRASS_MIN)):
    parks.append({'n': 'Highway verge', 'p': [[vx0, -44], [vx1, -44], [vx1, 30], [vx0, 30]]})

# Etihad Rail station parking (north of the rail, two rows of cars) reached by the street at x = 0,
# and a halt at the east end with its own parking reached by the street at x = 96
def car_rows(x0, x1, zs):
    out = []
    for zc in zs:
        cx = x0 + .4
        while cx <= x1 - .4:
            out.append([cx - .25, zc - .11, cx + .25, zc + .11])
            cx += .6
    return out
add_raw('Station parking cars', 'building', .35, -7.7, -53.2, car_rows(-14, -1.5, [-53.6, -52.7]) + car_rows(1.5, 14, [-53.6, -52.7]))
add_raw('Halt parking cars', 'building', .35, 96, -53.2, car_rows(88, 104, [-53.6, -52.7]))
for i_, x_ in ((8, 0), (20, 96)):
    first = [round(vx(i_, -52), 2), -52.0]
    access = [first, [first[0], -55.5]]
    roads.append({'n': f'Rail access street {i_}', 'c': 'residential', 'w': 1.0, 'o': 0, 't': 0, 'p': access,
                  'k': [f'v{i_}_0', f'acc{i_}_1']})
add_building('Etihad Rail halt platform', 'building', .3, 96, -49.5, 8, .8)

# signboards along the highway, the rail and the parking
for sz_ in range(-40, 32, 9):
    add_building('Highway sign', 'utility', .5, -65.4, sz_, .15, .15)
    add_building('Highway sign', 'utility', .5, -70.9, sz_, .15, .15)
for sx_ in (-6, 6, 90, 102):
    add_building('Rail and parking sign', 'utility', .5, sx_, -55.8, .15, .15)

# ---------- solar farm (three panel fields and a reservoir) ----------
sx0, sx1, sz0, sz1 = SOLAR
fields = [(sx0 + 2, sx0 + 22, sz1 - 14, sz1 - 2), (sx0 + 26, sx0 + 46, sz0 + 2, sz0 + 18), (sx0 + 26, sx1 - 2, sz0 + 22, sz1 - 16)]
for fx0, fx1, fz0, fz1 in fields:
    rows = []
    z_ = fz0
    while z_ + .6 <= fz1:
        rows.append([fx0, round(z_, 2), fx1, round(z_ + .4, 2)])
        z_ += .9
    add_raw('Solar panel field', 'utility', .08, (fx0 + fx1) / 2, (fz0 + fz1) / 2, rows)
add_raw('Solar inverter block', 'utility', .5, sx0 + 4, sz0 + 4, [[sx0 + 2, sz0 + 2, sx0 + 6, sz0 + 6]])
add_raw('Reservoir', 'utility', .05, sx0 + 22, sz1 - 2, [[sx0 + 8, sz0 + 26, sx0 + 22, sz0 + 36]])

# ---------- boulevard palms ----------
for k, (x, z) in enumerate(corn):
    if k % 2 == 0:
        palms.append([x, round(z - 1.4, 2), 1.0])

# ---------- Etihad Rail: double line along the south side of the district ----------
rail_pts = [[x, -50.5] for x in range(-152, 121, 2)]
roads.append({'n': 'Etihad Rail', 'c': 'rail', 'w': 1.0, 'o': 0, 't': 0, 'p': rail_pts,
              'k': [f'rl{k}' for k in range(len(rail_pts))]})
add_building('Etihad Rail platform', 'building', .3, 0, -49.5, 8, .8)

add_building('Tasheel Centre', 'mall', 1.2, 84, 6, 12, 7)

# ---------- signal poles at major intersections ----------
for i in range(0, len(X), 3):
    for j in range(0, len(Z), 3):
        ix = vx(i, Z[j])
        iz = hz(j, ix)
        if -58 < ix < 58 and -46 < iz < 30:
            add_building('Traffic signal', 'utility', .5, ix + .7, iz + .7, .25, .25)

# ---------- Rahmaniya colony (west of Emirates Road E611) ----------
RX = [-150, -142, -134, -126, -118, -110, -102, -94, -86, -78, -68]
RZ = [-48, -40, -32, -24, -16, -8, 0, 8, 16, 24, 32]
KSHISHA_CELLS = {(6, 5): 'Kshisha Park 1', (2, 5): 'Kshisha Park 2'}
RAH_MALL = (-98.0, 24.0)

# park zones (x0, x1, z0, z1): the streets inside a zone are cut, the zone edges stay as streets
KSHISHA1_ZONE = (-126.0, -78.0, -8.0, 0.0)       # widened east-west from the Park 2 street to the colony edge; depth unchanged
COMMUNITY_ZONE = (-150.0, -126.0, -48.0, -32.0)  # new community park with a school and a museum
PARK_ZONES = [KSHISHA1_ZONE, COMMUNITY_ZONE]

def in_zone(x, z, zone):
    x0, x1, z0, z1 = zone
    return x0 < x < x1 and z0 < z < z1

def split_runs(pts):
    # cut a street where it runs through a park zone; returns the contiguous runs left
    runs, cur = [], []
    for p in pts:
        if any(in_zone(p[0], p[1], zn) for zn in PARK_ZONES):
            if cur:
                runs.append(cur)
            cur = []
        else:
            cur.append(p)
    if cur:
        runs.append(cur)
    return runs

for i in range(len(RX) - 1):
    if RX[i] == -68:
        continue
    pts = clip_to_land([[RX[i], z] for z in [-50 + 2 * k for k in range(0, 42)]])
    for n_, run in enumerate(split_runs(pts)):
        if len(run) >= 3:
            roads.append({'n': f'Rahmaniya Street {i + 1}', 'c': 'secondary' if i % 3 == 0 else 'residential',
                          'w': 1.0, 'o': 0, 't': 0, 'p': run, 'k': [f'rx{i}_{n_}_{k}' for k in range(len(run))]})
for j in range(len(RZ)):
    # the street at z = -16 stops at the mall lot, which sits between the two streets either side
    spans = [(-150, -110), (-94, -78)] if RZ[j] == 24 else [(-150, -78)]
    for a_, b_ in spans:
        pts = []
        for x in range(a_, b_ + 1, 2):
            if RZ[j] > coastZ(x) - 1.5:
                break
            pts.append([x, RZ[j]])
        for n_, run in enumerate(split_runs(pts)):
            if len(run) >= 3:
                roads.append({'n': f'Rahmaniya Road {j + 1}', 'c': 'secondary' if j % 3 == 0 else 'residential',
                              'w': 1.0, 'o': 0, 't': 0, 'p': run, 'k': [f'rz{j}_{a_}_{n_}_{k}' for k in range(len(run))]})

def villa_lot(lx, lz, lw, ld):
    r = R.random()
    if r < .35:
        add_building('Emirati villa', 'house', R.uniform(.7, .9), lx - lw * .1, lz - ld * .1, lw * .62, ld * .42, 'U')
        pool = True
    elif r < .6:
        add_building('Mansion', 'house', R.uniform(1.0, 1.3), lx - lw * .1, lz - ld * .1, lw * .62, ld * .42)
        pool = True
    elif r < .85:
        add_building('Small house', 'residential', R.uniform(.5, .7), lx - lw * .1, lz - ld * .1, lw * .5, ld * .36,
                     R.choice(['rect', 'L']))
        pool = False
    else:
        return   # empty plot
    if pool and R.random() < .7:
        add_raw('Swimming pool', 'pool', .04, lx - lw * .1, lz + ld * .27,
                [[lx - lw * .1 - lw * .21, lz + ld * .19, lx - lw * .1 + lw * .21, lz + ld * .35]])
    if R.random() < .6:
        add_building('Garage', 'building', .45, lx + lw * .34, lz - ld * .1, lw * .22, ld * .5)
    cars = []
    for cxo in (-lw * .2, lw * .1):
        if R.random() < .75:
            cx, cz = lx + cxo, lz - ld * .42
            cars.append([cx - .11, cz - .25, cx + .11, cz + .25])
    if cars:
        add_raw('Land Cruisers', 'building', .35, lx, lz, cars)

def villa_block(mx, mz, w, d):
    layout = R.choice(['one', 'two', 'four'])
    if layout == 'one':
        villa_lot(mx, mz, w, d)
    elif layout == 'two':
        villa_lot(mx - w / 4, mz, w / 2, d)
        villa_lot(mx + w / 4, mz, w / 2, d)
    else:
        for sx_ in (-1, 1):
            for sz_ in (-1, 1):
                villa_lot(mx + sx_ * w / 4, mz + sz_ * d / 4, w / 2, d / 2)

def mall_span(x0, x1, z0, z1):
    # long north-south mall, parking lot on its west side
    mx0, mx1 = -100.5, -95.5
    add_building('Rahmaniya Mall', 'mall', 1.4, (mx0 + mx1) / 2, (z0 + z1) / 2, mx1 - mx0, z1 - z0, 'rect')

def parking_lot(x0, x1, z0, z1):
    cars = []
    cols = [x0 + o for o in (.9, 2.35, 3.8, 5.25)]
    rows = int((z1 - z0 - .8) // .6) + 1
    for cx in cols:
        for k in range(rows):
            if R.random() < .8:
                cz = z0 + .5 + k * .6
                cars.append([cx - .11, cz - .25, cx + .11, cz + .25])
    add_raw('Mall parking cars', 'building', .35, (x0 + x1) / 2, (z0 + z1) / 2, cars)

def mosque_block(mx, mz, w, d):
    add_building('Rahmaniya Jummah Masjid', 'mosque', 1.8, mx, mz, w * .85, d * .85)

rah_blocks = 0
for c in range(len(RX) - 1):
    for r in range(len(RZ) - 1):
        x0 = RX[c] + GAP
        if RX[c + 1] == -68:
            continue   # no plots east of Rahmaniya Street 9: the grass strip keeps 50 m+ to the highway
        x1 = RX[c + 1] - GAP
        z0 = RZ[r] + GAP
        z1 = RZ[r + 1] - GAP
        w, d = x1 - x0, z1 - z0
        mx, mz = (x0 + x1) / 2, (z0 + z1) / 2
        if mz + d / 2 > coastZ(mx) - 2.5:
            continue
        if any(in_zone(mx, mz, zn) for zn in PARK_ZONES):
            continue   # the park zones below replace these plots
        if (c, r) == (6, 8):
            mall_span(RX[6] + GAP, RX[7] - GAP, RZ[8] + GAP, RZ[10] - GAP)
        elif (c, r) in ((6, 9), (5, 9)):
            pass
        elif (c, r) == (5, 8):
            parking_lot(RX[5] + GAP, RX[6] - GAP, RZ[8] + GAP, RZ[10] - GAP)
        elif (c, r) == (8, 1):
            mosque_block(mx, mz, w, d)
        elif (c, r) in KSHISHA_CELLS:
            park(mx, mz, w * .92, d * .92)
            parks[-1]['n'] = KSHISHA_CELLS[(c, r)]
        else:
            villa_block(mx, mz, w, d)
        rah_blocks += 1
blocks += rah_blocks

# ---------- park zones: lawns with curved walks ----------
def walk(pts, nm):
    roads.append({'n': nm, 'c': 'pedestrian', 'w': 0.5, 'o': 0, 't': 0, 'p': pts,
                  'k': [f'{nm}_{k}' for k in range(len(pts))]})

def ring_walk(cx, cz, rad, nm):
    walk([[round(cx + rad * math.cos(t), 2), round(cz + rad * math.sin(t), 2)]
          for t in [2 * math.pi * k / 24 for k in range(25)]], nm)

# Kshisha Park 1: widened east-west, same depth as before; a winding walk along its length
kx, kz = -102.0, -4.0
park(kx, kz, 46.2, 5.7)
parks[-1]['n'] = 'Kshisha Park 1'
walk([[-120.0, -6.5], [-112.0, -1.5], [-104.0, -6.5], [-96.0, -1.5], [-88.0, -6.5], [-80.0, -1.5]], 'Kshisha winding walk')

# new community park with a school and a museum, its own lawn and walks
cx_, cz_ = -138.0, -40.0
park(cx_, cz_, 22.2, 14.2)
parks[-1]['n'] = 'Community Park'
ring_walk(cx_, cz_, 3.4, 'Community ring walk')
walk([[cx_ - 10.5, cz_], [cx_ - 3.4, cz_], [cx_ + 3.4, cz_], [cx_ + 10.5, cz_]], 'Community cross walk')
add_building('Community School', 'school', 0.9, cx_ + 6.8, cz_ - 4.4, 6.0, 4.6, 'rect')
add_building('Community Museum', 'building', 1.3, cx_ - 6.9, cz_ + 4.4, 5.6, 5.6, 'cross')

# ---------- coast and land ----------
coast = [[x, round(coastZ(x), 2)] for x in range(-152, 122, 2)]
land = [[-152, -80], [120, -80]] + [[x, z] for x, z in reversed(coast)]

# ---------- places (incident-related roles are required by the simulation) ----------
def p_in_city(x, z):
    return [round(x, 2), round(z, 2)]
places = [
    {'role': 'hospital', 'n': 'Al Sajaa Hospital', 'x': -20.0, 'z': -16.0, 'h': 9.5},
    {'role': 'school', 'n': 'Al Sajaa School', 'x': 14.0, 'z': -24.0, 'h': 6.0},
    {'role': 'depot', 'n': 'Al Sajaa Depot', 'x': 30.0, 'z': -32.0, 'h': 4.0},
    {'role': 'substation', 'n': 'Al Sajaa Substation', 'x': -30.0, 'z': 16.0, 'h': 4.0},
    {'role': 'exchange', 'n': 'Telecom Exchange', 'x': 6.0, 'z': -8.0, 'h': 5.0},
    {'role': 'mall', 'n': 'Sajaa Mall', 'x': 18.0, 'z': 4.0, 'h': 3.0},
    {'role': 'landmark', 'n': 'Sharjah Industrial Gate', 'x': -6.0, 'z': -40.0, 'h': 5.0},
    {'role': 'mosque', 'n': 'Al Sajaa Mosque', 'x': -40.0, 'z': -24.0, 'h': 4.0},
    {'role': 'mall', 'n': 'Tasheel Centre', 'x': 84.0, 'z': 6.0, 'h': 1.2},
    {'role': 'mall', 'n': 'Rahmaniya Mall', 'x': RAH_MALL[0], 'z': RAH_MALL[1], 'h': 1.4},
    {'role': 'mosque', 'n': 'Rahmaniya Jummah Masjid', 'x': -82.0, 'z': -36.0, 'h': 3.0},
]
places.append({'role': 'landmark', 'n': 'Etihad Rail Station', 'x': 0.0, 'z': -49.5, 'h': 3.0})
places.append({'role': 'landmark', 'n': 'Etihad Rail Halt', 'x': 96.0, 'z': -49.5, 'h': 2.0})
places.append({'role': 'landmark', 'n': 'Community School', 'x': -131.2, 'z': -44.4, 'h': 2.5})
places.append({'role': 'landmark', 'n': 'Community Museum', 'x': -144.9, 'z': -35.6, 'h': 3.0})
if 'logistics' in yard_marks:
    lx, lz = yard_marks['logistics']
    for pl in places:
        if pl['role'] == 'depot':
            pl.update({'n': 'Logistics Yard', 'x': round(lx, 2), 'z': round(lz, 2)})
if 'auction' in yard_marks:
    ax, az = yard_marks['auction']
    places.append({'role': 'landmark', 'n': 'Car Auction Yard', 'x': round(ax, 2), 'z': round(az, 2), 'h': 2.0})
if 'camp' in yard_marks:
    cx_, cz_ = yard_marks['camp']
    places.append({'role': 'landmark', 'n': 'Labor Camp', 'x': round(cx_, 2), 'z': round(cz_, 2), 'h': 2.5})
for pl in places:
    pl['m'] = round(math.hypot(pl['x'], pl['z']) * 10)

labels = [
    {'n': 'Khalifa Bin Zayed St', 'x': -34.0, 'z': 1.4, 'a': 0.0},
    {'n': 'Corniche St', 'x': -10.0, 'z': round(coastZ(-10) - 4.5, 2), 'a': 0.04},
    {'n': 'Al Sajaa Street 4', 'x': 24.0, 'z': -40.0, 'a': 1.57},
    {'n': 'Al Sajaa Road 3', 'x': -44.0, 'z': -16.0, 'a': 0.0},
    {'n': 'Al Sajaa Street 8', 'x': 44.0, 'z': 28.0, 'a': 1.57},
    {'n': 'Emirates Rd E611', 'x': -68.0, 'z': 10.0, 'a': 1.57},
    {'n': 'Emirates Rd E88', 'x': 30.0, 'z': -59.5, 'a': 0.0},
    {'n': 'Tasheel Roundabout', 'x': 84.0, 'z': 24.5, 'a': 0.0},
    {'n': 'Station parking', 'x': -7.0, 'z': -60.0, 'a': 0.0},
    {'n': 'Etihad Rail Halt', 'x': 96.0, 'z': -60.0, 'a': 0.0},
    {'n': 'Rahmaniya', 'x': -112.0, 'z': -28.0, 'a': 0.0},
    {'n': 'Kshisha Park 1', 'x': -98.0, 'z': -4.0, 'a': 0.0},
    {'n': 'Kshisha Park 2', 'x': -130.0, 'z': -4.0, 'a': 0.0},
    {'n': 'Community Park', 'x': -138.0, 'z': -51.0, 'a': 0.0},
]

data = {
    'meta': {
        'source': 'Procedural Al Sajaa layout (not survey data)',
        'fetched': None,
        'origin': {'lat': 25.3370, 'lon': 55.4360},
        'rotationDeg': 0,
        'unitMeters': 10,
        'rect': {'minX': -152, 'maxX': 120, 'minZ': -80, 'maxZ': 46},
        'blocks': blocks,
    },
    'land': land,
    'coast': coast,
    'roads': roads,
    'buildings': buildings,
    'parks': parks,
    'palms': palms,
    'places': places,
    'labels': labels,
}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'w') as f:
    json.dump(data, f)
print('blocks', blocks, 'roads', len(roads), 'buildings', len(buildings), 'parks', len(parks), 'palms', len(palms))
