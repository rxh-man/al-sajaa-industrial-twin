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
hw('Emirates Road E611', 'trunk', 2.4, 0, south_stub, 'e611s')
hw('E611 flyover over Etihad Rail', 'trunk', 2.4, 1, bridge_pts, 'e611b')
hw('Emirates Road E611', 'trunk', 2.4, 0, north_pts, 'e611n')
e88 = [[x, round(E88_Z + 1.5 * math.sin((x + 68) / 25), 2)] for x in range(-68, 122, 2)]
hw('Emirates Road E88', 'trunk', 2.4, 0, e88, 'e88')
for k_, (ox, oz) in enumerate([(-8, 8), (8, 8), (8, -8), (-8, -8)]):
    lcx, lcz, lr = -68 + ox, E88_Z + oz, 4.2
    loop = [[round(lcx + lr * math.cos(t), 2), round(lcz + lr * math.sin(t), 2)]
            for t in [2 * math.pi * q / 14 for q in range(15)]]
    hw(f'Cloverleaf loop {k_ + 1}', 'secondary', 1.0, 1, loop, f'loop{k_}_')
# slip ramps joining the loops to E611 and E88
hw('Cloverleaf ramp E611 north', 'secondary', 1.0, 1, [[-68, -48], [-68, -50], [-68, -52]], 'rampn')
hw('Cloverleaf ramp E88 east', 'secondary', 1.0, 1, [[-62, -57], [-60, -57], [-58, -57]], 'rampe')
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
        if r < .45:
            add_building('Tower', 'tower', R.uniform(4, 7.5), x, z, w, d, R.choice(SHAPES))
        elif r < .75:
            add_building('Office Tower', 'office', R.uniform(2.5, 5), x, z, w, d, R.choice(SHAPES))
        else:
            add_building('Residential', 'residential', R.uniform(1.5, 2.6), x, z, w, d, R.choice(SHAPES))
    elif cat == 'mix':
        if big and R.random() < .4:
            add_building('Mall', 'mall', .8, x, z, w, d, R.choice(['rect', 'U']))
        elif big and R.random() < .5:
            add_building('Hotel', 'hotel', R.uniform(2.5, 4.5), x, z, w, d, R.choice(SHAPES))
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
        gl = 2.9 if X[i] in HWY_X else GAP
        gr = 2.9 if X[i + 1] in HWY_X else GAP
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
rail_pts = [[x, -50.5] for x in range(-72, 121, 2)]
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

# ---------- coast and land ----------
coast = [[x, round(coastZ(x), 2)] for x in range(-68, 122, 2)]
land = [[-68, -62], [120, -62]] + [[x, z] for x, z in reversed(coast)]

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
]
places.append({'role': 'landmark', 'n': 'Etihad Rail Station', 'x': 0.0, 'z': -49.5, 'h': 3.0})
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
]

data = {
    'meta': {
        'source': 'Procedural Al Sajaa layout (not survey data)',
        'fetched': None,
        'origin': {'lat': 25.3370, 'lon': 55.4360},
        'rotationDeg': 0,
        'unitMeters': 10,
        'rect': {'minX': -68, 'maxX': 120, 'minZ': -62, 'maxZ': 46},
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
