import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BoxGeometry, BufferGeometry, Color, CylinderGeometry, EdgesGeometry, Float32BufferAttribute, Group, InstancedMesh, LineBasicMaterial, LineSegments, Matrix4, Quaternion, ShaderMaterial, Vector3, type Intersection, type Raycaster } from 'three';
import { LAYERS, LAYER_ORDER, NETWORKS, networkLengthM, type LayerId } from '../data/networks';
import { SENSORS } from '../data/sensors';
import { DIORAMA, RIVER } from '../data/city';
import { AD } from '../data/abudhabi';
import { live } from '../simulation/runtime';
import { NetworkLayer } from './networks/NetworkLayer';
import { SensorNodes } from './SensorNodes';
import { Valves } from './Valves';
import { LeakSimulation } from './LeakSimulation';
import { G } from './shaders/globals';
import { FadeHtml } from './labels/FadeHtml';
import { createPropMaterial } from './materials/surfaceMaterials';

const noRaycast = (_r: Raycaster, _i: Intersection[]) => {};

const PLATE_W = DIORAMA.maxX - DIORAMA.minX;
const PLATE_D = RIVER.minZ - DIORAMA.minZ;
const PLATE_CZ = (RIVER.minZ + DIORAMA.minZ) / 2;

/** Engineering plate shown under each layer in the exploded view. */
function ExplodedPlate({ color, y }: { color: string; y: number }) {
  const mat = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { uAmount: { value: 0 }, uColor: { value: new Color(color) } },
        vertexShader: /* glsl */ `
          varying vec2 vP;
          void main() {
            vP = position.xy;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uAmount;
          uniform vec3 uColor;
          varying vec2 vP;
          void main() {
            vec2 h = vec2(${(PLATE_W / 2).toFixed(1)}, ${(PLATE_D / 2).toFixed(1)});
            vec2 d = h - abs(vP);
            float edge = 1.0 - smoothstep(0.0, fwidth(min(d.x, d.y)) * 1.5 + 0.05, min(d.x, d.y));
            vec2 g = abs(fract(vP / 10.0 + 0.5) - 0.5) * 10.0;
            vec2 fw = fwidth(vP) * 1.2;
            float grid = 1.0 - min(smoothstep(0.0, fw.x, g.x), smoothstep(0.0, fw.y, g.y));
            float a = (0.035 + grid * 0.06 + edge * 0.7) * uAmount;
            gl_FragColor = vec4(uColor * (0.35 + edge * 0.9), a);
          }
        `,
      }),
    [color],
  );
  useFrame(() => {
    mat.uniforms.uAmount.value = G.uExploded.value;
  });
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, y, PLATE_CZ]} material={mat} raycast={noRaycast} renderOrder={-5}>
      <planeGeometry args={[PLATE_W, PLATE_D]} />
    </mesh>
  );
}

function LayerLabel({ id }: { id: LayerId }) {
  const layer = LAYERS[id];
  const metres = networkLengthM(id).toLocaleString('en-GB');
  return (
    <FadeHtml position={[DIORAMA.maxX + 6, layer.depth, RIVER.minZ - 4]} opacity={() => (G.uExploded.value - 0.6) * 2.5} zIndex={20}>
      <div className="layer-label" style={{ ['--c' as string]: layer.color }}>
        <span className="layer-label-swatch" />
        <div>
          <div className="layer-label-name">{layer.label}</div>
          <div className="layer-label-meta">{metres} m</div>
        </div>
      </div>
    </FadeHtml>
  );
}

function LayerGroup({ id }: { id: LayerId }) {
  const ref = useRef<Group>(null);
  const layer = LAYERS[id];
  useFrame(() => {
    if (ref.current) ref.current.position.y = G.uExploded.value * (layer.explodedY - layer.depth);
  });
  return (
    <group ref={ref}>
      {NETWORKS.filter((n) => n.layer.id === id).map((n) => (
        <NetworkLayer key={n.variant} network={n} />
      ))}
      <SensorNodes layer={id} />
      {id === 'water' && (
        <>
          <Valves />
          <LeakSimulation />
        </>
      )}
      <ExplodedPlate color={layer.color} y={layer.depth - 1.2} />
      <LayerLabel id={id} />
    </group>
  );
}

/** Vertical access shafts + chamber outlines linking sensors to their surface manholes. */
function AccessShafts() {
  const shaftRef = useRef<InstancedMesh>(null);
  const geo = useMemo(() => new CylinderGeometry(0.13, 0.13, 1, 8, 1, true), []);
  const mat = useMemo(() => createPropMaterial({ color: '#5d6875', roughness: 0.6, metalness: 0.3, opacity: 0.85 }), []);
  const chambers = useMemo(() => {
    const box = new EdgesGeometry(new BoxGeometry(1.7, 1.5, 1.7));
    const positions: number[] = [];
    const arr = box.getAttribute('position').array as Float32Array;
    for (const s of SENSORS) {
      for (let i = 0; i < arr.length; i += 3) positions.push(arr[i] + s.x, arr[i + 1] + s.y + 0.1, arr[i + 2] + s.z);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(positions, 3));
    const m = new LineBasicMaterial({ color: new Color('#6fa8c8'), transparent: true, opacity: 0.35 });
    const l = new LineSegments(g, m);
    l.raycast = noRaycast;
    return l;
  }, []);

  useLayoutEffect(() => {
    const m = new Matrix4();
    const q = new Quaternion();
    SENSORS.forEach((s, i) => {
      const h = -s.y - 0.8;
      m.compose(new Vector3(s.x, s.y + 0.8 + h / 2, s.z), q, new Vector3(1, h, 1));
      shaftRef.current!.setMatrixAt(i, m);
    });
    shaftRef.current!.instanceMatrix.needsUpdate = true;
    shaftRef.current!.computeBoundingSphere();
  }, []);

  useFrame(() => {
    const show = live.exploded < 0.05 && (live.xray > 0.05 || live.trench > 0.05);
    if (shaftRef.current) shaftRef.current.visible = show;
    chambers.visible = show;
    (chambers.material as LineBasicMaterial).opacity = 0.35 * Math.max(live.xray, live.trench);
  });

  return (
    <group>
      <instancedMesh ref={shaftRef} args={[geo, mat, SENSORS.length]} raycast={noRaycast} />
      <primitive object={chambers} />
    </group>
  );
}

function SurfaceLabel() {
  return (
    <FadeHtml position={[DIORAMA.maxX + 6, 0, RIVER.minZ - 4]} opacity={() => (G.uExploded.value - 0.6) * 2.5} zIndex={20}>
      <div className="layer-label" style={{ ['--c' as string]: '#c9d4e2' }}>
        <span className="layer-label-swatch" />
        <div>
          <div className="layer-label-name">City surface</div>
          <div className="layer-label-meta">{AD.buildings.length} buildings</div>
        </div>
      </div>
    </FadeHtml>
  );
}

export function UndergroundNetwork() {
  return (
    <group>
      {LAYER_ORDER.map((id) => (
        <LayerGroup key={id} id={id} />
      ))}
      <AccessShafts />
    </group>
  );
}

export { SurfaceLabel };
