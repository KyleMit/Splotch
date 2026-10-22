// The confetti that falls behind the loading dial: one fixed field of pieces,
// shared by the web stage (AiConfetti.svelte) and the native one, which imports
// it across the . boundary.

// Confetti particle colors are content, not chrome.
const CONFETTI_COLORS = ['#FF6FB5', '#FFD23F', '#5CC8FF', '#7BE08A', '#C792EA', '#FF9E4D'];

const CONFETTI_COUNT = 38;

// One arbitrary seed per property so hashUnit() maps each index to an
// independent-looking [0,1) value.
const HASH_SEED = {
  left: 12.9,
  delay: 57.3,
  duration: 31.7,
  swaySign: 45.1,
  swayMagnitude: 8.3,
  size: 77.7,
  color: 51.3,
  round: 27.1,
};

const LEFT_MIN = 2;
const LEFT_SPAN = 96;
const DELAY_SPAN = 9;
const DURATION_MIN = 5.5;
const DURATION_SPAN = 4.5;
const SWAY_MIN = 16;
const SWAY_SPAN = 24;
const SIZE_MIN = 6;
const SIZE_SPAN = 6;
const ROUND_FRACTION = 0.4;

// Deterministic fract-hash: maps an index to a stable [0,1) value so the
// server and client render identical markup — no hydration mismatch.
function hashUnit(i: number, seed: number): number {
  const x = Math.sin((i + 1) * seed) * 10000;
  return x - Math.floor(x);
}

type ConfettiPiece = Readonly<{
  // Percent of the stage width.
  left: number;
  // Seconds, negative: every piece is already mid-fall on the first frame.
  delay: number;
  // Seconds per fall.
  duration: number;
  sway: number;
  size: number;
  color: string;
  round: boolean;
}>;

export const CONFETTI_PIECES: readonly ConfettiPiece[] = Array.from(
  { length: CONFETTI_COUNT },
  (_, i) => {
    const r = (seed: number) => hashUnit(i, seed);
    return {
      left: LEFT_MIN + r(HASH_SEED.left) * LEFT_SPAN,
      delay: -r(HASH_SEED.delay) * DELAY_SPAN,
      duration: DURATION_MIN + r(HASH_SEED.duration) * DURATION_SPAN,
      sway: (r(HASH_SEED.swaySign) * 2 - 1) * (SWAY_MIN + r(HASH_SEED.swayMagnitude) * SWAY_SPAN),
      size: SIZE_MIN + r(HASH_SEED.size) * SIZE_SPAN,
      color: CONFETTI_COLORS[Math.floor(r(HASH_SEED.color) * CONFETTI_COLORS.length)],
      round: r(HASH_SEED.round) < ROUND_FRACTION,
    };
  }
);
