import { Vector2, Vector3, Vector4, Color } from 'three';
import { LEAK, TRENCH, IMPACT } from '../../data/incident';

/**
 * Uniform objects shared (by reference) across every custom material.
 * Updating `.value` once per frame updates the whole scene.
 */
export const G = {
  uTime: { value: 0 },
  uXray: { value: 0 },
  uTrench: { value: 0 },
  uExploded: { value: 0 },
  uFuture: { value: 0 },
  uBurst: { value: 0 },
  uHealed: { value: 0 },
  uImpactCenter: { value: new Vector2(IMPACT.center.x, IMPACT.center.z) },
  uImpactRadius: { value: 0 },
  uImpactStrength: { value: 0 },
  uHoverBuilding: { value: -1 },
  uSelectedBuilding: { value: -1 },
  uLeakPos: { value: new Vector3(LEAK.x, LEAK.y, LEAK.z) },
  uMoisture: { value: 0 },
  uTrenchRect: { value: new Vector4(TRENCH.minX, TRENCH.minZ, TRENCH.maxX, TRENCH.maxZ) },
  uRoadAlert: { value: 0 },
  uSectorAlert: { value: 0 },
  uSectorColor: { value: new Color('#f5b544') },
  uHoverSector: { value: -1 },
  uAlertSector: { value: -1 },
  uGhostColor: { value: new Color('#7fd8f2') },
  uAmber: { value: new Color('#ffb547') },
};

export type GlobalUniforms = typeof G;
