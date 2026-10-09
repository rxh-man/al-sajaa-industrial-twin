import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  Mesh,
  NormalBlending,
  PointLight,
  Points,
  ShaderMaterial,
  SphereGeometry,
  DoubleSide,
  type Intersection,
  type Raycaster,
} from 'three';
import { LEAK, INCIDENT } from '../data/incident';
import { LAYERS } from '../data/networks';
import { live } from '../simulation/runtime';
import { G } from './shaders/globals';
import { GLSL_COMMON } from './shaders/glsl';
import { FadeHtml } from './labels/FadeHtml';
import { useTwinStore } from '../store/useTwinStore';
import { AlertTriangle } from 'lucide-react';

const noRaycast = (_r: Raycaster, _i: Intersection[]) => {};
const R = LAYERS.water.radius;

/** Procedural longitudinal fracture drawn on a sleeve hugging the pipe. */
function Crack() {
  const geo = useMemo(() => new CylinderGeometry(R * 1.015, R * 1.015, 2.0, 64, 1, true, -0.45, 2.5), []);
  const mat = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: NormalBlending,
        side: DoubleSide,
        uniforms: { uTime: G.uTime, uLeak: { value: 0 }, uHeal: { value: 0 } },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader:
          GLSL_COMMON +
          /* glsl */ `
          uniform float uTime;
          uniform float uLeak;
          uniform float uHeal;
          varying vec2 vUv;
          float crackLine(vec2 p, float base, float amp, float freq, float seed) {
            float c = base + amp * sin(p.y * freq + seed) + 0.035 * (gnoise(vec2(p.y * 22.0, seed)) - 0.5);
            return abs(p.x - c);
          }
          void main() {
            float L = clamp(uLeak, 0.0, 3.2);
            // u along circumference (x), v along pipe (y)
            vec2 p = vec2(vUv.x, vUv.y);
            float span = 0.18 + 0.2 * min(L, 1.0) + 0.12 * max(L - 1.0, 0.0);
            float along = abs(p.y - 0.5);
            float taper = 1.0 - smoothstep(span * 0.55, span, along);
            float d = crackLine(p, 0.62, 0.025, 31.0, 1.7);
            float b1 = crackLine(vec2(p.x - (p.y - 0.43) * 1.6, p.y), 0.62, 0.012, 50.0, 4.2) + step(0.47, p.y) * 1.0 + step(p.y, 0.36) * 1.0;
            float b2 = crackLine(vec2(p.x + (p.y - 0.58) * 1.3, p.y), 0.6, 0.012, 44.0, 7.1) + step(p.y, 0.55) * 1.0 + step(0.66, p.y) * 1.0;
            float dd = min(d, min(b1, b2));
            float w = 0.006 + 0.004 * min(L, 2.0);
            float core = (1.0 - smoothstep(w * 0.4, w, dd)) * taper;
            float glow = exp(-dd * 70.0) * taper;
            float halo = exp(-dd * 14.0) * (1.0 - smoothstep(span * 0.4, span * 1.25, along));
            float pulse = 0.75 + 0.25 * sin(uTime * 4.2);
            vec3 hot = vec3(1.0, 0.36, 0.12) * (5.0 * pulse);
            vec3 col = mix(vec3(0.02, 0.01, 0.01), hot, smoothstep(0.0, 1.0, glow * 1.4));
            col += vec3(1.0, 0.25, 0.1) * halo * 0.9 * pulse;
            float a = max(core, max(glow * 0.9, halo * 0.55));
            float vis = smoothstep(0.05, 0.3, L) * (1.0 - uHeal);
            gl_FragColor = vec4(col, a * vis);
          }
        `,
      }),
    [],
  );
  useFrame(() => {
    mat.uniforms.uLeak.value = live.leak;
    mat.uniforms.uHeal.value = Math.min(1, live.repairTone);
  });
  return <mesh geometry={geo} material={mat} position={[LEAK.x, LEAK.y, LEAK.z]} rotation-z={Math.PI / 2} raycast={noRaycast} renderOrder={12} />;
}

