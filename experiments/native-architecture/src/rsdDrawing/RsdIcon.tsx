import { useMemo } from 'react';
import { SvgXml } from 'react-native-svg';
import { useDrawingAppearance } from '../drawing/DrawingAppearance';
import { DRAWING_THEMES } from '../drawing/theme';
import { useNativeIconMarkup } from './iconRegistry';
import type { NativeIconName } from './icons.generated';

// Holds the icon's box while a deferred icon's chunk loads, so its row does not reflow.
export const EMPTY_ICON_MARKUP = '<svg xmlns="http://www.w3.org/2000/svg"/>';
// The app.css .white-stroke / .dark-stroke keyline width in screen pixels;
// tools/tests/native-button-chrome.test.mjs holds it to app.css.
export const INK_KEYLINE_WIDTH_PX = 2;

const INK_PATH = /<path\b[^>]*\bfill="currentColor"[^>]*\/>/g;
const VIEW_BOX = /viewBox="([^"]+)"/;

// The shipping keyline strokes each currentColor path behind its fill (paint-order: stroke) at a
// fixed screen width (non-scaling-stroke). react-native-svg supports neither, so a stroke-only
// copy goes under each ink path, its width converted into the icon's own units.
export function keylinedMarkup(markup: string, keyline: string, size: number) {
  const [, , width = size, height = size] = (VIEW_BOX.exec(markup)?.[1] ?? '')
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const strokeWidth = (INK_KEYLINE_WIDTH_PX * Math.max(width, height)) / size;
  return markup.replace(
    INK_PATH,
    (path) =>
      path.replace(
        'fill="currentColor"',
        `fill="none" stroke="${keyline}" stroke-width="${strokeWidth}"`
      ) + path
  );
}

// Monochrome glyphs and the ink parts of brush faces paint currentColor. Resolving it in the markup
// keeps native and web identical instead of depending on each renderer's color inheritance.
// A keyline rings those ink parts so a white or near-black ink still reads on its button.
export function RsdIcon({
  name,
  size,
  ink,
  muted,
  keyline,
}: {
  name: NativeIconName;
  size: number;
  ink: string | undefined;
  muted: boolean;
  keyline?: string | undefined;
}) {
  const theme = useDrawingAppearance();
  const palette = DRAWING_THEMES[theme];
  const color = ink ?? (muted ? palette.iconMuted : palette.iconInk);
  const markup = useNativeIconMarkup(name)?.[theme];
  const xml = useMemo(() => {
    if (!markup) return EMPTY_ICON_MARKUP;
    const ringed = keyline ? keylinedMarkup(markup, keyline, size) : markup;
    return ringed.replaceAll('currentColor', color);
  }, [markup, color, keyline, size]);
  return <SvgXml xml={xml} width={size} height={size} />;
}
