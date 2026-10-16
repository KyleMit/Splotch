import { Svg } from '../platform/svg';
import type { PaperSize } from './paperSpace';
import type { SvgCaptureTarget } from './svgCapture';

type Callback = Parameters<SvgCaptureTarget['toDataURL']>[0];
type RasterJob = {
  image: HTMLImageElement | null;
  canvas: HTMLCanvasElement | null;
  clone: SVGSVGElement | null;
  released: boolean;
};
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const XLINK_NAMESPACE = 'http://www.w3.org/1999/xlink';
const PNG_PREFIX = 'data:image/png;base64,';

function snapshotElement(value: unknown): SVGSVGElement {
  if (typeof value !== 'object' || !value || !('elementRef' in value))
    throw new Error('The web drawing paper is unavailable.');
  const ref = value.elementRef;
  if (
    typeof ref !== 'object' ||
    !ref ||
    !('current' in ref) ||
    !(ref.current instanceof SVGSVGElement)
  )
    throw new Error('The web drawing paper is unavailable.');
  return ref.current;
}

function captureSize(options: unknown): PaperSize {
  if (
    typeof options !== 'object' ||
    !options ||
    !('width' in options) ||
    !('height' in options) ||
    typeof options.width !== 'number' ||
    typeof options.height !== 'number' ||
    !Number.isSafeInteger(options.width) ||
    !Number.isSafeInteger(options.height) ||
    options.width <= 0 ||
    options.height <= 0
  )
    throw new Error('The capture dimensions do not match the drawing paper.');
  return { width: options.width, height: options.height };
}

// The paper's fixed grid: the SVG laid out at its own view box.
function fixedGrid(target: SVGSVGElement, expectedViewBox: unknown): PaperSize {
  const width = Number(target.getAttribute('width'));
  const height = Number(target.getAttribute('height'));
  const rect = target.getBoundingClientRect();
  const viewBox =
    typeof expectedViewBox === 'string'
      ? expectedViewBox
          .trim()
          .split(/[\s,]+/)
          .map(Number)
      : [];
  // Browser layout can quantize fixed SVG dimensions to fractional CSS pixels.
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    Math.round(rect.width) !== width ||
    Math.round(rect.height) !== height ||
    target.getAttribute('viewBox') !== expectedViewBox ||
    viewBox.length !== 4 ||
    !viewBox.every(Number.isFinite) ||
    viewBox[2] <= 0 ||
    viewBox[3] <= 0
  )
    throw new Error('The fixed drawing paper is not ready to capture.');
  return { width, height };
}

// As react-native-svg's Android capture does, the requested pixels take the grid at one scale; a
// request of another shape, beyond a pixel of rounding on any side, is another surface.
function sameShape(grid: PaperSize, size: PaperSize): boolean {
  return (
    Math.abs(size.width * grid.height - size.height * grid.width) <=
    grid.width + grid.height + size.width + size.height
  );
}

function snapshotRoot(target: SVGSVGElement, size: PaperSize, viewBox: unknown) {
  const grid = fixedGrid(target, viewBox);
  if (!sameShape(grid, size)) throw new Error('The fixed drawing paper is not ready to capture.');
  const root = document.createElementNS(SVG_NAMESPACE, 'svg');
  root.setAttribute('viewBox', `0 0 ${grid.width} ${grid.height}`);
  root.setAttribute('width', String(size.width));
  root.setAttribute('height', String(size.height));
  root.appendChild(target.cloneNode(true));
  return root;
}

// An SVG decoded as an image loads nothing outside itself, so a fill served as a file (a bundled
// page's hashed asset, an offline book's object URL) is copied into the snapshot as a data URI.
function externalImages(root: SVGSVGElement) {
  return [...root.querySelectorAll('image')].flatMap((image) => {
    const href = image.getAttribute('href') ?? image.getAttributeNS(XLINK_NAMESPACE, 'href');
    return href && !href.startsWith('data:') ? [{ image, href }] : [];
  });
}

function readDataUri(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('A coloring image could not be read for capture.'));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function inlineImages(images: ReturnType<typeof externalImages>) {
  await Promise.all(
    images.map(async ({ image, href }) => {
      const response = await fetch(href);
      if (!response.ok) throw new Error('A coloring image did not load for capture.');
      image.removeAttributeNS(XLINK_NAMESPACE, 'href');
      image.setAttribute('href', await readDataUri(await response.blob()));
    })
  );
}

export class CaptureSvg extends Svg {
  private active: RasterJob | null = null;

  private release(job: RasterJob) {
    if (job.released) return;
    job.released = true;
    if (this.active === job) this.active = null;
    const { image, canvas, clone } = job;
    job.image = null;
    job.canvas = null;
    job.clone = null;
    try {
      if (image) {
        image.onload = null;
        image.onerror = null;
        image.removeAttribute('src');
      }
    } finally {
      try {
        if (canvas) {
          try {
            canvas.width = 0;
          } finally {
            canvas.height = 0;
          }
        }
      } finally {
        clone?.replaceChildren();
      }
    }
  }

  private complete(job: RasterJob, callback: (base64: string) => void, base64: string) {
    if (this.active !== job) return;
    try {
      this.release(job);
    } catch {
      callback('');
      return;
    }
    callback(base64);
  }

  private rasterize(job: RasterJob, clone: SVGSVGElement, size: PaperSize, callback: Callback) {
    const image = new window.Image();
    job.image = image;
    image.onerror = () => this.complete(job, callback, '');
    image.onload = () => {
      if (this.active !== job) return;
      try {
        const canvas = document.createElement('canvas');
        job.canvas = canvas;
        canvas.width = size.width;
        canvas.height = size.height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Pixel capture is unavailable.');
        context.drawImage(image, 0, 0);
        const png = canvas.toDataURL();
        if (!png.startsWith(PNG_PREFIX)) throw new Error('Pixel capture did not return a PNG.');
        this.complete(job, callback, png.slice(PNG_PREFIX.length));
      } catch {
        this.complete(job, callback, '');
      }
    };
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
      new XMLSerializer().serializeToString(clone)
    )}`;
    clone.replaceChildren();
    job.clone = null;
  }

  toDataURL: SvgCaptureTarget['toDataURL'] = (callback, options) => {
    if (this.active) this.release(this.active);
    const job: RasterJob = { image: null, canvas: null, clone: null, released: false };
    this.active = job;
    try {
      const size = captureSize(options);
      const clone = snapshotRoot(snapshotElement(this), size, this.props.viewBox);
      job.clone = clone;
      const external = externalImages(clone);
      if (external.length === 0) this.rasterize(job, clone, size, callback);
      else
        inlineImages(external).then(
          () => {
            if (this.active !== job) return;
            try {
              this.rasterize(job, clone, size, callback);
            } catch {
              this.complete(job, callback, '');
            }
          },
          () => this.complete(job, callback, '')
        );
    } catch (error) {
      this.release(job);
      throw error;
    }
    return () => this.release(job);
  };

  componentWillUnmount() {
    if (this.active) this.release(this.active);
    super.componentWillUnmount?.();
  }
}
