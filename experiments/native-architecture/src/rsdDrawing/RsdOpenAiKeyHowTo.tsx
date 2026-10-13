import type { ReactNode } from 'react';
import { css, html } from 'react-strict-dom';
import { useDrawingTheme } from '../drawing/DrawingAppearance';
import { OPENAI_KEY_HOWTO_COPY as COPY } from '../settings/aiSettingsCopy';
import { styles as controlStyles } from './controls';
import { RsdDisclosure } from './RsdDisclosure';
import { RsdExternalMark } from './RsdExternalMark';
import { RsdTextLink } from './RsdTextLink';
import { colors, dimensions } from './tokens.css';

// OpenAiKeyHowTo.svelte's literals, local for the StyleX web compile; native-ai-settings.test.mjs
// reads each back from that source.
const HOWTO_BOTTOM_PX = 14;
const SUMMARY_PADDING_PX = { block: 10, inline: 12 } as const;
const LIST_PADDING_PX = { inline: 16, bottom: 8, start: 32 } as const;
const LIST_LINE_HEIGHT = 1.7;
const CODE_PADDING_PX = { block: 1, inline: 5 } as const;
const NOTE_PADDING_PX = { inline: 12, bottom: 12 } as const;
// The list's numbers sit in its start padding, a few pixels clear of each step, as the browser
// draws an outside list marker.
const MARKER_GAP_PX = 6;

const styles = css.create({
  howto: { marginBottom: HOWTO_BOTTOM_PX, backgroundColor: colors.surface },
  summary: {
    paddingBlock: SUMMARY_PADDING_PX.block,
    paddingInline: SUMMARY_PADDING_PX.inline,
  },
  summaryText: { color: colors.brandText, fontSize: dimensions.fontSizeSm },
  mark: { fontSize: dimensions.fontSizeSm },
  list: {
    display: 'flex',
    flexDirection: 'column',
    margin: 0,
    paddingTop: 0,
    paddingRight: LIST_PADDING_PX.inline,
    paddingBottom: LIST_PADDING_PX.bottom,
    paddingLeft: 0,
    listStyle: 'none',
  },
  step: { display: 'flex', flexDirection: 'row', alignItems: 'flex-start' },
  marker: {
    flexShrink: 0,
    width: LIST_PADDING_PX.start - MARKER_GAP_PX,
    paddingRight: MARKER_GAP_PX,
    boxSizing: 'content-box',
    textAlign: 'right',
  },
  text: {
    flexShrink: 1,
    color: colors.textSoft,
    fontSize: dimensions.fontSizeSm,
    lineHeight: LIST_LINE_HEIGHT,
  },
  wrap: { display: 'flex', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  link: { color: colors.brandText, textDecorationLine: 'underline' },
  code: {
    paddingBlock: CODE_PADDING_PX.block,
    paddingInline: CODE_PADDING_PX.inline,
    borderRadius: dimensions.radiusSm,
    backgroundColor: colors.brandWash,
    fontSize: dimensions.fontSizeXs,
  },
  note: {
    margin: 0,
    paddingTop: 0,
    paddingRight: NOTE_PADDING_PX.inline,
    paddingBottom: NOTE_PADDING_PX.bottom,
    paddingLeft: NOTE_PADDING_PX.inline,
    color: colors.textSoft,
    fontSize: dimensions.fontSizeXs,
  },
});

function Step({ number, children }: { number: number; children: ReactNode }) {
  return (
    <html.li style={styles.step}>
      <html.span aria-hidden style={[styles.text, styles.marker]}>
        {`${number}.`}
      </html.span>
      {children}
    </html.li>
  );
}

function Strong({ children }: { children: string }) {
  return <html.strong style={controlStyles.semiboldText}>{children}</html.strong>;
}

// The shipping "How do I get an OpenAI API key?" disclosure: four steps to a key, the one about
// organization verification first, and the billing note. The keys page opens outside the app, so
// the caller holds it behind the external-links check.
export function RsdOpenAiKeyHowTo({ onOpenKeysPage }: { onOpenKeysPage: () => void }) {
  const theme = useDrawingTheme();
  return (
    <RsdDisclosure
      summary={
        <html.span style={[controlStyles.semiboldText, styles.summaryText]}>
          {COPY.summary}
        </html.span>
      }
      style={styles.howto}
      summaryStyle={styles.summary}
      markStyle={styles.mark}
    >
      <html.div>
        <html.ol style={styles.list}>
          <Step number={1}>
            <html.div style={styles.wrap}>
              <html.span style={styles.text}>{`${COPY.openLead.trimEnd()}\u00a0`}</html.span>
              <RsdTextLink onPress={onOpenKeysPage}>
                <html.span style={[controlStyles.semiboldText, styles.text, styles.link]}>
                  {COPY.openLink}
                </html.span>
                <RsdExternalMark variant="inline" ink={theme.brandText} />
              </RsdTextLink>
              <html.span style={styles.text}>.</html.span>
            </html.div>
          </Step>
          <Step number={2}>
            <html.span style={styles.text}>{COPY.signIn}</html.span>
          </Step>
          <Step number={3}>
            <html.span style={styles.text}>
              {COPY.verifyLead}
              <Strong>{COPY.verifyPlace}</Strong>
              {COPY.verifyMid}
              <Strong>{COPY.verifyStrong}</Strong>
              {COPY.verifyRest}
              <html.em>{COPY.verifyBefore}</html.em>
              {COPY.verifyTail}
            </html.span>
          </Step>
          <Step number={4}>
            <html.span style={styles.text}>
              {COPY.createLead}
              <Strong>{COPY.createStrong}</Strong>
              {COPY.createMid}
              <html.code style={styles.code}>{COPY.createCode}</html.code>
              {COPY.createTail}
            </html.span>
          </Step>
        </html.ol>
        <html.p style={styles.note}>{COPY.note}</html.p>
      </html.div>
    </RsdDisclosure>
  );
}
