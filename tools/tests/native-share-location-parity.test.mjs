import { describe, expect, it, vi } from 'vitest';
import { iosShareButtonLocation } from '../../web/src/lib/iosShareButtonLocation.ts';
import { INSTALL_PROMPT_COPY } from '../../web/src/lib/installPromptCopy.ts';
import { QUICKSAND_FONT_FAMILY } from '../../web/src/lib/fonts.ts';
import { TABLET_MIN_SIDE_PX } from '../../web/src/lib/breakpoints.ts';

const viewport = vi.hoisted(() => ({ width: 0, height: 0 }));
vi.mock('react-native', () => ({ useWindowDimensions: () => viewport }));

const { useShareButtonLocation } =
  await import('../../experiments/native-architecture/src/install/shareLocation.ts');
const { INSTALL_PROMPT_COPY: NATIVE_INSTALL_PROMPT_COPY } =
  await import('../../experiments/native-architecture/src/install/installCopy.ts');
const { SHIPPING_FONT_FAMILY } =
  await import('../../experiments/native-architecture/src/platform/shippingFontFaces.ts');
// layoutState.orientation: the wider side wins, and a square viewport takes the CSS orientation,
// which the CSS spec makes portrait.
const shippingOrientation = (width, height) => (width > height ? 'landscape' : 'portrait');

// Phones and tablets both ways up, the tablet floor either side, a square, and the unmeasured 0.
const VIEWPORTS = [
  [390, 844],
  [844, 390],
  [744, 1133],
  [1133, 744],
  [TABLET_MIN_SIDE_PX - 1, 900],
  [TABLET_MIN_SIDE_PX, 900],
  [500, 500],
  [0, 0],
];

describe('native install wording against the shipping modules it imports', () => {
  it.each(VIEWPORTS)('places the Share button for a %i x %i window as shipping does', (w, h) => {
    viewport.width = w;
    viewport.height = h;
    expect(useShareButtonLocation()).toBe(iosShareButtonLocation(w, shippingOrientation(w, h)));
  });

  it('shows the shipping banner copy and font family themselves, not copies', () => {
    expect(NATIVE_INSTALL_PROMPT_COPY).toBe(INSTALL_PROMPT_COPY);
    expect(SHIPPING_FONT_FAMILY).toBe(QUICKSAND_FONT_FAMILY);
  });
});
