import { Image, StyleSheet, useWindowDimensions } from 'react-native';
import { css, html } from 'react-strict-dom';
import { useDrawingAppearance, useDrawingTheme } from '../drawing/DrawingAppearance';
import {
  AI_VALUE_PROP_COPY,
  valuePropClaims,
  type AiValuePropCredential,
} from '../settings/aiSettingsCopy';
import { aiValuePropSource } from '../settings/aiValuePropAssets';
import { styles as controlStyles } from './controls';
import { RsdIcon } from './RsdIcon';
import { brandColors, colors, dimensions } from './tokens.css';

// AiValueProp.svelte's literals, local for the StyleX web compile; native-ai-settings-drift.test.mjs
// reads each back from that source.
const STEP_GAP_PX = 10;
const IMAGE_ASPECT = 278 / 213;
const BADGE_INSET_PX = 6;
const BADGE_PX = 24;
const BADGE_PHONE_PX = 18;
const BODY_LINE_HEIGHT = 1.5;
const CAPTION_LINE_HEIGHT = 1.25;
const CLAIM_LINE_HEIGHT = 1.45;
const CLAIM_ICON_COLUMN_PX = 16;
const CLAIM_ICON_PX = 14;
const CLAIM_ICON_TOP_PX = 3;
// AiValueProp.svelte's (max-width: 480px): a phone's steps tighten and their badges shrink.
const PHONE_MAX_WIDTH_PX = 480;

const styles = css.create({
  card: {
    display: 'flex',
    flexDirection: 'column',
    padding: dimensions.space4,
    borderWidth: dimensions.borderWidth,
    borderStyle: 'solid',
    borderColor: colors.border,
    borderRadius: dimensions.radiusMd,
    backgroundColor: colors.surface,
  },
  title: {
    marginTop: 0,
    marginRight: 0,
    marginBottom: dimensions.space2,
    marginLeft: 0,
    color: colors.textStrong,
    fontSize: dimensions.fontSizeLg,
  },
  body: {
    margin: 0,
    color: colors.text,
    fontSize: dimensions.fontSizeSm,
    lineHeight: BODY_LINE_HEIGHT,
  },
  steps: {
    display: 'flex',
    flexDirection: 'row',
    gap: STEP_GAP_PX,
    marginBlock: dimensions.space4,
    padding: 0,
    listStyle: 'none',
  },
  phoneSteps: { gap: dimensions.space2 },
  step: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
  },
  frame: {
    position: 'relative',
    overflow: 'hidden',
    aspectRatio: IMAGE_ASPECT,
    borderWidth: dimensions.borderWidth,
    borderStyle: 'solid',
    borderColor: colors.border,
    borderRadius: dimensions.radiusSm,
    backgroundColor: colors.paper,
  },
  badge: {
    position: 'absolute',
    top: BADGE_INSET_PX,
    left: BADGE_INSET_PX,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: BADGE_PX,
    height: BADGE_PX,
    borderRadius: dimensions.radiusPill,
    backgroundColor: colors.brandSolid,
  },
  phoneBadge: {
    top: dimensions.space1,
    left: dimensions.space1,
    width: BADGE_PHONE_PX,
    height: BADGE_PHONE_PX,
  },
  badgeText: { color: brandColors.onBrand, fontSize: dimensions.fontSizeXs, lineHeight: 1 },
  caption: {
    marginTop: dimensions.space1,
    color: colors.textSoft,
    fontSize: dimensions.fontSizeSm,
    lineHeight: CAPTION_LINE_HEIGHT,
    textAlign: 'center',
  },
  phoneCaption: { fontSize: dimensions.fontSizeXs },
  claims: {
    display: 'flex',
    flexDirection: 'column',
    gap: dimensions.space2,
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  claim: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: dimensions.space2,
  },
  claimIcon: { width: CLAIM_ICON_COLUMN_PX, paddingTop: CLAIM_ICON_TOP_PX },
  claimText: {
    flexShrink: 1,
    color: colors.text,
    fontSize: dimensions.fontSizeSm,
    lineHeight: CLAIM_LINE_HEIGHT,
  },
});

const imageStyles = StyleSheet.create({ fill: { width: '100%', height: '100%' } });

// The shipping AI Art explainer shown while the switch is off (AiValueProp.svelte): what one
// magic tap does, as three illustrated steps, and two reassurances worded for the credential that
// is saved, or the free pictures left.
export function RsdAiValueProp({
  credential,
  freeRemaining,
}: {
  credential: AiValuePropCredential;
  freeRemaining: number;
}) {
  const theme = useDrawingAppearance();
  const ink = useDrawingTheme().successText;
  const phone = useWindowDimensions().width <= PHONE_MAX_WIDTH_PX;
  const [saved, after] = valuePropClaims(credential, freeRemaining);
  return (
    <html.section aria-labelledby="ai-value-prop-title" style={styles.card}>
      <html.h3 id="ai-value-prop-title" style={[controlStyles.boldText, styles.title]}>
        {AI_VALUE_PROP_COPY.title}
      </html.h3>
      <html.p style={styles.body}>{AI_VALUE_PROP_COPY.body}</html.p>
      <html.ol style={[styles.steps, phone && styles.phoneSteps]}>
        {AI_VALUE_PROP_COPY.steps.map((step) => (
          <html.li key={step.number} style={styles.step}>
            <html.div style={styles.frame}>
              <Image
                accessible
                accessibilityRole="image"
                accessibilityLabel={step.alt}
                source={aiValuePropSource(step.number, theme)}
                resizeMode="cover"
                style={imageStyles.fill}
              />
              <html.div aria-hidden style={[styles.badge, phone && styles.phoneBadge]}>
                <html.span style={[controlStyles.boldText, styles.badgeText]}>
                  {String(step.number)}
                </html.span>
              </html.div>
            </html.div>
            <html.span
              style={[controlStyles.semiboldText, styles.caption, phone && styles.phoneCaption]}
            >
              {step.caption}
            </html.span>
          </html.li>
        ))}
      </html.ol>
      <html.ul style={styles.claims}>
        {[
          { icon: 'check' as const, text: saved },
          { icon: 'lock' as const, text: after },
        ].map((claim) => (
          <html.li key={claim.icon} style={styles.claim}>
            <html.div aria-hidden style={styles.claimIcon}>
              <RsdIcon name={claim.icon} size={CLAIM_ICON_PX} ink={ink} muted={false} />
            </html.div>
            <html.span style={styles.claimText}>{claim.text}</html.span>
          </html.li>
        ))}
      </html.ul>
    </html.section>
  );
}
