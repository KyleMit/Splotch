import Svg from 'react-native-svg';
import { PAPER_WIDTH, PAPER_HEIGHT } from './model';
import type { SvgCaptureTarget } from './svgCapture';

type RasterJob = {
  image: HTMLImageElement | null;
  canvas: HTMLCanvasElement | null;
  clone: SVGSVGElement | null;
  released: boolean;
};
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
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

function snapshotRoot(target: SVGSVGElement, options: unknown) {
  if (
    typeof options !== 'object' ||
    !options ||
    !('width' in options) ||
    !('height' in options) ||
    options.width !== PAPER_WIDTH ||
    options.height !== PAPER_HEIGHT
  )
    throw new Error('The capture dimensions do not match the drawing paper.');
  const rect = target.getBoundingClientRect();
  if (rect.width !== PAPER_WIDTH || rect.height !== PAPER_HEIGHT)
    throw new Error('The fixed drawing paper is not ready to capture.');
  const root = document.createElementNS(SVG_NAMESPACE, 'svg');
  root.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);
  root.setAttribute('width', String(PAPER_WIDTH));
  root.setAttribute('height', String(PAPER_HEIGHT));
  root.appendChild(target.cloneNode(true));
  return root;
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

  toDataURL: SvgCaptureTarget['toDataURL'] = (callback, options) => {
    if (this.active) this.release(this.active);
    const job: RasterJob = { image: null, canvas: null, clone: null, released: false };
    this.active = job;
    try {
      job.clone = snapshotRoot(snapshotElement(this), options);
      const image = new window.Image();
      job.image = image;
      image.onerror = () => this.complete(job, callback, '');
      image.onload = () => {
        if (this.active !== job) return;
        try {
          const canvas = document.createElement('canvas');
          job.canvas = canvas;
          canvas.width = PAPER_WIDTH;
          canvas.height = PAPER_HEIGHT;
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
        new XMLSerializer().serializeToString(job.clone)
      )}`;
      job.clone?.replaceChildren();
      job.clone = null;
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