/** Spray / seepage droplets — fully GPU-driven, no per-frame CPU work. */
function Spray() {
  const COUNT = 420;
  const geo = useMemo(() => {
    const g = new BufferGeometry();
    const pos = new Float32Array(COUNT * 3);
    const seed = new Float32Array(COUNT * 4);
    for (let i = 0; i < COUNT; i++) {
      const f = (v: number) => v - Math.floor(v);
      const h = Math.sin(i * 78.233) * 43758.5453;
      seed.set([f(h), f(h * 1.31), f(h * 1.73), f(h * 2.39)], i * 4);
    }
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new Float32BufferAttribute(seed, 4));
    g.boundingSphere = null;
    return g;
  }, []);
  const mat = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: {
          uTime: G.uTime,
          uLeak: { value: 0 },
          uOrigin: { value: [LEAK.x, LEAK.y, LEAK.z] },
          uPixel: { value: 1 },
        },
        vertexShader: /* glsl */ `
          attribute vec4 aSeed;
          uniform float uTime;
          uniform float uLeak;
          uniform vec3 uOrigin;
          uniform float uPixel;
          varying float vA;
          void main() {
            float L = uLeak;
            float alive = step(aSeed.z, clamp(L * 0.34, 0.0, 1.0));
            float life = 0.9 + aSeed.w * 0.8;
            float age = fract(uTime / life * (0.8 + L * 0.25) + aSeed.y);
            float ang = (aSeed.x - 0.5) * 2.2;
            vec3 dir = normalize(vec3(sin(ang) * 0.55, 0.85 + aSeed.w * 0.4, 0.55 + cos(ang) * 0.35));
            float speed = (1.1 + aSeed.w * 1.6) * (0.55 + 0.45 * min(L, 3.0));
            float tt = age * life;
            vec3 p = uOrigin + vec3((aSeed.x - 0.5) * 0.9 * min(L + 0.3, 2.0), ${(R * 0.85).toFixed(3)}, ${(R * 0.45).toFixed(3)});
            p += dir * speed * tt + vec3(0.0, -2.2, 0.0) * tt * tt;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            float size = (0.018 + 0.026 * aSeed.x) * (1.0 - age * 0.5);
            gl_PointSize = size * uPixel / max(0.1, -mv.z);
            vA = alive * (1.0 - age) * smoothstep(0.0, 0.08, age);
          }
        `,
        fragmentShader: /* glsl */ `
          varying float vA;
          void main() {
            vec2 c = gl_PointCoord - 0.5;
            float d = length(c);
            if (d > 0.5 || vA < 0.01) discard;
            float a = smoothstep(0.5, 0.1, d) * vA;
            gl_FragColor = vec4(vec3(0.55, 0.85, 1.0) * 1.6 * a, 1.0);
          }
        `,
      }),
    [],
  );
  const ref = useRef<Points>(null);
  useFrame(({ size, camera }) => {
    mat.uniforms.uLeak.value = live.leak * (1 - Math.min(1, live.repairTone));
    // pixel scale: viewport height / (2 * tan(fov/2))
    const fov = ((camera as unknown as { fov: number }).fov ?? 35) * (Math.PI / 180);
    mat.uniforms.uPixel.value = (size.height * window.devicePixelRatio) / (2 * Math.tan(fov / 2));
    if (ref.current) ref.current.visible = mat.uniforms.uLeak.value > 0.02;
  });
  return <points ref={ref} geometry={geo} material={mat} frustumCulled={false} raycast={noRaycast} renderOrder={13} />;
}

/** Translucent wet-soil volume that expands with the leak. */
function MoistureVolume() {
  const geo = useMemo(() => new SphereGeometry(1, 40, 28), []);
  const mat = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: NormalBlending,
        uniforms: { uTime: G.uTime, uAmount: { value: 0 }, uColor: { value: new Color('#2a7fc0') } },
        vertexShader: /* glsl */ `
          varying vec3 vN;
          varying vec3 vV;
          varying vec3 vP;
          uniform float uTime;
          void main() {
            vec3 p = position;
            float w = sin(p.x * 3.0 + uTime * 0.8) * sin(p.z * 2.7 - uTime * 0.6) * 0.06;
            p += normal * w;
            vP = p;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            vN = normalize(normalMatrix * normal);
            vV = -mv.xyz;
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uAmount;
          uniform vec3 uColor;
          varying vec3 vN;
          varying vec3 vV;
          varying vec3 vP;
          void main() {
            float f = clamp(abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0);
            float body = pow(f, 1.6);
            float rim = pow(1.0 - f, 3.0);
            vec3 col = uColor * (0.35 + body * 0.4) + vec3(0.4, 0.75, 1.0) * rim * 0.6;
            gl_FragColor = vec4(col, (body * 0.22 + rim * 0.18) * uAmount);
          }
        `,
      }),
    [],
  );
  const ref = useRef<Mesh>(null);
  useFrame(() => {
    const m = live.moisture;
    const r = 0.6 + Math.min(m, 1) * 1.9 + Math.max(0, m - 1) * 2.1;
    if (ref.current) {
      ref.current.scale.set(r * 1.35, r * 0.85, r);
      ref.current.position.set(LEAK.x, LEAK.y + r * 0.25, LEAK.z);
      ref.current.visible = m > 0.03;
    }
    mat.uniforms.uAmount.value = Math.min(1, m * 1.2) * (1 - live.exploded * 0.6);
  });
  return <mesh ref={ref} geometry={geo} material={mat} raycast={noRaycast} renderOrder={11} />;
}

