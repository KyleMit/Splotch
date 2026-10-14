import { css, html } from 'react-strict-dom';
import { SvgXml } from '../platform/svg';
import { dimensions, fonts, stepNumberMix } from './tokens.css';
import { DRAWING_BRAND } from '../drawing/theme';
import { useDrawingAppearance, useDrawingTheme } from '../drawing/DrawingAppearance';
import { blobXml, type BlobShape } from './blob';
import { mixSrgb } from './colorMix';

// app.css .step-number's default --step-number-size, the Install Banner's compact override and the
// Settings install guide's summary badge (SetupInstructions.svelte .section-number).
// Exported for native-design-primitives-drift.test.mjs, which reads both from shipping.
export const STEP_NUMBER_SIZE_PX = { regular: 32, summary: 26, compact: 20 } as const;
export type StepNumberSize = keyof typeof STEP_NUMBER_SIZE_PX;

// app.css cycles the three blobs down a list, :nth-child(3n + 1) through (3n), so neighbors differ.
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
});

// The shipping numbered-step badge: the brand tinted into the surface behind a brand-tinted digit,
// on a round disc or, for the paint-blob variant, one of the three blob shapes. Its list owns the
// order, so the badge itself is hidden from assistive technology as the shipping one is.
export function RsdStepNumber({
  number,
  size,
  shape,
}: {
  number: number;
  size: StepNumberSize;
  shape: 'disc' | 'blob';
}) {
  const theme = useDrawingTheme();
  const mix = stepNumberMix[useDrawingAppearance()];
  const wash = mixSrgb(DRAWING_BRAND, mix.washPercent, theme.surface);
  const ink = mixSrgb(DRAWING_BRAND, mix.inkPercent, theme.textStrong);
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
