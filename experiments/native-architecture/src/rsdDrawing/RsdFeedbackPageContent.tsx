import { Platform } from 'react-native';
import { useWindowDimensions } from '../platform/windowDimensions';
import { css, html } from 'react-strict-dom';
import { APP_PAGE_PATHS } from '../information/appPages';
import type { NativeFeedbackOwner } from '../feedback/feedback';
import { useNativeFeedbackState } from '../feedback/useNativeFeedback';
import { FEEDBACK_PAGE_COPY } from '../information/feedbackPageCopy';
import { RsdFeedbackSection } from './RsdFeedbackSection';
import { RsdPageAnchor } from './RsdPageAnchor';
import { RsdStatusMessage } from './RsdStatusMessage';
import { RsdStepNumber } from './RsdStepNumber';
import { styles as controls } from './controls';
import { colors, dimensions, fonts } from './tokens.css';

const RAIL_MIN_WIDTH_PX = 1024;
const FORM_BASIS_PX = 380;
const FORM_MEASURE_PX = 560;
const RAIL_BASIS_PX = 250;
const RAIL_PADDING_PX = { block: 14, inline: 18 };
const STEP_GAP_PX = 10;
const RAIL_RULE_WIDTH_PX = 3;
const HEADING_LINE_HEIGHT = 1.3;
const STEP_LINE_HEIGHT = 1.55;
const STEP_HUES = ['Yellow', 'Blue', 'Green'] as const;
const styles = css.create({
  layout: {
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: dimensions.space8,
  },
  form: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: FORM_BASIS_PX,
    maxWidth: FORM_MEASURE_PX,
    minWidth: 0,
  },
  stackedForm: { maxWidth: '100%' },
  aside: {
    flexGrow: 0,
    flexShrink: 1,
    flexBasis: RAIL_BASIS_PX,
    minWidth: 0,
    paddingBlock: RAIL_PADDING_PX.block,
    paddingInline: RAIL_PADDING_PX.inline,
    borderLeftWidth: RAIL_RULE_WIDTH_PX,
    borderLeftStyle: 'solid',
    borderLeftColor: colors.brandSolid,
    borderRadius: dimensions.radiusMd,
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
    backgroundColor: colors.brandWash,
  },
  stackedAside: { flexGrow: 1, flexBasis: '100%' },
  heading: {
    margin: 0,
    marginBottom: STEP_GAP_PX,
    fontSize: dimensions.fontSizeMd,
    lineHeight: HEADING_LINE_HEIGHT,
    color: colors.textStrong,
  },
  steps: {
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: STEP_GAP_PX,
    listStyle: 'none',
  },
  step: { display: 'flex', flexDirection: 'row', alignItems: 'flex-start', gap: dimensions.space3 },
  text: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: dimensions.fontSizeSm,
    fontFamily: fonts.mediumFamily,
    fontWeight: fonts.mediumWeight,
    lineHeight: STEP_LINE_HEIGHT,
    color: colors.text,
  },
  done: { display: 'flex', flexDirection: 'column', gap: dimensions.space6 },
  link: {
    color: colors.brandText,
    textDecorationLine: 'underline',
    fontFamily: fonts.semiboldFamily,
    fontWeight: fonts.semiboldWeight,
  },
});

export function RsdFeedbackPageContent({
  owner,
  onPrivacy,
}: {
  owner: NativeFeedbackOwner | null;
  onPrivacy: () => void;
}) {
  const sent = useNativeFeedbackState(owner)?.delivery.status === 'success';
  const stacked = useWindowDimensions().width <= RAIL_MIN_WIDTH_PX;
  return (
    <html.div style={styles.layout}>
      <html.div style={[styles.form, stacked && styles.stackedForm]}>
        {sent ? (
          <html.div style={styles.done}>
            <RsdStatusMessage status="success">{FEEDBACK_PAGE_COPY.sentStatus}</RsdStatusMessage>
            <html.span
              role="link"
              tabIndex={0}
              style={styles.link}
              onClick={owner?.reset}
              onKeyDown={(event) => {
                if (event.key === 'Enter') owner?.reset();
              }}
            >
              {FEEDBACK_PAGE_COPY.sendAnother}
            </html.span>
          </html.div>
        ) : (
          <RsdFeedbackSection owner={owner} presentation="page" />
        )}
      </html.div>
      <html.aside style={[styles.aside, stacked && styles.stackedAside]}>
        <html.h2 style={[controls.boldText, styles.heading]}>{FEEDBACK_PAGE_COPY.next}</html.h2>
        <html.ol role="list" style={styles.steps}>
          {FEEDBACK_PAGE_COPY.steps.map((step, index) => (
            <html.li key={step} style={styles.step}>
              <RsdStepNumber
                number={index + 1}
                size="support"
                shape="blob"
                hue={STEP_HUES[index]}
              />
              <html.span style={styles.text}>
                {step}
                {index === 2 ? (
                  <>
                    {Platform.OS === 'web' ? (
                      <RsdPageAnchor
                        href={APP_PAGE_PATHS.privacy}
                        onFollow={onPrivacy}
                        style={styles.link}
                      >
                        {FEEDBACK_PAGE_COPY.privacy}
                      </RsdPageAnchor>
                    ) : (
                      <html.span
                        role="link"
                        tabIndex={0}
                        onClick={onPrivacy}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') onPrivacy();
                        }}
                        style={styles.link}
                      >
                        {FEEDBACK_PAGE_COPY.privacy}
                      </html.span>
                    )}
                    .
                  </>
                ) : null}
              </html.span>
            </html.li>
          ))}
        </html.ol>
      </html.aside>
    </html.div>
  );
}
