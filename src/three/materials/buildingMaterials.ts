import { AdditiveBlending, MeshStandardMaterial, ShaderMaterial } from 'three';
import { G } from '../shaders/globals';
import { GLSL_COMMON } from '../shaders/glsl';
import { patchMaterial } from '../shaders/patch';
import { FOG_DENSITY } from '../sceneConfig';

const INSTANCE_ATTRS = /* glsl */ `
attribute float aSeed;
attribute float aBldg;
attribute float aStyle;
attribute float aLit;
attribute float aPoi;
attribute float aShop;
attribute vec3 aTint;
attribute vec2 aCenter;
`;

/* Per-instance values are \`flat\`: interpolating them adds per-pixel float error that the
   hashes below would amplify into noise (scrambled rooms, speckled balconies). */
const BUILDING_VARYINGS = /* glsl */ `
varying vec3 vBox;
flat varying vec3 vSize;
flat varying vec3 vObjN;
varying vec3 vLocal;
flat varying vec2 vCenter;
flat varying float vSeed;
flat varying float vBldg;
flat varying float vStyle;
flat varying float vLit;
flat varying float vPoi;
flat varying float vShop;
flat varying vec3 vTint;
`;

const BUILDING_VERTEX_ASSIGN = /* glsl */ `
vBox = position;
vObjN = normal;
vSize = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
vLocal = (instanceMatrix * vec4(position, 1.0)).xyz;
vCenter = aCenter;
vSeed = aSeed;
vBldg = aBldg;
vStyle = aStyle;
vLit = aLit;
vPoi = aPoi;
vShop = aShop;
vTint = aTint;
`;

/**
 * Facade layout shared by the solid and ghost materials: which style, where the
 * window bays and floors are, which windows are lit, distance to the face border.
 */
const FACADE_GLSL = /* glsl */ `
struct Facade {
  float side;
  float top;
  float win;
  float lit;
  float warm;
  float edgeDist;
  float floorLine;
  float xFace;
  float u;
  float v;
  vec2 cell;
  vec2 cf;
  vec2 ci;
  vec2 fw;
  float far;
  float colW;
  float floorH;
  float winW;
  float winH;
  float winY;
  float base;
};

void styleParams(float s, out float colW, out float floorH, out float winW, out float winH, out float winY) {
  colW = 0.6; floorH = 0.42; winW = 0.5; winH = 0.5; winY = 0.56;
  if (s < 0.5) { colW = 0.52; winW = 0.94; winH = 0.76; winY = 0.57; }       // curtain wall
  else if (s < 1.5) { colW = 0.62; winW = 0.54; winH = 0.52; }                // concrete frame
  else if (s < 2.5) { colW = 0.74; winW = 0.5; winH = 0.56; winY = 0.55; }    // residential
  else if (s < 3.5) { colW = 0.56; winW = 1.2; winH = 0.44; winY = 0.55; }    // ribbon glazing
  else if (s < 4.5) { colW = 0.6; winW = 0.42; winH = 0.58; winY = 0.54; }    // brick
  else { colW = 1.25; winW = 0.72; winH = 0.26; floorH = 0.7; winY = 0.72; }  // industrial
}

Facade facade() {
  Facade f;
  vec3 n = vObjN;
  f.top = step(0.5, n.y);
  float bottom = step(0.5, -n.y);
  f.side = 1.0 - f.top - bottom;
  f.xFace = step(0.5, abs(n.x));
  f.u = f.xFace > 0.5 ? vLocal.z : vLocal.x;
  f.v = vLocal.y;
  styleParams(vStyle, f.colW, f.floorH, f.winW, f.winH, f.winY);

  f.cell = vec2(f.u / f.colW, f.v / f.floorH);
  f.fw = fwidth(f.cell);
  f.ci = floor(f.cell);
  f.cf = fract(f.cell);
  float wx = 1.0 - smoothstep(f.winW * 0.5 - f.fw.x, f.winW * 0.5 + f.fw.x, abs(f.cf.x - 0.5));
  float wy = 1.0 - smoothstep(f.winH * 0.5 - f.fw.y, f.winH * 0.5 + f.fw.y, abs(f.cf.y - f.winY));
  float win = wx * wy;

  // half extents of this face (world units) and distance to its border
  vec2 hb = f.xFace > 0.5 ? vec2(vSize.z * 0.5, vSize.y * 0.5) : vec2(vSize.x * 0.5, vSize.y * 0.5);
  vec2 fc = f.xFace > 0.5 ? vec2(vBox.z * vSize.z, (vBox.y - 0.5) * vSize.y) : vec2(vBox.x * vSize.x, (vBox.y - 0.5) * vSize.y);
  if (f.top > 0.5) {
    hb = vec2(vSize.x * 0.5, vSize.z * 0.5);
    fc = vec2(vBox.x * vSize.x, vBox.z * vSize.z);
  }
  vec2 dEdge = hb - abs(fc);
  f.edgeDist = min(dEdge.x, dEdge.y);

  // solid corners, parapet band and the ground floor carry no regular windows
  f.base = 1.0 - step(f.floorH * 1.05, f.v);
  win *= step(0.32, dEdge.x);
  win *= step(0.3, (1.0 - vBox.y) * vSize.y);
  win *= 1.0 - f.base;
  win *= f.side;

  // far distance → average coverage (prevents shimmering)
  f.far = smoothstep(0.16, 0.5, max(f.fw.x, f.fw.y));
  vec2 cluster = vec2(floor(f.ci.x / 2.0), f.ci.y);
  float r = gh21(cluster + vec2(vSeed * 17.0 + n.x * 3.1, n.z * 7.7 + vSeed * 3.0));
  float litFrac = clamp(vLit * 1.7, 0.0, 0.8);
  float lit = step(r, litFrac);
  float avgWin = min(f.winW, 1.0) * f.winH * 0.85 * f.side * (1.0 - f.base);
  f.win = mix(win, avgWin, f.far);
  f.lit = mix(lit, litFrac, f.far);
  f.warm = step(0.35, gh21(f.ci * 1.37 + vSeed));
  float fl = abs(fract(f.cell.y * 0.25 + 0.5) - 0.5) * 4.0;
  f.floorLine = 1.0 - smoothstep(0.0, f.fw.y * 1.5 + 0.01, fl);
  return f;
}
`;

