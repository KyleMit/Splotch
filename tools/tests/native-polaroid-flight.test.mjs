import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  CSS_EASE,
  DISCARD_FADE_MS,
  FLASH_MS,
  POLAROID_Z_INDEX,
  POLAROID_FADE_KEYFRAMES,
  POLAROID_FADE_MS,
  POLAROID_FLASH_KEYFRAMES,
  POLAROID_FRAME,
  POLAROID_SHOW_KEYFRAMES,
  keyframeTimeline,
  keyframeValue,
} from '../../experiments/native-architecture/src/rsdDrawing/polaroidFlight.ts';
import { POLAROID_FLIGHT_MS } from '../../web/src/lib/drawing/screenshotTiming.ts';
import { polaroidCssSize } from '../../web/src/lib/drawing/polaroidGeometry.ts';
import { scale, zIndex } from '../../web/src/lib/design/tokens.ts';

// A recording Animated: a timing is returned as data for the test to read, and each curve squares
// its input and remembers the control points it was built from.
const curves = vi.hoisted(() => []);
vi.mock('react-native', () => ({
  Animated: { timing: (value, config) => ({ value, ...config }) },
  Easing: {
    bezier: (...points) => {
      curves.push(points);
      return (time) => time * time;
    },
  },
}));

const MS_PER_SECOND = 1000;
const seconds = (token) => Number.parseFloat(token) * MS_PER_SECOND;
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const css = read('web/src/app.css').replace(/\/\*[\s\S]*?\*\//g, '');
const native = read('experiments/native-architecture/src/rsdDrawing/RsdPolaroidFlight.tsx');

// The body of the first block whose prelude is `prelude`, braces balanced.
function block(prelude) {
  const start = css.indexOf(`${prelude} {`);
  expect(start, prelude).toBeGreaterThanOrEqual(0);
  let depth = 0;
  for (let index = css.indexOf('{', start); index < css.length; index++) {
    if (css[index] === '{') depth += 1;
    if (css[index] === '}') depth -= 1;
    if (depth === 0) return css.slice(css.indexOf('{', start) + 1, index);
  }
  throw new Error(`Unclosed ${prelude}`);
}

function declaration(body, property) {
  return body
    .match(new RegExp(`(?:^|[;\\s])${property}:\\s*([^;]+);`))?.[1]
    .replace(/\s+/g, ' ')
    .trim();
}

function bezier(value) {
  if (value === 'linear') return [0, 0, 1, 1];
  if (value === 'ease-out') return [0, 0, 0.58, 1];
  if (value === 'ease') return [0.25, 0.1, 0.25, 1];
  return value
    .match(/cubic-bezier\(([^)]+)\)/)[1]
    .split(',')
    .map(Number);
}

// A translate term: the button offset's multiple, or 0 at the center.
function fromMultiple(term) {
  if (term === '0') return 0;
  if (term.startsWith('var(--from-')) return 1;
  return Number(term.match(/\*\s*([\d.]+)\)$/)[1]);
}

function transform(value) {
  if (!value) return { from: 0, scale: 1, rotate: 0 };
  const translate = value.match(/translate3d\((calc\([^)]*\)\)|[^,]+),\s*(calc\([^)]*\)\)|[^,]+),/);
  const from = translate ? fromMultiple(translate[1].trim()) : 0;
  if (translate) expect(fromMultiple(translate[2].trim())).toBe(from);
  return {
    from,
    scale: Number(value.match(/scale\(([^)]+)\)/)?.[1] ?? 1),
    rotate: Number(value.match(/rotate\((-?[\d.]+)deg\)/)?.[1] ?? 0),
  };
}

// Each keyframe offset of an @keyframes rule, with the declarations its block sets.
function keyframes(name) {
  const body = block(`@keyframes ${name}`);
  return [...body.matchAll(/([\d%,\s]+)\{([^}]*)\}/g)].flatMap(([, offsets, declarations]) =>
    offsets
      .split(',')
      .map((offset) => offset.trim())
      .filter(Boolean)
      .map((offset) => ({ at: Number(offset.replace('%', '')) / 100, declarations }))
  );
}

