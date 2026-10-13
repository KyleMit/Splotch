import { css, html } from 'react-strict-dom';
import { useDrawingTheme } from '../drawing/DrawingAppearance';
import { FEEDBACK_APP_VERSION } from '../feedback/feedbackCopy';
import type { HostedPage } from '../settings/hostedPages';
import { RsdExternalMark } from './RsdExternalMark';
import { RsdIcon } from './RsdIcon';
import { RsdSplotchyIcon } from './RsdSplotchyIcon';
import { RsdTextLink } from './RsdTextLink';
import { colors, dimensions, fonts } from './tokens.css';

// AboutSection.svelte's literals, local for the StyleX web compile;
// native-settings-info-drift.test.mjs reads each back from that source.
const MARK_PX = 96;
const BRAND_GAP_PX = 12;
const BRAND_BOTTOM_PX = 24;
const TAGLINE_MAX_WIDTH_PX = 320;
const TAGLINE_LINE_HEIGHT = 1.5;
const LINKS_TOP_PX = 20;
const LINE_GAP_PX = 8;
const GITHUB_GAP_PX = 6;
const GITHUB_BLOCK_PX = 12;
const GITHUB_ICON_PX = 20;

export const ABOUT_COPY = {
  mascot: 'Splotch',
  tagline: 'A joyful, kid-friendly drawing app',
  privacy: 'Privacy Policy',
  github: 'View on GitHub',
  version: 'Version',
} as const;

const styles = css.create({
  brand: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: BRAND_GAP_PX,
    marginBottom: BRAND_BOTTOM_PX,
  },
  mark: { width: MARK_PX, height: MARK_PX },
  tagline: {
    margin: 0,
    maxWidth: TAGLINE_MAX_WIDTH_PX,
    fontSize: dimensions.fontSizeSm,
    color: colors.textSoft,
    lineHeight: TAGLINE_LINE_HEIGHT,
    textAlign: 'center',
  },
  links: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    paddingTop: LINKS_TOP_PX,
    borderTopWidth: dimensions.borderWidth,
    borderTopStyle: 'solid',
    borderTopColor: colors.border,
  },
  line: { marginBottom: LINE_GAP_PX },
  privacy: { color: colors.brandText, fontSize: dimensions.fontSizeSm },
  medium: { fontFamily: fonts.mediumFamily, fontWeight: fonts.mediumWeight },
  github: {
    gap: GITHUB_GAP_PX,
    marginTop: GITHUB_BLOCK_PX - LINE_GAP_PX,
    marginBottom: GITHUB_BLOCK_PX,
    color: colors.textSoft,
    fontSize: dimensions.fontSizeSm,
  },
  icon: { display: 'flex' },
  version: { margin: 0, fontSize: dimensions.fontSizeXs, color: colors.textSoft },
});

// The shipping About section (AboutSection.svelte): Splotchy and the tagline over a rule, then the
// Privacy Policy and GitHub links and the version. Both links open outside the app, so both carry
// the external mark and open through `onOpen`, which holds them behind the external-links check.
export function RsdAboutSection({ onOpen }: { onOpen: (page: HostedPage) => void }) {
  const theme = useDrawingTheme();
  return (
    <html.section>
      <html.div style={styles.brand}>
        <html.div role="img" aria-label={ABOUT_COPY.mascot} style={styles.mark}>
          <RsdSplotchyIcon size={MARK_PX} />
        </html.div>
        <html.p style={styles.tagline}>{ABOUT_COPY.tagline}</html.p>
      </html.div>
      <html.div style={styles.links}>
        <html.div style={styles.line}>
          <RsdTextLink onPress={() => onOpen('privacy')} style={styles.privacy}>
            <html.span style={styles.medium}>{ABOUT_COPY.privacy}</html.span>
            <RsdExternalMark variant="inline" ink={theme.brandText} />
          </RsdTextLink>
        </html.div>
        <RsdTextLink onPress={() => onOpen('github')} style={styles.github}>
          <html.div aria-hidden style={styles.icon}>
            <RsdIcon name="github" size={GITHUB_ICON_PX} ink={undefined} muted />
          </html.div>
          <html.span>{ABOUT_COPY.github}</html.span>
          <RsdExternalMark variant="standalone" />
        </RsdTextLink>
        <html.p style={styles.version}>{`${ABOUT_COPY.version} ${FEEDBACK_APP_VERSION}`}</html.p>
      </html.div>
    </html.section>
  );
}
