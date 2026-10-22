# Converts one or more OpenStreetMap .osm XML extracts into Overpass-style JSON
# (elements with resolved way geometry), merged and de-duplicated by OSM id.
#   python3 -I scripts/osm-xml-to-json.py out.json in1.osm [in2.osm ...]
# Relations are skipped and counted (the Al Sajaa builder reads ways only).
# Map data © OpenStreetMap contributors, ODbL.
import json
import sys
import xml.etree.ElementTree as ET

if len(sys.argv) < 3:
    sys.exit("usage: osm-xml-to-json.py out.json in1.osm [in2.osm ...]")
out_path, inputs = sys.argv[1], sys.argv[2:]

nodes = {}          # id -> (lat, lon, tags)
ways = {}           # id -> (node ids, tags)
skipped_relations = 0
bounds = []

for path in inputs:
    root = ET.parse(path).getroot()
    b = root.find("bounds")
    if b is not None:
        bounds.append({k: float(v) for k, v in b.attrib.items() if k in ("minlat", "minlon", "maxlat", "maxlon")})
    for n in root.iter("node"):
        tags = {t.get("k"): t.get("v") for t in n.findall("tag")}
        nodes.setdefault(int(n.get("id")), (float(n.get("lat")), float(n.get("lon")), tags))
    for w in root.iter("way"):
        refs = [int(nd.get("ref")) for nd in w.findall("nd")]
        tags = {t.get("k"): t.get("v") for t in w.findall("tag")}
        ways.setdefault(int(w.get("id")), (refs, tags))
    skipped_relations += len(root.findall("relation"))

elements = []
missing = 0
for wid, (refs, tags) in ways.items():
    geom = []
    for r in refs:
        if r in nodes:
            geom.append({"lat": nodes[r][0], "lon": nodes[r][1]})
        else:
            missing += 1
    if len(geom) < 2:
        continue
    elements.append({"type": "way", "id": wid, "tags": tags, "nodes": refs, "geometry": geom})

for nid, (lat, lon, tags) in nodes.items():
    if tags:  # only tagged nodes (named places, amenities)
        elements.append({"type": "node", "id": nid, "lat": lat, "lon": lon, "tags": tags})

# the merged file keeps the union of the extracts' bounds
if bounds:
    merged = {
        "minlat": min(b["minlat"] for b in bounds), "minlon": min(b["minlon"] for b in bounds),
        "maxlat": max(b["maxlat"] for b in bounds), "maxlon": max(b["maxlon"] for b in bounds),
    }
else:
    merged = None

with open(out_path, "w", encoding="utf-8") as f:
    json.dump({"bounds": merged, "elements": elements}, f, ensure_ascii=False)

print(f"ways={len(ways)} tagged_nodes={sum(1 for e in elements if e['type']=='node')} "
      f"relations_skipped={skipped_relations} node_refs_missing={missing} out={out_path}")
