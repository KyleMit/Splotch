// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DIAL_MAX_SIZE_PX, DIAL_STAGE_FRACTION, MASK_CLEARANCE } from './aiDialGeometry';

// The confetti's mask hole and fall distance are declared in AiResultStage's
// style block from the dial's geometry, as CSS literals: half the dial's
// stage fraction, half its size cap, and the clearance the hole opens past its
// rim. aiDialGeometry.ts is the source those numbers are copied from (AiDial
// sizes itself from the same module at runtime), so this reads the committed
// block back off disk and holds the copy to the source — the trimGeometry.test.ts
// pattern.

const stageSource = readFileSync(new URL('./AiResultStage.svelte', import.meta.url), 'utf8');
const confettiSource = readFileSync(new URL('./AiConfetti.svelte', import.meta.url), 'utf8');

function styleBlock(source: string): string {
  const match = source.match(/<style>([\s\S]*)<\/style>/);
  expect(match).not.toBeNull();
  return match![1];
}

function declaration(css: string, property: string): string {
  const match = css.match(new RegExp(`${property}:\\s*([^;]+);`));
  expect(match, `expected a \`${property}\` declaration`).not.toBeNull();
  return match![1].replace(/\s+/g, ' ').trim();
}

describe('AiResultStage declares the confetti geometry from the dial geometry', () => {
  const css = styleBlock(stageSource);

  it('cuts the mask hole to the dial: half its stage fraction, half its cap, and the clearance', () => {
    const radius = declaration(css, '--confetti-mask-radius');
    const match = radius.match(
      /^calc\(min\(var\(--stage-w\) \* ([\d.]+), (\d+)px\) \* ([\d.]+)\)$/
    );
    expect(match, `unexpected radius expression: ${radius}`).not.toBeNull();
    expect(Number(match![1])).toBe(DIAL_STAGE_FRACTION / 2);
    expect(Number(match![2])).toBe(DIAL_MAX_SIZE_PX / 2);
    expect(Number(match![3])).toBe(MASK_CLEARANCE);
  });

  it('hands the confetti one radius on both axes, so the hole is a circle on any aspect', () => {
    expect(declaration(css, '--confetti-rx')).toBe('var(--confetti-mask-radius)');
    expect(declaration(css, '--confetti-ry')).toBe('var(--confetti-mask-radius)');
  });

  it("projects the stage box from the card's budget and the picture's aspect", () => {
    expect(declaration(css, '--stage-w')).toBe(
      'min( var(--result-stage-max-w), calc(var(--result-stage-max-h) * var(--result-aspect)) )'
    );
    expect(declaration(css, '--stage-h')).toBe('calc(var(--stage-w) / var(--result-aspect))');
  });

  it('is the only source the confetti reads: no fallback literals remain', () => {
    const confetti = styleBlock(confettiSource);
    expect(confetti).not.toMatch(/var\(--stage-h,/);
    expect(confetti).not.toMatch(/var\(--confetti-r[xy],/);
    expect(stageSource).not.toContain('ResizeObserver');
  });
});
