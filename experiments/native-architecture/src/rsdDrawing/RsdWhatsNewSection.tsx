import { css, html } from 'react-strict-dom';
import { colors, dimensions } from './tokens.css';
import { styles as controlStyles } from './controls';
import { RELEASE_NOTES, type ReleaseBlock } from '../settings/whatsNew';

const styles = css.create({
  release: {
    display: 'flex',
    flexDirection: 'column',
    gap: dimensions.space2,
    padding: dimensions.space4,
    borderRadius: dimensions.radiusMd,
    backgroundColor: colors.surface2,
  },
  date: { color: colors.textStrong, fontSize: dimensions.fontSizeLg },
  heading: { color: colors.textStrong, fontSize: dimensions.fontSizeMd },
  items: {
    display: 'flex',
    flexDirection: 'column',
    gap: dimensions.space2,
    margin: 0,
    paddingLeft: dimensions.space4,
  },
});

// Consecutive list items share one list; each paragraph stands alone.
function blockRuns(blocks: readonly ReleaseBlock[]) {
  const runs: { kind: ReleaseBlock['kind']; texts: string[] }[] = [];
  for (const { kind, text } of blocks) {
    const last = runs.at(-1);
    if (kind === 'item' && last?.kind === 'item') last.texts.push(text);
    else runs.push({ kind, texts: [text] });
  }
  return runs;
}

// The shipping What's New section reads its notes from the release documents; the web links on
// to /changelog for the rest, which this app has no page for, so every release is listed here
// newest first under its date.
export function RsdWhatsNewSection() {
  return (
    <html.div style={controlStyles.stack}>
      {RELEASE_NOTES.map((release) => (
        <html.div key={release.version} style={styles.release}>
          <html.h2 style={styles.date}>{release.dateLabel}</html.h2>
          <html.span>{`Version ${release.version}`}</html.span>
          {release.sections.map((section, index) => (
            <html.div key={index} style={controlStyles.stack}>
              {section.title ? <html.h3 style={styles.heading}>{section.title}</html.h3> : null}
              {blockRuns(section.blocks).map((run, runIndex) =>
                run.kind === 'item' ? (
                  <html.ul key={runIndex} style={styles.items}>
                    {run.texts.map((text, item) => (
                      <html.li key={item}>{`• ${text}`}</html.li>
                    ))}
                  </html.ul>
                ) : (
                  <html.p key={runIndex}>{run.texts[0]}</html.p>
                )
              )}
            </html.div>
          ))}
        </html.div>
      ))}
    </html.div>
  );
}
