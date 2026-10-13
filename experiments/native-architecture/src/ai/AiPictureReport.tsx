import { Image, StyleSheet, View } from 'react-native';
import { Text } from '../drawing/Text';
import { Action } from '../DrawingControls';
import { createDrawingStyles, useDrawingStyles } from '../drawing/DrawingAppearance';
import { DRAWING_SCALE, TOUCH_TARGET } from '../drawing/theme';
import type { NativeAiOwner, AiState } from './generation';
import type { AiResult } from './journal';
import { AI_REPORT_HANDLING_NOTICE, type AiReportState } from './reportContract';
import { NativeAiPictureView } from './NativeAiPictureView';

export function AiReportAction({ owner, uri }: { owner: NativeAiOwner; uri: string }) {
  return <Action label="Report AI picture" onPress={() => owner.reportPicture(uri)} />;
}

export function AiRefusalReportAction({
  owner,
  state,
}: {
  owner: NativeAiOwner;
  state: Pick<AiState, 'refusal' | 'busy'>;
}) {
  const refusal = state.refusal;
  if (!refusal) return null;
  return (
    <Action
      label="Grown-ups: report this refusal"
      disabled={state.busy}
      onPress={() => owner.reportRefusal(refusal.id)}
    />
  );
}

export function NativeReportablePicture({
  owner,
  state,
  picture,
}: {
  owner: NativeAiOwner;
  state: AiState;
  picture: AiResult;
}) {
  return (
    <>
      <NativeAiPictureView owner={owner} state={state} picture={picture} />
      <AiReportAction owner={owner} uri={picture.uri} />
    </>
  );
}

export function AiPictureReport({
  owner,
  report,
}: {
  owner: NativeAiOwner;
  report: AiReportState;
}) {
  const styles = useDrawingStyles(themedStyles);
  if (report.phase === 'idle' || report.phase === 'gating') return null;
  const confirming = report.phase === 'confirm' || report.phase === 'sending';
  return (
    <View style={styles.content}>
      <Text accessibilityRole="header" style={styles.text}>
        {('preview' in report ? report.preview.target : report.target).kind ===
        'false-positive-refusal'
          ? 'Report this refusal'
          : 'Report this AI picture'}
      </Text>
      {confirming ? (
        <>
          <Text style={styles.text}>
            {report.preview.target.kind === 'false-positive-refusal'
              ? `The original drawing, original art style, exact instruction and authenticated refusal reason go to a grown-up at Splotch in a private report. ${AI_REPORT_HANDLING_NOTICE}`
              : `The original drawing, AI picture, original art style and exact instruction go to a grown-up at Splotch in a private report. ${AI_REPORT_HANDLING_NOTICE}`}
          </Text>
          <Text style={styles.text}>{`Original style: ${report.preview.style}`}</Text>
          <Image
            accessibilityLabel="Original drawing to report"
            source={{ uri: report.preview.drawing }}
            resizeMode="contain"
            style={styles.image}
          />
          {report.preview.target.kind === 'picture' ? (
            <Image
              accessibilityLabel="AI picture to report"
              source={{ uri: report.preview.output }}
              resizeMode="contain"
              style={styles.image}
            />
          ) : null}
          <Action
            label={report.phase === 'sending' ? 'Sending report…' : 'Send report'}
            disabled={report.phase === 'sending'}
            onPress={() => {
              void owner.sendPictureReport();
            }}
          />
        </>
      ) : (
        <Text accessibilityLiveRegion="polite" style={styles.text}>
          {report.phase === 'success'
            ? `Report received. ${AI_REPORT_HANDLING_NOTICE} Keep this reference to request earlier deletion: ${report.reportId}`
            : 'message' in report
              ? report.message
              : ''}
        </Text>
      )}
      {report.phase === 'error' ? (
        <Action label="Review report again" onPress={() => owner.reviewAiReport(report.target)} />
      ) : null}
      <Action label="Cancel report" onPress={owner.cancelPictureReport} />
    </View>
  );
}
const AI_REPORT_PREVIEW_HEIGHT_PX = TOUCH_TARGET * 3;
const themedStyles = createDrawingStyles((palette) =>
  StyleSheet.create({
    content: { gap: DRAWING_SCALE.space3 },
    text: { color: palette.text, fontSize: DRAWING_SCALE.fontSizeMd },
    image: { width: '100%', height: AI_REPORT_PREVIEW_HEIGHT_PX },
  })
);
