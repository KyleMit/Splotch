// Program construction and uniform upload shared by the three renderers, so
// they differ only in their geometry stage.

import { CRAYON_DEFAULTS } from '../crayonBrush';
import { CRAYON_UNIFORM_NAMES, FEATHER_START_01, type CrayonUniformName } from './crayonShader';
import { createProgram, hexToRgb01, uniformLocations } from './gl';
import type { StrokeStyle } from './renderer';
import type { ToothTexture } from './toothTexture';

export interface CrayonProgram {
  program: WebGLProgram;
  uniforms: Record<CrayonUniformName, WebGLUniformLocation | null>;
}

export function createCrayonProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string
): CrayonProgram {
  const program = createProgram(gl, vertexSource, fragmentSource);
  return { program, uniforms: uniformLocations(gl, program, CRAYON_UNIFORM_NAMES) };
}

// The production density bands restated as the radial parameters the shaders
// take. Read off CRAYON_DEFAULTS rather than transcribed, so retuning the CPU
// crayon retunes the GPU one.
const [rimPass, corePass] = CRAYON_DEFAULTS.passes;
const CORE_RADIUS_01 = corePass.widthScale / rimPass.widthScale;

export function setCrayonUniforms(
  gl: WebGL2RenderingContext,
  crayon: CrayonProgram,
  tooth: ToothTexture,
  resolution: readonly [number, number],
  style: StrokeStyle
) {
  const u = crayon.uniforms;
  gl.useProgram(crayon.program);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tooth.texture);
  gl.uniform1i(u.uTooth, 0);
  gl.uniform1f(u.uToothTile, tooth.tile);
  gl.uniform2f(u.uPhase, style.phase[0], style.phase[1]);

  const [r, g, b] = hexToRgb01(style.color);
  gl.uniform3f(u.uColor, r, g, b);

  gl.uniform1f(u.uShadeVariation, Math.max(0, CRAYON_DEFAULTS.shadeVariation));
  gl.uniform1f(u.uBodyVariation, CRAYON_DEFAULTS.bodyVariation);
  gl.uniform1f(u.uDitherScale, 2 * Math.max(0, CRAYON_DEFAULTS.edge));

  gl.uniform1f(u.uCoreRadius01, CORE_RADIUS_01);
  gl.uniform1f(u.uCoreCoverage, corePass.coverage);
  gl.uniform1f(u.uRimCoverage, rimPass.coverage);
  gl.uniform1f(u.uFeatherStart01, FEATHER_START_01);

  gl.uniform2f(u.uResolution, resolution[0], resolution[1]);
  gl.uniform1f(u.uHalfWidth, style.widthPx / 2);
}
