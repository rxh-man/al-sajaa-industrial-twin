import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import { Color, FogExp2, Mesh, ShaderMaterial, Vector3, type DirectionalLight } from 'three';
import { FOG_COLOR, FOG_DENSITY, SKY_BOTTOM, SUN_COLOR, SUN_DIR, SUN_INTENSITY } from './sceneConfig';
import { createSkyMaterial } from './sky';
import { G } from './shaders/globals';

function SkyDome() {
  const mat = useMemo(() => createSkyMaterial(false), []);
  const ref = useRef<Mesh>(null);
  useFrame(({ camera }) => {
    if (ref.current) ref.current.position.copy(camera.position);
  });
  return (
    <mesh ref={ref} material={mat} renderOrder={-100} frustumCulled={false}>
      <sphereGeometry args={[800, 48, 24]} />
    </mesh>
  );
}

/** The sky rendered once into the environment map: glass, paint and water reflect the dusk. */
function EnvSky() {
  const mat = useMemo(() => createSkyMaterial(true), []);
  return (
    <mesh material={mat} scale={400}>
      <sphereGeometry args={[1, 48, 24]} />
    </mesh>
  );
}

/** Engineering "workspace" grid beneath the diorama; drops with the exploded view. */
function GridFloor() {
  const mat = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { uExploded: G.uExploded, uColor: { value: new Color('#5f8db8') } },
        vertexShader: /* glsl */ `
          varying vec2 vXZ;
          uniform float uExploded;
          void main() {
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vXZ = wp.xz;
            wp.y -= uExploded * 26.0;
            gl_Position = projectionMatrix * viewMatrix * wp;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor;
          varying vec2 vXZ;
          float grid(vec2 p, float s, float w) {
            vec2 g = abs(fract(p / s + 0.5) - 0.5) * s;
            vec2 fw = fwidth(p) * w;
            return 1.0 - min(smoothstep(0.0, fw.x, g.x), smoothstep(0.0, fw.y, g.y));
          }
          void main() {
            float d = length(vXZ);
            float fade = 1.0 - smoothstep(90.0, 330.0, d);
            float g1 = grid(vXZ, 10.0, 1.2) * 0.35;
            float g2 = grid(vXZ, 50.0, 1.6) * 0.5;
            float a = max(g1, g2) * fade * 0.24;
            gl_FragColor = vec4(uColor * 0.55, a);
          }
        `,
      }),
    [],
  );
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, -16.5, 10]} material={mat} renderOrder={-50}>
      <planeGeometry args={[760, 760, 1, 1]} />
    </mesh>
  );
}

/** Fits the orthographic shadow frustum tightly around the city as seen from the sun. */
function fitShadow(light: DirectionalLight) {
  const center = new Vector3(0, 0, 10);
  const pos = SUN_DIR.clone().multiplyScalar(260).add(center);
  light.position.copy(pos);
  light.target.position.copy(center);
  light.target.updateMatrixWorld();
  const z = pos.clone().sub(center).normalize();
  const x = new Vector3(0, 1, 0).cross(z).normalize();
  const y = z.clone().cross(x);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minD = Infinity;
  let maxD = -Infinity;
  const c = new Vector3();
  for (const cx of [-98, 98])
    for (const cy of [-1, 34])
      for (const cz of [-70, 94]) {
        c.set(cx, cy, cz).sub(pos);
        const lx = c.dot(x);
        const ly = c.dot(y);
        const ld = -c.dot(z);
        minX = Math.min(minX, lx);
        maxX = Math.max(maxX, lx);
        minY = Math.min(minY, ly);
        maxY = Math.max(maxY, ly);
        minD = Math.min(minD, ld);
        maxD = Math.max(maxD, ld);
      }
  const cam = light.shadow.camera;
  cam.left = minX - 1;
  cam.right = maxX + 1;
  cam.bottom = minY - 1;
  cam.top = maxY + 1;
  cam.near = Math.max(1, minD - 5);
  cam.far = maxD + 5;
  cam.updateProjectionMatrix();
}

export function SceneEnvironment({ shadowSize = 4096 }: { shadowSize?: number }) {
  const scene = useThree((s) => s.scene);
  const keyRef = useRef<DirectionalLight>(null);

  useEffect(() => {
    scene.fog = new FogExp2(FOG_COLOR, FOG_DENSITY);
    scene.background = new Color(SKY_BOTTOM);
    return () => {
      scene.fog = null;
    };
  }, [scene]);

  useEffect(() => {
    if (keyRef.current) fitShadow(keyRef.current);
  }, []);

  return (
    <>
      <SkyDome />
      <GridFloor />
      {/* cool sky dome above, warm bounce from the ground */}
      <hemisphereLight args={['#8d9dbd', '#2a2219', 0.5]} />
      {/* low golden sun: long shadows across the blocks */}
      <directionalLight
        ref={keyRef}
        intensity={SUN_INTENSITY}
        color={SUN_COLOR}
        castShadow
        shadow-mapSize={[shadowSize, shadowSize]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
      />
      {/* cool skylight from the opposite (east) side so shaded facades keep their form */}
      <directionalLight position={[120, 70, -60]} intensity={0.36} color="#93a6c9" />
      <directionalLight position={[40, -30, 120]} intensity={0.18} color="#4a6a96" />
      <Environment resolution={256} frames={1} environmentIntensity={0.55}>
        <EnvSky />
        <Lightformer form="rect" intensity={0.5} color="#9fb9e0" scale={[300, 300, 1]} position={[0, 180, 0]} rotation-x={Math.PI / 2} />
        <Lightformer form="rect" intensity={0.35} color="#5b86c4" scale={[250, 40, 1]} position={[220, 30, 40]} rotation-y={-Math.PI / 2} />
      </Environment>
    </>
  );
}
