import { blobShapes } from './tokens.css';

// React Native corners take one radius each, so the shipping paint blobs (elliptical
// `border-radius: h h h h / v v v v`) are drawn as SVG paths instead.
export type BlobShape = keyof typeof blobShapes;

const COORDINATE_PRECISION = 1000;

function coordinate(value: number) {
  return Math.round(value * COORDINATE_PRECISION) / COORDINATE_PRECISION;
}

// CSS shrinks every radius by one factor when two radii along a side overlap it.
function cornerRadii(shape: BlobShape, width: number, height: number) {
  const { horizontal, vertical } = blobShapes[shape];
  const across = horizontal.map((percent) => (percent / 100) * width);
  const down = vertical.map((percent) => (percent / 100) * height);
  const [topLeft, topRight, bottomRight, bottomLeft] = [0, 1, 2, 3];
  const scale = Math.min(
    1,
    width / (across[topLeft] + across[topRight]),
    width / (across[bottomRight] + across[bottomLeft]),
    height / (down[topLeft] + down[bottomLeft]),
    height / (down[topRight] + down[bottomRight])
  );
  return [topLeft, topRight, bottomRight, bottomLeft].map((corner) => ({
    x: coordinate(across[corner] * scale),
    y: coordinate(down[corner] * scale),
  }));
}

// The outline of a box with the shipping blob's corners, clockwise from the top edge.
export function blobPath(shape: BlobShape, width: number, height: number): string {
  const [topLeft, topRight, bottomRight, bottomLeft] = cornerRadii(shape, width, height);
  const arc = (radius: { x: number; y: number }, x: number, y: number) =>
    `A${radius.x} ${radius.y} 0 0 1 ${coordinate(x)} ${coordinate(y)}`;
  return [
    `M${topLeft.x} 0`,
    `H${coordinate(width - topRight.x)}`,
    arc(topRight, width, topRight.y),
    `V${coordinate(height - bottomRight.y)}`,
    arc(bottomRight, width - bottomRight.x, height),
    `H${bottomLeft.x}`,
    arc(bottomLeft, 0, height - bottomLeft.y),
    `V${topLeft.y}`,
    arc(topLeft, topLeft.x, 0),
    'Z',
  ].join(' ');
}

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const VIEW_BOX = /viewBox="0 0 ([\d.]+) ([\d.]+)"/;
const OUTER_FILL = /^<svg[^>]*\sfill="([^"]+)"/;

// One SVG holding the blob and, centered on it, a monochrome icon whose currentColor takes `ink`.
// A single drawing keeps the mark one inline box on every renderer, where an overlay would need
// absolute positioning that React Native text layout ignores.
export function blobXml({
  shape,
  size,
  fill,
  icon,
}: {
  shape: BlobShape;
  size: number;
  fill: string;
  icon?: { markup: string; size: number; ink: string };
}): string {
  const blob = `<path d="${blobPath(shape, size, size)}" fill="${fill}"/>`;
  return `<svg xmlns="${SVG_NAMESPACE}" viewBox="0 0 ${size} ${size}">${blob}${icon ? centeredIcon(icon, size) : ''}</svg>`;
}

function centeredIcon(icon: { markup: string; size: number; ink: string }, box: number) {
  const viewBox = VIEW_BOX.exec(icon.markup);
  const body = /^<svg[^>]*>([\s\S]*)<\/svg>$/.exec(icon.markup.trim());
  if (!viewBox || !body) throw new Error('Icon markup is not a single viewBox svg');
  const scale = icon.size / Math.max(Number(viewBox[1]), Number(viewBox[2]));
  const offset = coordinate((box - icon.size) / 2);
  const fill = OUTER_FILL.exec(icon.markup)?.[1];
  const ink = (markup: string) => markup.replaceAll('currentColor', icon.ink);
  const fillAttribute = fill ? ` fill="${ink(fill)}"` : '';
  return `<g transform="translate(${offset} ${offset}) scale(${scale})"${fillAttribute}>${ink(body[1])}</g>`;
}