/**
 * Surface look of the solid buildings: wall materials per style (glass spandrels,
 * concrete, render, brick, corrugated metal), window frames and reveals, glass that
 * reflects the sky with per-pane distortion, and interior-mapped rooms behind the glass.
 */
const LOOK_GLSL = /* glsl */ `
struct Look {
  vec3 albedo;
  float rough;
  float metal;
  vec3 emit;
  vec3 nOff;
};

float boxMask(vec2 p, vec2 h, vec2 fw) {
  vec2 m = 1.0 - smoothstep(h - fw, h + fw, abs(p));
  return m.x * m.y;
}

/* Interior mapping: a box room behind each window, ray-traced in the fragment shader. */
vec3 roomColor(vec2 cf, vec3 rdF, vec3 dims, vec3 lc, float r1, float r2, float r3) {
  vec3 d = rdF / dims;
  d = mix(d, vec3(1e-4), step(abs(d), vec3(1e-4)));
  vec3 p = vec3(cf, 0.0);
  vec3 tt = (step(vec3(0.0), d) - p) / d;
  float t = min(min(tt.x, tt.y), tt.z);
  vec3 h = clamp(p + d * t, 0.0, 1.0);
  vec3 wallC = mix(vec3(0.92, 0.84, 0.72), vec3(0.74, 0.8, 0.86), r2);
  vec3 c;
  if (tt.z <= tt.x && tt.z <= tt.y) {
    c = wallC * (0.5 + 0.5 * h.y);
    float furn = step(h.y, 0.26 + r1 * 0.16) * step(abs(h.x - 0.28 - r2 * 0.44), 0.14 + r3 * 0.16);
    c *= 1.0 - 0.75 * furn;
    float art = step(abs(h.x - 0.65 + r3 * 0.3), 0.08) * step(abs(h.y - 0.62), 0.09) * step(0.5, r1);
    c = mix(c, vec3(0.3, 0.42, 0.6) * (0.6 + r2), art * 0.7);
  } else if (tt.x <= tt.y) {
    c = wallC * 0.62 * (0.55 + 0.45 * h.y) * (1.0 - 0.45 * h.z);
  } else if (d.y < 0.0) {
    c = mix(vec3(0.42, 0.29, 0.19), vec3(0.32, 0.33, 0.36), r3) * (0.35 + 0.35 * (1.0 - h.z));
  } else {
    c = vec3(0.62);
    c += vec3(2.2) * (1.0 - smoothstep(0.05, 0.13, length((h.xz - vec2(0.5, 0.6)) * vec2(1.0, 1.4))));
  }
  return c * lc;
}

Look facadeLook(Facade f) {
  Look L;
  vec3 n = vObjN;
  vec3 tint = vTint;
  vec3 T = f.xFace > 0.5 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
  float near = 1.0 - f.far;
  float u = f.u;
  float v = f.v;

  /* ---------------- wall ---------------- */
  float nse = gnoise(vec2(u, v) * 0.9 + vSeed * 5.0);
  vec3 wall = tint * (0.9 + 0.14 * nse);
  wall *= mix(0.8, 1.0, smoothstep(0.0, 2.2, v));                      // grime near the street
  float streak = gnoise(vec2(u * 5.0 + vSeed, v * 0.22));
  wall *= 1.0 - 0.07 * streak * near;                                     // rain streaks
  float rough = 0.86;
  float metal = 0.0;
  vec3 nOff = vec3(0.0);

  if (vStyle < 0.5) {
    // curtain wall: spandrel panels are opaque tinted glass, slightly glossy
    wall = tint * 0.55 + vec3(0.015);
    rough = 0.22;
    metal = 0.55;
  } else if (vStyle < 1.5) {
    // concrete frame: exposed slab edges every floor + pilasters between bays
    float slab = 1.0 - smoothstep(0.06, 0.06 + f.fw.y, abs(f.cf.y - 0.03) * 1.0);
    float pil = 1.0 - smoothstep(0.04, 0.04 + f.fw.x, min(f.cf.x, 1.0 - f.cf.x));
    wall *= 1.0 + 0.12 * max(slab, pil) * near;
  } else if (vStyle < 2.5) {
    // rendered residential: balconies on alternating bays (slab + glass railing)
    float hasBal = step(0.45, gh21(vec2(f.ci.x, floor(f.ci.y / 1.0)) + vSeed * 9.0)) * (1.0 - f.base) * f.side;
    float slab = 1.0 - smoothstep(0.055, 0.055 + f.fw.y, abs(f.cf.y - 0.05));
    float rail = step(0.08, f.cf.y) * step(f.cf.y, 0.32) * step(abs(f.cf.x - 0.5), 0.46);
    wall = mix(wall, vec3(0.72, 0.72, 0.7), slab * hasBal * near * step(abs(f.cf.x - 0.5), 0.47));
    wall = mix(wall, vec3(0.16, 0.2, 0.24), rail * hasBal * near * 0.55);
    nOff += vec3(0.0, -1.0, 0.0) * slab * hasBal * near * 0.35;
  } else if (vStyle > 3.5 && vStyle < 4.5) {
    // brick: running bond with recessed mortar
    vec2 bp = vec2(u / 0.075, v / 0.034);
    bp.x += 0.5 * mod(floor(bp.y), 2.0);
    vec2 bf = abs(fract(bp) - 0.5);
    vec2 bfw = fwidth(bp);
    float brick = (1.0 - smoothstep(0.44 - bfw.x, 0.44 + bfw.x, bf.x)) * (1.0 - smoothstep(0.38 - bfw.y, 0.38 + bfw.y, bf.y));
    float bfar = smoothstep(0.08, 0.32, max(bfw.x, bfw.y));
    vec3 brickC = tint * (0.85 + 0.3 * gh21(floor(bp) + vSeed));
    vec3 mortar = vec3(0.42, 0.4, 0.37);
    wall = mix(mix(mortar, brickC, brick), tint * 0.95 + mortar * 0.06, bfar);
    rough = 0.92;
  } else if (vStyle > 4.5) {
    // corrugated metal siding
    float rib = sin(u * 6.2831 / 0.07);
    nOff += T * rib * 0.22 * near;
    rough = 0.48;
    metal = 0.45;
  }

  // corner trim
  float corner = 1.0 - smoothstep(0.05, 0.05 + fwidth(f.edgeDist) + 0.01, f.edgeDist);
  wall *= 1.0 + 0.1 * corner * f.side;

  /* ---------------- windows ---------------- */
  vec2 wp = vec2(f.cf.x - 0.5, f.cf.y - f.winY);
  vec2 hOuter = vec2(f.winW * 0.5, f.winH * 0.5);
  vec2 ft = vec2(0.028 / f.colW, 0.028 / f.floorH);
  if (vStyle < 0.5) ft = vec2(0.012 / f.colW, 0.012 / f.floorH);
  vec2 hGlass = hOuter - ft;
  float outer = boxMask(wp, hOuter, f.fw);
  float glassM = boxMask(wp, hGlass, f.fw) * f.win;
  // centre mullion on wide punched windows
  if (vStyle > 0.5 && vStyle < 3.5 && f.winW * f.colW > 0.3) glassM *= 1.0 - (1.0 - smoothstep(ft.x * 0.5, ft.x * 0.5 + f.fw.x, abs(wp.x))) * near;
  float frame = clamp(outer * f.win - glassM, 0.0, 1.0) * near;
  vec3 frameC = vStyle < 0.5 ? vec3(0.42, 0.45, 0.48) : vStyle > 2.5 && vStyle < 3.5 ? vec3(0.7, 0.72, 0.74) : vec3(0.1, 0.105, 0.11);
  // sill + lintel on punched windows
  float sill = (1.0 - smoothstep(0.02, 0.02 + f.fw.y, abs(wp.y + hOuter.y + 0.025))) * step(abs(wp.x), hOuter.x + 0.04) * f.side * (1.0 - f.base);
  float punched = step(0.5, vStyle) * (1.0 - step(2.5, vStyle) * step(vStyle, 3.5)) * step(vStyle, 4.5);
  sill *= punched;
  wall = mix(wall, wall * 1.25 + 0.04, sill * near * 0.8);

  // per-pane variation: tilt (reflection break-up), tint, roughness
  float pr1 = gh21(f.ci + vSeed * 3.7);
  float pr2 = gh21(f.ci.yx * 1.31 + vSeed * 1.9);
  vec3 glassTint = vStyle < 0.5 ? mix(vec3(0.1, 0.14, 0.16), tint * 0.5, 0.5) : vec3(0.06, 0.07, 0.08);
  nOff += (T * (pr1 - 0.5) + vec3(0.0, pr2 - 0.5, 0.0)) * 0.07 * glassM * near;

  // view ray in face space for the rooms
  vec3 rd = normalize(vLocal - cameraPosition);
  vec3 rdF = vec3(dot(rd, T), rd.y, -dot(rd, n));
  float lightSel = gh21(f.ci * 2.13 + vSeed * 7.1);
  vec3 lc = vStyle < 1.5 ? mix(vec3(0.86, 0.92, 1.0), vec3(1.0, 0.84, 0.62), step(0.62, lightSel)) : mix(vec3(1.0, 0.7, 0.42), vec3(1.0, 0.83, 0.6), step(0.55, lightSel));
  lc *= 0.8 + 0.4 * fract(lightSel * 13.7);
  // a few TVs flicker blue in the flats
  float tv = step(0.9, lightSel) * step(1.5, vStyle) * step(vStyle, 2.5);
  lc = mix(lc, vec3(0.5, 0.66, 1.0) * (0.75 + 0.25 * sin(uTime * 7.0 + pr1 * 20.0) * sin(uTime * 3.1 + pr2 * 9.0)), tv);
  // rooms are only ray-traced when a window is big enough on screen to read them
  float detail = 1.0 - smoothstep(0.035, 0.09, max(f.fw.x, f.fw.y));
  vec3 room = vec3(0.0);
  if (glassM > 0.001 && detail > 0.01) {
    room = roomColor(f.cf, rdF, vec3(f.colW, f.floorH, 0.55), lc, pr1, pr2, lightSel);
    // curtains / blinds
    float gx = (wp.x / hGlass.x) * 0.5 + 0.5;
    float gy = (wp.y / hGlass.y) * 0.5 + 0.5;
    float cur = step(0.62, pr2) * step(1.5, vStyle);
    float curM = cur * (step(gx, 0.18 + pr1 * 0.25) + step(0.82 - pr1 * 0.2, gx));
    room = mix(room, lc * vec3(0.95, 0.82, 0.66) * 0.55, clamp(curM, 0.0, 1.0));
    float blind = step(0.55, pr2) * step(vStyle, 1.5) * step(1.0 - 0.3 - pr1 * 0.5, gy);
    float slatF = gy * 9.0;
    float slatW = fwidth(slatF);
    float slat = mix(smoothstep(0.5 - slatW, 0.5 + slatW, abs(fract(slatF) - 0.5) * 2.0), 0.5, smoothstep(0.3, 0.7, slatW));
    room = mix(room, lc * 0.5 * (0.65 + 0.35 * slat), blind);
  }
  float topShadow = smoothstep(hGlass.y - 0.14, hGlass.y, wp.y) * near;
  room *= 1.0 - 0.45 * topShadow;
  vec3 avgRoom = lc * (0.5 + 0.22 * pr2);
  vec3 interior = mix(avgRoom, room, detail);
  interior = mix(interior, lc * 0.62, f.far);

  /* ---------------- ground floor ---------------- */
  float gfl = f.base * f.side * step(0.3, f.edgeDist);
  vec3 emitShop = vec3(0.0);
  if (gfl > 0.5) {
    float bay = 0.9;
    float bu = u / bay;
    float bci = floor(bu);
    float bcf = fract(bu);
    float bfw = fwidth(bu);
    float h1 = gh21(vec2(bci, vSeed * 13.0) + n.xz * 5.0);
    float sfGlass = (1.0 - smoothstep(0.44 - bfw, 0.44 + bfw, abs(bcf - 0.5))) * step(0.025, v) * step(v, 0.29);
    float signM = step(0.31, v) * step(v, 0.385) * (1.0 - smoothstep(0.4 - bfw, 0.4 + bfw, abs(bcf - 0.5)));
    if (vShop > 0.5) {
      vec3 sLc = mix(vec3(1.0, 0.82, 0.6), vec3(0.9, 0.95, 1.0), step(0.6, h1));
      vec3 shopRoom = roomColor(vec2(bcf, v / 0.3), rdF, vec3(bay, 0.3, 0.9), sLc, h1, fract(h1 * 7.3), fract(h1 * 3.1));
      emitShop += mix(shopRoom, sLc * 0.7, f.far) * sfGlass * 1.15;
      vec3 sc = h1 < 0.25 ? vec3(1.0, 0.25, 0.2) : h1 < 0.45 ? vec3(0.3, 0.75, 1.0) : h1 < 0.6 ? vec3(0.35, 1.0, 0.55) : h1 < 0.8 ? vec3(1.0, 0.7, 0.25) : vec3(1.0, 0.95, 0.9);
      emitShop += sc * signM * step(0.25, fract(h1 * 5.7)) * 1.6;
      wall = mix(wall, vec3(0.05, 0.055, 0.06), sfGlass);
      glassM = max(glassM, sfGlass);
    } else {
      // lobby: dark stone base with a lit entrance near the middle of the face
      wall *= 0.72;
      float cu = f.xFace > 0.5 ? vLocal.z - vBox.z * vSize.z : vLocal.x - vBox.x * vSize.x;
      float door = sfGlass * step(abs(u - cu), 0.9);
      emitShop += vec3(1.0, 0.85, 0.65) * door * 0.9;
      glassM = max(glassM, door);
    }
  }

  /* ---------------- roof ---------------- */
  // roof finish per building: light membrane, ballast gravel, dark bitumen or a sedum green roof
  float rt = gh21(vec2(vBldg * 1.37 + 0.5, 4.2));
  float rn = gnoise(vLocal.xz * 1.1 + vSeed * 4.0);
  vec3 roof;
  if (rt < 0.38) {
    roof = vec3(0.6, 0.6, 0.58) * (0.86 + 0.18 * rn);
    vec2 seam = abs(fract(vLocal.xz / vec2(1.2, 2.4)) - 0.5);
    roof *= 1.0 - 0.1 * (1.0 - smoothstep(0.0, 0.025, seam.x)) * near;
    roof *= 1.0 - 0.18 * smoothstep(0.55, 0.8, gnoise(vLocal.xz * 0.35 + vSeed)); // weathering
  } else if (rt < 0.7) {
    float grain = gh21(floor(vLocal.xz * 38.0));
    roof = vec3(0.34, 0.33, 0.31) * (0.8 + 0.3 * rn) * mix(1.0, 0.82 + 0.36 * grain, near);
  } else if (rt < 0.9) {
    roof = vec3(0.1, 0.1, 0.11) * (0.8 + 0.4 * rn);
    roof = mix(roof, vec3(0.16, 0.16, 0.17), smoothstep(0.6, 0.66, gnoise(vLocal.xz * 0.6 + 7.0)));
  } else {
    roof = mix(vec3(0.12, 0.17, 0.07), vec3(0.24, 0.24, 0.1), gnoise(vLocal.xz * 2.2 + vSeed)) * (0.8 + 0.3 * rn);
  }
  float parapet = 1.0 - smoothstep(0.14, 0.18, f.edgeDist);
  roof = mix(roof, tint * 0.9 + 0.05, parapet);

  /* ---------------- compose ---------------- */
  vec3 albedo = mix(wall, frameC, frame);
  albedo = mix(albedo, glassTint, glassM);
  albedo = mix(albedo, roof, f.top);
  L.albedo = albedo;
  L.rough = mix(mix(rough, 0.4, frame), 0.05 + pr1 * 0.08, glassM);
  L.rough = mix(L.rough, 0.8, f.top);
  L.metal = mix(mix(metal, 0.6, frame * step(vStyle, 0.5)), 0.86, glassM);
  L.metal = mix(L.metal, 0.0, f.top);
  float litNow = f.lit;
  L.emit = interior * glassM * mix(0.03, 0.82, litNow) * f.side + emitShop;
  L.nOff = nOff * f.side;
  return L;
}
`;

