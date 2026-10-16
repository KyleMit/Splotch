import { useEffect } from 'react';
import { useWindowDimensions } from 'react-native';
import { css, html } from 'react-strict-dom';
import type { NativeFeedbackOwner, NativeFeedbackState } from '../feedback/feedback';
import { MAX_REPORT_MESSAGE_LENGTH, REPORT_KINDS } from '../feedback/report';
import { MESSAGE_PROMPT_BY_KIND, REPORT_FORM_COPY } from '../feedback/reportFormCopy';
import { useNativeFeedbackState } from '../feedback/useNativeFeedback';
import { DeviceCheckbox, DeviceDetails } from './RsdDeviceOptIn';
import { RsdButton } from './RsdButton';
import { RsdRuleLabel } from './RsdRuleLabel';
import { RsdSegmentedPicker } from './RsdSegmentedPicker';
import { RsdStatusMessage } from './RsdStatusMessage';
import { brandColors, colors, dimensions, fonts } from './tokens.css';

// ReportForm.svelte's and ReportFields.svelte's literals, local for the StyleX web compile;
// native-settings-info-drift.test.mjs reads each back from those sources.
const HEADING_BOTTOM_PX = 6;
const INTRO_BOTTOM_PX = 12;
const INTRO_LINE_HEIGHT = 1.5;
const FIELD_GAP_PX = 12;
const DEVICE_GAP_PX = 10;
const PRIVACY_PULL_PX = 2;
const PRIVACY_LINE_HEIGHT = 1.45;
// ReportFields.svelte's (max-width: 400px): below it the kind picker tightens its track.
const TIGHT_PICKER_MAX_WIDTH_PX = 400;
const PAGE_FIELD_GAP_PX = 14;
const PAGE_PHONE_MAX_WIDTH_PX = 540;
// The .report-textarea skin. The field is React Strict DOM's own textarea rather than the shared
// RsdTextArea, whose React Native Web TextInput the color picker's chunk also loads: a module two
// web chunks share is hoisted onto the startup path.
const TEXTAREA_ROWS = 4;
const TEXTAREA_MIN_HEIGHT_PX = 88;
const TEXTAREA_PADDING_PX = { block: 10, inline: 12 } as const;
const TEXTAREA_LINE_HEIGHT = 1.5;

const styles = css.create({
  section: { display: 'flex', flexDirection: 'column' },
  heading: { marginBottom: HEADING_BOTTOM_PX },
  intro: {
    marginTop: 0,
    marginBottom: INTRO_BOTTOM_PX,
    fontSize: dimensions.fontSizeSm,
    color: colors.textSoft,
    lineHeight: INTRO_LINE_HEIGHT,
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: FIELD_GAP_PX,
    paddingTop: dimensions.space3,
    paddingBottom: dimensions.space3,
    paddingLeft: dimensions.space4,
    paddingRight: dimensions.space4,
    borderRadius: dimensions.radiusLg,
    backgroundColor: colors.surface2,
  },
  label: {
    fontSize: dimensions.fontSizeSm,
    fontFamily: fonts.mediumFamily,
    fontWeight: fonts.mediumWeight,
    color: colors.text,
  },
  textarea: {
    boxSizing: 'border-box',
    width: '100%',
    minHeight: TEXTAREA_MIN_HEIGHT_PX,
    margin: 0,
    paddingTop: TEXTAREA_PADDING_PX.block,
    paddingBottom: TEXTAREA_PADDING_PX.block,
    paddingLeft: TEXTAREA_PADDING_PX.inline,
    paddingRight: TEXTAREA_PADDING_PX.inline,
    fontFamily: fonts.family,
    fontSize: dimensions.fontSizeMd,
    lineHeight: TEXTAREA_LINE_HEIGHT,
    color: colors.textStrong,
    backgroundColor: colors.surface,
    borderWidth: dimensions.borderWidth,
    borderStyle: 'solid',
    borderColor: { default: colors.borderWarmStrong, ':focus': brandColors.brand },
    borderRadius: dimensions.radiusSm,
    '::placeholder': { color: colors.textSoft },
  },
  device: { display: 'flex', flexDirection: 'column', gap: DEVICE_GAP_PX },
  privacy: {
    marginTop: -PRIVACY_PULL_PX,
    marginBottom: 0,
    fontSize: dimensions.fontSizeXs,
    color: colors.textSoft,
    lineHeight: PRIVACY_LINE_HEIGHT,
  },
  submit: { alignSelf: 'flex-start' },
  status: { marginTop: dimensions.space3 },
  pageCard: { padding: 0, backgroundColor: 'transparent', gap: PAGE_FIELD_GAP_PX },
  pageLabel: {
    fontSize: dimensions.fontSizeLg,
    fontFamily: fonts.boldFamily,
    fontWeight: fonts.boldWeight,
    color: colors.textStrong,
  },
  pagePrivacy: { fontSize: dimensions.fontSizeSm },
  pageField: { borderRadius: dimensions.radiusMd },
  pageSubmit: { marginTop: dimensions.space1 },
  phoneSubmit: { width: '100%' },
});

