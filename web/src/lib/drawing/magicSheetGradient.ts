interface GradientStop {
  offset: number;
  color: string;
}

export interface RainbowGradient {
  // Direction of the gradient line, in radians, measured from the +x axis.
  angle: number;
  stops: GradientStop[];
}

export const MAGIC_GRADIENT_COUNT = 10;

// Few enough hue stops that each is visually distinct, many enough that the ramp
// between them reads as continuous rather than banded.
const RAINBOW_STOPS_MIN = 5;
const RAINBOW_STOPS_SPAN = 4;
// A sweep past 360 lets the hue wrap; staying short of the full circle still leaves
// some hues out of any one gradient, so pooled gradients read as distinct rainbows.
const RAINBOW_HUE_SWEEP_MIN_DEG = 240;
const RAINBOW_HUE_SWEEP_SPAN_DEG = 200;
const RAINBOW_SATURATION_MIN_PCT = 70;
const RAINBOW_SATURATION_SPAN_PCT = 25;
const RAINBOW_LIGHTNESS_MIN_PCT = 55;
const RAINBOW_LIGHTNESS_SPAN_PCT = 15;

// Build one random rainbow: a hue sweep across a randomly angled line, with a
// random span, saturation, and lightness so the ten pooled gradients read as
// distinct rainbows rather than the same ramp rotated. `rand` is injectable so the
// pure generation stays unit-testable.
export function createRainbowGradient(rand: () => number = Math.random): RainbowGradient {
  const angle = rand() * Math.PI * 2;
  const stopCount = RAINBOW_STOPS_MIN + Math.floor(rand() * RAINBOW_STOPS_SPAN);
  const hueStart = rand() * 360;
  const direction = rand() < 0.5 ? 1 : -1;
  const hueSweep = RAINBOW_HUE_SWEEP_MIN_DEG + rand() * RAINBOW_HUE_SWEEP_SPAN_DEG;
  const saturation = RAINBOW_SATURATION_MIN_PCT + rand() * RAINBOW_SATURATION_SPAN_PCT;
  const lightness = RAINBOW_LIGHTNESS_MIN_PCT + rand() * RAINBOW_LIGHTNESS_SPAN_PCT;
  const stops: GradientStop[] = [];
  for (let index = 0; index < stopCount; index++) {
    const offset = index / (stopCount - 1);
    const hue = (((hueStart + direction * hueSweep * offset) % 360) + 360) % 360;
    stops.push({ offset, color: `hsl(${hue}, ${saturation}%, ${lightness}%)` });
  }
  return { angle, stops };
}
