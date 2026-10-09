import { BackSide, ShaderMaterial, Vector3 } from 'three';
import { G } from './shaders/globals';
import { GLSL_COMMON } from './shaders/glsl';
import { SUN_DIR } from './sceneConfig';

/**
 * Procedural dusk sky: deep blue zenith, a warm band along the horizon towards the
 * sun, a hazy sun halo and slow drifting stratus lit from below. The same material
 * renders the visible dome and the environment map that glass and water reflect.
 */
export function createSkyMaterial(forEnv = false) {
  return new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uSun: { value: SUN_DIR.clone() as Vector3 },
      uTime: G.uTime,
      uEnv: { value: forEnv ? 1 : 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }
    `,
    fragmentShader:
      GLSL_COMMON +
      /* glsl */ `
      uniform vec3 uSun;
      uniform float uTime;
      uniform float uEnv;
      varying vec3 vDir;

      vec3 skyColor(vec3 d) {
        float y = d.y;
        float hy = max(y, 0.0);
        vec2 hz = normalize(d.xz + vec2(1e-5));
        vec2 sz = normalize(uSun.xz);
        // clamped: rounding can dip below 0 facing away from the sun, and pow() of a
        // negative is NaN on Direct3D (Chrome on Windows), which the env-map blur spreads
        // over every reflection until the whole city renders black
        float az = clamp(dot(hz, sz) * 0.5 + 0.5, 0.0, 1.0); // 1 = towards the sun
        float warmA = pow(az, 5.0);

        vec3 zenith = vec3(0.010, 0.024, 0.066);
        vec3 mid = vec3(0.036, 0.074, 0.165);
        vec3 hzCool = vec3(0.115, 0.118, 0.205);
        vec3 hzWarm = vec3(1.15, 0.50, 0.20);
        vec3 horizon = mix(hzCool, hzWarm, warmA);

        vec3 col = mix(horizon, mid, pow(clamp(hy / 0.32, 0.0, 1.0), 0.55));
        col = mix(col, zenith, smoothstep(0.22, 0.95, hy));
        // magenta transition band above the warm horizon
        col += vec3(0.22, 0.06, 0.12) * warmA * exp(-abs(hy - 0.09) * 18.0);
        // thin bright line right at the horizon
        col += vec3(1.0, 0.52, 0.2) * warmA * exp(-hy * 30.0) * 0.55;

        // sun halo + disc
        float mu = max(dot(d, normalize(uSun)), 0.0);
        col += vec3(1.0, 0.55, 0.25) * pow(mu, 10.0) * 0.55;
        col += vec3(1.0, 0.78, 0.5) * pow(mu, 180.0) * 2.4;
        col += vec3(1.0, 0.88, 0.7) * smoothstep(0.99955, 0.9998, mu) * 14.0;

        // stratus: projected onto a cloud deck, lit from below on the sun side
        if (y > 0.0) {
          vec2 cuv = d.xz / (y + 0.1) * 1.35;
          cuv.x += uTime * 0.006;
          float warp = gfbm(cuv * 0.45 + 3.1);
          float n = gfbm(vec2(cuv.x * 0.8, cuv.y * 1.6) + warp * 1.4);
          float cov = smoothstep(0.5, 0.74, n);
          cov *= smoothstep(0.0, 0.05, y) * (1.0 - smoothstep(0.3, 0.75, y));
          float lit = smoothstep(0.55, 0.85, n);
          vec3 cWarm = mix(vec3(0.42, 0.14, 0.14), vec3(1.25, 0.55, 0.24), lit);
          vec3 cCool = mix(vec3(0.05, 0.05, 0.085), vec3(0.16, 0.13, 0.2), lit);
          vec3 cc = mix(cCool, cWarm, pow(az, 2.2));
          col = mix(col, cc, cov * 0.88);
        }

        // below the horizon: dark haze (the void beneath the diorama)
        vec3 below = mix(vec3(0.018, 0.024, 0.036), horizon * 0.25, uEnv);
        col = mix(col, below, smoothstep(0.0, -0.07, y));
        return col;
      }

      void main() {
        gl_FragColor = vec4(skyColor(normalize(vDir)), 1.0);
      }
    `,
  });
}
