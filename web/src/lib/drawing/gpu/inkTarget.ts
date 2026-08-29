// The single GPU surface every renderer paints into, plus the pass that shows
// it. This is the structural claim the spike is testing: one framebuffer the
// size of the whole paper, mutated every frame, presented through a swap chain
// rather than flushed as a CPU-visible 2D canvas surface — the thing ADR-0085
// had to tile a 2D canvas into 16 pieces to avoid.
//
// The paper colour is cleared INTO the ink texture rather than shown through a
// transparent canvas beneath it (ADR-0050's stack). Under gl.MIN the target has
// to start at the paper for the glaze to mean anything, and folding the sheet
// in is what a GPU cutover would do anyway — ADR-0051 names it as the change
// that would also unlock the desynchronized/hardware-overlay path.

import { createProgram, uniformLocations } from './gl';

const PRESENT_VERTEX = /* glsl */ `#version 300 es
out vec2 vUv;
void main() {
  // Fullscreen triangle from gl_VertexID — no buffer, no attribute state.
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

const PRESENT_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uInk;
out vec4 outColor;
void main() { outColor = vec4(texture(uInk, vUv).rgb, 1.0); }
`;

export class InkTarget {
  readonly gl: WebGL2RenderingContext;
  width: number;
  height: number;

  private texture: WebGLTexture;
  private framebuffer: WebGLFramebuffer;
  private presentProgram: WebGLProgram;
  private presentUniforms: Record<'uInk', WebGLUniformLocation | null>;
  private emptyVao: WebGLVertexArrayObject;

  constructor(
    gl: WebGL2RenderingContext,
    width: number,
    height: number,
    private paper: readonly [number, number, number]
  ) {
    this.gl = gl;
    this.width = width;
    this.height = height;

    const texture = gl.createTexture();
    const framebuffer = gl.createFramebuffer();
    const emptyVao = gl.createVertexArray();
    if (!texture || !framebuffer || !emptyVao) throw new Error('ink target allocation failed');

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error(`ink framebuffer incomplete: 0x${status.toString(16)}`);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);

    this.texture = texture;
    this.framebuffer = framebuffer;
    this.emptyVao = emptyVao;
    this.presentProgram = createProgram(gl, PRESENT_VERTEX, PRESENT_FRAGMENT);
    this.presentUniforms = uniformLocations(gl, this.presentProgram, ['uInk'] as const);
  }

  // Bind for painting, with gl.MIN already configured — every renderer wants
  // exactly this state, and forgetting the equation silently produces flat
  // opaque strokes rather than wax.
  bindForPainting() {
    const { gl } = this;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.viewport(0, 0, this.width, this.height);
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.MIN);
  }

  get canvas(): HTMLCanvasElement {
    return this.gl.canvas as HTMLCanvasElement;
  }

  clearToPaper() {
    const { gl } = this;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.viewport(0, 0, this.width, this.height);
    gl.disable(gl.BLEND);
    gl.clearColor(this.paper[0], this.paper[1], this.paper[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    // The clear only touches the ink texture; show it, or the previous
    // renderer's strokes stay on screen until the next paint.
    this.present();
  }

  present() {
    const { gl } = this;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);
    gl.disable(gl.BLEND);
    gl.useProgram(this.presentProgram);
    gl.bindVertexArray(this.emptyVao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(this.presentUniforms.uInk, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  // The frame and clear half of CrayonRenderer, which every GPU option
  // implements identically — they differ in geometry, not in where the pixels
  // land or when they are shown.
  frameMethods() {
    return {
      canvas: this.canvas,
      clear: () => this.clearToPaper(),
      beginFrame: () => this.bindForPainting(),
      endFrame: () => this.present(),
      endStroke: () => {},
    };
  }

  dispose() {
    const { gl } = this;
    gl.deleteTexture(this.texture);
    gl.deleteFramebuffer(this.framebuffer);
    gl.deleteProgram(this.presentProgram);
    gl.deleteVertexArray(this.emptyVao);
  }
}
