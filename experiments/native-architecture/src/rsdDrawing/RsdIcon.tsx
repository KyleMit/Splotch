import { useMemo } from 'react';
import { SvgXml } from 'react-native-svg';
import { useDrawingAppearance } from '../drawing/DrawingAppearance';
import { DRAWING_THEMES } from '../drawing/theme';
import { NATIVE_ICONS, type NativeIconName } from './icons.generated';

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
  const xml = useMemo(
    () => NATIVE_ICONS[name][theme].replaceAll('currentColor', color),
    [name, theme, color]
  );
  return <SvgXml xml={xml} width={size} height={size} />;
}
