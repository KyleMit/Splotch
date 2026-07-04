// Pixel-art post-processing for the Pixel style cover. gemini-2.5-flash-image
// can't reliably render a whole scene as clean pixel art, so the Pixel cover
// renders a plain illustration and pixelates it here: average-downsample to a
// coarse grid, then nearest-upsample back for hard, even blocks.
import sharp from 'sharp';

// Blocks per axis. Must divide the output size evenly so every block is equal.
const PIXEL_GRID = 32;

// Turn an image buffer into a `size`x`size` sharp pipeline of hard pixel blocks.
export async function pixelate(imageBuffer, size) {
  const small = await sharp(imageBuffer)
    .resize(PIXEL_GRID, PIXEL_GRID, { fit: 'fill' })
    .png()
    .toBuffer();
  return sharp(small).resize(size, size, { kernel: sharp.kernel.nearest });
}
