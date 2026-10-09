import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import { AdditiveBlending, Color, ShaderMaterial, Vector3, type Intersection, type Raycaster } from 'three';
import { SENSORS } from '../data/sensors';
import { LEAK_SURFACE } from '../data/incident';
import { live, runtime } from '../simulation/runtime';
import { telemetryAt } from '../simulation/telemetry';
import { G } from './shaders/globals';
import { FadeHtml } from './labels/FadeHtml';
import { useTwinStore } from '../store/useTwinStore';
import { Crosshair } from 'lucide-react';

const noRaycast = (_r: Raycaster, _i: Intersection[]) => {};
const CLUSTER = SENSORS.filter((s) => s.cluster);
const TARGET = new Vector3(LEAK_SURFACE.x, 0.25, LEAK_SURFACE.z);

type LineRef = { material: { dashOffset: number; opacity: number } } | null;

function arcPoints(a: Vector3, b: Vector3, lift: number) {
  const mid = a.clone().lerp(b, 0.5);
  mid.y += lift;
  const pts: Vector3[] = [];
  for (let i = 0; i <= 28; i++) {
    const t = i / 28;
    pts.push(
      a
        .clone()
        .multiplyScalar((1 - t) * (1 - t))
        .add(mid.clone().multiplyScalar(2 * (1 - t) * t))
        .add(b.clone().multiplyScalar(t * t)),
    );
  }
  return pts;
}

function CorrelationArc({ from, idx }: { from: Vector3; idx: number }) {
  const pts = useMemo(() => arcPoints(from, TARGET, 2.2 + from.distanceTo(TARGET) * 0.25), [from]);
  const ref = useRef<LineRef>(null);
  useFrame((_, dt) => {
    const m = ref.current?.material;
    if (!m) return;
    m.dashOffset -= dt * (1.4 + idx * 0.1);
    m.opacity = live.correlation * 0.95;
  });
  return (
    <Line
      ref={ref as never}
      points={pts}
      color={new Color('#ffc861').multiplyScalar(1.8)}
      lineWidth={2.4}
      dashed
      dashSize={0.55}
      gapSize={0.4}
      transparent
      opacity={0}
      depthWrite={false}
      raycast={noRaycast}
    />
  );
}

/** Live sensor chips hovering above the surface access points during the anomaly. */
function SensorChip({ id, x, z, kind }: { id: string; x: number; z: number; kind: string }) {
  const valRef = useRef<HTMLSpanElement>(null);
  useFrame(() => {
    if (!valRef.current) return;
    const tel = telemetryAt(runtime.t, runtime.wall, useTwinStore.getState().status !== 'idle');
    let v = '';
    if (kind === 'pressure') {
      const f = id === 'P-17' ? 1 : id === 'P-14' ? 0.55 : 0.72;
      v = `${(tel.pressureDev * f).toFixed(1)}%`;
    } else if (kind === 'moisture') v = `+${(tel.moistureDev * (id === 'M-06' ? 1 : 0.82)).toFixed(0)}%`;
    else v = `+${tel.tempDev.toFixed(1)}%`;
    if (valRef.current.textContent !== v) valRef.current.textContent = v;
  });
  return (
    <FadeHtml position={[x, 1.4, z]} opacity={() => live.ping * (1 - live.trench * 1.5) * (1 - live.xray)} zIndex={18} center>
      <div className="sensor-chip">
        <span className="mono">{id}</span>
        <span className="tnum" ref={valRef} />
      </div>
    </FadeHtml>
  );
}

function Reticle() {
  const mat = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: { uTime: G.uTime, uAmount: { value: 0 }, uColor: { value: new Color('#ff7a52') } },
        vertexShader: /* glsl */ `
          varying vec2 vP;
          void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
        `,
        fragmentShader: /* glsl */ `
          uniform float uTime;
          uniform float uAmount;
          uniform vec3 uColor;
          varying vec2 vP;
          void main() {
            float d = length(vP);
            float ang = atan(vP.y, vP.x);
            float shrink = mix(1.8, 1.0, smoothstep(0.0, 1.0, uAmount));
            float r1 = 2.6 * shrink;
            float r2 = 1.6 * shrink;
            float ring1 = (1.0 - smoothstep(0.0, 0.07, abs(d - r1))) * step(0.35, fract((ang + uTime * 0.8) / 1.5708));
            float ring2 = (1.0 - smoothstep(0.0, 0.06, abs(d - r2))) * step(0.5, fract((ang - uTime * 1.3) / 0.785));
            float crossM = (1.0 - smoothstep(0.0, 0.05, min(abs(vP.x), abs(vP.y)))) * step(0.5, d) * step(d, 1.15);
            float coreM = exp(-d * 5.0);
            float a = (ring1 * 0.9 + ring2 * 0.8 + crossM * 0.9 + coreM * 1.2) * uAmount;
            gl_FragColor = vec4(uColor * a * 2.0, 1.0);
          }
        `,
      }),
    [],
  );
  useFrame(() => {
    mat.uniforms.uAmount.value = live.reticle;
  });
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[TARGET.x, 0.16, TARGET.z]} material={mat} raycast={noRaycast} renderOrder={9}>
        <planeGeometry args={[7, 7]} />
      </mesh>
      <FadeHtml position={[TARGET.x + 2.8, 2.2, TARGET.z]} opacity={() => live.reticle} zIndex={28}>
        <div className="reticle-chip">
          <Crosshair size={13} strokeWidth={2.4} />
          <span>Found the spot</span>
          <b className="mono">±4 m</b>
        </div>
      </FadeHtml>
    </group>
  );
}

export function Correlation() {
  const anchors = useMemo(() => CLUSTER.map((s) => new Vector3(s.x, 0.2, s.z)), []);
  return (
    <group>
      {anchors.map((a, i) => (
        <CorrelationArc key={CLUSTER[i].id} from={a} idx={i} />
      ))}
      {CLUSTER.map((s) => (
        <SensorChip key={s.id} id={s.id} x={s.x} z={s.z + (s.id === 'M-07' ? 1.2 : s.id === 'T-03' ? 1.3 : -1.2)} kind={s.type} />
      ))}
      <Reticle />
    </group>
  );
}
