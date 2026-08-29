// Option B — analytic stamp integration, after Ciallo (Ciao et al.,
// SIGGRAPH 2024, "GPU-Accelerated Rendering of Vector Brush Strokes").
//
// The stamped option approximates a continuous deposit by summing discrete
// tips, and pays for the approximation twice: in overdraw, and in the beading
// that appears whenever the stroke moves faster than the spacing assumes.
// Ciallo's move is to stop discretising — for a stamp with a closed-form
// radial profile, the integral of that profile along a segment has a closed
// form too, so ONE quad per segment can evaluate the exact accumulated deposit
// at each fragment:
//
//     ∫ max(0, 1 - r²/R²) ds
//       = (1 - h²/R²)(s₁ - s₀) - [(s - m)³]/(3R²)   evaluated s₀ → s₁
//
// writing the distance from a fragment to arclength s along a→b as
// h² + (s - m)², clamping to where the integrand is positive and to the
// segment's own extent. Normalised by the on-axis value for an unbounded
// line, 4R/3, that is a 0..1 deposit profile, and clamping to the segment
// extent tapers the stroke's ends for free — there are no caps to draw.
//
// TWO THINGS THIS ALGORITHM NEEDS THAT THE OTHER TWO DO NOT, both found by
// drawing it wrong first:
//
// 1. Deposit accumulates over an arclength of ±R around a fragment, so a
//    segment cannot be integrated alone. At the drawing cadence a hand
//    produces (~4 px between points) and a toddler's stroke width (46 px, so
//    R = 23), that is a dozen segments, not one. Integrating only the segment
//    and its immediate neighbours renders a stroke at a fraction of its
//    density — it looks like a dry pencil, not a crayon. The window is
//    therefore sized from the data at paint time and the whole polyline lives
//    in a texture the fragment shader walks.
//
// 2. That window has to reach backwards past the current frame's batch. The
//    engine delivers a few points per presented frame; the newest segment's
//    integral needs the points from previous frames too. So the renderer
//    retains a tail of the stroke and re-uploads it, drawing instances only
//    for the segments the frame actually added. Re-deriving a fragment that an
//    earlier frame already painted is safe because gl.MIN is idempotent for a
//    fixed colour, and it is what lets the previous frame's necessarily
//    lighter deposit be corrected once the segments that complete it arrive.

import { RADIAL_COVERAGE_GLSL, WAX_GLSL } from '../crayonShader';
import { createCrayonProgram, setCrayonUniforms, type CrayonProgram } from '../crayonProgram';
import type { InkTarget } from '../inkTarget';
import type { CrayonRenderer, PaintStats, StrokeStyle } from '../renderer';
import type { ToothTexture } from '../toothTexture';

// How far back the deposit window may reach, in segments. The shader loops a
// constant bound so every driver can unroll it; uWindow narrows that per paint
// from the batch's actual point spacing, which is what keeps a flick (one
// segment is already wider than the brush) from paying a scribble's window.
const MAX_WINDOW_SEGMENTS = 16;

// Points retained behind the newest segment. Only the window is ever read, so
// this only has to exceed MAX_WINDOW_SEGMENTS with room for a batch.
const TAIL_POINTS = 64;

// Density → coverage transfer. The integral yields a CONTINUOUS deposit that
// peaks on the stroke axis and falls to zero at the rim, where the other two
// options read the CPU pipeline's two discrete bands (0.63 inside 0.68 of the
// half-width, 0.45 out to the feather). Mapped linearly the analytic stroke is
// correct and visibly underexposed — thinner and drier than the crayon it is
// meant to replace, because most of its width sits below both band values. The
// gamma lifts the mid-profile toward the plateau while leaving the zero at the
// rim intact, which is what keeps the soft edge the algorithm earns.
//
// This is a real asymmetry, not a fudge: an analytic renderer needs a transfer
// function that a banded one gets for free by construction.
const DEPOSIT_GAMMA = 0.4;