const resting = {
  from: 0,
  scale: 1,
  rotate: 0,
  opacity: Number(declaration(block('.polaroid-frame'), 'opacity')),
};

describe('the native save polaroid against app.css', () => {
  it('flies the polaroid-show keyframes, offsets, curves and duration', () => {
    const frame = block('.polaroid-frame');
    expect(declaration(frame, 'animation')).toBe('polaroid-show 1.9s linear forwards');
    expect(POLAROID_FLIGHT_MS).toBe(1900);
    const shipping = keyframes('polaroid-show').map(({ at, declarations }) => ({
      at,
      ...transform(declaration(declarations, 'transform')),
      opacity: Number(declaration(declarations, 'opacity')),
      easing: declaration(declarations, 'animation-timing-function'),
    }));
    expect(POLAROID_SHOW_KEYFRAMES.map(({ easing: _easing, ...keyframe }) => keyframe)).toEqual(
      shipping.map(({ easing: _easing, ...keyframe }) => keyframe)
    );
    for (const [index, keyframe] of POLAROID_SHOW_KEYFRAMES.slice(0, -1).entries())
      expect(keyframe.easing, `${keyframe.at}`).toEqual(bezier(shipping[index].easing));
  });

  it('fades the Reduce Motion polaroid-fade keyframes between the frame resting style', () => {
    expect(declaration(block('.polaroid-frame[data-start-reduced-motion]'), 'animation-name')).toBe(
      'polaroid-fade'
    );
    expect(
      declaration(block('.polaroid-frame[data-start-reduced-motion]'), 'animation-duration')
    ).toBe(`${POLAROID_FADE_MS / 1000}s`);
    const inner = keyframes('polaroid-fade').map(({ at, declarations }) => ({
      at,
      ...transform(declaration(declarations, 'transform')),
      opacity: Number(declaration(declarations, 'opacity')),
      easing: bezier('linear'),
    }));
    expect(POLAROID_FADE_KEYFRAMES).toEqual([
      { at: 0, ...resting, easing: bezier('linear') },
      ...inner,
      { at: 1, ...resting, easing: bezier('linear') },
    ]);
  });

  it('flashes the polaroid-flash keyframes for --duration-slow, and drops the flash under Reduce Motion', () => {
    const flash = block('.polaroid-flash');
    expect(declaration(flash, 'animation')).toBe(
      'polaroid-flash var(--duration-slow) ease-out forwards'
    );
    const base = Number(declaration(flash, 'opacity'));
    const peaks = keyframes('polaroid-flash').map(({ at, declarations }) => ({
      at,
      opacity: Number(declaration(declarations, 'opacity')),
      easing: bezier('ease-out'),
    }));
    expect(POLAROID_FLASH_KEYFRAMES).toEqual([
      { at: 0, opacity: base, easing: bezier('ease-out') },
      ...peaks,
      { at: 1, opacity: base, easing: bezier('ease-out') },
    ]);
    expect(declaration(block('.polaroid-flash[data-start-reduced-motion]'), 'animation')).toBe(
      'none'
    );
    expect(FLASH_MS).toBe(seconds(scale.durationSlow));
    expect(native).toMatch(/calm\s*\?\s*null/);
  });

  it('frames the picture on the polaroid paper with the app.css padding, corners and shadow', () => {
    const frame = block('.polaroid-frame');
    expect(declaration(frame, 'padding')).toBe(
      `${POLAROID_FRAME.paddingTopPx}px ${POLAROID_FRAME.paddingInlinePx}px ${POLAROID_FRAME.paddingBottomPx}px`
    );
    expect(declaration(frame, 'border-radius')).toBe(`${POLAROID_FRAME.radiusPx}px`);
    expect(declaration(frame, 'background')).toBe('var(--polaroid-paper)');
    const rgba = (shadow) =>
      shadow.replace(
        /rgb\((\d+) (\d+) (\d+) \/ (\d+)%\)/g,
        (_, r, g, b, alpha) => `rgba(${r}, ${g}, ${b}, ${Number(alpha) / 100})`
      );
    expect(rgba(declaration(frame, 'box-shadow'))).toBe(POLAROID_FRAME.shadow);
    const image = block('.polaroid-image');
    expect(declaration(image, 'border-radius')).toBe(
      `${native.match(/const IMAGE_RADIUS_PX = (\d+);/)[1]}px`
    );
    expect(declaration(image, 'background')).toBe('var(--polaroid-paper)');
    expect(declaration(block('.polaroid-overlay'), 'z-index')).toBe('var(--z-polaroid)');
    expect(POLAROID_Z_INDEX).toBe(zIndex.zPolaroid);
    expect(native).toContain('zIndex: POLAROID_Z_INDEX');
    expect(native).toContain('backgroundColor: DRAWING_POLAROID.paper');
    expect(native).toContain('backgroundColor: fixedColors.polaroidPaper');
  });

  it('fades a failed save out over --duration-base with the CSS ease', () => {
    expect(declaration(block('.polaroid-overlay.polaroid-discarded'), 'transition')).toBe(
      'opacity var(--duration-base) ease'
    );
    expect(CSS_EASE).toEqual(bezier('ease'));
    expect(DISCARD_FADE_MS).toBe(seconds(scale.durationBase));
  });

  it('sizes the polaroid by the shipping rule the shipping flight uses', () => {
    expect(read('web/src/lib/drawing/polaroidAnimation.ts')).toContain('polaroidCssSize(');
    expect(native).toContain('polaroidCssSize(flight.paper, window)');
    expect(polaroidCssSize({ width: 1024, height: 768 }, { width: 390, height: 844 })).toEqual({
      width: 260,
      height: 195,
    });
    expect(polaroidCssSize({ width: 0, height: 768 }, { width: 390, height: 844 })).toBeNull();
  });
});

