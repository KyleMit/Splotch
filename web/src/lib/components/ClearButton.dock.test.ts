// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { EDGE_SWIPE_BAND_PX } from '$lib/drawing/strokeMath';
import clearButtonSource from './ClearButton.svelte?raw';

// While immersive mode hides the system bars, Android reserves the top screen
// edge for the swipe that brings them back, and web content cannot opt out of
// it. The docked Clear Button is the app's only drag target up there, so its top
// edge has to sit a band clear of that band: one EDGE_SWIPE_BAND_PX for the
// reserved strip, and one more so a fingertip landing high on a corner-pinned
// target still lands on the button rather than in the strip.
const DOCK_CLEARANCE_BANDS = 2;
const MIN_DOCK_TOP_PX = EDGE_SWIPE_BAND_PX * DOCK_CLEARANCE_BANDS;

// The landscape dock floors its offset so the OS inset can raise it but never
// lower it; portrait adds to the inset from an offset that already clears the
// band on its own. An unrecognized form is a failure on purpose — the guard
// protects nothing once it stops understanding the declaration it reads.
const LANDSCAPE_FLOOR = /^max\( ?(\d+)px, ?calc\( ?(\d+)px \+ var\(--safe-area-top\) ?\) ?\)$/;
const PORTRAIT_OFFSET = /^calc\( ?(\d+)px \+ var\(--safe-area-top\) ?\)$/;

// Every `.clear-container` rule that sets its own `top`, in source order:
// the landscape base rule first, then the portrait override. The newline anchor
// keeps the modifier rules (`.clear-container:global(.dragging-active)` and the
// reduced-motion descendant selector) out — neither positions the dock.
function dockTopDeclarations(): string[] {
  return [...clearButtonSource.matchAll(/\n\s*\.clear-container\s*\{([^}]*)\}/g)]
    .map((rule) => /\btop:\s*([^;]+);/.exec(rule[1])?.[1])
    .filter((top): top is string => top !== undefined)
    .map((top) => top.replace(/\s+/g, ' ').trim());
}

describe('clear button dock', () => {
  it('positions the dock in both orientations', () => {
    expect(dockTopDeclarations()).toHaveLength(2);
  });

  it('floors the landscape dock clear of the OS top-edge gesture band', () => {
    const [landscape] = dockTopDeclarations();
    const match = LANDSCAPE_FLOOR.exec(landscape);

    expect(match, `unrecognized landscape dock offset: ${landscape}`).not.toBeNull();
    expect(Number(match?.[1])).toBeGreaterThanOrEqual(MIN_DOCK_TOP_PX);
  });

  it('keeps the portrait dock clear of the same band without a floor', () => {
    const [, portrait] = dockTopDeclarations();
    const match = PORTRAIT_OFFSET.exec(portrait);

    expect(match, `unrecognized portrait dock offset: ${portrait}`).not.toBeNull();
    expect(Number(match?.[1])).toBeGreaterThanOrEqual(MIN_DOCK_TOP_PX);
  });
});
