// Minimal WebGL2 helpers for the GPU crayon spike (routes/dev/gpu-crayon).
//
// Deliberately small: the spike exists to answer one question — can a single
// GPU-backed surface paint a full-resolution crayon stroke without the
// surface-flush starvation ADR-0085 tiled around — so this file carries only
// what the three renderers share, and no abstraction they do not both use.

export class ShaderCompileError extends Error {
  constructor(stage: string, log: string, source: string) {
    const numbered = source
      .split('\n')
      .map((line, i) => `${String(i + 1).padStart(3)} | ${line}`)
      .join('\n');
    super(`${stage} shader failed to compile:\n${log}\n\n${numbered}`);
    this.name = 'ShaderCompileError';
  }
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('createShader returned null');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? '(no log)';
    gl.deleteShader(shader);
    throw new ShaderCompileError(type === gl.VERTEX_SHADER ? 'vertex' : 'fragment', log, source);
  }
  return shader;
}

export function createProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string
): WebGLProgram {
  const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!program) throw new Error('createProgram returned null');
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? '(no log)';
    gl.deleteProgram(program);
    throw new Error(`program failed to link: ${log}`);
  }
  return program;
}

export function uniformLocations<K extends string>(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  names: readonly K[]
): Record<K, WebGLUniformLocation | null> {
  const out = {} as Record<K, WebGLUniformLocation | null>;
  for (const name of names) out[name] = gl.getUniformLocation(program, name);
  return out;
}

// Parse a CSS hex colour to normalised linear-ish [r,g,b] in 0..1. The harness
// only ever hands this palette hexes; anything else is mid-grey rather than a
// throw, matching parseColor in crayonBrush.ts.
export function hexToRgb01(hex: string): [number, number, number] {
  let h = hex.startsWith('#') ? hex.slice(1) : hex;
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = Number.parseInt(h, 16);
  if (h.length !== 6 || Number.isNaN(n)) return [0.5, 0.5, 0.5];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