const IMPACT_GLSL = /* glsl */ `
float impactMask(vec2 c) {
  float d = distance(c, uImpactCenter);
  return (1.0 - smoothstep(uImpactRadius - 1.5, uImpactRadius + 0.5, d)) * uImpactStrength;
}
`;

const FACADE_UNIFORMS = {
  uTime: G.uTime,
  uXray: G.uXray,
  uImpactCenter: G.uImpactCenter,
  uImpactRadius: G.uImpactRadius,
  uImpactStrength: G.uImpactStrength,
  uHoverBuilding: G.uHoverBuilding,
  uSelectedBuilding: G.uSelectedBuilding,
  uAmber: G.uAmber,
  uGhostColor: G.uGhostColor,
};

/** Solid, lit buildings (opaque look; fades out as X-ray takes over). */
export function createBuildingSolidMaterial() {
  const mat = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.82, metalness: 0.05, transparent: true, envMapIntensity: 1.0 });
  return patchMaterial(mat, {
    key: 'building-solid',
    uniforms: FACADE_UNIFORMS,
    vertexHead: INSTANCE_ATTRS + BUILDING_VARYINGS,
    vertexTransform: BUILDING_VERTEX_ASSIGN,
    fragmentHead: /* glsl */ `
      uniform float uTime;
      uniform float uXray;
      uniform vec2 uImpactCenter;
      uniform float uImpactRadius;
      uniform float uImpactStrength;
      uniform float uHoverBuilding;
      uniform float uSelectedBuilding;
      uniform vec3 uAmber;
      uniform vec3 uGhostColor;
      ${BUILDING_VARYINGS}
      ${GLSL_COMMON}
      ${FACADE_GLSL}
      ${LOOK_GLSL}
      ${IMPACT_GLSL}
      Facade gF;
      Look gL;
    `,
    fragmentColor: /* glsl */ `
      gF = facade();
      gL = facadeLook(gF);
      diffuseColor.rgb = gL.albedo;
    `,
    fragmentEmissive: /* glsl */ `
      roughnessFactor = gL.rough;
      metalnessFactor = gL.metal;
      normal = normalize(normal + (viewMatrix * vec4(gL.nOff, 0.0)).xyz);
      totalEmissiveRadiance += gL.emit * (1.0 - uXray * 0.6);
      // impact zone tint
      float imp = impactMask(vCenter);
      float pulseA = 0.75 + 0.25 * sin(uTime * 3.2);
      totalEmissiveRadiance += uAmber * imp * (0.06 + 0.07 * gF.top) * pulseA;
      totalEmissiveRadiance += uAmber * imp * (1.0 - smoothstep(0.0, 0.1, gF.edgeDist)) * 1.25;
      totalEmissiveRadiance += vec3(1.0, 0.35, 0.3) * imp * vPoi * (1.0 - smoothstep(0.0, 0.18, gF.edgeDist)) * 2.4 * pulseA;
      // hover / selection
      float hov = 1.0 - step(0.5, abs(vBldg - uHoverBuilding));
      float sel = 1.0 - step(0.5, abs(vBldg - uSelectedBuilding));
      totalEmissiveRadiance += vec3(0.3, 0.75, 1.0) * (hov * 0.05 + sel * 0.08);
      totalEmissiveRadiance += vec3(0.4, 0.85, 1.0) * max(hov, sel) * (1.0 - smoothstep(0.0, 0.08, gF.edgeDist)) * 1.1;
    `,
    fragmentOutput: /* glsl */ `
      diffuseColor.a = 1.0 - smoothstep(0.0, 0.92, uXray);
    `,
  });
}

