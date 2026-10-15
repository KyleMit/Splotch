import { css, html } from 'react-strict-dom';
import { SvgXml } from '../platform/svg';
import { dimensions, fonts, stepNumberMix } from './tokens.css';
import { DRAWING_BRAND } from '../drawing/theme';
import { paletteHex, type PaletteLabel } from '../drawing/palette';
import { useDrawingAppearance, useDrawingTheme } from '../drawing/DrawingAppearance';
import { blobXml, type BlobShape } from './blob';
import { mixSrgb } from './colorMix';

import { STEP_NUMBER_SIZE_PX, type StepNumberSize } from './stepNumberSize';

// app.css cycles the three blobs down a list, :nth-child(3n + 1) through (3n), so neighbors differ.
const SUPPORT_INK_FRACTION = 0.75;
const BLOB_CYCLE: readonly BlobShape[] = ['radiusBlob3', 'radiusBlob1', 'radiusBlob2'];

const styles = css.create({
  badge: (size: number) => ({
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    width: size,
    height: size,
  }),
  disc: { borderRadius: dimensions.radiusPill },
  wash: (color: string) => ({ backgroundColor: color }),
  blob: { position: 'absolute', top: 0, left: 0 },
  // Positioned so the web paints it over the absolutely placed blob, as React Native's order does.
  digit: {
    position: 'relative',
    fontFamily: fonts.boldFamily,
    fontWeight: fonts.boldWeight,
    fontVariant: 'tabular-nums',
  },
  ink: (color: string) => ({ color }),
  regular: { fontSize: dimensions.fontSizeSm },
  summary: { fontSize: dimensions.fontSizeSm },
  compact: { fontSize: dimensions.fontSizeXs },
  support: { fontSize: dimensions.fontSizeXs },
});

// The shipping numbered-step badge: the brand tinted into the surface behind a brand-tinted digit,
// on a round disc or, for the paint-blob variant, one of the three blob shapes. Its list owns the
// order, so the badge itself is hidden from assistive technology as the shipping one is.
export function RsdStepNumber({
  number,
  size,
  shape,
  hue,
}: {
  number: number;
  size: StepNumberSize;
  shape: 'disc' | 'blob';
  hue?: PaletteLabel;
}) {
  const theme = useDrawingTheme();
  const mix = stepNumberMix[useDrawingAppearance()];
  const accent = hue ? paletteHex(hue) : DRAWING_BRAND;
  const wash = mixSrgb(accent, mix.washPercent, theme.surface);
  const ink = mixSrgb(
    accent,
    mix.inkPercent * (size === 'support' ? SUPPORT_INK_FRACTION : 1),
    theme.textStrong
  );
  const box = STEP_NUMBER_SIZE_PX[size];
  return (
    <html.div
      aria-hidden
      style={[styles.badge(box), shape === 'disc' && [styles.disc, styles.wash(wash)]]}
    >
      {shape === 'blob' ? (
        <html.div style={styles.blob}>
          <SvgXml
            xml={blobXml({ shape: BLOB_CYCLE[number % BLOB_CYCLE.length], size: box, fill: wash })}
            width={box}
            height={box}
          />
        </html.div>
      ) : null}
      <html.span style={[styles.digit, styles.ink(ink), styles[size]]}>{number}</html.span>
    </html.div>
  );
}
