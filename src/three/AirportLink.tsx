import { useMemo } from 'react';
import { createAsphaltMaterial } from './materials/surfaceMaterials';
import { AIRPORT_CENTRE } from '../aviation/AviationScene';

/** The city's east road extended to the MRR Gateway airport slab. Always visible: it is part of the city map. */
const FROM_X = 72; // city east edge
const TO_X = AIRPORT_CENTRE.x - 200 + 4; // airport slab west edge (4 units clear of the slab)

export function AirportLink() {
  const asphalt = useMemo(() => createAsphaltMaterial(), []);
  const len = TO_X - FROM_X;
  return (
    <group name="airport-link">
      <mesh position={[FROM_X + len / 2, 0.03, 0]} material={asphalt}>
        <boxGeometry args={[len, 0.12, 8]} />
      </mesh>
    </group>
  );
}
