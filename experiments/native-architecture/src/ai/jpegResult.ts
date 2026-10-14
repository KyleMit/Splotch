import type { PngWork } from '../drawing/pngWork';
import type { PngGrid } from '../drawing/pngLimits';
import { imageGrid, invalidImage, MAX_AI_IMAGE_METADATA_BYTES } from './imageBounds';
type Component = { id: number; h: number; v: number; q: number };
type Frame = { grid: PngGrid; components: Component[]; progressive: boolean };
const MAX_SEGMENTS = 1024;
const MAX_COMPONENT_BLOCKS = 6;
// The Huffman-coded DCT frames (baseline, extended sequential, progressive) the image provider
// emits and every target decoder reads; arithmetic, lossless and hierarchical frames are rejected.
// The native structure walks in SplotchAIEnvironment admit the same frames, pinned by
// tools/tests/native-ai-image-admission.test.mjs.
const SEQUENTIAL_FRAMES = new Set([0xc0, 0xc1]);
const PROGRESSIVE_FRAME = 0xc2;
const LAST_COEFFICIENT = 63;
// ITU T.81 Table B.3: the successive-approximation bit position of an 8-bit progressive scan.
const MAX_APPROXIMATION_BIT = 13;
const SOI = 0xd8,
  EOI = 0xd9,
  SOS = 0xda,
  DQT = 0xdb,
  DHT = 0xc4,
  DRI = 0xdd,
  RST0 = 0xd0,
  APP0 = 0xe0,
  APP15 = 0xef,
  COM = 0xfe;
