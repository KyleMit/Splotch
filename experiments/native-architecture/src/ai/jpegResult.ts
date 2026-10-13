import type { PngWork } from '../drawing/pngWork';
import type { PngGrid } from '../drawing/pngLimits';
import { imageGrid, invalidImage, MAX_AI_IMAGE_METADATA_BYTES } from './imageBounds';
type Huffman = Map<number, number>[];
type Component = { id: number; h: number; v: number; q: number };
type Frame = { grid: PngGrid; components: Component[]; h: number; v: number };
type Scan = { component: Component; dc: Huffman; ac: Huffman }[];
const MAX_SEGMENTS = 1024;
const MAX_COMPONENT_BLOCKS = 6;
function tables(body: Uint8Array, huffman: Map<number, Huffman>) {
  let position = 0;
  while (position < body.length) {
    const selector = body[position++];
    if (selector & 0xec || position + 16 > body.length || huffman.has(selector)) invalidImage();
    const counts = body.subarray(position, position + 16),
      tree: Huffman = [];
    position += 16;
    const total = counts.reduce((sum, value) => sum + value, 0);
    if (!total || total > 256 || position + total > body.length) invalidImage();
    let code = 0;
    for (let length = 1; length <= 16; length++) {
      const level = new Map<number, number>();
      if (code + counts[length - 1] >= 2 ** length) invalidImage();
      for (let index = 0; index < counts[length - 1]; index++) {
        const value = body[position++],
          size = value & 15;
        if (selector < 16 ? value > 11 : value !== 0 && value !== 0xf0 && (size < 1 || size > 10))
          invalidImage();
        level.set(code++, value);
      }
      tree.push(level);
      code *= 2;
    }
    huffman.set(selector, tree);
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
function frame(body: Uint8Array): Frame {
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
  return { grid, components, h, v };
}
function scan(
  body: Uint8Array,
  image: Frame,
  huffman: Map<number, Huffman>,
  quantized: Set<number>
): Scan {
  const count = body[0];
  if (
    count !== image.components.length ||
    body.length !== 1 + count * 2 + 3 ||
    body[body.length - 3] !== 0 ||
    body[body.length - 2] !== 63 ||
    body[body.length - 1] !== 0
  )
    invalidImage();
  const result: Scan = [];
  for (let offset = 1; offset < 1 + count * 2; offset += 2) {
    const component = image.components.find((value) => value.id === body[offset]),
      selector = body[offset + 1];
    const dc = huffman.get(selector >>> 4),
      ac = huffman.get(16 + (selector & 15));
    if (
      !component ||
      !quantized.has(component.q) ||
      !dc ||
      !ac ||
      result.some((value) => value.component === component)
    )
      invalidImage();
    result.push({ component, dc, ac });
  }
  return result;
}
class Entropy {
  private position: number;
  private value = 0;
  private held = 0;
  constructor(
    private bytes: Uint8Array,
    start: number,
    private work: PngWork
  ) {
    this.position = start;
  }
  bit() {
    if (!this.held) {
      if (this.position >= this.bytes.length) invalidImage();
      this.value = this.bytes[this.position++];
      if (this.value === 255 && this.bytes[this.position++] !== 0) invalidImage();
      this.held = 8;
    }
    this.work.charge();
    return (this.value >>> --this.held) & 1;
  }
  skip(count: number) {
    for (let index = 0; index < count; index++) this.bit();
  }
  symbol(tree: Huffman) {
    let code = 0;
    for (const level of tree) {
      code = code * 2 + this.bit();
      const value = level.get(code);
      if (value !== undefined) return value;
    }
    return invalidImage();
  }
  marker(value: number) {
    if (this.held && (this.value & ((1 << this.held) - 1)) !== (1 << this.held) - 1) invalidImage();
    this.held = 0;
    if (this.bytes[this.position++] !== 255 || this.bytes[this.position++] !== value)
      invalidImage();
  }
  end() {
    this.marker(0xd9);
    if (this.position !== this.bytes.length) invalidImage();
  }
}
function block(reader: Entropy, item: Scan[number]) {
  reader.skip(reader.symbol(item.dc));
  let coefficient = 1;
  while (coefficient < 64) {
    const symbol = reader.symbol(item.ac);
    if (symbol === 0) return;
    if (symbol === 0xf0) {
      coefficient += 16;
      if (coefficient > 64) invalidImage();
    } else {
      coefficient += symbol >>> 4;
      if (coefficient >= 64) invalidImage();
      reader.skip(symbol & 15);
      coefficient++;
    }
  }
}
async function entropy(
  bytes: Uint8Array,
  start: number,
  image: Frame,
  items: Scan,
  restart: number,
  work: PngWork
) {
  const reader = new Entropy(bytes, start, work);
  const mcus =
    Math.ceil(image.grid.width / (8 * image.h)) * Math.ceil(image.grid.height / (8 * image.v));
  let sequence = 0;
  for (let mcu = 0; mcu < mcus; mcu++) {
    if (restart && mcu && mcu % restart === 0) reader.marker(0xd0 + (sequence++ % 8));
    for (const item of items)
      for (let n = 0; n < item.component.h * item.component.v; n++) {
        block(reader, item);
        if (work.due() && work.endSlice()) await work.pause();
      }
  }
  reader.end();
}
export async function jpegResultGrid(bytes: Uint8Array, work: PngWork) {
  if (bytes[0] !== 255 || bytes[1] !== 0xd8) invalidImage();
  let offset = 2,
    image: Frame | null = null,
    restart = 0,
    segments = 0,
    metadataBytes = 0,
    hasRestart = false;
  const huffman = new Map<number, Huffman>(),
    quantized = new Set<number>();
  while (offset < bytes.length) {
    if (++segments > MAX_SEGMENTS || bytes[offset++] !== 255) invalidImage();
    const marker = bytes[offset++];
    if (offset + 2 > bytes.length) invalidImage();
    const length = bytes[offset] * 256 + bytes[offset + 1],
      end = offset + length;
    if (length < 2 || end > bytes.length) invalidImage();
    const body = bytes.subarray(offset + 2, end);
    offset = end;
    if (marker === 0xdb) quantization(body, quantized);
    else if (marker === 0xc4) tables(body, huffman);
    else if (marker === 0xc0) {
      if (image) invalidImage();
      image = frame(body);
    } else if (marker === 0xdd) {
      if (hasRestart || body.length !== 2) invalidImage();
      hasRestart = true;
      restart = body[0] * 256 + body[1];
    } else if (marker === 0xda) {
      if (!image) invalidImage();
      await entropy(bytes, offset, image, scan(body, image, huffman, quantized), restart, work);
      work.check();
      return image.grid;
    } else if ((marker >= 0xe0 && marker <= 0xef) || marker === 0xfe) {
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
