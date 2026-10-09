import type { Material, WebGLProgramParametersWithUniforms } from 'three';

export interface PatchSpec {
  /** cache key — materials with identical injected code may share one */
  key: string;
  uniforms?: Record<string, { value: unknown }>;
  vertexHead?: string;
  /** runs after `#include <begin_vertex>` (local `transformed` available) */
  vertexTransform?: string;
  /** runs after `#include <beginnormal_vertex>` (local `objectNormal` available) */
  vertexNormal?: string;
  /** runs after `#include <project_vertex>` */
  vertexEnd?: string;
  fragmentHead?: string;
  /** runs after `#include <color_fragment>` (diffuseColor) */
  fragmentColor?: string;
  /** runs after `#include <emissivemap_fragment>` (totalEmissiveRadiance) */
  fragmentEmissive?: string;
  /** runs before `#include <opaque_fragment>` (outgoingLight, diffuseColor.a, normal) */
  fragmentOutput?: string;
}

/**
 * Injects custom GLSL into a built-in three.js material (MeshStandardMaterial etc.)
 * while keeping its lighting, shadows, fog and tone-mapping intact.
 */
export function patchMaterial<M extends Material>(material: M, spec: PatchSpec): M {
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    if (spec.uniforms) Object.assign(shader.uniforms, spec.uniforms);
    let vs = shader.vertexShader;
    let fs = shader.fragmentShader;
    if (spec.vertexHead) vs = vs.replace('#include <common>', `#include <common>\n${spec.vertexHead}`);
    if (spec.vertexNormal) vs = vs.replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n${spec.vertexNormal}`);
    if (spec.vertexTransform) vs = vs.replace('#include <begin_vertex>', `#include <begin_vertex>\n${spec.vertexTransform}`);
    if (spec.vertexEnd) vs = vs.replace('#include <project_vertex>', `#include <project_vertex>\n${spec.vertexEnd}`);
    if (spec.fragmentHead) fs = fs.replace('#include <common>', `#include <common>\n${spec.fragmentHead}`);
    if (spec.fragmentColor) fs = fs.replace('#include <color_fragment>', `#include <color_fragment>\n${spec.fragmentColor}`);
    if (spec.fragmentEmissive) fs = fs.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${spec.fragmentEmissive}`);
    if (spec.fragmentOutput) fs = fs.replace('#include <opaque_fragment>', `${spec.fragmentOutput}\n#include <opaque_fragment>`);
    shader.vertexShader = vs;
    shader.fragmentShader = fs;
  };
  material.customProgramCacheKey = () => spec.key;
  return material;
}

/** World position varying, works for instanced and non-instanced meshes. */
export const WORLDPOS_VERT_HEAD = /* glsl */ `
varying vec3 vWPos;
`;
export const WORLDPOS_VERT_END = /* glsl */ `
{
  vec4 wp4 = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    wp4 = instanceMatrix * wp4;
  #endif
  vWPos = (modelMatrix * wp4).xyz;
}
`;
export const WORLDPOS_FRAG_HEAD = /* glsl */ `
varying vec3 vWPos;
`;
