import { useMemo } from 'react';
import { SvgXml } from 'react-native-svg';
import { useDrawingAppearance } from '../drawing/DrawingAppearance';
import { DRAWING_THEMES } from '../drawing/theme';
import { useNativeIconMarkup } from './iconRegistry';
import type { NativeIconName } from './icons.generated';

// Holds the icon's box while a deferred icon's chunk loads, so its row does not reflow.
export const EMPTY_ICON_MARKUP = '<svg xmlns="http://www.w3.org/2000/svg"/>';

// Monochrome glyphs and the ink parts of brush faces paint currentColor. Resolving it in the markup
// keeps native and web identical instead of depending on each renderer's color inheritance.
export function RsdIcon({
  name,
  size,
  ink,
  muted,
}: {
  name: NativeIconName;
  size: number;
  ink: string | undefined;
  muted: boolean;
}) {
  const theme = useDrawingAppearance();
  const palette = DRAWING_THEMES[theme];
  const color = ink ?? (muted ? palette.iconMuted : palette.iconInk);
  const markup = useNativeIconMarkup(name)?.[theme];
  const xml = useMemo(
    () => markup?.replaceAll('currentColor', color) ?? EMPTY_ICON_MARKUP,
    [markup, color]
  );
  return <SvgXml xml={xml} width={size} height={size} />;
}
