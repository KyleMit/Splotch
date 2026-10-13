import { TOUCH_TARGET } from '../drawing/theme';

// The shipping Button Size range and default (ACTION_BUTTON_SCALE_* in
// web/src/lib/state/settings.svelte.ts), a percentage of each edge control's normal size.
// That module is a Svelte runes store, so native-settings-sections.test.mjs holds these to it.
export const BUTTON_SCALE_MIN = 70;
export const BUTTON_SCALE_MAX = 130;
export const DEFAULT_BUTTON_SCALE = 100;
export const BUTTON_SIZE_LABEL = 'Button Size';
export const BUTTON_SIZE_HELP = 'Bigger buttons help small or unsteady hands';

export function isButtonScale(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= BUTTON_SCALE_MIN &&
    value <= BUTTON_SCALE_MAX
  );
}

// A whole-pixel border-box square, so the slot math and the rendered controls agree exactly.
export function controlSize(scale: number) {
  return Math.round((TOUCH_TARGET * scale) / 100);
}
