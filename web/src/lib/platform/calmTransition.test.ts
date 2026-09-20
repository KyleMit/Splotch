import { slide } from 'svelte/transition';
import { afterEach, describe, expect, it } from 'vitest';
import { CALM_FADE_MS } from '$lib/motionDurations';
import { calm } from './calmTransition';
import { applyReducedMotion, REDUCE_MOTION_ATTRIBUTE } from './reducedMotion';

afterEach(() => document.documentElement.removeAttribute(REDUCE_MOTION_ATTRIBUTE));

const SLIDE_MS = 220;

function config(node: Element, reduced: boolean) {
  applyReducedMotion(reduced);
  return calm(slide, { duration: SLIDE_MS })(node);
}

describe('calm', () => {
  it('runs the wrapped transition at full motion', () => {
    const node = document.createElement('div');
    document.body.appendChild(node);
    const { duration, css } = config(node, false);
    expect(duration).toBe(SLIDE_MS);
    expect(css?.(0.5, 0.5)).toContain('height');
    node.remove();
  });

  it('swaps travel for a short opacity fade when the parent asked for calm', () => {
    const node = document.createElement('div');
    document.body.appendChild(node);
    const { duration, css } = config(node, true);
    expect(duration).toBe(CALM_FADE_MS);
    // jsdom reports no computed opacity, which `fade` reads as its ceiling, so
    // the value is meaningless here; that it touches opacity alone is the point.
    expect(css?.(0.5, 0.5)).toMatch(/^opacity: [\d.]+$/);
    node.remove();
  });

  it('reads the answer at each reveal, so a mid-session flip reaches the next one', () => {
    const node = document.createElement('div');
    document.body.appendChild(node);
    const reveal = calm(slide, { duration: SLIDE_MS });
    applyReducedMotion(false);
    expect(reveal(node).duration).toBe(SLIDE_MS);
    applyReducedMotion(true);
    expect(reveal(node).duration).toBe(CALM_FADE_MS);
    node.remove();
  });
});
