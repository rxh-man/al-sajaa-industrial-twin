import { Color, InstancedBufferAttribute, MeshStandardMaterial } from 'three';
import { G } from '../shaders/globals';
import { patchMaterial } from '../shaders/patch';

/**
 * One material for every vehicle. Per-vertex `aPart` selects paint / glass / rubber /
 * chrome / lamps; per-instance `aState` = (headlights, brake, beacons, indicator −1|0|1).
 * Paint comes from the instance colour. Fades to a fresnel ghost in X-ray mode.
 */
export function createVehicleMaterial(accent = '#f07c1e') {
  const mat = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.35, metalness: 0.5, envMapIntensity: 1.25, transparent: true });
  return patchMaterial(mat, {
    key: 'vehicle',
    uniforms: { uXray: G.uXray, uGhostColor: G.uGhostColor, uTime: G.uTime, uAccent: { value: new Color(accent) } },
    vertexHead: /* glsl */ `
      attribute float aPart;
      attribute vec4 aState;
      varying float vPart;
      varying vec4 vState;
      varying float vSeedV;
    `,
    vertexTransform: /* glsl */ `
      vPart = aPart;
      vState = aState;
      #ifdef USE_INSTANCING
        vSeedV = fract(instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.71);
      #else
        vSeedV = 0.0;
      #endif
    `,
    fragmentHead: /* glsl */ `
      uniform float uXray;
      uniform vec3 uGhostColor;
      uniform float uTime;
      uniform vec3 uAccent;
      varying float vPart;
      varying vec4 vState;
      varying float vSeedV;
      vec3 gVEmit;
      float gVRough;
      float gVMetal;
    `,
    fragmentColor: /* glsl */ `
      {
        float part = floor(vPart + 0.5);
        float lightsOn = vState.x;
        float brake = vState.y;
        float beacon = vState.z;
        float ind = vState.w;
        vec3 c = diffuseColor.rgb;
        gVRough = 0.3;
        gVMetal = 0.55;
        gVEmit = vec3(0.0);
        if (part == 1.0) { c = vec3(0.03, 0.04, 0.05); gVRough = 0.05; gVMetal = 0.92; }
        else if (part == 2.0) { c = vec3(0.028, 0.03, 0.033); gVRough = 0.72; gVMetal = 0.05; }
        else if (part == 3.0) { c = vec3(0.86, 0.86, 0.84); gVRough = 0.12; gVMetal = 0.3; gVEmit = vec3(1.0, 0.93, 0.8) * 5.5 * lightsOn; }
        else if (part == 4.0) { c = vec3(0.42, 0.03, 0.03); gVRough = 0.25; gVMetal = 0.1; gVEmit = vec3(1.0, 0.05, 0.03) * (1.1 * lightsOn + 4.0 * brake); }
        else if (part == 5.0) { c = vec3(0.6, 0.62, 0.64); gVRough = 0.25; gVMetal = 0.9; }
        else if (part == 6.0) { c = vec3(1.0, 0.92, 0.7); gVEmit = vec3(1.0, 0.84, 0.5) * 2.0; }
        else if (part == 7.0) { float on = step(0.5, fract(uTime * 2.3 + vSeedV)); c = vec3(0.45, 0.04, 0.04); gVEmit = vec3(1.0, 0.07, 0.05) * 8.0 * beacon * on; }
        else if (part == 8.0) { float on = 1.0 - step(0.5, fract(uTime * 2.3 + vSeedV)); c = vec3(0.04, 0.08, 0.45); gVEmit = vec3(0.12, 0.32, 1.0) * 9.0 * beacon * on; }
        else if (part == 9.0) { c = vec3(0.84, 0.85, 0.86); gVRough = 0.38; gVMetal = 0.1; }
        else if (part == 10.0) { c = uAccent; gVRough = 0.4; gVMetal = 0.1; gVEmit = uAccent * 0.08; }
        else if (part == 11.0) { float on = step(0.5, fract(uTime * 1.9 + vSeedV * 3.0)); c = vec3(0.6, 0.36, 0.05); gVEmit = vec3(1.0, 0.55, 0.08) * 8.0 * beacon * on; }
        else if (part >= 12.0) {
          float side = part == 12.0 ? 1.0 : -1.0;
          float on = step(0.5, fract(uTime * 1.6 + vSeedV)) * step(0.5, ind * side);
          c = vec3(0.6, 0.4, 0.1);
          gVEmit = vec3(1.0, 0.55, 0.1) * 5.0 * on;
        }
        diffuseColor.rgb = c;
      }
    `,
    fragmentEmissive: /* glsl */ `
      roughnessFactor = gVRough;
      metalnessFactor = gVMetal;
      totalEmissiveRadiance += gVEmit * (1.0 - uXray * 0.85);
    `,
    fragmentOutput: /* glsl */ `
      {
        float fres = pow(1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0), 2.0);
        outgoingLight = mix(outgoingLight, uGhostColor * (0.02 + fres * 0.4), uXray * 0.9);
        diffuseColor.a *= mix(1.0, 0.04 + fres * 0.16, uXray);
      }
    `,
  });
}

/** Per-instance (headlights, brake, beacons, indicator) attribute, attached to an instanced vehicle geometry. */
export function createStateAttribute(count: number) {
  const a = new InstancedBufferAttribute(new Float32Array(count * 4), 4);
  return a;
}