describe('the keyframe timeline', () => {
  it('runs the whole flight as one native-driven timing', () => {
    const progress = { interpolate: (config) => config };
    const timing = keyframeTimeline(progress, POLAROID_SHOW_KEYFRAMES, POLAROID_FLIGHT_MS);
    expect(timing).toMatchObject({
      value: progress,
      toValue: 1,
      duration: POLAROID_FLIGHT_MS,
      useNativeDriver: true,
    });
  });

  it('eases each keyframe gap under the curve its starting keyframe names', () => {
    curves.length = 0;
    const timing = keyframeTimeline({}, POLAROID_SHOW_KEYFRAMES, POLAROID_FLIGHT_MS);
    expect(curves).toEqual(POLAROID_SHOW_KEYFRAMES.slice(0, -1).map((keyframe) => keyframe.easing));
    for (const [index, keyframe] of POLAROID_SHOW_KEYFRAMES.slice(0, -1).entries()) {
      const next = POLAROID_SHOW_KEYFRAMES[index + 1];
      expect(timing.easing(keyframe.at)).toBeCloseTo(keyframe.at);
      expect(timing.easing((keyframe.at + next.at) / 2)).toBeCloseTo(
        keyframe.at + (next.at - keyframe.at) / 4
      );
    }
    expect(timing.easing(1)).toBe(1);
  });

  it('interpolates each property linearly across the keyframe offsets', () => {
    const progress = { interpolate: (config) => config };
    expect(keyframeValue(progress, POLAROID_SHOW_KEYFRAMES, (keyframe) => keyframe.scale)).toEqual({
      inputRange: POLAROID_SHOW_KEYFRAMES.map((keyframe) => keyframe.at),
      outputRange: POLAROID_SHOW_KEYFRAMES.map((keyframe) => keyframe.scale),
      extrapolate: 'clamp',
    });
  });
});