// What the parent hears after Send report: the shipping thanks on success, else the delivery's
// own account of what happened, which says whether the report may already have arrived.
function deliveryOutcome(state: NativeFeedbackState) {
  const { delivery } = state;
  if (delivery.status === 'idle' || delivery.status === 'sending') return null;
  return delivery.status === 'success'
    ? { status: 'success' as const, message: REPORT_FORM_COPY.sent }
    : { status: 'error' as const, message: delivery.message };
}

function inputValue(event: unknown): string | null {
  if (!event || typeof event !== 'object' || !('target' in event)) return null;
  const target = event.target;
  return target &&
    typeof target === 'object' &&
    'value' in target &&
    typeof target.value === 'string'
    ? target.value
    : null;
}

function MessageField({
  owner,
  state,
  label,
  placeholder,
  page,
}: {
  owner: NativeFeedbackOwner;
  state: NativeFeedbackState;
  label: string;
  placeholder: string;
  page: boolean;
}) {
  return (
    <html.textarea
      aria-label={label}
      value={state.draft.message}
      rows={TEXTAREA_ROWS}
      maxLength={MAX_REPORT_MESSAGE_LENGTH}
      autoComplete="off"
      placeholder={placeholder}
      onChange={(event: unknown) => {
        const value = inputValue(event);
        if (value !== null) owner.setMessage(value);
      }}
      style={[styles.textarea, page && styles.pageField]}
    />
  );
}

function ReportFields({
  owner,
  state,
  page,
}: {
  owner: NativeFeedbackOwner;
  state: NativeFeedbackState;
  page: boolean;
}) {
  const prompt = MESSAGE_PROMPT_BY_KIND[state.draft.kind];
  const tight = useWindowDimensions().width <= TIGHT_PICKER_MAX_WIDTH_PX;
  return (
    <>
      <RsdSegmentedPicker
        label={REPORT_FORM_COPY.kindLabel}
        tight={tight}
        options={REPORT_KINDS}
        selected={state.draft.kind}
        onSelect={owner.setKind}
      />
      <html.span style={[styles.label, page && styles.pageLabel]}>{prompt.label}</html.span>
      <MessageField
        owner={owner}
        state={state}
        label={prompt.label}
        placeholder={prompt.placeholder}
        page={page}
      />
      {state.draft.kind === 'bug' ? (
        <html.div style={styles.device}>
          <DeviceCheckbox
            checked={state.draft.includeDevice}
            onToggle={() => owner.setIncludeDevice(!state.draft.includeDevice)}
          />
          {state.draft.includeDevice ? <DeviceDetails rows={owner.deviceRows()} /> : null}
        </html.div>
      ) : null}
      <html.p style={[styles.privacy, page && styles.pagePrivacy]}>
        {REPORT_FORM_COPY.privacy}
      </html.p>
    </>
  );
}

// The shipping Settings Feedback section (ReportForm.svelte with ReportFields.svelte): a short
// introduction, then one card holding the kind, the message, the device opt-in with what it would
// send, the privacy line and Send report, which asks for the grown-up check before anything
// leaves. Each visit starts a fresh draft. The owner loads after first paint on the web, so until
// it has the section shows nothing.
export function RsdFeedbackSection({
  owner,
  presentation = 'settings',
}: {
  owner: NativeFeedbackOwner | null;
  presentation?: 'settings' | 'page';
}) {
  const page = presentation === 'page';
  const phone = useWindowDimensions().width <= PAGE_PHONE_MAX_WIDTH_PX;
  const state = useNativeFeedbackState(owner);
  useEffect(() => {
    owner?.reset();
  }, [owner]);
  if (!owner || !state) return null;
  const sending = state.delivery.status === 'sending';
  const outcome = deliveryOutcome(state);
  const message = state.validation
    ? { status: 'error' as const, message: state.validation }
    : outcome;
  return (
    <html.section style={styles.section}>
      {!page ? (
        <>
          <html.div style={styles.heading}>
            <RsdRuleLabel as="h3" strong>
              {REPORT_FORM_COPY.heading}
            </RsdRuleLabel>
          </html.div>
          <html.p style={styles.intro}>{REPORT_FORM_COPY.intro}</html.p>
        </>
      ) : null}
      <html.div style={[styles.card, page && styles.pageCard]}>
        <ReportFields owner={owner} state={state} page={page} />
        <html.div
          style={[styles.submit, page && styles.pageSubmit, page && phone && styles.phoneSubmit]}
        >
          <RsdButton
            variant="brand"
            size={page ? 'lg' : 'md'}
            fullWidth={page && phone}
            busy={sending}
            disabled={(!page && !state.draft.message.trim()) || !state.policyReady}
            onPress={page ? owner.submitPublic : owner.submit}
          >
            {sending
              ? REPORT_FORM_COPY.sending
              : page && state.draft.kind === 'feature'
                ? REPORT_FORM_COPY.sendIdea
                : REPORT_FORM_COPY.send}
          </RsdButton>
        </html.div>
      </html.div>
      {message ? (
        <html.div style={styles.status}>
          <RsdStatusMessage status={message.status}>{message.message}</RsdStatusMessage>
        </html.div>
      ) : null}
    </html.section>
  );
}
