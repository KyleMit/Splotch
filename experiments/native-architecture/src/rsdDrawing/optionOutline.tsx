import { useMemo, type ReactNode } from 'react';
import { css, html } from 'react-strict-dom';
import { SvgXml } from '../platform/svg';
import { useDrawingAppearance, useDrawingTheme } from '../drawing/DrawingAppearance';
import { useNativeIconMarkup } from './iconRegistry';
import type { NativeIconName } from './icons.generated';
import { EMPTY_ICON_MARKUP, keylinedMarkup } from './RsdIcon';
import { BARE_OPTION_OUTLINE_PX } from './RsdIconButton';

export type OptionOutlineProps = {
  // The option's glyph, drawn over its outline.
  children: ReactNode;
  name: NativeIconName;
  size: number;
  // The glyph's own keyline, which the outline traces too.
  keyline: string | undefined;
};

// Icon markup writes every color in hex.
const PAINTED_COLOR = /#(?:[0-9a-f]{6}|[0-9a-f]{3})\b|currentColor/gi;
const OUTLINE_STEPS_PX = [-BARE_OPTION_OUTLINE_PX, 0, BARE_OPTION_OUTLINE_PX];
const OUTLINE_OFFSETS = OUTLINE_STEPS_PX.flatMap((left) =>
  OUTLINE_STEPS_PX.map((top) => ({ left, top }))
).filter(({ left, top }) => left !== 0 || top !== 0);

const styles = css.create({
  box: (size: number) => ({ position: 'relative', width: size, height: size }),
  shadow: (left: number, top: number) => ({ position: 'absolute', left, top }),
});

// A selected flat option is outlined in the strong text ink by four chained drop shadows, and iOS
// drops a drop-shadow() filter. So the native apps draw what those shadows leave: the glyph's
// silhouette in the ink at every step of a three-by-three grid, corners included, under the glyph.
export function RsdOptionOutline({ children, name, size, keyline }: OptionOutlineProps) {
  const { textStrong } = useDrawingTheme();
  const markup = useNativeIconMarkup(name)?.[useDrawingAppearance()];
  const silhouette = useMemo(() => {
    if (!markup) return EMPTY_ICON_MARKUP;
    const ringed = keyline ? keylinedMarkup(markup, textStrong, size) : markup;
    return ringed.replace(PAINTED_COLOR, textStrong);
  }, [markup, keyline, textStrong, size]);
  return (
    <html.div style={styles.box(size)}>
      {OUTLINE_OFFSETS.map(({ left, top }) => (
        <html.div
          key={`${left},${top}`}
          data-testid="option-outline"
          style={styles.shadow(left, top)}
        >
          <SvgXml xml={silhouette} width={size} height={size} />
        </html.div>
      ))}
      {children}
    </html.div>
  );
}