const RESTART_MARKERS = 8;
function tables(body: Uint8Array, huffman: Set<number>) {
  let position = 0;
  while (position < body.length) {
    const selector = body[position++];
    if (selector & 0xec || position + 16 > body.length) invalidImage();
    const counts = body.subarray(position, position + 16);
    position += 16;
    const total = counts.reduce((sum, value) => sum + value, 0);
    if (!total || total > 256 || position + total > body.length) invalidImage();
    let code = 0;
    for (let length = 1; length <= 16; length++) {
      if (code + counts[length - 1] >= 2 ** length) invalidImage();
      for (let index = 0; index < counts[length - 1]; index++) {
        const value = body[position++];
        if (selector < 16 ? value > 11 : (value & 15) > 10) invalidImage();
        code++;
      }
      code *= 2;
    }
    huffman.add(selector);
  }
}
function quantization(body: Uint8Array, quantized: Set<number>) {
  let offset = 0;
  while (offset < body.length) {
    const id = body[offset++];
    if (id > 3 || quantized.has(id) || offset + 64 > body.length) invalidImage();
    for (let n = 0; n < 64; n++) if (!body[offset++]) invalidImage();
    quantized.add(id);
  }
}
function frame(body: Uint8Array, progressive: boolean): Frame {
  if (
    body.length < 9 ||
    body[0] !== 8 ||
    (body[5] !== 1 && body[5] !== 3) ||
    body.length !== 6 + body[5] * 3
  )
    invalidImage();
  const grid = imageGrid(body[3] * 256 + body[4], body[1] * 256 + body[2]);
  const components: Component[] = [];
  for (let offset = 6; offset < body.length; offset += 3) {
    const component = {
      id: body[offset],
      h: body[offset + 1] >>> 4,
      v: body[offset + 1] & 15,
      q: body[offset + 2],
    };
    if (
      components.some((value) => value.id === component.id) ||
      component.h < 1 ||
      component.h > 2 ||
      component.v < 1 ||
      component.v > 2 ||
      component.q > 3
    )
      invalidImage();
    components.push(component);
  }
  const h = Math.max(...components.map((value) => value.h)),
    v = Math.max(...components.map((value) => value.v));
  if (
    components.reduce((sum, value) => sum + value.h * value.v, 0) > MAX_COMPONENT_BLOCKS ||
    components.some((value) => h % value.h || v % value.v) ||
    (components.length === 1 && (h !== 1 || v !== 1))
  )
    invalidImage();
  return { grid, components, progressive };
}
function isValidBand(image: Frame, count: number, ss: number, se: number, ah: number, al: number) {
  if (!image.progressive) return ss === 0 && se === LAST_COEFFICIENT && !ah && !al;
  const band = ss === 0 ? se === 0 : ss <= se && se <= LAST_COEFFICIENT && count === 1;
  return band && (!ah || al === ah - 1) && al <= MAX_APPROXIMATION_BIT;
}
function scan(
  body: Uint8Array,
  image: Frame,
  huffman: Set<number>,
  quantized: Set<number>,
  scanned: Set<Component>
) {
  const count = body[0];
  if (!count || count > image.components.length || body.length !== 1 + count * 2 + 3)
    invalidImage();
  const ss = body[body.length - 3],
    se = body[body.length - 2],
    ah = body[body.length - 1] >>> 4,
    al = body[body.length - 1] & 15;
  if (!isValidBand(image, count, ss, se, ah, al)) invalidImage();
  const members = new Set<Component>();
  for (let offset = 1; offset < 1 + count * 2; offset += 2) {
    const component = image.components.find((value) => value.id === body[offset]),
      selector = body[offset + 1];
    if (
      !component ||
      members.has(component) ||
      (!image.progressive && scanned.has(component)) ||
      !quantized.has(component.q) ||
      selector & 0xcc ||
      (ss === 0 && !ah && !huffman.has(selector >>> 4)) ||
      (se > 0 && !huffman.has(16 + (selector & 15)))
    )
      invalidImage();
    members.add(component);
  }
  for (const component of members) scanned.add(component);
}
async function skipEntropy(bytes: Uint8Array, start: number, restart: number, work: PngWork) {
  let position = start,
    sequence = 0;
  for (;;) {
    if (position + 1 >= bytes.length) invalidImage();
    work.charge();
    if (work.due() && work.endSlice()) await work.pause();
    if (bytes[position] !== 255) {
      position++;
      continue;
    }
    const marker = bytes[position + 1];
    if (marker >= RST0 && marker < RST0 + RESTART_MARKERS) {
      if (!restart || marker !== RST0 + (sequence++ % RESTART_MARKERS)) invalidImage();
    } else if (marker) {
      if (position === start) invalidImage();
      return position;
    }
    position += 2;
  }
}
export async function jpegResultGrid(bytes: Uint8Array, work: PngWork) {
  if (bytes[0] !== 255 || bytes[1] !== SOI) invalidImage();
  let offset = 2,
    image: Frame | null = null,
    restart = 0,
    segments = 0,
    metadataBytes = 0;
  const huffman = new Set<number>(),
    quantized = new Set<number>(),
    scanned = new Set<Component>();
  while (offset < bytes.length) {
    if (++segments > MAX_SEGMENTS || bytes[offset++] !== 255) invalidImage();
    const marker = bytes[offset++];
    if (marker === EOI) {
      if (!image || scanned.size !== image.components.length || offset !== bytes.length)
        invalidImage();
      work.check();
      return image.grid;
    }
    if (offset + 2 > bytes.length) invalidImage();
    const length = bytes[offset] * 256 + bytes[offset + 1],
      end = offset + length;
    if (length < 2 || end > bytes.length) invalidImage();
    const body = bytes.subarray(offset + 2, end);
    offset = end;
    if (marker === DQT) quantization(body, quantized);
    else if (marker === DHT) tables(body, huffman);
    else if (SEQUENTIAL_FRAMES.has(marker) || marker === PROGRESSIVE_FRAME) {
      if (image) invalidImage();
      image = frame(body, marker === PROGRESSIVE_FRAME);
    } else if (marker === DRI) {
      if (body.length !== 2) invalidImage();
      restart = body[0] * 256 + body[1];
    } else if (marker === SOS) {
      if (!image) invalidImage();
      scan(body, image, huffman, quantized, scanned);
      offset = await skipEntropy(bytes, offset, restart, work);
    } else if ((marker >= APP0 && marker <= APP15) || marker === COM) {
      metadataBytes += body.length;
      if (metadataBytes > MAX_AI_IMAGE_METADATA_BYTES) invalidImage();
    } else invalidImage();
    for (let charged = 0; charged <= body.length; charged++) {
      work.charge();
      if (work.due() && work.endSlice()) await work.pause();
    }
  }
  return invalidImage();
}
