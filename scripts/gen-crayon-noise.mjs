// Generates the crayon brush's blue-noise "paper tooth" mask (ADR-0065) as a
// tileable threshold matrix, and writes it to web/src/lib/drawing/crayonNoise.ts
// as a base64-embedded byte array.
//
// Why blue noise (void-and-cluster, Ulichney 1993): the crayon renders partial
// paper coverage by masking the stroke with a per-pixel threshold. White noise
// clumps — partial coverage reads as gritty digital speckle. Blue noise spreads
// its energy to high frequencies, so any threshold slice is an *evenly spaced*
// stipple that reads as fine, uniform paper grain instead of clumps. The matrix
// is generated once here (deterministic, seeded) and committed, so the runtime
// never pays the O(n^2) generation cost and every device/replay/export samples
// the exact same tooth — the engine's bit-identical-replay invariant needs the
// texture to be identical everywhere, so a shipped constant beats runtime RNG.
//
// The matrix wraps toroidally (all neighbour math is mod N), so the pattern
// tiles seamlessly as a repeating CanvasPattern with no visible seam.
//
// Run: npm run gen:crayon-noise   (reproducible — same seed, same bytes)

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const N = 64; // tile edge in pixels — 64*64 = 4096 ranks, ~5.5KB base64
const SIZE = N * N;
const SEED = 0x5c1a7c;

// Deterministic PRNG (mulberry32) so the generated tile is reproducible across
// machines and Node versions — no Math.random anywhere in the pipeline.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Truncated toroidal Gaussian energy kernel. Void-and-cluster ranks pixels by a
// Gaussian-weighted density of the surrounding minority pixels; sigma ~1.5 is
// Ulichney's recommended value for isotropic blue noise.
const SIGMA = 1.5;
const RADIUS = Math.ceil(SIGMA * 3);
const kernel = [];
for (let dy = -RADIUS; dy <= RADIUS; dy++) {
  for (let dx = -RADIUS; dx <= RADIUS; dx++) {
    const w = Math.exp(-(dx * dx + dy * dy) / (2 * SIGMA * SIGMA));
    if (w > 1e-4) kernel.push({ dx, dy, w });
  }
}

const idx = (x, y) => ((y + N) % N) * N + ((x + N) % N);

// Energy field: sum of the Gaussian kernel placed at every "1" pixel. Updated
// incrementally as pixels toggle, so each add/remove is O(kernel), not O(N^2).
const energy = new Float64Array(SIZE);
const bin = new Uint8Array(SIZE);

function splat(x, y, sign) {
  for (const k of kernel) energy[idx(x + k.dx, y + k.dy)] += sign * k.w;
}
function togglePoint(x, y, on) {
  bin[idx(x, y)] = on ? 1 : 0;
  splat(x, y, on ? 1 : -1);
}

// Tightest cluster = the "1" pixel sitting in the highest energy (most crowded).
function tightestCluster() {
  let best = -1;
  let bestE = -Infinity;
  for (let i = 0; i < SIZE; i++) {
    if (bin[i] && energy[i] > bestE) {
      bestE = energy[i];
      best = i;
    }
  }
  return best;
}
// Largest void = the "0" pixel sitting in the lowest energy (most empty).
function largestVoid() {
  let best = -1;
  let bestE = Infinity;
  for (let i = 0; i < SIZE; i++) {
    if (!bin[i] && energy[i] < bestE) {
      bestE = energy[i];
      best = i;
    }
  }
  return best;
}

// --- Phase 0: initial binary pattern (IBP) ---------------------------------
// Scatter ~1/10 of the pixels, then relax: repeatedly move the pixel from the
// tightest cluster into the largest void until it stabilises. This yields a
// well-distributed minority set to seed the ranking phases.
const rand = mulberry32(SEED);
const ONES = Math.floor(SIZE / 10);
{
  let placed = 0;
  while (placed < ONES) {
    const i = Math.floor(rand() * SIZE);
    if (!bin[i]) {
      togglePoint(i % N, (i / N) | 0, true);
      placed++;
    }
  }
  for (;;) {
    const c = tightestCluster();
    togglePoint(c % N, (c / N) | 0, false);
    const v = largestVoid();
    if (v === c) {
      togglePoint(c % N, (c / N) | 0, true);
      break;
    }
    togglePoint(v % N, (v / N) | 0, true);
  }
}

