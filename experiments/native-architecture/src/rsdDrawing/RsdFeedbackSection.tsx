import { useEffect } from 'react';
import { useWindowDimensions } from 'react-native';
import { css, html } from 'react-strict-dom';
import { DRAWING_ON_BRAND } from '../drawing/theme';
import type { NativeFeedbackOwner, NativeFeedbackState } from '../feedback/feedback';
import { MAX_REPORT_MESSAGE_LENGTH, REPORT_KINDS } from '../feedback/report';
import { MESSAGE_PROMPT_BY_KIND, REPORT_FORM_COPY } from '../feedback/reportFormCopy';
import { useNativeFeedbackState } from '../feedback/useNativeFeedback';
import { styles as controlStyles } from './controls';
import { RsdButton } from './RsdButton';
import { RsdDisclosure } from './RsdDisclosure';
import { RsdIcon } from './RsdIcon';
import { RsdPressable } from './RsdPressable';
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
const CHECK_GAP_PX = 10;
const CHECK_LINE_HEIGHT = 1.4;
const CHECKBOX_PX = 18;
const CHECKBOX_TOP_PX = 1;
const PRIVACY_PULL_PX = 2;
const PRIVACY_LINE_HEIGHT = 1.45;
const DEVICE_SUMMARY_PADDING_PX = { block: 8, inline: 12 } as const;
const DEVICE_LIST_PADDING_PX = { inline: 12, bottom: 4 } as const;
const DEVICE_LIST_LINE_HEIGHT = 1.7;
const DEVICE_NOTE_PADDING_PX = { top: 4, inline: 12, bottom: 10 } as const;
const DEVICE_NOTE_LINE_HEIGHT = 1.4;
const DEVICE_EMPTY_BOTTOM_PX = 8;
// The browser checkbox's own box: a hairline frame with slightly rounded corners, and a tick
// inset a little inside the brand fill once checked.
const CHECKBOX_RADIUS_PX = 3;
// ReportFields.svelte's (max-width: 400px): below it the kind picker tightens its track.
const TIGHT_PICKER_MAX_WIDTH_PX = 400;
const CHECKBOX_TICK_PX = 14;
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
  check: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: CHECK_GAP_PX,
    margin: 0,
    padding: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    textAlign: 'left',
    cursor: 'pointer',
  },
  box: {
    boxSizing: 'border-box',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: CHECKBOX_PX,
    height: CHECKBOX_PX,
    marginTop: CHECKBOX_TOP_PX,
    borderRadius: CHECKBOX_RADIUS_PX,
    borderWidth: dimensions.borderWidth,
    borderStyle: 'solid',
    borderColor: colors.textSoft,
    backgroundColor: colors.surface,
  },
  boxChecked: { borderColor: colors.brandSolid, backgroundColor: colors.brandSolid },
  checkText: {
    flexShrink: 1,
    fontSize: dimensions.fontSizeSm,
    color: colors.text,
    lineHeight: CHECK_LINE_HEIGHT,
  },
  why: { color: colors.textSoft },
  details: { backgroundColor: colors.surface },
  detailsSummary: {
    paddingTop: DEVICE_SUMMARY_PADDING_PX.block,
    paddingBottom: DEVICE_SUMMARY_PADDING_PX.block,
    paddingLeft: DEVICE_SUMMARY_PADDING_PX.inline,
    paddingRight: DEVICE_SUMMARY_PADDING_PX.inline,
    fontSize: dimensions.fontSizeSm,
    color: colors.brandText,
  },
  detailsMark: { fontSize: dimensions.fontSizeSm },
  rows: {
    margin: 0,
    paddingTop: 0,
    paddingLeft: DEVICE_LIST_PADDING_PX.inline,
    paddingRight: DEVICE_LIST_PADDING_PX.inline,
    paddingBottom: DEVICE_LIST_PADDING_PX.bottom,
    listStyle: 'none',
  },
  row: {
    fontSize: dimensions.fontSizeXs,
    color: colors.textSoft,
    lineHeight: DEVICE_LIST_LINE_HEIGHT,
  },
  empty: {
    margin: 0,
    paddingTop: 0,
    paddingLeft: DEVICE_LIST_PADDING_PX.inline,
    paddingRight: DEVICE_LIST_PADDING_PX.inline,
    paddingBottom: DEVICE_EMPTY_BOTTOM_PX,
    fontSize: dimensions.fontSizeXs,
    color: colors.textSoft,
  },
  note: {
    margin: 0,
    paddingTop: DEVICE_NOTE_PADDING_PX.top,
    paddingLeft: DEVICE_NOTE_PADDING_PX.inline,
    paddingRight: DEVICE_NOTE_PADDING_PX.inline,
    paddingBottom: DEVICE_NOTE_PADDING_PX.bottom,
    fontSize: dimensions.fontSizeXs,
    color: colors.textSoft,
    lineHeight: DEVICE_NOTE_LINE_HEIGHT,
  },
  privacy: {
    marginTop: -PRIVACY_PULL_PX,
    marginBottom: 0,
    fontSize: dimensions.fontSizeXs,
    color: colors.textSoft,
    lineHeight: PRIVACY_LINE_HEIGHT,
  },
  submit: { alignSelf: 'flex-start' },
  status: { marginTop: dimensions.space3 },
});

