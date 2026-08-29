// The paper-tooth field, uploaded as a texture instead of colorized on the CPU.
//
// crayonBrush.ts builds three tileable fields once (height, body, dither) and
// then, per (colour, pass), walks every texel to bake a colorized wax tile. The
// walk is the part that does not belong on a GPU renderer: the same three
// fields sampled in a fragment shader answer every colour and every pass from
// ONE upload, so colour changes and pass counts stop costing texel work.
//
// Fidelity note: the fields are float32 on the CPU and land here as RGBA16F.
// Half-float carries ~3 decimal digits, which is far finer than the 0.045
// dither band the threshold compares against, so the shader reaches the same
// binary decision as fillColorTilePixels for all but pathologically borderline
// texels. Sampling is NEAREST — the tooth is anchored 1:1 to paper pixels
// exactly as the CanvasPattern is, so there is nothing to interpolate.

import { crayonFields } from '../crayonBrush';

export interface ToothTexture {
  texture: WebGLTexture;
  tile: number;
}

export function createToothTexture(gl: WebGL2RenderingContext): ToothTexture {
  const fields = crayonFields();
  const { tile, height, body, dither } = fields;
  const texels = tile * tile;

  // RGBA16F wants Float16; WebGL2 accepts a Float32Array upload with type
  // HALF_FLOAT only via Uint16, so pack through a Float32Array + FLOAT type
  // against an RGBA32F internal format instead — sampling 32F is core WebGL2,
  // and this texture is uploaded once at init, never per frame.
  const data = new Float32Array(texels * 4);
  for (let i = 0; i < texels; i++) {
    const j = i * 4;
    data[j] = height[i];
    data[j + 1] = body[i];
    data[j + 2] = dither[i];
    data[j + 3] = 1;
  }

  const texture = gl.createTexture();
  if (!texture) throw new Error('createTexture returned null');
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, tile, tile, 0, gl.RGBA, gl.FLOAT, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.bindTexture(gl.TEXTURE_2D, null);

  return { texture, tile };
}
