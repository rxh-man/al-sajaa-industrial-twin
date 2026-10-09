/** Shared GLSL helpers (hashes, value noise, AA utilities, ground strata). */

export const GLSL_COMMON = /* glsl */ `
float gh21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float gh31(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.x + p.y) * p.z);
}
float gnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = gh21(i);
  float b = gh21(i + vec2(1.0, 0.0));
  float c = gh21(i + vec2(0.0, 1.0));
  float d = gh21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float gfbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * gnoise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return v;
}
/* anti-aliased band: 1 inside |x| < w */
float aaBand(float x, float w) {
  float fw = max(fwidth(x), 1e-4);
  return 1.0 - smoothstep(w - fw, w + fw, abs(x));
}
/* anti-aliased step */
float aaStep(float edge, float x) {
  float fw = max(fwidth(x), 1e-4);
  return smoothstep(edge - fw, edge + fw, x);
}
`;

/**
 * Soil strata colour for a cut face at depth y (world units, surface = 0).
 * Muted, slightly cool earth tones so the section reads as "ground" without
 * fighting the infrastructure colours.
 */
export const GLSL_STRATA = /* glsl */ `
vec3 strataColor(float y, vec2 h) {
  float n = gfbm(h * 0.35) * 0.6 + gnoise(h * 2.7) * 0.4;
  float yy = y + (n - 0.5) * 0.45;
  vec3 asphalt = vec3(0.075, 0.08, 0.09);
  vec3 base = vec3(0.21, 0.2, 0.19);
  vec3 fill = vec3(0.24, 0.19, 0.15);
  vec3 clay = vec3(0.2, 0.15, 0.12);
  vec3 sand = vec3(0.25, 0.21, 0.16);
  vec3 rock = vec3(0.12, 0.125, 0.14);
  vec3 c = asphalt;
  c = mix(c, base, smoothstep(-0.32, -0.42, yy));
  c = mix(c, fill, smoothstep(-1.1, -1.4, yy));
  c = mix(c, clay, smoothstep(-4.0, -4.6, yy));
  c = mix(c, sand, smoothstep(-8.0, -8.6, yy));
  c = mix(c, rock, smoothstep(-11.0, -11.6, yy));
  // pebbles / grain
  float grain = gh21(floor(h * 9.0) + floor(y * 9.0));
  c *= 0.86 + grain * 0.22;
  // darken with depth
  c *= mix(1.0, 0.62, clamp(-y / 14.0, 0.0, 1.0));
  return c;
}
`;
