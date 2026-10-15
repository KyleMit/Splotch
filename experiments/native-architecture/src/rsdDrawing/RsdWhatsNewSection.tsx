import { Fragment } from 'react';
import { css, html } from 'react-strict-dom';
import { useDrawingTheme } from '../drawing/DrawingAppearance';
import type { SettingsLink } from '../settings/hostedPages';
import {
  RELEASE_NOTES,
  WHATS_NEW_COPY,
  releaseSectionIcon,
  type ReleaseBlock,
} from '../settings/whatsNew';
import { styles as controlStyles } from './controls';
import { RsdIcon } from './RsdIcon';
import { RsdList } from './RsdList';
import { RsdTextLink } from './RsdTextLink';
import { colors, dimensions } from './tokens.css';

// WhatsNewSection.svelte's and ReleaseSectionHeading.svelte's literals, local for the StyleX web
// compile; native-settings-info-drift.test.mjs reads each back from those sources.
const CARD_BOTTOM_PX = 16;
const CARD_PADDING_PX = 16;
const DATE_BOTTOM_PX = 10;
const HEADING_TOP_PX = 12;
const HEADING_BOTTOM_PX = 6;
const LIST_INDENT_PX = 20;
const ITEM_GAP_PX = 4;
const ITEM_LINE_HEIGHT = 1.5;
const ALL_RELEASES_TOP_PX = 4;
const CHEVRON_PX = 18;
const CHEVRON_PULL_PX = 4;
const NOTES_FONT_PX = 14;
// ReleaseSectionHeading.svelte sizes its icon to --space-6.
const RELEASE_ICON_PX = 24;

// The shell's heading over the section sets the levels under it: the release date one below, and
// the release's own sections one below the date, as the shipping section files them.
const RELEASE_HEADINGS = {
  2: { date: html.h3, section: html.h4 },
  3: { date: html.h4, section: html.h5 },
} as const;
export type SectionHeadingLevel = keyof typeof RELEASE_HEADINGS;

const styles = css.create({
  card: {
    marginBottom: CARD_BOTTOM_PX,
    padding: CARD_PADDING_PX,
    borderRadius: dimensions.radiusLg,
    backgroundColor: colors.surface2,
  },
  heading: {
    marginTop: 0,
    marginLeft: 0,
    marginRight: 0,
    fontSize: dimensions.fontSizeSm,
    color: colors.textStrong,
  },
  date: { marginBottom: DATE_BOTTOM_PX },
  sectionHeading: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: dimensions.space2,
    marginBottom: HEADING_BOTTOM_PX,
  },
  following: { marginTop: HEADING_TOP_PX },
  flush: { marginBottom: 0 },
  icon: { display: 'flex', flexShrink: 0 },
  notes: { fontSize: NOTES_FONT_PX, color: colors.text, lineHeight: ITEM_LINE_HEIGHT },
  paragraph: { margin: 0 },
  allReleases: {
    display: 'flex',
    flexDirection: 'row',
    marginTop: ALL_RELEASES_TOP_PX,
  },
  allReleasesLink: { color: colors.brandText, fontSize: dimensions.fontSizeSm },
  chevron: { display: 'flex', marginRight: -CHEVRON_PULL_PX },
});

// Consecutive list items share one list; each paragraph stands alone.
export function releaseBlockRuns(blocks: readonly ReleaseBlock[]) {
  const runs: { kind: ReleaseBlock['kind']; texts: string[] }[] = [];
  for (const { kind, text } of blocks) {
    const last = runs.at(-1);
    if (kind === 'item' && last?.kind === 'item') last.texts.push(text);
    else runs.push({ kind, texts: [text] });
  }
  return runs;
}

function RsdReleaseBlocks({
  blocks,
  fontSizePx = NOTES_FONT_PX,
  lineHeight = ITEM_LINE_HEIGHT,
}: {
  blocks: readonly ReleaseBlock[];
  fontSizePx?: number;
  lineHeight?: number;
}) {
  const theme = useDrawingTheme();
  return releaseBlockRuns(blocks).map((run, index) =>
    run.kind === 'item' ? (
      <RsdList
        key={index}
        ordered={false}
        fontSizePx={fontSizePx}
        lineHeightPx={fontSizePx * lineHeight}
        indentPx={LIST_INDENT_PX}
        gapPx={ITEM_GAP_PX}
        markerColor={theme.text}
        items={run.texts}
      />
    ) : (
      <html.p key={index} style={styles.paragraph}>
        {run.texts[0]}
      </html.p>
    )
  );
}

// The shipping What's New section (WhatsNewSection.svelte): the current release's notes on a raised
// card under its date, each section headed by its New, Improved or Fixed icon, then a link to every
// release, which opens the in-app changelog through `onOpen`.
export function RsdWhatsNewSection({
  sectionHeadingLevel,
  onOpen,
}: {
  sectionHeadingLevel: SectionHeadingLevel;
  onOpen: (page: SettingsLink) => void;
}) {
  const theme = useDrawingTheme();
  const [current] = RELEASE_NOTES;
  const { date: DateHeading, section: SectionHeading } = RELEASE_HEADINGS[sectionHeadingLevel];
  return (
    <html.section>
      {current ? (
        <html.div style={styles.card}>
          <DateHeading style={[controlStyles.boldText, styles.heading, styles.date]}>
            {current.dateLabel}
          </DateHeading>
          <html.div style={styles.notes}>
            {current.sections.map((section, index) => {
              const icon = releaseSectionIcon(section.title);
              return (
                <Fragment key={section.title}>
                  <html.div
                    data-section={section.title}
                    style={[styles.sectionHeading, index > 0 && styles.following]}
                  >
                    {icon ? (
                      <html.div aria-hidden style={styles.icon}>
                        <RsdIcon
                          name={icon}
                          size={RELEASE_ICON_PX}
                          ink={theme.brandText}
                          muted={false}
                        />
                      </html.div>
                    ) : null}
                    <SectionHeading style={[controlStyles.boldText, styles.heading, styles.flush]}>
                      {section.title}
                    </SectionHeading>
                  </html.div>
                  <RsdReleaseBlocks blocks={section.blocks} />
                </Fragment>
              );
            })}
          </html.div>
        </html.div>
      ) : null}
      <html.div style={styles.allReleases}>
        <RsdTextLink onPress={() => onOpen('changelog')} style={styles.allReleasesLink}>
          <html.span style={controlStyles.semiboldText}>{WHATS_NEW_COPY.allReleases}</html.span>
          <html.div aria-hidden style={styles.chevron}>
            <RsdIcon name="chevron-right" size={CHEVRON_PX} ink={theme.brandText} muted={false} />
          </html.div>
        </RsdTextLink>
      </html.div>
    </html.section>
  );
}
