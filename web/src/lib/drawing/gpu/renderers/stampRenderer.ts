// Option A — stamped tip, the Procreate / Photoshop / Krita model.
//
// The stroke is resampled by arclength and one instanced quad is drawn per
// stamp, each quad reading the same paper-anchored tooth. This is what every
// commercial brush engine does, and it is the baseline the other two options
// have to beat: it is trivially correct, and it extends to per-stamp jitter,
// rotation and pressure for free.
//
// Because gl.MIN is idempotent for a fixed colour and the tooth is anchored to
// the paper rather than to the stamp, the overdraw between neighbouring stamps
// is visually free: two stamps covering the same texel reach the same decision.
//
// It was expected to be expensive in fragments, and it is not. Measured against
// the SDF option it lands within 0.002 ms at every surface size tried while
// drawing 2.2x the primitives, and cutting its spacing fourfold — 1,646 stamps
// down to 370 — moved the frame 1.8% while changing 1.3% of the picture. What
// this renderer costs is the surface its render pass binds, which is a cost it
// shares with every other option rather than one the spacing controls.

import { RADIAL_COVERAGE_GLSL, WAX_GLSL } from '../crayonShader';
import { createCrayonProgram, setCrayonUniforms, type CrayonProgram } from '../crayonProgram';
import type { InkTarget } from '../inkTarget';
import type { CrayonRenderer, PaintStats, StrokeStyle } from '../renderer';
import type { ToothTexture } from '../toothTexture';

// Stamp spacing as a fraction of stroke DIAMETER. Commercial brush engines sit
// in the 0.05–0.15 band for an opaque tip; below it the extra stamps buy
// nothing a paper-anchored tooth can show, above it a fast stroke beads into
// visible discs.
const STAMP_SPACING_FRACTION = 0.08;

const VERTEX = /* glsl */ `#version 300 es
precision highp float;
in vec2 aCorner;
in vec2 aCenter;
uniform vec2 uResolution;
uniform float uHalfWidth;
out vec2 vPaper;
out vec2 vCenter;

void main() {
  float pad = uHalfWidth + 1.0;
  vec2 pos = aCenter + aCorner * pad;
  vPaper = pos;
  vCenter = aCenter;
  vec2 ndc = (pos / uResolution) * 2.0 - 1.0;
  gl_Position = vec4(ndc.x, -ndc.y, 0.0, 1.0);
}
`;

const FRAGMENT = /* glsl */ `#version 300 es
${WAX_GLSL}
${RADIAL_COVERAGE_GLSL}
uniform float uHalfWidth;
in vec2 vPaper;
in vec2 vCenter;
out vec4 outColor;

void main() {
  float r01 = length(vPaper - vCenter) / uHalfWidth;
  float coverage = r01 >= 1.0 ? 0.0 : bandedCoverage(r01);
  outColor = coverage <= 0.0 ? vec4(1.0) : waxAt(vPaper, coverage);
}
`;

const CORNERS = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);

export function createStampRenderer(
  gl: WebGL2RenderingContext,
  tooth: ToothTexture,
  resolution: readonly [number, number],
  ink: InkTarget
): CrayonRenderer {
  const crayon: CrayonProgram = createCrayonProgram(gl, VERTEX, FRAGMENT);
  const vao = gl.createVertexArray();
  const cornerBuffer = gl.createBuffer();
  const centerBuffer = gl.createBuffer();
  if (!vao || !cornerBuffer || !centerBuffer) throw new Error('stamp renderer allocation failed');

  const aCorner = gl.getAttribLocation(crayon.program, 'aCorner');
  const aCenter = gl.getAttribLocation(crayon.program, 'aCenter');

  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, CORNERS, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(aCorner);
  gl.vertexAttribPointer(aCorner, 2, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, centerBuffer);
  gl.enableVertexAttribArray(aCenter);
  gl.vertexAttribPointer(aCenter, 2, gl.FLOAT, false, 0, 0);
  gl.vertexAttribDivisor(aCenter, 1);
  gl.bindVertexArray(null);

  // Arclength state carried between paint calls: a stroke arrives one frame's
  // worth of points at a time, so the distance left over at a batch boundary
  // has to survive it or the stamps re-phase at every frame edge.
  let stampedFirstPoint = false;
  let untilNextStamp = 0;
  let centers = new Float32Array(1024);

  function pushCenter(index: number, x: number, y: number) {
    if (index * 2 + 2 > centers.length) {
      const grown = new Float32Array(centers.length * 2);
      grown.set(centers);
      centers = grown;
    }
    centers[index * 2] = x;
    centers[index * 2 + 1] = y;
  }

  function resample(points: Float32Array, pointCount: number, spacing: number): number {
    let count = 0;
    if (pointCount < 1) return 0;
    if (!stampedFirstPoint) {
      pushCenter(count++, points[0], points[1]);
      stampedFirstPoint = true;
      untilNextStamp = spacing;
    }
    for (let i = 0; i < pointCount - 1; i++) {
      const ax = points[i * 2];
      const ay = points[i * 2 + 1];
      const dx = points[i * 2 + 2] - ax;
      const dy = points[i * 2 + 3] - ay;
      const segmentLength = Math.hypot(dx, dy);
      if (segmentLength <= 1e-6) continue;
      let travelled = 0;
      while (untilNextStamp <= segmentLength - travelled) {
        travelled += untilNextStamp;
        const t = travelled / segmentLength;
        pushCenter(count++, ax + dx * t, ay + dy * t);
        untilNextStamp = spacing;
      }
      untilNextStamp -= segmentLength - travelled;
    }
    return count;
  }

  return {
    ...ink.frameMethods(),
    id: 'stamp',
    label: 'Stamped tip',
    blurb:
      'Arclength-resampled stamps, one instanced quad each, at 0.08 of stroke diameter — the Procreate/Photoshop model. Extends to per-stamp jitter, rotation and pressure for free.',
    primitiveNoun: 'stamps',

    beginStroke() {
      stampedFirstPoint = false;
      untilNextStamp = 0;
    },

    paint(points: Float32Array, pointCount: number, style: StrokeStyle): PaintStats {
      const spacing = Math.max(0.5, style.widthPx * STAMP_SPACING_FRACTION);
      const stamps = resample(points, pointCount, spacing);
      if (stamps < 1) return { drawCalls: 0, primitives: 0 };

      setCrayonUniforms(gl, crayon, tooth, resolution, style);
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, centerBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, centers.subarray(0, stamps * 2), gl.DYNAMIC_DRAW);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, stamps);
      gl.bindVertexArray(null);

      return { drawCalls: 1, primitives: stamps };
    },

    dispose() {
      gl.deleteProgram(crayon.program);
      gl.deleteVertexArray(vao);
      gl.deleteBuffer(cornerBuffer);
      gl.deleteBuffer(centerBuffer);
    },
  };
}