const VERTEX = /* glsl */ `#version 300 es
precision highp float;
in vec2 aCorner;
uniform sampler2D uPoints;
uniform int uSegmentBase;
uniform vec2 uResolution;
uniform float uHalfWidth;
flat out int vSegment;
out vec2 vPaper;

vec2 pointAt(int index) { return texelFetch(uPoints, ivec2(index, 0), 0).xy; }

void main() {
  int segment = uSegmentBase + gl_InstanceID;
  vec2 p0 = pointAt(segment);
  vec2 p1 = pointAt(segment + 1);

  vec2 along = p1 - p0;
  float len = length(along);
  vec2 tangent = len > 1e-6 ? along / len : vec2(1.0, 0.0);
  vec2 normal = vec2(-tangent.y, tangent.x);
  // The quad has to cover every fragment this segment can deposit on, which is
  // its capsule — the window's reach belongs to the neighbours' own quads.
  float pad = uHalfWidth + 1.0;
  vec2 mid = (p0 + p1) * 0.5;
  vec2 pos = mid + tangent * aCorner.x * (len * 0.5 + pad) + normal * aCorner.y * pad;

  vSegment = segment;
  vPaper = pos;
  vec2 ndc = (pos / uResolution) * 2.0 - 1.0;
  gl_Position = vec4(ndc.x, -ndc.y, 0.0, 1.0);
}
`;

const FRAGMENT = /* glsl */ `#version 300 es
${WAX_GLSL}
${RADIAL_COVERAGE_GLSL}
uniform sampler2D uPoints;
uniform int uSegmentCount;
uniform int uWindow;
uniform float uHalfWidth;
flat in int vSegment;
in vec2 vPaper;
out vec4 outColor;

const int MAX_WINDOW = ${MAX_WINDOW_SEGMENTS};

vec2 pointAt(int index) { return texelFetch(uPoints, ivec2(index, 0), 0).xy; }

// Zero-length segments and segments further than R away both return 0, so the
// window can overrun the stroke's shape without a special case.
float depositIntegral(vec2 p, vec2 a, vec2 b, float radius) {
  vec2 along = b - a;
  float len = length(along);
  if (len < 1e-6) return 0.0;

  vec2 tangent = along / len;
  vec2 toP = p - a;
  float projection = dot(toP, tangent);
  float radius2 = radius * radius;
  float perpendicular2 = max(0.0, dot(toP, toP) - projection * projection);
  if (perpendicular2 >= radius2) return 0.0;

  float halfChord = sqrt(radius2 - perpendicular2);
  float s0 = max(0.0, projection - halfChord);
  float s1 = min(len, projection + halfChord);
  if (s1 <= s0) return 0.0;

  float peak = (radius2 - perpendicular2) / radius2;
  float e0 = s0 - projection;
  float e1 = s1 - projection;
  return peak * (s1 - s0) - (e1 * e1 * e1 - e0 * e0 * e0) / (3.0 * radius2);
}

void main() {
  float radius = uHalfWidth;
  float deposit = 0.0;
  for (int k = -MAX_WINDOW; k <= MAX_WINDOW; k++) {
    if (k < -uWindow || k > uWindow) continue;
    int segment = vSegment + k;
    if (segment < 0 || segment >= uSegmentCount) continue;
    deposit += depositIntegral(vPaper, pointAt(segment), pointAt(segment + 1), radius);
  }

  float profile = clamp(deposit / (4.0 * radius / 3.0), 0.0, 1.0);
  float coverage = uCoreCoverage * pow(profile, ${DEPOSIT_GAMMA.toFixed(2)});
  outColor = coverage <= 0.0 ? vec4(1.0) : waxAt(vPaper, coverage);
}
`;

const CORNERS = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);

