import type { PngWork } from '../drawing/pngWork';
import type { PngGrid } from '../drawing/pngLimits';
import { imageGrid, invalidImage, MAX_AI_IMAGE_METADATA_BYTES } from './imageBounds';
type Huffman = Map<number, number>[];
type Component = {
  id: number;
  h: number;
  v: number;
  q: number;
  columns: number;
  rows: number;
  stride: number;
  // Successive-approximation bit each coefficient is coded down to, -1 before its first scan. The
  // picture is complete only when all reach 0: decoders render one missing later scans silently.
  coded: Int8Array;
  // Two words per block: which AC coefficients earlier progressive scans made nonzero.
  nonzero: Uint32Array;
};
type Frame = {
  grid: PngGrid;
  components: Component[];
  progressive: boolean;
  mcuColumns: number;
  mcuRows: number;
};
type EobRun = { blocks: number };
type BlockWalk = (reader: Entropy, block: number, run: EobRun) => void;
type Member = { component: Component; walk: BlockWalk };
const MAX_SEGMENTS = 1024;
const MAX_COMPONENT_BLOCKS = 6;
// The Huffman-coded DCT frames (baseline, extended sequential, progressive) the image provider
// emits and every target decoder reads; arithmetic, lossless and hierarchical frames are rejected.
// The native structure walks in SplotchAIEnvironment admit the same frames, pinned by
// tools/tests/native-ai-image-admission.test.mjs.
const SEQUENTIAL_FRAMES = new Set([0xc0, 0xc1]);
const PROGRESSIVE_FRAME = 0xc2;
const BLOCK_SIZE = 8;
const LAST_COEFFICIENT = 63;
const ZERO_RUN = 15;
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
function tables(body: Uint8Array, huffman: Map<number, Huffman>) {
  let position = 0;
  while (position < body.length) {
    const selector = body[position++];
    if (selector & 0xec || position + 16 > body.length) invalidImage();
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
        const value = body[position++];
        if (selector < 16 ? value > 11 : (value & 15) > 10) invalidImage();
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
function frame(body: Uint8Array, progressive: boolean): Frame {
  if (
    body.length < 9 ||
    body[0] !== 8 ||
    (body[5] !== 1 && body[5] !== 3) ||
    body.length !== 6 + body[5] * 3
  )
    invalidImage();
  const grid = imageGrid(body[3] * 256 + body[4], body[1] * 256 + body[2]);
  const sampling: { id: number; h: number; v: number; q: number }[] = [];
  for (let offset = 6; offset < body.length; offset += 3) {
    const component = {
      id: body[offset],
      h: body[offset + 1] >>> 4,
      v: body[offset + 1] & 15,
      q: body[offset + 2],
    };
    if (
      sampling.some((value) => value.id === component.id) ||
      component.h < 1 ||
      component.h > 2 ||
      component.v < 1 ||
      component.v > 2 ||
      component.q > 3
    )
      invalidImage();
    sampling.push(component);
  }
  const h = Math.max(...sampling.map((value) => value.h)),
    v = Math.max(...sampling.map((value) => value.v));
  if (
    sampling.reduce((sum, value) => sum + value.h * value.v, 0) > MAX_COMPONENT_BLOCKS ||
    sampling.some((value) => h % value.h || v % value.v) ||
    (sampling.length === 1 && (h !== 1 || v !== 1))
  )
    invalidImage();
  const mcuColumns = Math.ceil(grid.width / (BLOCK_SIZE * h)),
    mcuRows = Math.ceil(grid.height / (BLOCK_SIZE * v));
  const components = sampling.map((value) => {
    const stride = mcuColumns * value.h;
    return {
      ...value,
      columns: Math.ceil(Math.ceil((grid.width * value.h) / h) / BLOCK_SIZE),
      rows: Math.ceil(Math.ceil((grid.height * value.v) / v) / BLOCK_SIZE),
      stride,
      coded: new Int8Array(LAST_COEFFICIENT + 1).fill(-1),
      nonzero: new Uint32Array(progressive ? stride * mcuRows * value.v * 2 : 0),
    };
  });
  return { grid, components, progressive, mcuColumns, mcuRows };
}
function isValidBand(image: Frame, count: number, ss: number, se: number, ah: number, al: number) {
  if (!image.progressive) return ss === 0 && se === LAST_COEFFICIENT && !ah && !al;
  const band = ss === 0 ? se === 0 : ss <= se && se <= LAST_COEFFICIENT && count === 1;
  return band && (!ah || al === ah - 1) && al <= MAX_APPROXIMATION_BIT;
}
function progress(component: Component, ss: number, se: number, ah: number, al: number) {
  if (ss > 0 && component.coded[0] < 0) invalidImage();
  for (let k = ss; k <= se; k++) {
    if (component.coded[k] !== (ah || -1)) invalidImage();
    component.coded[k] = al;
  }
}
const isNonzero = (bits: Uint32Array, block: number, k: number) =>
  (bits[block * 2 + (k >>> 5)] >>> (k & 31)) & 1;
function markNonzero(bits: Uint32Array, block: number, k: number) {
  bits[block * 2 + (k >>> 5)] |= 1 << (k & 31);
}
function sequentialBlock(dc: Huffman, ac: Huffman): BlockWalk {
  return (reader) => {
    reader.skip(reader.symbol(dc));
    for (let k = 1; k <= LAST_COEFFICIENT; k++) {
      const symbol = reader.symbol(ac),
        run = symbol >>> 4;
      if (!(symbol & 15) && run !== ZERO_RUN) return;
      k += run;
      if (k > LAST_COEFFICIENT) invalidImage();
      reader.skip(symbol & 15);
    }
  };
}
function firstDcBlock(dc: Huffman): BlockWalk {
  return (reader) => reader.skip(reader.symbol(dc));
}
const refineDcBlock: BlockWalk = (reader) => reader.skip(1);
function firstAcBlock(ac: Huffman, ss: number, se: number, nonzero: Uint32Array): BlockWalk {
  return (reader, block, run) => {
    if (run.blocks) {
      run.blocks--;
      return;
    }
    for (let k = ss; k <= se; k++) {
      const symbol = reader.symbol(ac),
        zeros = symbol >>> 4,
        size = symbol & 15;
      if (!size && zeros !== ZERO_RUN) {
        run.blocks = (1 << zeros) - 1 + reader.bits(zeros);
        return;
      }
      k += zeros;
      if (k > se) invalidImage();
      if (size) {
        reader.skip(size);
        markNonzero(nonzero, block, k);
      }
    }
  };
}
function refineAcBlock(ac: Huffman, ss: number, se: number, nonzero: Uint32Array): BlockWalk {
  return (reader, block, run) => {
    let k = ss;
    if (!run.blocks)
      for (; k <= se; k++) {
        const symbol = reader.symbol(ac),
          size = symbol & 15;
        let zeros = symbol >>> 4;
        if (size) reader.skip(1);
        else if (zeros !== ZERO_RUN) {
          run.blocks = (1 << zeros) + reader.bits(zeros);
          break;
        }
        for (; k <= se; k++)
          if (isNonzero(nonzero, block, k)) reader.skip(1);
          else if (--zeros < 0) break;
        if (k > se) invalidImage();
        if (size) markNonzero(nonzero, block, k);
      }
    if (!run.blocks) return;
    for (; k <= se; k++) if (isNonzero(nonzero, block, k)) reader.skip(1);
    run.blocks--;
  };
}
function table(huffman: Map<number, Huffman>, selector: number) {
  return huffman.get(selector) ?? invalidImage();
}
function blockWalk(
  image: Frame,
  component: Component,
  selector: number,
  huffman: Map<number, Huffman>,
  ss: number,
  se: number,
  ah: number
): BlockWalk {
  const dc = () => table(huffman, selector >>> 4),
    ac = () => table(huffman, 16 + (selector & 15));
  if (!image.progressive) return sequentialBlock(dc(), ac());
  if (ss === 0) return ah ? refineDcBlock : firstDcBlock(dc());
  return ah
    ? refineAcBlock(ac(), ss, se, component.nonzero)
    : firstAcBlock(ac(), ss, se, component.nonzero);
}
function scan(
  body: Uint8Array,
  image: Frame,
  huffman: Map<number, Huffman>,
  quantized: Set<number>
): Member[] {
  const count = body[0];
  if (!count || count > image.components.length || body.length !== 1 + count * 2 + 3)
    invalidImage();
  const ss = body[body.length - 3],
    se = body[body.length - 2],
    ah = body[body.length - 1] >>> 4,
    al = body[body.length - 1] & 15;
  if (!isValidBand(image, count, ss, se, ah, al)) invalidImage();
  const members: Member[] = [];
  for (let offset = 1; offset < 1 + count * 2; offset += 2) {
    const component = image.components.find((value) => value.id === body[offset]),
      selector = body[offset + 1];
    if (!component || !quantized.has(component.q) || selector & 0xcc) invalidImage();
    progress(component, ss, se, ah, al);
    members.push({ component, walk: blockWalk(image, component, selector, huffman, ss, se, ah) });
  }
  return members;
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
  bits(count: number) {
    let value = 0;
    for (let index = 0; index < count; index++) value = value * 2 + this.bit();
    return value;
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
  end() {
    this.held = 0;
    return this.position;
  }
  marker(value: number) {
    this.end();
    if (this.bytes[this.position++] !== 255 || this.bytes[this.position++] !== value)
      invalidImage();
  }
}
// Every block is walked because WebKit, Chromium and ImageIO all render entropy cut short
// before an intact EOI as a finished picture.
async function entropy(
  bytes: Uint8Array,
  start: number,
  image: Frame,
  members: Member[],
  restart: number,
  work: PngWork
) {
  const reader = new Entropy(bytes, start, work),
    run: EobRun = { blocks: 0 };
  const single = members.length === 1 ? members[0].component : null;
  const columns = single ? single.columns : image.mcuColumns,
    rows = single ? single.rows : image.mcuRows;
  let sequence = 0;
  for (let row = 0; row < rows; row++)
    for (let column = 0; column < columns; column++) {
      const unit = row * columns + column;
      if (restart && unit && unit % restart === 0) {
        run.blocks = 0;
        reader.marker(RST0 + (sequence++ % RESTART_MARKERS));
      }
      for (const { component, walk } of members) {
        const height = single ? 1 : component.v,
          width = single ? 1 : component.h;
        for (let y = 0; y < height; y++)
          for (let x = 0; x < width; x++) {
            walk(reader, (row * height + y) * component.stride + column * width + x, run);
            if (work.due() && work.endSlice()) await work.pause();
          }
      }
    }
  return reader.end();
}
export async function jpegResultGrid(bytes: Uint8Array, work: PngWork) {
  if (bytes[0] !== 255 || bytes[1] !== SOI) invalidImage();
  let offset = 2,
    image: Frame | null = null,
    restart = 0,
    segments = 0,
    metadataBytes = 0;
  const huffman = new Map<number, Huffman>(),
    quantized = new Set<number>();
  while (offset < bytes.length) {
    if (++segments > MAX_SEGMENTS || bytes[offset++] !== 255) invalidImage();
    const marker = bytes[offset++];
    if (marker === EOI) {
      if (
        !image ||
        image.components.some((component) => component.coded.some((bit) => bit !== 0)) ||
        offset !== bytes.length
      )
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
      const members = scan(body, image, huffman, quantized);
      offset = await entropy(bytes, offset, image, members, restart, work);
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
