// The wax model, shared by all three GPU crayon renderers.
//
// This is a direct port of crayonBrush.ts's fillColorTilePixels + shadeShift.
// Everything the CPU pipeline bakes per (colour, pass) into a canvas tile is
// computed here per fragment from one uploaded tooth texture, so the three
// renderers below differ ONLY in how they decide a fragment's coverage — the
// geometry question — and share the wax question exactly.
//
// The blend is the whole reason a GPU port is tractable. ADR-0148 records that
// at mix = 1 the crayon's subtractive glaze collapses to min(S, D); WebGL2 has
// that as a native blend equation (gl.MIN), which means:
//
//   * same-colour overdraw is min(c, c) = c — idempotent, so undo/replay is
//     byte-stable for the same reason the CPU pipeline's binary alpha is;
//   * blue over yellow darkens per channel into green, the pigment behaviour
//     the CPU pipeline needs a buffered two-blit stamp to reach;
//   * a fragment with no wax writes vec3(1.0), and min(dst, 1) = dst, so the
//     tooth's holes are free rather than a discard.
//
// Every renderer therefore writes opaque alpha and encodes "no wax here" as
// white, and the harness initialises the ink target to the paper colour.

// Mirrors SHADE_HEIGHT_MID / SHADE_FINE_WEIGHT / SHADE_BODY_WEIGHT and the
// threshold arithmetic in crayonBrush.ts. Kept as one string so a change to the
// wax model is one edit for all three renderers.
export const WAX_GLSL = /* glsl */ `
precision highp float;

uniform sampler2D uTooth;
uniform float uToothTile;
uniform vec2  uPhase;            // per-pass paper-space phase shift (stroke seed)
uniform vec3  uColor;
uniform float uShadeVariation;
uniform float uBodyVariation;
uniform float uDitherScale;      // 2 * edge

const float SHADE_HEIGHT_MID  = 0.7;
const float SHADE_FINE_WEIGHT = 0.7;
const float SHADE_BODY_WEIGHT = 0.3;

float shadeShift(float heightValue, float bodyValue, float amplitude) {
  float fine = clamp((SHADE_HEIGHT_MID - heightValue) * 2.0, -1.0, 1.0);
  float slow = bodyValue * 2.0 - 1.0;
  return amplitude * (SHADE_FINE_WEIGHT * fine + SHADE_BODY_WEIGHT * slow);
}

// paperPx arrives at fragment centres (x.5), which lands mid-texel under
// NEAREST/REPEAT — the same 1:1 paper anchoring the CanvasPattern gets.
vec4 waxAt(vec2 paperPx, float coverage) {
  vec3 field = texture(uTooth, (paperPx + uPhase) / uToothTile).rgb;
  float heightValue = field.r;
  float bodyValue   = field.g;
  float ditherValue = field.b;

  float threshold = (1.0 - coverage) + uBodyVariation * (bodyValue - 0.5);
  float jitter    = (ditherValue - 0.5) * uDitherScale;
  float laid      = step(threshold, heightValue + jitter);

  float s = shadeShift(heightValue, bodyValue, uShadeVariation);
  vec3 waxed = s >= 0.0 ? uColor + (vec3(1.0) - uColor) * s : uColor * (1.0 + s);

  // White is the identity under gl.MIN, so an unlaid texel costs a write and
  // changes nothing. Cheaper than discard, which would forfeit early-z.
  return vec4(laid > 0.5 ? waxed : vec3(1.0), 1.0);
}
`;

// The two production density bands (passes: width 1.00 @ coverage 0.45, then
// width 0.68 @ coverage 0.63, widest first) restated as one radial function.
// A stroke's outermost band is feathered to zero rather than cut, so the
// silhouette breaks up into tooth flecks instead of ending on a clean circle —
// the CPU pipeline gets that edge from the canvas antialiasing its stroked
// path, which a binary-alpha MIN blend has no equivalent for.
export const RADIAL_COVERAGE_GLSL = /* glsl */ `
uniform float uCoreRadius01;     // passes[1].widthScale / passes[0].widthScale
uniform float uCoreCoverage;     // passes[1].coverage
uniform float uRimCoverage;      // passes[0].coverage
uniform float uFeatherStart01;

float bandedCoverage(float r01) {
  float c = r01 <= uCoreRadius01 ? uCoreCoverage : uRimCoverage;
  return c * (1.0 - smoothstep(uFeatherStart01, 1.0, r01));
}
`;

export const CRAYON_UNIFORM_NAMES = [
  'uTooth',
  'uToothTile',
  'uPhase',
  'uColor',
  'uShadeVariation',
  'uBodyVariation',
  'uDitherScale',
  'uCoreRadius01',
  'uCoreCoverage',
  'uRimCoverage',
  'uFeatherStart01',
  'uResolution',
  'uHalfWidth',
] as const;

export type CrayonUniformName = (typeof CRAYON_UNIFORM_NAMES)[number];

// Where the outermost band starts feathering, as a fraction of half-width.
// Low enough that the rim reads as scattered flecks, high enough that the
// stroke keeps its stated width.
export const FEATHER_START_01 = 0.82;
