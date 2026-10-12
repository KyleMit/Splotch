import { useState } from 'react';
import { html } from 'react-strict-dom';
import { ScrollView } from 'react-native';
import { useDrawingScreenStyles } from '../drawing/drawingScreenStyles';
import type { useDrawingScreen } from '../useDrawingScreen';
import { RsdAction, styles } from './controls';

export function RsdRecoveryNotice({
  screen,
  blocked,
}: {
  screen: ReturnType<typeof useDrawingScreen>;
  blocked: boolean;
}) {
  const drawingScreenStyles = useDrawingScreenStyles();
  const state = screen.pngRecovery.state;
  const [settled, setSettled] = useState(state);
  if (!screen.drawing && settled !== state) setSettled(state);
  const visible = screen.drawing ? settled : state;
  const disabled =
    screen.drawing || blocked || state.busy || screen.pagePickerOpen || screen.settingsOpen;
  if (!visible.pictures.length && !visible.notice && visible.status !== 'unreadable') return null;
  return (
    <ScrollView
      testID="rsd-png-recovery-viewport"
      accessibilityLabel="PNG recovery"
      accessible={false}
      style={drawingScreenStyles.feedback}
      contentContainerStyle={drawingScreenStyles.feedbackContent}
      removeClippedSubviews={false}
      scrollEnabled={!screen.drawing}
    >
      {visible.pictures.map((picture) => (
        <html.div key={picture.id} style={styles.recoveryCard}>
          <html.span>
            {picture.durable
              ? 'PNG held on this device for retry.'
              : 'PNG held only while this screen stays open.'}
          </html.span>
          <html.span>{picture.filename}</html.span>
          {picture.attempt.status === 'failed' ? (
            <html.span aria-live="polite">{picture.attempt.message}</html.span>
          ) : null}
          {picture.attempt.status === 'sharing-closed' ? (
            <html.span>Share sheet closed. This PNG is kept until you dismiss it.</html.span>
          ) : null}
          {picture.attempt.status === 'download-requested' ? (
            <html.span>Download requested. This PNG is kept until you dismiss it.</html.span>
          ) : null}
          <RsdAction
            label={`Dismiss held PNG ${picture.filename}`}
            text="Dismiss"
            disabled={disabled}
            onClick={() => {
              void screen.pngRecovery.dismiss(picture.id);
            }}
          />
        </html.div>
      ))}
      {visible.notice ? <html.span aria-live="polite">{visible.notice}</html.span> : null}
      {visible.pictures.length || visible.status === 'unreadable' ? (
        <RsdAction
          label="Try PNG export again"
          disabled={disabled}
          onClick={() => {
            void screen.pngRecovery.retry();
          }}
        />
      ) : null}
    </ScrollView>
  );
}