export function createCialloRenderer(
  gl: WebGL2RenderingContext,
  tooth: ToothTexture,
  resolution: readonly [number, number],
  ink: InkTarget
): CrayonRenderer {
  const crayon: CrayonProgram = createCrayonProgram(gl, VERTEX, FRAGMENT);
  const vao = gl.createVertexArray();
  const cornerBuffer = gl.createBuffer();
  const pointsTexture = gl.createTexture();
  if (!vao || !cornerBuffer || !pointsTexture) throw new Error('ciallo renderer allocation failed');

  const aCorner = gl.getAttribLocation(crayon.program, 'aCorner');
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, CORNERS, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(aCorner);
  gl.vertexAttribPointer(aCorner, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  gl.bindTexture(gl.TEXTURE_2D, pointsTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);

  const uPoints = gl.getUniformLocation(crayon.program, 'uPoints');
  const uSegmentBase = gl.getUniformLocation(crayon.program, 'uSegmentBase');
  const uSegmentCount = gl.getUniformLocation(crayon.program, 'uSegmentCount');
  const uWindow = gl.getUniformLocation(crayon.program, 'uWindow');

  // The retained tail, as an RGBA32F row the shader texelFetches.
  const tail = new Float32Array(TAIL_POINTS * 4);
  let tailCount = 0;

  // Returns the number of SEGMENTS the batch added. Counting points instead is
  // the trap: once the tail is full every append also evicts from the front, so
  // a caller that derives the base index from the pre-append length addresses
  // segments that have since been renumbered — and silently draws nothing at
  // all, from the moment the tail first fills onwards.
  function appendToTail(points: Float32Array, pointCount: number): number {
    // A batch repeats the previous batch's last point so the segment across a
    // frame boundary is not lost; ingest only what is genuinely new.
    const skip = tailCount > 0 ? 1 : 0;
    const added = pointCount - skip;
    if (added < 1) return 0;

    if (tailCount + added > TAIL_POINTS) {
      const drop = tailCount + added - TAIL_POINTS;
      tail.copyWithin(0, drop * 4, tailCount * 4);
      tailCount -= drop;
    }
    for (let i = 0; i < added; i++) {
      const at = (tailCount + i) * 4;
      tail[at] = points[(skip + i) * 2];
      tail[at + 1] = points[(skip + i) * 2 + 1];
    }
    tailCount += added;
    return pointCount - 1;
  }

  // The window has to span R of arclength. Size it off the SHORTEST segment in
  // the tail, since that is the one that reaches least far per step.
  function windowSegments(radius: number): number {
    let shortest = Infinity;
    for (let i = 0; i < tailCount - 1; i++) {
      const dx = tail[(i + 1) * 4] - tail[i * 4];
      const dy = tail[(i + 1) * 4 + 1] - tail[i * 4 + 1];
      const length = Math.hypot(dx, dy);
      if (length > 1e-6 && length < shortest) shortest = length;
    }
    if (!Number.isFinite(shortest)) return 1;
    return Math.min(MAX_WINDOW_SEGMENTS, Math.max(1, Math.ceil(radius / shortest)));
  }

  return {
    ...ink.frameMethods(),
    id: 'ciallo',
    label: 'Analytic (Ciallo)',
    blurb:
      'One quad per segment evaluating the closed-form integral of a quadratic tip over a window of the polyline held in a texture. No stamps, no beading, ends taper for free.',
    primitiveNoun: 'segments',

    beginStroke() {
      tailCount = 0;
    },

    paint(points: Float32Array, pointCount: number, style: StrokeStyle): PaintStats {
      const instances = appendToTail(points, pointCount);
      if (instances < 1 || tailCount < 2) return { drawCalls: 0, primitives: 0 };
      // Read off the POST-append length, so eviction cannot shift it.
      const segmentBase = tailCount - 1 - instances;

      setCrayonUniforms(gl, crayon, tooth, resolution, style);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, pointsTexture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA32F,
        tailCount,
        1,
        0,
        gl.RGBA,
        gl.FLOAT,
        tail.subarray(0, tailCount * 4)
      );
      gl.uniform1i(uPoints, 1);
      gl.uniform1i(uSegmentBase, segmentBase);
      gl.uniform1i(uSegmentCount, tailCount - 1);
      gl.uniform1i(uWindow, windowSegments(style.widthPx / 2));

      gl.bindVertexArray(vao);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, instances);
      gl.bindVertexArray(null);
      gl.activeTexture(gl.TEXTURE0);

      return { drawCalls: 1, primitives: instances };
    },

    dispose() {
      gl.deleteProgram(crayon.program);
      gl.deleteVertexArray(vao);
      gl.deleteBuffer(cornerBuffer);
      gl.deleteTexture(pointsTexture);
    },
  };
}
