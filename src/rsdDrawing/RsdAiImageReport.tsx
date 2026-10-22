import { Image, StyleSheet } from 'react-native';
import { css, html } from 'react-strict-dom';
import { AI_REPORT_CONFIRM_COPY, AI_REPORT_COPY, aiReportReceived } from '../ai/aiResultCopy';
import type { NativeAiOwner } from '../ai/generation';
import type { AiReportPreview, AiReportState } from '../ai/reportContract';
import { ModalShell } from './ModalShell';
import { RsdButton } from './RsdButton';
import { RsdConfirmCard } from './RsdConfirmCard';
import { RsdStatusMessage } from './RsdStatusMessage';
import { useModalPresence } from './useModalPresence';
import { colors, dimensions } from './tokens.css';
import { styles as controlStyles } from './controls';
import { REPORT_RECEIVED_MESSAGE } from '../lib/reportReply';

// AiImageReport.svelte's thumbnail literals; native-ai-flow-geometry.test.mjs reads them back.
const REPORT_THUMB_SINGLE_MAX_PX = 144;
export const REPORT_THUMB_SHADOW = '0px 2px 8px rgba(0, 0, 0, 0.14)';
const REPORT_THUMB_RADIUS_PX = 12;

// An outcome is on screen, so the report's launchers give way to its message, as shipping's
// ImageReportFlow.settled does.
export function aiReportSettled(report: AiReportState) {
  return ['success', 'error', 'unknown', 'unavailable'].includes(report.phase);
}

// The outcome of a sent report, where the report's launcher was: the reference to keep, or why it
// did not go and, when it can go again, a way back to the confirmation.
export function RsdAiReportStatus({
  owner,
  report,
}: {
  owner: NativeAiOwner;
  report: AiReportState;
}) {
  if (report.phase === 'success')
    return (
      <html.div style={styles.status}>
        <RsdStatusMessage status="success">
          {report.reportId === null ? REPORT_RECEIVED_MESSAGE : aiReportReceived(report.reportId)}
        </RsdStatusMessage>
      </html.div>
    );
  if (report.phase !== 'error' && report.phase !== 'unavailable') return null;
  return (
    <html.div style={styles.status}>
      <RsdStatusMessage status="error">{report.message}</RsdStatusMessage>
      {report.phase === 'error' ? (
        <RsdButton size="sm" onPress={() => owner.reviewAiReport(report.target)}>
          {AI_REPORT_COPY.retry}
        </RsdButton>
      ) : null}
    </html.div>
  );
}

function confirmingPreview(report: AiReportState) {
  return report.phase === 'confirm' || report.phase === 'sending' ? report.preview : null;
}

// The last step before an irreversible send, standing in front of the result: what goes, the
// pictures it sends, and Cancel beside Send report.
export function RsdAiReportConfirm({
  owner,
  report,
}: {
  owner: NativeAiOwner;
  report: AiReportState;
}) {
  const presence = useModalPresence(confirmingPreview(report));
  const preview = presence.shown;
  if (!preview) return null;
  const sending = report.phase === 'sending';
  const copy = AI_REPORT_CONFIRM_COPY[preview.target.kind];
  // Nothing is on the wire until Send report, so dismissing is free until then.
  const cancel = () => {
    if (!sending) owner.cancelPictureReport();
  };
  return (
    <ModalShell
      visible={presence.visible}
      onDismiss={presence.dismissed}
      label={copy.title}
      size="confirm"
      onClose={cancel}
      header={null}
    >
      <RsdConfirmCard
        title={copy.title}
        copy={copy.copy}
        actions={[
          <RsdButton key="cancel" size="lg" disabled={sending} onPress={cancel}>
            {AI_REPORT_COPY.cancel}
          </RsdButton>,
          <RsdButton
            key="send"
            variant="brand"
            size="lg"
            busy={sending}
            onPress={() => void owner.sendPictureReport()}
          >
            {sending ? AI_REPORT_COPY.sending : AI_REPORT_COPY.send}
          </RsdButton>,
        ]}
      >
        <ReportThumbs preview={preview} drawingCaption={copy.drawing} />
      </RsdConfirmCard>
    </ModalShell>
  );
}

// The captions say what each picture is, so the pictures themselves are decorative.
function ReportThumbs({
  preview,
  drawingCaption,
}: {
  preview: AiReportPreview;
  drawingCaption: string;
}) {
  const output = preview.output ?? null;
  return (
    <html.div style={styles.thumbs}>
      {output ? <Figure uri={output} caption={AI_REPORT_COPY.output} single={false} /> : null}
      <Figure uri={preview.drawing} caption={drawingCaption} single={!output} />
    </html.div>
  );
}

function Figure({ uri, caption, single }: { uri: string; caption: string; single: boolean }) {
  return (
    <html.div style={[styles.figure, single && styles.single(REPORT_THUMB_SINGLE_MAX_PX)]}>
      <html.div style={styles.thumb(REPORT_THUMB_SHADOW)}>
        <Image accessible={false} source={{ uri }} resizeMode="cover" style={thumb.image} />
      </html.div>
      <html.span style={[controlStyles.semiboldText, styles.caption]}>{caption}</html.span>
    </html.div>
  );
}

const thumb = StyleSheet.create({
  image: { width: '100%', height: '100%', borderRadius: REPORT_THUMB_RADIUS_PX },
});

const styles = css.create({
  status: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: dimensions.space2,
    width: '100%',
  },
  thumbs: { display: 'flex', flexDirection: 'row', gap: dimensions.space3 },
  figure: {
    display: 'flex',
    flexDirection: 'column',
    gap: dimensions.space2,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
  },
  single: (max: number) => ({ maxWidth: max, marginInline: 'auto' }),
  thumb: (shadow: string) => ({
    width: '100%',
    aspectRatio: 1,
    borderRadius: dimensions.radiusMd,
    backgroundColor: colors.paper,
    boxShadow: shadow,
  }),
  caption: { color: colors.textSoft, fontSize: dimensions.fontSizeXs, textAlign: 'center' },
});
