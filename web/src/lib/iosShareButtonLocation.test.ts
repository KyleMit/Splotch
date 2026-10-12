// @vitest-environment node
import { expect, it } from 'vitest';
import { TABLET_MIN_SIDE_PX } from './breakpoints';
import { iosShareButtonLocation } from './iosShareButtonLocation';

const BOTTOM = 'at the bottom of the screen';
const TOOLBAR = 'in the Safari toolbar';

it.each([
  { device: 'a phone in portrait', width: 390, orientation: 'portrait', expected: BOTTOM },
  { device: 'a phone in landscape', width: 844, orientation: 'landscape', expected: TOOLBAR },
  { device: 'a small phone in landscape', width: 568, orientation: 'landscape', expected: TOOLBAR },
  { device: 'an iPad in portrait', width: 820, orientation: 'portrait', expected: TOOLBAR },
  {
    device: 'a portrait viewport at the tablet floor',
    width: TABLET_MIN_SIDE_PX,
    orientation: 'portrait',
    expected: TOOLBAR,
  },
  { device: 'an iPad in landscape', width: 1180, orientation: 'landscape', expected: TOOLBAR },
  { device: 'an unmeasured viewport', width: 0, orientation: 'portrait', expected: TOOLBAR },
] as const)('puts the Share button $expected on $device', ({ width, orientation, expected }) => {
  expect(iosShareButtonLocation(width, orientation)).toBe(expected);
});