// The rank each pixel receives (0 = darkest / first-to-appear tooth peak).
const rank = new Int32Array(SIZE).fill(-1);
// Snapshot the IBP — it's the boundary between the three ranking phases.
const ibp = bin.slice();

// --- Phase 1: rank the IBP's "1" pixels (ranks ONES-1 .. 0) ----------------
// Remove tightest clusters one at a time; the order of removal ranks them.
for (let r = ONES - 1; r >= 0; r--) {
  const c = tightestCluster();
  rank[c] = r;
  togglePoint(c % N, (c / N) | 0, false);
}

// --- Phase 2: rank every remaining "0" pixel (ONES .. SIZE-1) --------------
// Restore the IBP, then repeatedly insert a 1 into the largest void. With a
// toroidal Gaussian field the total kernel weight K at every pixel is constant,
// so the 0-density E0(p) = K - E(p): the "largest void" (argmin E among 0s) is
// *identically* the tightest cluster of the 0-minority. That means there is no
// separate past-50% phase — filling the largest void all the way to full keeps
// the shrinking set of 0s spread as blue noise the whole way.
energy.fill(0);
bin.set(ibp);
for (let i = 0; i < SIZE; i++) if (bin[i]) splat(i % N, (i / N) | 0, 1);
for (let r = ONES; r < SIZE; r++) {
  const v = largestVoid();
  rank[v] = r;
  togglePoint(v % N, (v / N) | 0, true);
}

// Normalise ranks to bytes 0..255 (the threshold value at each pixel).
const bytes = new Uint8Array(SIZE);
for (let i = 0; i < SIZE; i++) bytes[i] = Math.min(255, Math.round((rank[i] / (SIZE - 1)) * 255));

// Sanity: a blue-noise matrix is a permutation — every rank used exactly once.
const seen = new Uint8Array(SIZE);
for (let i = 0; i < SIZE; i++) {
  if (rank[i] < 0) throw new Error(`unranked pixel at ${i}`);
  seen[rank[i]] = 1;
}
if (seen.reduce((a, b) => a + b, 0) !== SIZE) throw new Error('ranks are not a permutation');

const base64 = Buffer.from(bytes).toString('base64');

const out = `// GENERATED by scripts/gen-crayon-noise.mjs — do not edit by hand.
// Regenerate with: npm run gen:crayon-noise
//
// A ${N}x${N} tileable blue-noise threshold matrix (void-and-cluster, Ulichney
// 1993) — the crayon brush's "paper tooth" (ADR-0065). Each byte is a threshold
// in 0..255; the crayon's coverage curve maps it to a per-pixel wax deposit so a
// partial pass reads as fine, even paper grain rather than clumpy noise. Shipped
// as a constant (not generated at runtime) so every device, replay, and export
// samples the identical tooth — the engine's bit-identical-replay invariant.

export const CRAYON_NOISE_SIZE = ${N};

const CRAYON_NOISE_BASE64 =
  '${base64}';

// Decoded lazily to a Uint8ClampedArray of length ${SIZE} (row-major, wraps).
let decoded: Uint8ClampedArray | null = null;
export function crayonNoiseBytes(): Uint8ClampedArray {
  if (decoded) return decoded;
  const bin = typeof atob === 'function' ? atob(CRAYON_NOISE_BASE64) : '';
  const arr = new Uint8ClampedArray(CRAYON_NOISE_SIZE * CRAYON_NOISE_SIZE);
  if (bin) for (let i = 0; i < arr.length; i++) arr[i] = bin.charCodeAt(i);
  decoded = arr;
  return arr;
}
`;

const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, '..', 'web', 'src', 'lib', 'drawing', 'crayonNoise.ts');
writeFileSync(target, out);
console.log(`Wrote ${target} (${N}x${N}, ${base64.length} base64 chars)`);
