// A native repeating image tiles in device pixels: iOS decodes it at the screen scale and
// Android's tiler paints the bitmap pixel for pixel. Shipping's CSS tile spans one CSS pixel per
// image pixel, so PaperTexture lays the grain out at the paper's size over this density and
// scales it back up by it.
export function paperGrainDensity(screenScale: number) {
  return screenScale;
}
