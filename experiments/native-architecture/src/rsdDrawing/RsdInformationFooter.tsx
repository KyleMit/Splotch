import { Platform } from 'react-native';
import { css, html } from 'react-strict-dom';
import { FEEDBACK_URL } from '../../../../web/src/lib/siteUrl';
import type { AppPage } from '../information/appPages';
import { openAppPage } from '../platform/appPath';
import { RELEASE_NOTES } from '../settings/whatsNew';
import { RsdTextLink } from './RsdTextLink';
import { RsdSplotchyIcon } from './RsdSplotchyIcon';
import { RsdExternalMark } from './RsdExternalMark';
import { styles as controlStyles } from './controls';
import { colors, dimensions } from './tokens.css';

const FOOTER_MARK_PX = 24;
const FOOTER_MIN_TARGET_PX = 44;
const styles = css.create({
  footer: {
    display: 'flex',
    flexDirection: 'column',
    gap: dimensions.space4,
    marginTop: dimensions.space8,
    paddingTop: dimensions.space4,
    borderTopWidth: dimensions.borderWidth,
    borderTopStyle: 'solid',
    borderTopColor: colors.border,
  },
  row: {
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: dimensions.space4,
  },
  brand: {
    gap: dimensions.space2,
    minHeight: FOOTER_MIN_TARGET_PX,
    fontSize: dimensions.fontSizeXs,
    color: colors.textStrong,
  },
  nav: { display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: dimensions.space4 },
  link: {
    minHeight: FOOTER_MIN_TARGET_PX,
    fontSize: dimensions.fontSizeSm,
    color: colors.brandText,
  },
  version: { margin: 0, fontSize: dimensions.fontSizeXs, color: colors.textSoft },
});
const LINKS = [
  { page: 'privacy', label: 'Privacy' },
  { page: 'changelog', label: 'Changelog' },
  { page: 'feedback', label: 'Send feedback' },
] as const;

export function RsdInformationFooter({
  page,
  onExternal,
}: {
  page: Exclude<AppPage, 'drawing'>;
  onExternal: (href: string) => void;
}) {
  const latest = RELEASE_NOTES[0];
  return (
    <html.footer style={styles.footer}>
      <html.div style={styles.row}>
        <RsdTextLink onPress={() => openAppPage('drawing')} style={styles.brand}>
          <RsdSplotchyIcon size={FOOTER_MARK_PX} />
          <html.span style={controlStyles.boldText}>Splotch</html.span>
        </RsdTextLink>
        <html.nav aria-label="Splotch pages" style={styles.nav}>
          {LINKS.map((link) => {
            const external = link.page === 'feedback' && Platform.OS !== 'web';
            return link.page === page && !external ? (
              <html.span
                key={link.page}
                aria-current="page"
                style={[styles.link, controlStyles.boldText]}
              >
                {link.label}
              </html.span>
            ) : (
              <RsdTextLink
                key={link.page}
                onPress={() => (external ? onExternal(FEEDBACK_URL) : openAppPage(link.page))}
                style={styles.link}
              >
                <html.span>{link.label}</html.span>
                {external ? <RsdExternalMark variant="inline" /> : null}
              </RsdTextLink>
            );
          })}
        </html.nav>
      </html.div>
      <html.p
        style={styles.version}
      >{`Splotch ${latest.version} · released ${latest.dateLabel}`}</html.p>
    </html.footer>
  );
}
