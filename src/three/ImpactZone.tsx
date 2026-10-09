import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import { AdditiveBlending, Color, Mesh, ShaderMaterial, Vector3, type Intersection, type Raycaster } from 'three';
import { Hospital, School, Users, Construction } from 'lucide-react';
import { IMPACT, INCIDENT, LEAK_SURFACE, POI } from '../data/incident';
import { live, runtime } from '../simulation/runtime';
import { T } from '../simulation/timeline';
import { G } from './shaders/globals';
import { GLSL_COMMON } from './shaders/glsl';
import { FadeHtml } from './labels/FadeHtml';
import { useTwinStore } from '../store/useTwinStore';

const noRaycast = (_r: Raycaster, _i: Intersection[]) => {};
const AMBER = new Color('#ffb547');
const RED = new Color('#ff5040');

/** Expanding translucent influence zone on the ground around B-12. */
function ZoneDisc() {
  const size = IMPACT.futureRadius * 2 + 8;
  const mat = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: {
          uTime: G.uTime,
          uRadius: G.uImpactRadius,
          uStrength: G.uImpactStrength,
          uColor: { value: AMBER.clone() },
          uTrench: G.uTrench,
        },
        vertexShader: /* glsl */ `
          varying vec2 vP;
          void main() {
            vP = position.xy;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uTime;
          uniform float uRadius;
          uniform float uStrength;
          uniform vec3 uColor;
          varying vec2 vP;
          void main() {
            float R = uRadius;
            if (R < 0.05) discard;
            float d = length(vP);
            if (d > R + 4.0) discard;
            float inside = 1.0 - smoothstep(R - 0.25, R + 0.05, d);
            float ring = exp(-abs(d - R) * 2.2);
            float fill = inside * (0.01 + 0.03 * pow(d / R, 2.0));
            float ang = atan(vP.y, vP.x);
            float dashes = step(0.5, fract(ang * 18.0 / 6.2831));
            float r1 = (1.0 - smoothstep(0.0, 0.18, abs(d - R * 0.36))) * dashes;
            float r2 = (1.0 - smoothstep(0.0, 0.18, abs(d - R * 0.68))) * dashes;
            float sw = fract(ang / 6.2831 - uTime * 0.08);
            float sweep = exp(-sw * 10.0) * inside * 0.5;
            float wave = exp(-abs(d - fract(uTime * 0.22) * R) * 1.4) * inside * 0.35;
            float a = fill + ring * 0.9 + (r1 + r2) * 0.08 * inside + sweep * 0.06 + wave * 0.07;
            gl_FragColor = vec4(uColor * a * uStrength * 1.25, 1.0);
          }
        `,
      }),
    [],
  );
  useFrame(() => {
    mat.uniforms.uColor.value.copy(AMBER).lerp(RED, Math.max(live.future, live.burst, live.sectorSeverity * 0.35));
  });
  return (
    <mesh rotation-x={-Math.PI / 2} position={[IMPACT.center.x, 0.22, IMPACT.center.z]} material={mat} raycast={noRaycast} renderOrder={7}>
      <planeGeometry args={[size, size]} />
    </mesh>
  );
}

function Arc({ to }: { to: [number, number, number] }) {
  const points = useMemo(() => {
    const a = new Vector3(LEAK_SURFACE.x, 0.3, LEAK_SURFACE.z);
    const b = new Vector3(...to);
    const mid = a.clone().lerp(b, 0.5);
    mid.y += a.distanceTo(b) * 0.28 + 2;
    const pts: Vector3[] = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      const p = a.clone().multiplyScalar((1 - t) * (1 - t)).add(mid.clone().multiplyScalar(2 * (1 - t) * t)).add(b.clone().multiplyScalar(t * t));
      pts.push(p);
    }
    return pts;
  }, [to]);
  const ref = useRef<{ material: { dashOffset: number; opacity: number } } | null>(null);
  useFrame((_, dt) => {
    const m = ref.current?.material;
    if (!m) return;
    m.dashOffset -= dt * 1.6;
    m.opacity = live.pois * 0.9;
  });
  return (
    <group>
      <Line
        ref={ref as never}
        points={points}
        color={new Color('#ffcf7a').multiplyScalar(1.6)}
        lineWidth={1.6}
        dashed
        dashSize={0.9}
        gapSize={0.6}
        transparent
        opacity={0}
        depthWrite={false}
        raycast={noRaycast}
      />
    </group>
  );
}