/** Hot glow at the fracture + a real point light so nearby pipes/walls pick up the alarm. */
function Hotspot() {
  const light = useRef<PointLight>(null);
  const sprite = useRef<Mesh>(null);
  const mat = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: { uAmount: { value: 0 }, uColor: { value: new Color('#ff5a30') } },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            vUv = uv * 2.0 - 1.0;
            vec4 c = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
            vec3 s = vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), 1.0);
            c.xy += position.xy * s.xy;
            gl_Position = projectionMatrix * c;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uAmount;
          uniform vec3 uColor;
          varying vec2 vUv;
          void main() {
            float r = length(vUv);
            float a = exp(-r * r * 5.0) * 0.9 + exp(-r * 14.0) * 1.5;
            gl_FragColor = vec4(uColor * a * uAmount, 1.0);
          }
        `,
      }),
    [],
  );
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const heal = Math.min(1, live.repairTone);
    const amt = Math.min(1.6, live.leak) * (1 - heal);
    const pulse = 0.72 + 0.28 * Math.sin(t * 4.2);
    if (light.current) light.current.intensity = amt * pulse * 26;
    mat.uniforms.uAmount.value = amt * pulse * 1.2;
    if (sprite.current) {
      const s = 1.3 + Math.min(live.leak, 3) * 0.55;
      sprite.current.scale.set(s, s, 1);
      sprite.current.visible = amt > 0.01;
    }
  });
  return (
    <group>
      <pointLight ref={light} position={[LEAK.x, LEAK.y + 1.1, LEAK.z + 1.0]} color="#ff5a36" intensity={0} distance={14} decay={1.6} />
      <mesh ref={sprite} position={[LEAK.x, LEAK.y + R * 0.5, LEAK.z + R * 0.6]} material={mat} raycast={noRaycast} renderOrder={14}>
        <planeGeometry args={[1, 1]} />
      </mesh>
    </group>
  );
}

function LeakAnnotation() {
  const future = useTwinStore((s) => s.future);
  return (
    <FadeHtml position={[LEAK.x, LEAK.y + 0.7, LEAK.z]} opacity={() => live.annotation * (1 - live.exploded)} zIndex={40}>
      <div className={`leak-annotation ${future ? 'is-future' : ''}`}>
        <svg className="leak-leader" width="96" height="74" viewBox="0 0 96 74" aria-hidden>
          <circle cx="4" cy="70" r="3.2" />
          <path d="M4 70 L44 22 L96 22" />
        </svg>
        <div className="leak-card">
          <div className="leak-title">
            <AlertTriangle size={14} strokeWidth={2.4} />
            {future ? 'PIPE BURST' : 'POSSIBLE WATER LEAK'}
          </div>
          <div className="leak-rows">
            <div>
              <span>How sure</span>
              <b className="tnum">{future ? '97%' : `${INCIDENT.confidence}%`}</b>
            </div>
            <div>
              <span>{future ? 'Burst at' : 'Predicted failure'}</span>
              <b className="tnum">{future ? 'T+44 h' : `${INCIDENT.failureWindow[0]}–${INCIDENT.failureWindow[1]} h`}</b>
            </div>
          </div>
        </div>
      </div>
    </FadeHtml>
  );
}

export function LeakSimulation() {
  return (
    <group>
      <MoistureVolume />
      <Crack />
      <Spray />
      <Hotspot />
      <LeakAnnotation />
    </group>
  );
}