/** Additive hologram used when the city is seen in X-ray mode (order independent). */
export function createBuildingGhostMaterial() {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    uniforms: { ...FACADE_UNIFORMS, uFogDensity: { value: FOG_DENSITY } },
    vertexShader: /* glsl */ `
      ${INSTANCE_ATTRS}
      ${BUILDING_VARYINGS}
      varying vec3 vViewN;
      varying vec3 vViewPos;
      void main() {
        ${BUILDING_VERTEX_ASSIGN}
        vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        vViewPos = -mv.xyz;
        vViewN = normalize(mat3(modelViewMatrix) * mat3(instanceMatrix) * normal);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uXray;
      uniform vec2 uImpactCenter;
      uniform float uImpactRadius;
      uniform float uImpactStrength;
      uniform float uHoverBuilding;
      uniform float uSelectedBuilding;
      uniform vec3 uAmber;
      uniform vec3 uGhostColor;
      uniform float uFogDensity;
      ${BUILDING_VARYINGS}
      varying vec3 vViewN;
      varying vec3 vViewPos;
      ${GLSL_COMMON}
      ${FACADE_GLSL}
      ${IMPACT_GLSL}
      void main() {
        Facade f = facade();
        float fres = pow(1.0 - clamp(abs(dot(normalize(vViewN), normalize(vViewPos))), 0.0, 1.0), 2.2);
        float lw = fwidth(f.edgeDist) * 1.4 + 0.004;
        float edge = 1.0 - smoothstep(0.0, lw, f.edgeDist);
        float glow = exp(-max(f.edgeDist, 0.0) * 5.0);
        vec3 base = uGhostColor;
        float imp = impactMask(vCenter);
        base = mix(base, uAmber, imp);
        float hov = max(1.0 - step(0.5, abs(vBldg - uHoverBuilding)), 1.0 - step(0.5, abs(vBldg - uSelectedBuilding)));
        vec3 col = base * (0.01 + fres * 0.045 + edge * 0.4 + glow * 0.045 + f.floorLine * f.side * 0.022);
        col += vec3(1.0, 0.8, 0.55) * f.win * f.lit * 0.035;
        col += base * imp * (0.012 + 0.01 * sin(uTime * 3.2));
        col += vec3(1.0, 0.35, 0.3) * imp * vPoi * edge * 1.2;
        col *= 1.0 + hov * 1.4;
        float depth = length(vViewPos);
        float fogF = exp(-uFogDensity * uFogDensity * depth * depth);
        gl_FragColor = vec4(col * uXray * fogF, 1.0);
      }
    `,
  });
}
