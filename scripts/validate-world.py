#!/usr/bin/env python3
"""Whole-world geometry and road-network audit: the world the app renders (baseline + expansion +
corrections in src/data/alsajaa-fixes.json, merged as src/data/abudhabi.ts merges them).

validate-expansion.py checks the expansion districts on their own; this checks everything together:
  - building footprints on an at-grade carriageway, and footprints that overlap each other
  - buildings on the rail corridor, and roads that share the rail corridor lengthwise
  - buildings taller than the clearance under an elevated road deck
  - palms standing on a carriageway or inside a building
  - one connected drivable road network, and no dead ends away from the edge of the model

Usage: python3 scripts/validate-world.py [--raw] [--json]
  --raw   audit without the corrections file (the state before scripts/build-world-fixes.py)
Exit code 1 if any check fails.
"""
import json, sys
from world_lib import load_world, audit

world = load_world(with_fixes='--raw' not in sys.argv)
rep = audit(world)
if '--json' in sys.argv:
    print(json.dumps(rep, indent=1))
    sys.exit(0)

print(f"roads {len(world['roads'])} · buildings {len(world['buildings'])} · palms {len(world['palms'])} · corrections {'on' if world['fixes'] else 'off'}")
labels = [
    ('on_carriageway', 'buildings on an at-grade carriageway'),
    ('overlaps', 'overlapping building footprints'),
    ('on_rail', 'buildings on the rail corridor'),
    ('along_rail', 'roads sharing the rail corridor lengthwise'),
    ('under_deck', 'buildings taller than the clearance under an elevated deck'),
    ('palms_on_road', 'palms on a carriageway'),
    ('palms_in_building', 'palms inside a building'),
    ('dead_ends', 'dead ends away from the model edge'),
]
fail = False
for key, label in labels:
    print(f'{label}: {len(rep[key])}')
    for x in rep[key][:10]:
        print('   ', x)
    fail |= bool(rep[key])
print(f"rail crossings (each bridged, at most 4): {len(rep['rail_crossings'])}")
for x in rep['rail_crossings']:
    print('   ', x)
fail |= len(rep['rail_crossings']) > 4
print(f"drivable road networks: {len(rep['components'])}")
for x in rep['components'][:5]:
    print('   ', x)
fail |= len(rep['components']) != 1
print('FAIL' if fail else 'all world geometry checks passed')
sys.exit(1 if fail else 0)
