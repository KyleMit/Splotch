import type { ReactNode } from 'react';
import { css, html } from 'react-strict-dom';
import { AI_SAFETY_REFUSAL_MESSAGE } from '../../../../web/src/lib/ai/loadingCopy';
import { AI_ERROR_CARD_COPY, AI_RESULT_COPY, AI_STORAGE_FULL_COPY } from '../ai/aiResultCopy';
import type { NativeAiOwner, AiState } from '../ai/generation';
import type { AiErrorReason } from '../ai/uiState';
import { RsdAiReportStatus, aiReportSettled } from './RsdAiImageReport';
import { RsdButton } from './RsdButton';
import { RsdIcon } from './RsdIcon';
import { DRAWING_ON_BRAND } from '../drawing/theme';
import { colors, dimensions, fonts } from './tokens.css';
import { styles as controlStyles } from './controls';

// AiErrorCard.svelte and AiResultError.svelte literals; native-ai-flow-geometry.test.mjs reads
// them back.
const ERROR_GLYPH_PX = 72;
const ERROR_REFRESH_ICON_PX = 22;
const ERROR_PEN_ICON_PX = 24;
const SAFETY_SECTION_MIN_HEIGHT_PX = 240;
const SAFETY_SECTION_MAX_WIDTH_PX = 380;
const SAFETY_SUB_MAX_WIDTH_PX = 280;
const ERROR_TITLE_LINE_HEIGHT = 1.2;
const ERROR_BODY_LINE_HEIGHT = 1.35;

// The AI Result's error section: a refusal guides the child to draw something else and offers
// grown-ups a report; anything else is the error card.
export function RsdAiResultError({
  owner,
  state,
  reason,
  children,
}: {
  owner: NativeAiOwner;
  state: AiState;
  reason: AiErrorReason;
  // The problem report's outcome, which carries its own space above it, as shipping's
  // .ai-image-report does: the card reserves none while there is no outcome to show.
  children?: ReactNode;
}) {
  if (reason === 'safety') return <SafetyRefusal owner={owner} state={state} />;
  return (
    <RsdAiErrorCard reason={reason} onTryAgain={owner.retry} onKeepDrawing={owner.dismiss}>
      {children}
    </RsdAiErrorCard>
  );
}

function SafetyRefusal({ owner, state }: { owner: NativeAiOwner; state: AiState }) {
  const refusal = state.refusal;
  return (
    <html.div style={styles.safety(SAFETY_SECTION_MAX_WIDTH_PX, SAFETY_SECTION_MIN_HEIGHT_PX)}>
      <html.p style={[controlStyles.semiboldText, styles.safetyLead]}>
        {AI_SAFETY_REFUSAL_MESSAGE}
      </html.p>
      <html.p style={[styles.medium, styles.safetySub(SAFETY_SUB_MAX_WIDTH_PX)]}>
        {AI_RESULT_COPY.safetySub}
      </html.p>
      <html.div style={styles.refusalReport}>
        <html.span style={[controlStyles.semiboldText, styles.grownUps]}>
          {AI_RESULT_COPY.grownUps}
        </html.span>
        {!aiReportSettled(state.report) ? (
          <RsdButton
            size="md"
            disabled={!refusal || state.busy}
            onPress={() => {
              if (refusal) owner.reportRefusal(refusal.id);
            }}
          >
            {AI_RESULT_COPY.reportRefusal}
          </RsdButton>
        ) : null}
        <RsdAiReportStatus owner={owner} report={state.report} />
      </html.div>
    </html.div>
  );
}

// The shipping AiErrorCard: Dottie, what happened, and one big way on. A first failure offers
// Try again; a repeated one sends the child back to drawing. A full device always offers Try again.
function RsdAiErrorCard({
  reason,
  onTryAgain,
  onKeepDrawing,
  children,
}: {
  reason: Exclude<AiErrorReason, 'safety'>;
  onTryAgain: () => void;
  onKeepDrawing: () => void;
  children?: ReactNode;
}) {
  const rest = reason === 'rest';
  const copy = reason === 'storage' ? AI_STORAGE_FULL_COPY : AI_ERROR_CARD_COPY[reason];
  return (
    <html.div style={styles.card}>
      <html.div aria-hidden style={styles.glyph(ERROR_GLYPH_PX)}>
        <RsdIcon
          name={rest ? 'dottie-stumped' : 'dottie-another-idea'}
          size={ERROR_GLYPH_PX}
          ink={undefined}
          muted={false}
        />
      </html.div>
      <html.h2 style={[controlStyles.boldText, styles.title(ERROR_TITLE_LINE_HEIGHT)]}>
        {copy.title}
      </html.h2>
      <html.p style={[styles.medium, styles.body(ERROR_BODY_LINE_HEIGHT)]}>{copy.body}</html.p>
      <html.div style={styles.primary}>
        <RsdButton
          variant="brand"
          size="hero"
          icon={
            <RsdIcon
              name={rest ? 'brush-pen' : 'refresh'}
              size={rest ? ERROR_PEN_ICON_PX : ERROR_REFRESH_ICON_PX}
              ink={DRAWING_ON_BRAND}
              muted={false}
            />
          }
          onPress={rest ? onKeepDrawing : onTryAgain}
        >
          {copy.action}
        </RsdButton>
      </html.div>
      {copy.note ? <html.p style={[styles.medium, styles.note]}>{copy.note}</html.p> : null}
      {children}
    </html.div>
  );
}

const styles = css.create({
  medium: { fontFamily: fonts.mediumFamily, fontWeight: fonts.mediumWeight },
  safety: (maxWidth: number, minHeight: number) => ({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: dimensions.space3,
    width: '100%',
    maxWidth,
    minHeight,
    textAlign: 'center',
  }),
  safetyLead: { margin: 0, color: colors.text, fontSize: dimensions.fontSizeMd },
  safetySub: (maxWidth: number) => ({
    margin: 0,
    maxWidth,
    color: colors.textSoft,
    fontSize: dimensions.fontSizeSm,
  }),
  refusalReport: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: dimensions.space2,
    marginTop: dimensions.space1,
  },
  grownUps: { color: colors.textSoft, fontSize: dimensions.fontSizeXs },
  card: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    width: '100%',
    textAlign: 'center',
  },
  glyph: (size: number) => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: size,
    height: size,
    marginBottom: dimensions.space4,
  }),
  title: (lineHeight: number) => ({
    margin: 0,
    color: colors.textStrong,
    fontSize: dimensions.fontSizeXl,
    lineHeight,
  }),
  body: (lineHeight: number) => ({
    margin: 0,
    marginTop: dimensions.space2,
    color: colors.text,
    fontSize: dimensions.fontSizeMd,
    lineHeight,
  }),
  primary: {
    display: 'flex',
    flexDirection: 'column',
    alignSelf: 'stretch',
    marginTop: dimensions.space6,
  },
  note: {
    margin: 0,
    marginTop: dimensions.space3,
    color: colors.textSoft,
    fontSize: dimensions.fontSizeSm,
  },
});