function PoiBadges() {
  const future = useTwinStore((s) => s.future || s.compare === 'none');
  return (
    <group>
      <FadeHtml position={[POI.hospital.x, POI.hospital.y + 2.2, POI.hospital.z]} opacity={() => live.pois} zIndex={26}>
        <div className="poi-badge is-hospital">
          <span className="poi-icon">
            <Hospital size={15} strokeWidth={2.2} />
          </span>
          <div>
            <div className="poi-name">{POI.hospital.name}</div>
            <div className="poi-meta">{POI.hospital.distanceM} m</div>
          </div>
        </div>
      </FadeHtml>
      <FadeHtml position={[POI.school.x, POI.school.y + 2.2, POI.school.z]} opacity={() => live.pois} zIndex={25}>
        <div className="poi-badge is-school">
          <span className="poi-icon">
            <School size={15} strokeWidth={2.2} />
          </span>
          <div>
            <div className="poi-name">{POI.school.name}</div>
            <div className="poi-meta">{POI.school.distanceM} m</div>
          </div>
        </div>
      </FadeHtml>
      <Arc to={[POI.hospital.x, POI.hospital.y + 0.4, POI.hospital.z]} />
      <Arc to={[POI.school.x, POI.school.y + 0.4, POI.school.z]} />
      <FadeHtml position={[IMPACT.center.x - 30, 1.2, IMPACT.center.z - 40]} opacity={() => live.impact * live.pois} zIndex={22}>
        <div className="zone-label">
          <Users size={14} strokeWidth={2.2} />
          <span className="tnum">{(future ? INCIDENT.futurePopulation : INCIDENT.population).toLocaleString('en-US')}</span>
          <span className="zone-label-sub">people</span>
        </div>
      </FadeHtml>
    </group>
  );
}

/** Khalifa Street closure-risk overlay (amber → red when projected / burst). */
function RoadAlert() {
  const mat = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: {
          uTime: G.uTime,
          uAmount: { value: 0 },
          uSeverity: { value: 0 },
          uHalf: { value: 30 },
          uTrench: G.uTrench,
          uTrenchRect: G.uTrenchRect,
        },
        vertexShader: /* glsl */ `
          varying vec3 vW;
          void main() {
            vec4 w = modelMatrix * vec4(position, 1.0);
            vW = w.xyz;
            gl_Position = projectionMatrix * viewMatrix * w;
          }
        `,
        fragmentShader:
          GLSL_COMMON +
          /* glsl */ `
          uniform float uTime;
          uniform float uAmount;
          uniform float uSeverity;
          uniform float uHalf;
          uniform float uTrench;
          uniform vec4 uTrenchRect;
          varying vec3 vW;
          void main() {
            vec2 p = vW.xz;
            if (uTrench > 0.02 && p.x > uTrenchRect.x && p.x < uTrenchRect.z && p.y > uTrenchRect.y && p.y < uTrenchRect.w) discard;
            float ax = abs(p.x - 2.0);
            if (ax > uHalf) discard;
            float endFade = 1.0 - smoothstep(uHalf - 3.0, uHalf, ax);
            float stripes = step(0.5, fract((p.x + p.y) * 0.35 - uTime * 0.6));
            float edge = 1.0 - smoothstep(0.0, 0.25, 4.5 - abs(p.y));
            vec3 amber = vec3(1.0, 0.68, 0.22);
            vec3 red = vec3(1.0, 0.27, 0.2);
            vec3 c = mix(amber, red, uSeverity);
            float a = (stripes * 0.09 + edge * 0.7 + 0.03) * endFade * uAmount;
            gl_FragColor = vec4(c * a * 1.4, 1.0);
          }
        `,
      }),
    [],
  );
  useFrame(() => {
    const sev = Math.max(live.future, live.burst);
    mat.uniforms.uAmount.value = live.road;
    mat.uniforms.uSeverity.value = sev;
    mat.uniforms.uHalf.value = 30 + sev * 14;
  });
  const future = useTwinStore((s) => s.future || s.compare === 'none');
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[2, 0.05, 0]} material={mat} raycast={noRaycast} renderOrder={6}>
        <planeGeometry args={[96, 9.2]} />
      </mesh>
      <FadeHtml position={[-24, 0.6, 2.5]} opacity={() => live.road} zIndex={23}>
        <div className={`road-chip ${future ? 'is-closed' : ''}`}>
          <Construction size={13} strokeWidth={2.2} />
          <span>Khalifa St</span>
          <b>{future ? 'CLOSED' : 'at risk'}</b>
        </div>
      </FadeHtml>
    </group>
  );
}

