import { Fragment, type ReactNode } from 'react';
import { Animated } from '../platform/animated';
import { css, html } from 'react-strict-dom';
import { useDrawingTheme } from '../drawing/DrawingAppearance';
import { DRAWING_SCALE } from '../drawing/theme';
import {
  INSTALL_BANNER_PARTS,
  iosBannerStepParts,
  type InstallTextPart,
} from '../install/installCopy';
import type { InstallBanner } from '../install/useInstallBanner';
import { useShareButtonLocation } from '../install/shareLocation';
import { styles as controlStyles } from './controls';
import type { NativeIconName } from './icons.generated';
import { INSTALL_BANNER_MOTION, useFade } from './installBannerMotion';
import { RsdIcon } from './RsdIcon';
import { RsdSplotchyIcon } from './RsdSplotchyIcon';
import { RsdStepNumber } from './RsdStepNumber';
import { RsdVisuallyHidden } from './RsdVisuallyHidden';
import { colors, dimensions } from './tokens.css';

// InstallBanner.svelte's literals for the hint and the parting message, local for the StyleX web
// compile; tools/tests/native-install-banner-drift.test.mjs reads each back from shipping.
const MASCOT_PX = 40;
const TEXT_LINE_HEIGHT = 1.5;

export const INSTALL_TEXT_METRICS = {
  mascotPx: MASCOT_PX,
  textLineHeight: TEXT_LINE_HEIGHT,
} as const;
export const INSTALL_HINT_ID = 'install-hint';

// The hand-off to Settings: Splotchy beside the message, fading in over the card's place.
export function RsdInstallParting() {
  const { opacity } = useFade(true, INSTALL_BANNER_MOTION.partingFadeMs);
  return (
    <Animated.View style={{ opacity }}>
      <html.div style={styles.parting}>
        <html.div aria-hidden style={styles.mascot}>
          <RsdSplotchyIcon size={MASCOT_PX} />
        </html.div>
        <html.p style={[styles.prose, styles.partingText]}>
          <InstallText parts={INSTALL_BANNER_PARTS.parting} />
        </html.p>
      </html.div>
    </Animated.View>
  );
}

// The manual steps the How? button discloses: Safari's numbered steps or the Android menu path.
export function RsdInstallHint({ shown, mode }: { shown: boolean; mode: InstallBanner['mode'] }) {
  const shareLocation = useShareButtonLocation();
  const { mounted, opacity } = useFade(shown, INSTALL_BANNER_MOTION.hintFadeMs);
  if (!mounted) return null;
  return (
    <Animated.View style={{ opacity }}>
      <html.div id={INSTALL_HINT_ID} style={[styles.prose, styles.hint]}>
        {mode === 'ios' ? (
          <html.ol role="list" style={styles.steps}>
            {iosBannerStepParts(shareLocation).map((parts, index) => (
              <html.li key={index} style={styles.step}>
                <RsdStepNumber number={index + 1} size="compact" shape="disc" />
                <html.span style={styles.stepText}>
                  <InstallText parts={parts} />
                </html.span>
              </html.li>
            ))}
          </html.ol>
        ) : (
          <html.p style={styles.flush}>
            <InstallText parts={INSTALL_BANNER_PARTS.androidHint} />
          </html.p>
        )}
      </html.div>
    </Animated.View>
  );
}

function TextPart({ part, termInk }: { part: InstallTextPart; termInk: string }): ReactNode {
  if (part.kind === 'text') return part.text;
  if (part.kind === 'strong')
    return <html.strong style={controlStyles.boldText}>{part.text}</html.strong>;
  if (part.kind === 'icon') return <InlineIcon name={part.icon} ink={undefined} />;
  return (
    <html.span style={[controlStyles.boldText, styles.term]}>
      <InlineIcon name={part.icon} ink={part.textInk ? termInk : undefined} />
      {part.spoken ? <RsdVisuallyHidden>{part.spoken}</RsdVisuallyHidden> : null}
      {part.text}
    </html.span>
  );
}

// A banner sentence in the hint's text size: its inline icons are one em, as shipping's are.
function InstallText({ parts }: { parts: readonly InstallTextPart[] }) {
  const termInk = useDrawingTheme().textStrong;
  return parts.map((part, index) => (
    <Fragment key={index}>
      <TextPart part={part} termInk={termInk} />
    </Fragment>
  ));
}

function InlineIcon({ name, ink }: { name: NativeIconName; ink: string | undefined }) {
  return (
    <html.span aria-hidden style={styles.inlineIcon}>
      <RsdIcon name={name} size={DRAWING_SCALE.fontSizeSm} ink={ink} muted={false} />
    </html.span>
  );
}

const styles = css.create({
  parting: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: dimensions.space3,
  },
  mascot: { flexShrink: 0, width: MASCOT_PX, height: MASCOT_PX },
  prose: { fontSize: dimensions.fontSizeSm, lineHeight: TEXT_LINE_HEIGHT },
  partingText: { flexShrink: 1, margin: 0, color: colors.textSoft, textAlign: 'left' },
  hint: {
    marginTop: dimensions.space3,
    paddingTop: dimensions.space3,
    borderTopWidth: dimensions.borderWidth,
    borderTopStyle: 'solid',
    borderTopColor: colors.borderWarm,
    color: colors.textSoft,
  },
  flush: { margin: 0 },
  steps: {
    display: 'flex',
    flexDirection: 'column',
    gap: dimensions.space2,
    margin: 0,
    padding: 0,
    listStyle: 'none',
    color: colors.text,
  },
  step: { display: 'flex', flexDirection: 'row', gap: dimensions.space3, alignItems: 'flex-start' },
  stepText: { flexShrink: 1 },
  term: { whiteSpace: 'nowrap', color: colors.textStrong },
  inlineIcon: { display: 'inline-flex', verticalAlign: '-0.125em' },
});
