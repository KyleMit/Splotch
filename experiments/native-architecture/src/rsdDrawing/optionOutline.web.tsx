import { css, html } from 'react-strict-dom';
import { useDrawingTheme } from '../drawing/DrawingAppearance';
import type { OptionOutlineProps } from './optionOutline';
import { BARE_OPTION_OUTLINE_PX } from './RsdIconButton';

const styles = css.create({
  outlined: (size: number, filter: string) => ({ width: size, height: size, filter }),
});

const OUTLINE_OFFSETS = [
  `${BARE_OPTION_OUTLINE_PX}px 0`,
  `-${BARE_OPTION_OUTLINE_PX}px 0`,
  `0 ${BARE_OPTION_OUTLINE_PX}px`,
  `0 -${BARE_OPTION_OUTLINE_PX}px`,
];

// The web outlines a selected flat option with shipping's own four chained drop shadows.
export function RsdOptionOutline({ children, size }: OptionOutlineProps) {
  const { textStrong } = useDrawingTheme();
  const filter = OUTLINE_OFFSETS.map((offset) => `drop-shadow(${offset} 0 ${textStrong})`).join(
    ' '
  );
  return <html.div style={styles.outlined(size, filter)}>{children}</html.div>;
}