/** +48 h / no-intervention damage: wet asphalt, cracks, warning outline, pooling water. */
function SurfaceDamage() {
  const mat = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
          uTime: G.uTime,
          uAmount: { value: 0 },
          uBurst: { value: 0 },
          uTrench: G.uTrench,
          uTrenchRect: G.uTrenchRect,
        },
        vertexShader: /* glsl */ `
          varying vec3 vW;
          void main() {
            vec4 w = modelMatrix * vec4(position, 1.0);
            vW = w.xyz;
            gl_Position = projectionMatrix * viewMatrix * w;
          }
        `,
        fragmentShader:
          GLSL_COMMON +
          /* glsl */ `
          uniform float uTime;
          uniform float uAmount;
          uniform float uBurst;
          uniform float uTrench;
          uniform vec4 uTrenchRect;
          varying vec3 vW;
          void main() {
            vec2 p = vW.xz - vec2(${LEAK_SURFACE.x.toFixed(2)}, ${LEAK_SURFACE.z.toFixed(2)});
            vec2 w = vW.xz;
            if (uTrench > 0.02 && w.x > uTrenchRect.x && w.x < uTrenchRect.z && w.y > uTrenchRect.y && w.y < uTrenchRect.w) discard;
            float R = 3.0 + uAmount * 6.0 + uBurst * 7.0;
            vec2 q = p * vec2(0.55, 1.0);
            float d = length(q) + (gnoise(p * 0.6) - 0.5) * 2.2;
            float wet = 1.0 - smoothstep(R * 0.7, R, d);
            float cracks = 0.0;
            for (int i = 0; i < 3; i++) {
              float fi = float(i);
              float n = gnoise(p * (1.4 + fi * 0.9) + fi * 7.0);
              cracks = max(cracks, 1.0 - smoothstep(0.0, 0.035, abs(n - 0.5)));
            }
            cracks *= (1.0 - smoothstep(R * 0.4, R * 0.9, d));
            float outline = exp(-abs(d - R * 1.08) * 2.5);
            float pool = (1.0 - smoothstep(R * 0.25, R * 0.62, d)) * uBurst;
            vec3 col = vec3(0.0);
            float a = wet * 0.55;
            col = mix(col, vec3(0.02, 0.05, 0.08), wet);
            col += vec3(0.05, 0.16, 0.24) * pool * (0.7 + 0.3 * sin(uTime * 1.5 + d));
            col = mix(col, vec3(0.0), cracks * 0.9);
            a = max(a, cracks * 0.85 * wet);
            col += vec3(1.4, 0.32, 0.22) * outline * (0.6 + 0.4 * sin(uTime * 3.0));
            a = max(a, outline * 0.85);
            a = max(a, pool * 0.75);
            gl_FragColor = vec4(col, a * min(1.0, uAmount + uBurst));
          }
        `,
      }),
    [],
  );
  const ref = useRef<Mesh>(null);
  useFrame(() => {
    mat.uniforms.uAmount.value = live.future;
    mat.uniforms.uBurst.value = live.burst;
    if (ref.current) ref.current.visible = live.future + live.burst > 0.01;
  });
  return (
    <mesh ref={ref} rotation-x={-Math.PI / 2} position={[LEAK_SURFACE.x, 0.07, LEAK_SURFACE.z]} material={mat} raycast={noRaycast} renderOrder={6}>
      <planeGeometry args={[46, 26]} />
    </mesh>
  );
}

/** Emerald ripples from the repaired site when the failure is prevented. */
function HealPulse() {
  const mat = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: { uElapsed: { value: -1 }, uColor: { value: new Color('#34d399').multiplyScalar(1.6) } },
        vertexShader: /* glsl */ `
          varying vec2 vP;
          void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
        `,
        fragmentShader: /* glsl */ `
          uniform float uElapsed;
          uniform vec3 uColor;
          varying vec2 vP;
          void main() {
            if (uElapsed < 0.0) discard;
            float d = length(vP);
            float a = 0.0;
            for (int k = 0; k < 3; k++) {
              float e = uElapsed - float(k) * 0.55;
              if (e < 0.0) continue;
              float r = 3.0 + e * 26.0;
              float fade = 1.0 - smoothstep(0.0, 2.6, e);
              a += (1.0 - smoothstep(0.0, 0.5 + e * 0.35, abs(d - r))) * fade;
            }
            gl_FragColor = vec4(uColor * a * 0.8, 1.0);
          }
        `,
      }),
    [],
  );
  const ref = useRef<Mesh>(null);
  useFrame(() => {
    const active = useTwinStore.getState().status !== 'idle';
    const e = active ? runtime.t - T.resolved : -1;
    const on = e >= 0 && e < 4.5;
    mat.uniforms.uElapsed.value = on ? e : -1;
    if (ref.current) ref.current.visible = on;
  });
  return (
    <mesh ref={ref} rotation-x={-Math.PI / 2} position={[IMPACT.center.x, 0.3, IMPACT.center.z]} material={mat} raycast={noRaycast} renderOrder={8}>
      <planeGeometry args={[150, 150]} />
    </mesh>
  );
}

export function ImpactZone() {
  return (
    <group>
      <ZoneDisc />
      <HealPulse />
      <RoadAlert />
      <SurfaceDamage />
      <PoiBadges />
    </group>
  );
}

