// Option C — SDF polyline.
//
// One instanced quad per segment, oriented and sized to bound the segment's
// capsule. The fragment measures its own distance to the segment and reads the
// production density bands straight off that radius. No stamps, no
// tessellation of round joins (consecutive capsules overlap, and gl.MIN makes
// that overlap idempotent), and no geometry cost that scales with brush size.
//
// This is the closest of the three to what the CPU pipeline paints today: the
// banded radial coverage IS crayonBrush's two passes, so a visual diff against
// production isolates the port rather than the algorithm.

import { RADIAL_COVERAGE_GLSL, WAX_GLSL } from '../crayonShader';
import { createCrayonProgram, setCrayonUniforms, type CrayonProgram } from '../crayonProgram';
import type { InkTarget } from '../inkTarget';
import type { CrayonRenderer, PaintStats, StrokeStyle } from '../renderer';
import type { ToothTexture } from '../toothTexture';

const VERTEX = /* glsl */ `#version 300 es
precision highp float;
in vec2 aCorner;
in vec2 aP0;
in vec2 aP1;
uniform vec2 uResolution;
uniform float uHalfWidth;
out vec2 vPaper;
out vec2 vP0;
out vec2 vP1;

void main() {
  vec2 along = aP1 - aP0;
  float len = length(along);
  vec2 tangent = len > 1e-6 ? along / len : vec2(1.0, 0.0);
  vec2 normal = vec2(-tangent.y, tangent.x);
  // +1px of slack so the outermost feathered flecks are never clipped by the
  // bounding quad they are drawn through.
  float pad = uHalfWidth + 1.0;
  vec2 mid = (aP0 + aP1) * 0.5;
  vec2 pos = mid + tangent * aCorner.x * (len * 0.5 + pad) + normal * aCorner.y * pad;

  vPaper = pos;
  vP0 = aP0;
  vP1 = aP1;
  vec2 ndc = (pos / uResolution) * 2.0 - 1.0;
  gl_Position = vec4(ndc.x, -ndc.y, 0.0, 1.0);
}
`;

const FRAGMENT = /* glsl */ `#version 300 es
${WAX_GLSL}
${RADIAL_COVERAGE_GLSL}
uniform float uHalfWidth;
in vec2 vPaper;
in vec2 vP0;
in vec2 vP1;
out vec4 outColor;

float distanceToSegment(vec2 p, vec2 a, vec2 b) {
  vec2 ab = b - a;
  float denom = dot(ab, ab);
  float t = denom > 1e-12 ? clamp(dot(p - a, ab) / denom, 0.0, 1.0) : 0.0;
  return length(p - (a + ab * t));
}

void main() {
  float r01 = distanceToSegment(vPaper, vP0, vP1) / uHalfWidth;
  float coverage = r01 >= 1.0 ? 0.0 : bandedCoverage(r01);
  outColor = coverage <= 0.0 ? vec4(1.0) : waxAt(vPaper, coverage);
}
`;

const CORNERS = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);

export function createSdfRenderer(
  gl: WebGL2RenderingContext,
  tooth: ToothTexture,
  resolution: readonly [number, number],
  ink: InkTarget
): CrayonRenderer {
  const crayon: CrayonProgram = createCrayonProgram(gl, VERTEX, FRAGMENT);
  const vao = gl.createVertexArray();
  const cornerBuffer = gl.createBuffer();
  const pointBuffer = gl.createBuffer();
  if (!vao || !cornerBuffer || !pointBuffer) throw new Error('sdf renderer allocation failed');

  const aCorner = gl.getAttribLocation(crayon.program, 'aCorner');
  const aP0 = gl.getAttribLocation(crayon.program, 'aP0');
  const aP1 = gl.getAttribLocation(crayon.program, 'aP1');

  gl.bindVertexArray(vao);

  gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, CORNERS, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(aCorner);
  gl.vertexAttribPointer(aCorner, 2, gl.FLOAT, false, 0, 0);

  // The same point buffer bound twice at a one-point stride offset gives each
  // instance its segment endpoints without duplicating any vertex data.
  gl.bindBuffer(gl.ARRAY_BUFFER, pointBuffer);
  gl.enableVertexAttribArray(aP0);
  gl.vertexAttribPointer(aP0, 2, gl.FLOAT, false, 8, 0);
  gl.vertexAttribDivisor(aP0, 1);
  gl.enableVertexAttribArray(aP1);
  gl.vertexAttribPointer(aP1, 2, gl.FLOAT, false, 8, 8);
  gl.vertexAttribDivisor(aP1, 1);

  gl.bindVertexArray(null);

  return {
    ...ink.frameMethods(),
    id: 'sdf',
    label: 'SDF polyline',
    blurb:
      'One instanced capsule quad per segment; the fragment measures its own distance to the segment and reads the production density bands off that radius.',
    primitiveNoun: 'segments',

    beginStroke() {},

    paint(points: Float32Array, pointCount: number, style: StrokeStyle): PaintStats {
      const segments = pointCount - 1;
      if (segments < 1) return { drawCalls: 0, primitives: 0 };

      setCrayonUniforms(gl, crayon, tooth, resolution, style);
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, pointBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, points.subarray(0, pointCount * 2), gl.DYNAMIC_DRAW);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, segments);
      gl.bindVertexArray(null);

      return { drawCalls: 1, primitives: segments };
    },

    dispose() {
      gl.deleteProgram(crayon.program);
      gl.deleteVertexArray(vao);
      gl.deleteBuffer(cornerBuffer);
      gl.deleteBuffer(pointBuffer);
    },
  };
}
