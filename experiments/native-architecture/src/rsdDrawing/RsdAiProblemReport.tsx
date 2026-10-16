import { css, html } from 'react-strict-dom';
import type { NativeAiOwner } from '../ai/generation';
import { AI_PROBLEM_REPORT_COPY, type AiProblemState } from '../ai/problemReport';
import { AI_REPORT_COPY } from '../ai/aiResultCopy';
import { DeviceCheckbox, DeviceDetails } from './RsdDeviceOptInContent';
import { ModalShell } from './ModalShell';
import { RsdButton } from './RsdButton';
import { RsdConfirmCard } from './RsdConfirmCard';
import { RsdStatusMessage } from './RsdStatusMessage';
import { useModalPresence } from './useModalPresence';
import { colors, dimensions } from './tokens.css';
import { styles as controlStyles } from './controls';

// AiImageReport.svelte's diagnostics literals; native-ai-problem-report.test.mjs reads them back.
export const DIAGNOSTICS_LINE_HEIGHT = 1.7;
export const DIAGNOSTICS_NOTE_LINE_HEIGHT = 1.4;
export const DIAGNOSTICS_NOTE_BOTTOM_PX = 10;

// An outcome is on screen, so Report a problem gives way to its message.
export function aiProblemSettled(problem: AiProblemState | null) {
  return problem?.phase === 'success' || problem?.phase === 'error';
}

// The sent problem report's outcome on the error card, with a retry that asks no second check.
export function RsdAiProblemStatus({
  owner,
  problem,
}: {
  owner: NativeAiOwner;
  problem: AiProblemState | null;
}) {
  if (problem?.phase !== 'success' && problem?.phase !== 'error') return null;
  return (
    <html.div style={styles.status}>
      <RsdStatusMessage status={problem.phase}>{problem.message}</RsdStatusMessage>
      {problem.phase === 'error' ? (
        <RsdButton size="sm" onPress={owner.retryProblemReport}>
          {AI_PROBLEM_REPORT_COPY.retry}
        </RsdButton>
      ) : null}
    </html.div>
  );
}

function confirming(problem: AiProblemState | null) {
  return problem?.phase === 'confirm' || problem?.phase === 'sending' ? problem : null;
}

// The last step before the problem report is sent: exactly what goes, what does not, and the
// device opt-in, as shipping's problem confirmation lists them.
export function RsdAiProblemConfirm({
  owner,
  problem,
}: {
  owner: NativeAiOwner;
  problem: AiProblemState | null;
}) {
  const presence = useModalPresence(confirming(problem));
  const shown = presence.shown;
  if (!shown) return null;
  const sending = problem?.phase === 'sending';
  const cancel = () => {
    if (!sending) owner.cancelProblemReport();
  };
  return (
    <ModalShell
      visible={presence.visible}
      onDismiss={presence.dismissed}
      label={AI_PROBLEM_REPORT_COPY.title}
      size="confirm"
      onClose={cancel}
      header={null}
    >
      <RsdConfirmCard
        title={AI_PROBLEM_REPORT_COPY.title}
        copy={AI_PROBLEM_REPORT_COPY.copy}
        actions={[
          <RsdButton key="cancel" size="lg" disabled={sending} onPress={cancel}>
            {AI_REPORT_COPY.cancel}
          </RsdButton>,
          <RsdButton
            key="send"
            variant="brand"
            size="lg"
            busy={sending}
            onPress={() => void owner.sendProblemReport()}
          >
            {sending ? AI_REPORT_COPY.sending : AI_REPORT_COPY.send}
          </RsdButton>,
        ]}
      >
        <html.section aria-label={AI_PROBLEM_REPORT_COPY.whatIsSent} style={styles.diagnostics}>
          <html.h4 style={[controlStyles.semiboldText, styles.heading]}>
            {AI_PROBLEM_REPORT_COPY.whatIsSent}
          </html.h4>
          <html.div style={styles.rows(DIAGNOSTICS_LINE_HEIGHT)}>
            {shown.rows.map((row) => (
              <html.p key={row.label} style={styles.row}>
                <html.span style={controlStyles.semiboldText}>{`${row.label}: `}</html.span>
                {row.value}
              </html.p>
            ))}
          </html.div>
          <html.p style={styles.note(DIAGNOSTICS_NOTE_LINE_HEIGHT, DIAGNOSTICS_NOTE_BOTTOM_PX)}>
            {AI_PROBLEM_REPORT_COPY.notSent}
          </html.p>
        </html.section>
        <html.div style={styles.device}>
          <DeviceCheckbox
            checked={shown.includeDevice}
            onToggle={() => {
              if (!sending) owner.setProblemDevice(!shown.includeDevice);
            }}
          />
          {shown.includeDevice ? <DeviceDetails rows={shown.deviceRows} /> : null}
        </html.div>
      </RsdConfirmCard>
    </ModalShell>
  );
}

const styles = css.create({
  status: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: dimensions.space2,
    width: '100%',
  },
  diagnostics: {
    borderWidth: dimensions.borderWidth,
    borderStyle: 'solid',
    borderColor: colors.borderWarm,
    borderRadius: dimensions.radiusMd,
    textAlign: 'left',
  },
  heading: {
    margin: 0,
    paddingTop: dimensions.space2,
    paddingBottom: dimensions.space2,
    paddingLeft: dimensions.space3,
    paddingRight: dimensions.space3,
    fontSize: dimensions.fontSizeSm,
    color: colors.brandText,
  },
  rows: (lineHeight: number) => ({
    paddingLeft: dimensions.space3,
    paddingRight: dimensions.space3,
    paddingBottom: dimensions.space1,
    lineHeight,
  }),
  row: { margin: 0, fontSize: dimensions.fontSizeXs, color: colors.textSoft },
  note: (lineHeight: number, bottom: number) => ({
    margin: 0,
    paddingTop: dimensions.space1,
    paddingLeft: dimensions.space3,
    paddingRight: dimensions.space3,
    paddingBottom: bottom,
    fontSize: dimensions.fontSizeXs,
    color: colors.textSoft,
    lineHeight,
  }),
  device: { display: 'flex', flexDirection: 'column', gap: dimensions.space2 },
});
