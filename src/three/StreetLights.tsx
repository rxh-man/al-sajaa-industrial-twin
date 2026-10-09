import { useLayoutEffect, useMemo, useRef } from 'react';
import { AdditiveBlending, BoxGeometry, Color, CylinderGeometry, InstancedMesh, Matrix4, PlaneGeometry, Quaternion, ShaderMaterial, Vector3, type Intersection, type Raycaster } from 'three';
import { LAMPS, LAMP_H } from '../data/lamps';
import { createGlowMaterial, createPropMaterial } from './materials/surfaceMaterials';
import { G } from './shaders/globals';

const noRaycast = (_r: Raycaster, _i: Intersection[]) => {};

/** Dusk street lighting on the real roads: poles, arms, warm lamp heads and soft pools of light on the paving. */
export function StreetLights() {
  const n = LAMPS.length;
  const poleRef = useRef<InstancedMesh>(null);
  const armRef = useRef<InstancedMesh>(null);
  const headRef = useRef<InstancedMesh>(null);
  const poolRef = useRef<InstancedMesh>(null);

  const poleGeo = useMemo(() => new CylinderGeometry(0.03, 0.045, 1, 6).translate(0, 0.5, 0), []);
  const boxGeo = useMemo(() => new BoxGeometry(1, 1, 1), []);
  const poolGeo = useMemo(() => new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), []);
  const poleMat = useMemo(() => createPropMaterial({ color: '#3a414b', roughness: 0.5, metalness: 0.6 }), []);
  const headMat = useMemo(() => createGlowMaterial('#ffd9a3', 4.2, 0.08), []);
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
            gl_FragColor = vec4(uColor * a * 0.13 * (1.0 - uXray), 1.0);
          }
        `,
      }),
    [],
  );

  useLayoutEffect(() => {
    const m = new Matrix4();
    const q = new Quaternion();
    const up = new Vector3(0, 1, 0);
    LAMPS.forEach((l, i) => {
      // the arm (and its head) point along the lamp's own direction
      q.setFromAxisAngle(up, Math.atan2(l.ox, l.oz));
      m.compose(new Vector3(l.x, 0, l.z), q, new Vector3(1, LAMP_H, 1));
      poleRef.current!.setMatrixAt(i, m);
      m.compose(new Vector3(l.x + l.ox * 0.2, LAMP_H - 0.015, l.z + l.oz * 0.2), q, new Vector3(0.035, 0.03, 0.4));
      armRef.current!.setMatrixAt(i, m);
      const hx = l.x + l.ox * 0.38;
      const hz = l.z + l.oz * 0.38;
      m.compose(new Vector3(hx, LAMP_H - 0.045, hz), q, new Vector3(0.11, 0.035, 0.2));
      headRef.current!.setMatrixAt(i, m);
      m.compose(new Vector3(hx + l.ox * 0.4, 0.03, hz + l.oz * 0.4), q, new Vector3(2.8, 1, 2.8));
      poolRef.current!.setMatrixAt(i, m);
    });
    for (const r of [poleRef, armRef, headRef, poolRef]) {
      r.current!.instanceMatrix.needsUpdate = true;
      r.current!.computeBoundingSphere();
    }
  }, []);

  return (
    <group>
      <instancedMesh ref={poleRef} args={[poleGeo, poleMat, n]} raycast={noRaycast} castShadow />
      <instancedMesh ref={armRef} args={[boxGeo, poleMat, n]} raycast={noRaycast} />
      <instancedMesh ref={headRef} args={[boxGeo, headMat, n]} raycast={noRaycast} />
      <instancedMesh ref={poolRef} args={[poolGeo, poolMat, n]} raycast={noRaycast} renderOrder={3} />
    </group>
  );
}
