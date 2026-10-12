import { describe, expect, it } from 'vitest';
import { ACTION_BUTTON_SCALE_MIN } from './state/settings.svelte';
import type { Orientation } from './platform';
import {
  ACTION_BUTTON_BASE_PX,
  FLYOUT_OPTION_MIN_BASE_PX,
  type ActionButtonSizeClass,
} from './actionButtonLayout';

// Splotch is drawn on by two-year-olds, so what a size class hands a child is
// two questions, not one: how big the control is by default, and how small the
// Button Size slider can then ask for it. Both are pinned here, because a
// baseline that reads fine at the default can still take a control somewhere it
// has never been at the slider's floor.

/** The design system's floor for anything interactive. */
const MIN_TOUCH_TARGET_PX = 44;

// At ACTION_BUTTON_SCALE_MIN a parent has deliberately traded target size for
// canvas, so both of these sit below MIN_TOUCH_TARGET_PX — that trade is theirs
// to make. What is not theirs is a baseline change taking a kid-facing control
// lower than their own minimum already does, which is what these pin. The flyout
// options hold the higher floor because a popover frees no canvas to trade for
// (see FLYOUT_OPTION_MIN_BASE_PX and .flyout-option in app.css).
const SMALLEST_ACTION_BUTTON_AT_MIN_SCALE_PX = 35;
const SMALLEST_FLYOUT_OPTION_AT_MIN_SCALE_PX = 42;

const SIZE_CLASS_STEPS = (
  Object.entries(ACTION_BUTTON_BASE_PX) as [ActionButtonSizeClass, Record<Orientation, number>][]
).flatMap(([sizeClass, steps]) =>
  (Object.entries(steps) as [Orientation, number][]).map(([orientation, basePx]) => ({
    where: `${sizeClass} ${orientation}`,
    basePx,
  }))
);

const atSliderMinimum = (basePx: number) => (basePx * ACTION_BUTTON_SCALE_MIN) / 100;

// Mirrors .flyout-option's `max(var(--action-btn-base), FLYOUT_OPTION_MIN_BASE_PX)`,
// which actionButtonLayout.fallback.test.ts holds the stylesheet to.
const flyoutOptionBase = (basePx: number) => Math.max(basePx, FLYOUT_OPTION_MIN_BASE_PX);

describe('at the Button Size default', () => {
  it('keeps the smallest step a comfortable target', () => {
    const smallest = Math.min(...Object.values(ACTION_BUTTON_BASE_PX.phone));
    expect(smallest).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
  });

  // The panel's step shrinks on a phone to hand the canvas back; a flyout closes
  // on the next tap and hands nothing back, so it never takes that step down and
  // clears the floor on every screen rather than only the roomy ones.
  it.each(SIZE_CLASS_STEPS)('keeps the $where flyout option a comfortable target', ({ basePx }) => {
    expect(flyoutOptionBase(basePx)).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
  });
});

describe('at the Button Size minimum', () => {
  it.each(SIZE_CLASS_STEPS)('keeps the $where action button off the floor', ({ basePx }) => {
    expect(atSliderMinimum(basePx)).toBeGreaterThanOrEqual(SMALLEST_ACTION_BUTTON_AT_MIN_SCALE_PX);
  });

  it.each(SIZE_CLASS_STEPS)('keeps the $where flyout option off the floor', ({ basePx }) => {
    expect(atSliderMinimum(flyoutOptionBase(basePx))).toBeGreaterThanOrEqual(
      SMALLEST_FLYOUT_OPTION_AT_MIN_SCALE_PX
    );
  });

  // The pair only reads as a deliberate split while the popover is the larger
  // target; equal floors would mean the flyout had quietly taken the panel's.
  it('leaves a flyout option larger than the button that opened it', () => {
    expect(SMALLEST_FLYOUT_OPTION_AT_MIN_SCALE_PX).toBeGreaterThan(
      SMALLEST_ACTION_BUTTON_AT_MIN_SCALE_PX
    );
  });
});
