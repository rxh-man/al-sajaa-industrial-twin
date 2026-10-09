import { AdditiveBlending, Color, MeshStandardMaterial, ShaderMaterial } from 'three';
import { G } from '../shaders/globals';
import { patchMaterial } from '../shaders/patch';
import type { LayerDef } from '../../data/networks';

export interface PipeUniforms {
  uColor: { value: Color };
  uGlow: { value: Color };
  uFlowSpacing: { value: number };
  uFlowSpeed: { value: number };
  uFlowWidth: { value: number };
  uFlowStrength: { value: number };
  uDim: { value: number };
  uVis: { value: number };
  uHighlightSeg: { value: number };
  uHighlightColor: { value: Color };
  uHighlightMix: { value: number };
  uIsolation: { value: number };
  uReroute: { value: number };
  uHoverSeg: { value: number };
  uSelectedSeg: { value: number };
  uHiddenSeg: { value: number };
  uBoost: { value: number };
}

export function createPipeUniforms(layer: LayerDef, variant: string): PipeUniforms {
  const color = new Color(layer.color);
  const glow = new Color(layer.glow);
  if (variant === 'return') {
    color.offsetHSL(0.0, -0.1, -0.12);
    glow.offsetHSL(0.0, -0.1, -0.1);
  }
  return {
    uColor: { value: color },
    uGlow: { value: glow },
    uFlowSpacing: { value: layer.flow.spacing },
    uFlowSpeed: { value: layer.flow.speed },
    uFlowWidth: { value: layer.flow.width },
    uFlowStrength: { value: layer.flow.strength },
    uDim: { value: 0 },
    uVis: { value: 1 },
    uHighlightSeg: { value: -1 },
    uHighlightColor: { value: new Color('#ff4d3d') },
    uHighlightMix: { value: 0 },
    uIsolation: { value: 0 },
    uReroute: { value: 0 },
    uHoverSeg: { value: -1 },
    uSelectedSeg: { value: -1 },
    uHiddenSeg: { value: -1 },
    uBoost: { value: 0 },
  };
}

