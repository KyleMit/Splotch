import { css, html } from 'react-strict-dom';
import { NativeDialog } from './NativeDialog';
import { RsdAction, styles } from './controls';
import { colors, dimensions } from './tokens.css';
import { TOUCH_TARGET } from '../drawing/theme';
import { describeDeviceInfo } from '../feedback/deviceReport';
import { MAX_REPORT_MESSAGE_LENGTH, REPORT_KINDS } from '../feedback/report';
import {
  FEEDBACK_GATE_LABELS,
  FEEDBACK_GATE_MODES,
  GATE_ANSWER_MAX_LENGTH,
} from '../feedback/feedbackGate';
import {
  FEEDBACK_DEVICE_NOTICE,
  FEEDBACK_DISCLOSURE,
  FEEDBACK_DRAFT_NOTICE,
  FEEDBACK_POLICY_NOTICE,
} from '../feedback/feedbackCopy';
import type { NativeFeedbackOwner, NativeFeedbackState } from '../feedback/feedback';

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

export function RsdFeedbackSheet({
  owner,
  state,
}: {
  owner: NativeFeedbackOwner;
  state: NativeFeedbackState;
}) {
  const close = () => (state.gate.open ? owner.dismissGate() : owner.close());
  const sending = state.delivery.status === 'sending';
  return (
    <NativeDialog
      visible={state.open}
      label="Send Feedback"
      onClose={close}
      footer={
        <RsdAction
          label={state.gate.open ? 'Cancel challenge' : 'Close feedback'}
          onClick={close}
        />
      }
    >
      <html.div style={styles.dialogContent}>
        <html.h1>{state.gate.open ? 'Grown-ups only' : 'Send Feedback'}</html.h1>
        {state.gate.open ? (
          <>
            <html.span>Solve this multiplication problem to continue.</html.span>
            <html.span>
              {state.gate.x} × {state.gate.y}
            </html.span>
            <html.input
              aria-label="Answer"
              value={state.gate.input}
              inputMode="numeric"
              autoFocus
              maxLength={GATE_ANSWER_MAX_LENGTH}
              disabled={state.gate.locked}
              onChange={(event: unknown) => {
                const value = inputValue(event);
                if (value !== null) owner.gateInput(value);
              }}
              style={feedbackStyles.input}
            />
            <html.span aria-live="polite">{state.gate.message}</html.span>
            <RsdAction label="Continue" disabled={state.gate.locked} onClick={owner.gateAnswer} />
          </>
        ) : (
          <>
            <html.span>{FEEDBACK_DISCLOSURE}</html.span>
            <html.span>{FEEDBACK_DRAFT_NOTICE}</html.span>
            {state.preview ? (
              <>
                <html.h2>Review your feedback</html.h2>
                <html.span>
                  Type:{' '}
                  {REPORT_KINDS.find((kind) => kind.value === state.preview?.body.kind)?.label}
                </html.span>
                <html.span>{state.preview.body.message}</html.span>
                {describeDeviceInfo(state.preview.body.device ?? {}).map((row) => (
                  <html.span key={row.label}>
                    {row.label}: {row.value}
                  </html.span>
                ))}
                {!state.preview.body.device ? (
                  <html.span>Device details: not included</html.span>
                ) : null}
                <RsdAction label="Edit feedback" onClick={owner.editPreview} />
                <RsdAction
                  label={
                    sending
                      ? 'Sending…'
                      : state.delivery.status === 'idle' || state.delivery.status === 'success'
                        ? 'Send privately'
                        : 'Try sending again'
                  }
                  disabled={sending || state.delivery.status === 'throttled' || !state.policyReady}
                  onClick={owner.send}
                />
              </>
            ) : (
              <RsdFeedbackDraftFields owner={owner} state={state} />
            )}
            <html.span aria-live="polite">{state.validation}</html.span>
            {state.delivery.status !== 'idle' ? (
              <html.span aria-live="polite">
                {sending
                  ? 'Sending privately. You can close this form and keep drawing.'
                  : state.delivery.message}
              </html.span>
            ) : null}
            {sending ? (
              <RsdAction
                label="Cancel sending"
                onClick={() => {
                  if (state.delivery.status === 'sending') owner.cancelSending(state.delivery.id);
                }}
              />
            ) : null}
            <html.h2>Feedback protection</html.h2>
            <html.span>{FEEDBACK_POLICY_NOTICE}</html.span>
            <html.div role="radiogroup" aria-label="Feedback protection" style={styles.row}>
              {FEEDBACK_GATE_MODES.map((mode) => (
                <RsdAction
                  key={mode}
                  label={`${FEEDBACK_GATE_LABELS[mode]} feedback protection`}
                  text={FEEDBACK_GATE_LABELS[mode]}
                  selection="radio"
                  selected={mode === state.policy}
                  disabled={!state.policyReady}
                  onClick={() => owner.changePolicy(mode)}
                />
              ))}
            </html.div>
            <html.span aria-live="polite">{state.policyMessage}</html.span>
          </>
        )}
      </html.div>
    </NativeDialog>
  );
}
function RsdFeedbackDraftFields({
  owner,
  state,
}: {
  owner: NativeFeedbackOwner;
  state: NativeFeedbackState;
}) {
  return (
    <>
      <html.div role="radiogroup" aria-label="Feedback type" style={styles.row}>
        {REPORT_KINDS.map((kind) => (
          <RsdAction
            key={kind.value}
            label={kind.label}
            selection="radio"
            selected={state.draft.kind === kind.value}
            onClick={() => owner.setKind(kind.value)}
          />
        ))}
      </html.div>
      <html.textarea
        aria-label="Feedback message"
        value={state.draft.message}
        maxLength={MAX_REPORT_MESSAGE_LENGTH}
        autoComplete="off"
        placeholder="Describe the problem or your idea"
        rows={FEEDBACK_MESSAGE_ROWS}
        onChange={(event: unknown) => {
          const value = inputValue(event);
          if (value !== null) owner.setMessage(value);
        }}
        style={feedbackStyles.input}
      />
      <html.span>
        {state.draft.message.length} / {MAX_REPORT_MESSAGE_LENGTH} characters
      </html.span>
      {state.draft.kind === 'bug' ? (
        <>
          <RsdAction
            label="Include device details"
            selection="switch"
            selected={state.draft.includeDevice}
            onClick={() => owner.setIncludeDevice(!state.draft.includeDevice)}
          />
          <html.span>{FEEDBACK_DEVICE_NOTICE}</html.span>
        </>
      ) : null}
      <RsdAction label="Review feedback" onClick={owner.preview} />
    </>
  );
}
const FEEDBACK_MESSAGE_ROWS = 6;
const feedbackStyles = css.create({
  input: {
    minHeight: TOUCH_TARGET,
    padding: dimensions.space3,
    borderRadius: dimensions.radiusMd,
    color: colors.text,
    backgroundColor: colors.paper,
    fontSize: dimensions.fontSizeMd,
  },
});
