import { useLayoutEffect, useMemo, useRef } from 'react';
import { AdditiveBlending, BoxGeometry, Color, CylinderGeometry, InstancedMesh, Matrix4, PlaneGeometry, Quaternion, ShaderMaterial, Vector3, type Intersection, type Raycaster } from 'three';
import { SECTORS, PLINTH_H } from '../data/city';
import { createGlowMaterial, createPropMaterial } from './materials/surfaceMaterials';
import { G } from './shaders/globals';

const noRaycast = (_r: Raycaster, _i: Intersection[]) => {};

interface Lamp {
  x: number;
  z: number;
  ox: number; // arm direction (toward the road)
  oz: number;
}

function buildLamps(): Lamp[] {
  const lamps: Lamp[] = [];
  for (const s of SECTORS) {
    const off = 10.85;
    for (const a of [-6, 6]) {
      lamps.push({ x: s.x + a, z: s.z - off, ox: 0, oz: -1 });
      lamps.push({ x: s.x + a, z: s.z + off, ox: 0, oz: 1 });
      lamps.push({ x: s.x - off, z: s.z + a, ox: -1, oz: 0 });
      lamps.push({ x: s.x + off, z: s.z + a, ox: 1, oz: 0 });
    }
  }
  // Corniche promenade
  for (let x = -70; x <= 70; x += 10) lamps.push({ x, z: 64.2, ox: 0, oz: -1 });
  return lamps;
}

function StreetLights() {
  const lamps = useMemo(buildLamps, []);
  const n = lamps.length;
  const poleRef = useRef<InstancedMesh>(null);
  const armRef = useRef<InstancedMesh>(null);
  const headRef = useRef<InstancedMesh>(null);
  const poolRef = useRef<InstancedMesh>(null);

  const poleGeo = useMemo(() => new CylinderGeometry(0.045, 0.06, 1, 6).translate(0, 0.5, 0), []);
  const boxGeo = useMemo(() => new BoxGeometry(1, 1, 1), []);
  const poolGeo = useMemo(() => new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), []);
  const poleMat = useMemo(() => createPropMaterial({ color: '#3a414b', roughness: 0.5, metalness: 0.6 }), []);
  const headMat = useMemo(() => createGlowMaterial('#ffd9a3', 5.5, 0.08), []);
  const poolMat = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: { uXray: G.uXray, uColor: { value: new Color('#ffbf73') } },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() { vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }
        `,
        fragmentShader: /* glsl */ `
          uniform float uXray; uniform vec3 uColor; varying vec2 vUv;
          void main() {
            float d = length(vUv);
            float a = (1.0 - smoothstep(0.0, 1.0, d)) * (1.0 - smoothstep(0.0, 1.0, d));
            gl_FragColor = vec4(uColor * a * 0.16 * (1.0 - uXray), 1.0);
          }
        `,
      }),
    [],
  );

  useLayoutEffect(() => {
    const m = new Matrix4();
    const q = new Quaternion();
    const H = 1.6;
    lamps.forEach((l, i) => {
      const base = PLINTH_H;
      m.compose(new Vector3(l.x, base, l.z), q, new Vector3(1, H, 1));
      poleRef.current!.setMatrixAt(i, m);
      const ax = l.x + l.ox * 0.3;
      const az = l.z + l.oz * 0.3;
      const along = l.ox !== 0;
      m.compose(new Vector3(ax, base + H - 0.02, az), q, new Vector3(along ? 0.6 : 0.05, 0.04, along ? 0.05 : 0.6));
      armRef.current!.setMatrixAt(i, m);
      const hx = l.x + l.ox * 0.58;
      const hz = l.z + l.oz * 0.58;
      m.compose(new Vector3(hx, base + H - 0.06, hz), q, new Vector3(along ? 0.3 : 0.16, 0.05, along ? 0.16 : 0.3));
      headRef.current!.setMatrixAt(i, m);
      m.compose(new Vector3(hx + l.ox * 0.6, 0.15, hz + l.oz * 0.6), q, new Vector3(4.6, 1, 4.6));
      poolRef.current!.setMatrixAt(i, m);
    });
    for (const r of [poleRef, armRef, headRef, poolRef]) {
      r.current!.instanceMatrix.needsUpdate = true;
      r.current!.computeBoundingSphere();
    }
  }, [lamps]);

  return (
    <group>
      <instancedMesh ref={poleRef} args={[poleGeo, poleMat, n]} raycast={noRaycast} castShadow />
      <instancedMesh ref={armRef} args={[boxGeo, poleMat, n]} raycast={noRaycast} />
      <instancedMesh ref={headRef} args={[boxGeo, headMat, n]} raycast={noRaycast} />
      <instancedMesh ref={poolRef} args={[poolGeo, poolMat, n]} raycast={noRaycast} renderOrder={3} />
    </group>
  );
}

export function StreetFurniture() {
  return (
    <group>
      <StreetLights />
    </group>
  );
}
