import { Animated } from '../platform/animated';
import { css, html } from 'react-strict-dom';
import { DRAWING_SCALE } from '../drawing/theme';
import { INSTALL_BANNER_PARTS, iosBannerStepParts } from '../install/installCopy';
import type { InstallBanner } from '../install/useInstallBanner';
import { useShareButtonLocation } from '../install/shareLocation';
import { INSTALL_BANNER_MOTION, useFade } from './installBannerMotion';
import { RsdSplotchyIcon } from './RsdSplotchyIcon';
import { RsdStepNumber } from './RsdStepNumber';
import { InstallText } from './RsdInstallParts';
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
          <InstallText parts={INSTALL_BANNER_PARTS.parting} iconPx={DRAWING_SCALE.fontSizeSm} />
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
                  <InstallText parts={parts} iconPx={DRAWING_SCALE.fontSizeSm} />
                </html.span>
              </html.li>
            ))}
          </html.ol>
        ) : (
          <html.p style={styles.flush}>
            <InstallText
              parts={INSTALL_BANNER_PARTS.androidHint}
              iconPx={DRAWING_SCALE.fontSizeSm}
            />
          </html.p>
        )}
      </html.div>
    </Animated.View>
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
});