const PIPE_UNIFORM_DECL = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uGlow;
uniform float uFlowSpacing;
uniform float uFlowSpeed;
uniform float uFlowWidth;
uniform float uFlowStrength;
uniform float uDim;
uniform float uVis;
uniform float uHighlightSeg;
uniform vec3 uHighlightColor;
uniform float uHighlightMix;
uniform float uIsolation;
uniform float uReroute;
uniform float uHoverSeg;
uniform float uSelectedSeg;
uniform float uHiddenSeg;
uniform float uBoost;
uniform float uTime;
uniform float uXray;
`;

/** Straight pipe runs (instanced unit cylinders along local +Y). */
export function createPipeMaterial(u: PipeUniforms) {
  const mat = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.38, metalness: 0.35, envMapIntensity: 0.9 });
  return patchMaterial(mat, {
    key: 'pipe',
    uniforms: { ...u, uTime: G.uTime, uXray: G.uXray },
    vertexHead:
      PIPE_UNIFORM_DECL +
      /* glsl */ `
      attribute float aSeg;
      attribute float aFlow;
      attribute float aFlowIso;
      attribute float aReroute;
      varying float vAlong;
      varying float vSeg;
      varying float vFlow;
      varying float vReroute;
    `,
    vertexTransform: /* glsl */ `
      float pLen = length(instanceMatrix[1].xyz);
      vAlong = position.y * pLen;
      vSeg = aSeg;
      vFlow = mix(aFlow, aFlowIso, uIsolation);
      vReroute = aReroute;
      transformed.xz *= max(uVis, 0.0001);
    `,
    fragmentHead:
      PIPE_UNIFORM_DECL +
      /* glsl */ `
      varying float vAlong;
      varying float vSeg;
      varying float vFlow;
      varying float vReroute;
      float gIsHL;
    `,
    fragmentColor: /* glsl */ `
      if (abs(vSeg - uHiddenSeg) < 0.5) discard;
      gIsHL = 1.0 - step(0.5, abs(vSeg - uHighlightSeg));
      vec3 pbase = mix(uColor, uHighlightColor * 0.8, gIsHL * uHighlightMix);
      float lum = dot(pbase, vec3(0.3, 0.59, 0.11));
      pbase = mix(pbase, vec3(lum) * 0.32, uDim * 0.85);
      diffuseColor.rgb = pbase;
    `,
    fragmentEmissive: /* glsl */ `
      {
        float dirS = vFlow >= 0.0 ? 1.0 : -1.0;
        float flowOn = abs(vFlow) * (1.0 - gIsHL * uIsolation);
        float s = vAlong * dirS;
        float cyc = s / uFlowSpacing - uTime * uFlowSpeed / uFlowSpacing;
        float ph = fract(cyc);
        float fwc = fwidth(s / uFlowSpacing) * 1.5 + 1e-4;
        float comet = smoothstep(1.0 - uFlowWidth, 1.0, ph);
        comet = comet * comet * (1.0 - smoothstep(1.0 - fwc, 1.0, ph));
        float lit = 1.0 - uDim * 0.92;
        vec3 em = uGlow * comet * flowOn * uFlowStrength * lit * (1.0 + uBoost * 0.6);
        vec3 pcol = mix(uColor, uHighlightColor, gIsHL * uHighlightMix);
        em += pcol * (0.06 + 0.05 * uXray + 0.1 * uBoost) * lit;
        float fres = pow(1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0), 2.4);
        vec3 rimC = mix(uGlow, uHighlightColor, gIsHL * uHighlightMix);
        em += rimC * fres * (0.16 + 0.16 * uXray) * lit;
        // reroute: bright fast cyan current
        float rr = vReroute * uReroute;
        float rph = fract(s / 2.2 - uTime * 10.0 / 2.2);
        em += vec3(0.25, 0.92, 1.0) * rr * (0.55 + 2.6 * smoothstep(0.55, 1.0, rph));
        // highlighted (incident) segment
        em += uHighlightColor * gIsHL * uHighlightMix * (0.3 + 0.2 * sin(uTime * 5.0));
        float hov = 1.0 - step(0.5, abs(vSeg - uHoverSeg));
        float sel = 1.0 - step(0.5, abs(vSeg - uSelectedSeg));
        em += uGlow * (hov * 0.45 + sel * 0.6);
        totalEmissiveRadiance += em;
      }
    `,
  });
}

/** Fittings (elbows, hubs, flanges, risers): no flow, same dimming/visibility. */
export function createFittingMaterial(u: PipeUniforms, shade = 1) {
  const mat = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.42, metalness: 0.45, envMapIntensity: 0.9 });
  return patchMaterial(mat, {
    key: 'fitting',
    uniforms: { ...u, uTime: G.uTime, uXray: G.uXray, uExploded: G.uExploded, uShade: { value: shade } },
    vertexHead: PIPE_UNIFORM_DECL + 'uniform float uExploded;',
    vertexTransform: /* glsl */ `
      transformed *= max(uVis, 0.0001);
    `,
    fragmentHead: PIPE_UNIFORM_DECL + 'uniform float uShade;',
    fragmentColor: /* glsl */ `
      vec3 fbase = uColor * uShade;
      float flum = dot(fbase, vec3(0.3, 0.59, 0.11));
      fbase = mix(fbase, vec3(flum) * 0.32, uDim * 0.85);
      diffuseColor.rgb = fbase;
    `,
    fragmentEmissive: /* glsl */ `
      {
        float lit = 1.0 - uDim * 0.92;
        float fres = pow(1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0), 2.4);
        totalEmissiveRadiance += uColor * (0.1 + 0.08 * uXray) * lit + uGlow * fres * (0.22 + 0.25 * uXray) * lit;
      }
    `,
  });
}

/** Glass shell shown around a selected pipe so the flow inside becomes visible. */
export function createGlassShellMaterial(color: Color) {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { uColor: { value: color.clone() }, uTime: G.uTime },
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vV;
      varying float vY;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = -mv.xyz;
        vY = position.y;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uTime;
      varying vec3 vN;
      varying vec3 vV;
      varying float vY;
      void main() {
        float fres = pow(1.0 - clamp(abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0), 1.6);
        float rings = smoothstep(0.92, 1.0, abs(fract(vY * 0.5) - 0.5) * 2.0);
        vec3 col = uColor * (0.05 + fres * 0.75 + rings * 0.08);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}
