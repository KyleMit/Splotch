import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '../..');
const read = (path) => readFileSync(join(root, path), 'utf8');

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const shippingClip = readFileSync(join(root, 'web/static/sounds/clear-page-turn.mp3'));
const nativeClip = readFileSync(
  join(root, 'experiments/native-architecture/src/audio/clear-page-turn.mp3')
);

describe('native drag-to-clear projections of the shipping gesture', () => {
  it('bundles the shipping page-turn clip byte for byte', () => {
    expect(digest(nativeClip)).toBe(digest(shippingClip));
    const changed = Buffer.from(nativeClip);
    changed[0] ^= 1;
    expect(digest(changed)).not.toBe(digest(shippingClip));
  });
});
const nativeSource = {
  face: read('experiments/native-architecture/src/rsdDrawing/RsdClearFace.tsx'),
  ring: read('experiments/native-architecture/src/rsdDrawing/RsdClearRing.tsx'),
  control: read('experiments/native-architecture/src/rsdDrawing/RsdClearControl.tsx'),
};

describe('native Clear Button accessible name', () => {
  it('keeps the Clear control accessible name', () => {
    expect(nativeSource.control).toContain('accessibilityLabel="Clear drawing"');
  });
});

it("keeps Clear's ring reveal and emphasis on their shipping curves", () => {
  const native = read('experiments/native-architecture/src/clear/useClearGesture.ts');
  const [, curve] = /export const CSS_EASE: Bezier = \[([^\]]+)\]/.exec(
    read('experiments/native-architecture/src/rsdDrawing/polaroidFlight.ts')
  );
  expect(native).toContain(`const CSS_EASE = Easing.bezier(${curve.trim()});`);
  expect(native).toContain('animateValue(values.ring, 1, EMPHASIS_MS, reduced.current, CSS_EASE);');
  expect(native).toContain(
    'animateValue(values.ringScale, 1, RING_REVEAL_MS, reduced.current, EASE_POP);'
  );
  expect(native).toContain(
    'animateValue(values.emphasis, next ? 1 : 0, EMPHASIS_MS, reduced.current, CSS_EASE);'
  );
});