// The device opt-in, drawn as the browser draws shipping's checkbox in the brand accent: a real
// checkbox for assistive technology, the whole row its label.
function DeviceCheckbox({ checked, onToggle }: { checked: boolean; onToggle: () => void }) {
  return (
    <RsdPressable
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={`${REPORT_FORM_COPY.includeDevice} ${REPORT_FORM_COPY.includeDeviceWhy}`}
      style={styles.check}
      onClick={onToggle}
    >
      <html.div aria-hidden style={[styles.box, checked && styles.boxChecked]}>
        {checked ? (
          <RsdIcon name="check" size={CHECKBOX_TICK_PX} ink={DRAWING_ON_BRAND} muted={false} />
        ) : null}
      </html.div>
      <html.span aria-hidden style={styles.checkText}>
        {`${REPORT_FORM_COPY.includeDevice} `}
        <html.span style={styles.why}>{REPORT_FORM_COPY.includeDeviceWhy}</html.span>
      </html.span>
    </RsdPressable>
  );
}

function DeviceDetails({ owner }: { owner: NativeFeedbackOwner }) {
  const rows = owner.deviceRows();
  return (
    <RsdDisclosure
      summary={
        <html.span style={controlStyles.semiboldText}>{REPORT_FORM_COPY.deviceSummary}</html.span>
      }
      style={styles.details}
      summaryStyle={styles.detailsSummary}
      markStyle={styles.detailsMark}
    >
      <html.div>
        {rows.length ? (
          <html.ul style={styles.rows}>
            {rows.map((row) => (
              <html.li key={row.label} style={styles.row}>
                <html.span style={controlStyles.semiboldText}>{`${row.label}:`}</html.span>
                {` ${row.value}`}
              </html.li>
            ))}
          </html.ul>
        ) : (
          <html.p style={styles.empty}>{REPORT_FORM_COPY.deviceGathering}</html.p>
        )}
        <html.p style={styles.note}>{REPORT_FORM_COPY.deviceNote}</html.p>
      </html.div>
    </RsdDisclosure>
  );
}

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
}: {
  owner: NativeFeedbackOwner;
  state: NativeFeedbackState;
  label: string;
  placeholder: string;
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
      style={styles.textarea}
    />
  );
}

function ReportFields({
  owner,
  state,
}: {
  owner: NativeFeedbackOwner;
  state: NativeFeedbackState;
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
      <html.span style={styles.label}>{prompt.label}</html.span>
      <MessageField
        owner={owner}
        state={state}
        label={prompt.label}
        placeholder={prompt.placeholder}
      />
      {state.draft.kind === 'bug' ? (
        <html.div style={styles.device}>
          <DeviceCheckbox
            checked={state.draft.includeDevice}
            onToggle={() => owner.setIncludeDevice(!state.draft.includeDevice)}
          />
          {state.draft.includeDevice ? <DeviceDetails owner={owner} /> : null}
        </html.div>
      ) : null}
      <html.p style={styles.privacy}>{REPORT_FORM_COPY.privacy}</html.p>
    </>
  );
}

// The shipping Settings Feedback section (ReportForm.svelte with ReportFields.svelte): a short
// introduction, then one card holding the kind, the message, the device opt-in with what it would
// send, the privacy line and Send report, which asks for the grown-up check before anything
// leaves. Each visit starts a fresh draft. The owner loads after first paint on the web, so until
// it has the section shows nothing.
export function RsdFeedbackSection({ owner }: { owner: NativeFeedbackOwner | null }) {
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
      <html.div style={styles.heading}>
        <RsdRuleLabel as="h3" strong>
          {REPORT_FORM_COPY.heading}
        </RsdRuleLabel>
      </html.div>
      <html.p style={styles.intro}>{REPORT_FORM_COPY.intro}</html.p>
      <html.div style={styles.card}>
        <ReportFields owner={owner} state={state} />
        <html.div style={styles.submit}>
          <RsdButton
            variant="brand"
            busy={sending}
            disabled={
              !state.draft.message.trim() ||
              !state.policyReady ||
              state.delivery.status === 'throttled'
            }
            onPress={owner.submit}
          >
            {sending ? REPORT_FORM_COPY.sending : REPORT_FORM_COPY.send}
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
