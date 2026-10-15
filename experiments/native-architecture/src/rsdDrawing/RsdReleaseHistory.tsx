import { Fragment } from 'react';
import { css, html } from 'react-strict-dom';
import { RELEASE_NOTES } from '../settings/whatsNew';
import { RsdReleaseBlocks } from './RsdWhatsNewSection';
import { styles as controlStyles } from './controls';
import { colors, dimensions } from './tokens.css';

const PAGE_LINE_HEIGHT = 1.6;
const PAGE_FONT_PX = 16;
const styles = css.create({
  section: { marginTop: dimensions.space6 },
  heading: {
    marginTop: 0,
    marginBottom: dimensions.space2,
    color: colors.textStrong,
    fontSize: dimensions.fontSizeLg,
  },
  paragraph: {
    marginTop: 0,
    marginBottom: dimensions.space3,
    fontSize: dimensions.fontSizeMd,
    color: colors.text,
    lineHeight: PAGE_LINE_HEIGHT,
  },
  muted: { color: colors.textSoft },
  version: { margin: 0, fontSize: dimensions.fontSizeXs, color: colors.textSoft },
});
export function RsdReleaseHistory() {
  return RELEASE_NOTES.map((release) => (
    <html.section key={release.version} style={styles.section}>
      <html.h2
        style={[controlStyles.boldText, styles.heading]}
      >{`Version ${release.version}`}</html.h2>
      <html.p style={[styles.paragraph, styles.muted]}>{release.dateLabel}</html.p>
      {release.sections.map((section) => (
        <Fragment key={section.title}>
          <html.h3 style={[controlStyles.boldText, styles.heading]}>{section.title}</html.h3>
          <html.div style={styles.paragraph}>
            <RsdReleaseBlocks
              blocks={section.blocks}
              fontSizePx={PAGE_FONT_PX}
              lineHeight={PAGE_LINE_HEIGHT}
            />
          </html.div>
        </Fragment>
      ))}
    </html.section>
  ));
}

export function RsdLatestReleaseLabel() {
  const latest = RELEASE_NOTES[0];
  return (
    <html.p style={styles.version}>
      {`Splotch ${latest.version} · released ${latest.dateLabel}`}
    </html.p>
  );
}
