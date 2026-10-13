import { NativeFrame } from '../rsdDrawing/NativeFrame';
import { useRef, type RefObject } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Action } from '../DrawingControls';
import {
  createDrawingStyles,
  useDrawingStyles,
  useDrawingTheme,
} from '../drawing/DrawingAppearance';
import { DRAWING_SCALE, DRAWING_SCRIM, TOUCH_TARGET } from '../drawing/theme';
import { describeDeviceInfo } from './deviceReport';
import { MAX_REPORT_MESSAGE_LENGTH, REPORT_KINDS } from './report';
import { FEEDBACK_GATE_LABELS, FEEDBACK_GATE_MODES, GATE_ANSWER_MAX_LENGTH } from './feedbackGate';
import {
  FEEDBACK_DEVICE_NOTICE,
  FEEDBACK_DISCLOSURE,
  FEEDBACK_DRAFT_NOTICE,
  FEEDBACK_POLICY_NOTICE,
} from './feedbackCopy';
import type { NativeFeedbackOwner, NativeFeedbackState } from './feedback';
import { useNativeFeedbackState } from './useNativeFeedback';

export function NativeFeedback({
  owner,
  visible,
  onDismiss,
}: {
  owner: NativeFeedbackOwner | null;
  visible?: boolean;
  onDismiss?: () => void;
}) {
  const state = useNativeFeedbackState(owner);
  return owner && state && (state.open || visible !== undefined) ? (
    <FeedbackSheet owner={owner} state={state} visible={visible} onDismiss={onDismiss} />
  ) : null;
}

function FeedbackSheet({
  owner,
  state,
  visible = state.open,
  onDismiss,
}: {
  owner: NativeFeedbackOwner;
  state: NativeFeedbackState;
  visible?: boolean;
  onDismiss?: () => void;
}) {
  const styles = useDrawingStyles(themedStyles);
  const input = useRef<TextInput>(null);
  const close = () => (state.gate.open ? owner.dismissGate() : owner.close());
  const sending = state.delivery.status === 'sending';
  return (
    <Modal
      statusBarTranslucent
      navigationBarTranslucent
      visible={visible}
      onDismiss={onDismiss}
      transparent
      animationType="none"
      onRequestClose={close}
      onShow={() => input.current?.focus()}
      accessibilityLabel="Send Feedback"
    >
      <NativeFrame variant="overlay">
        <View style={styles.backdrop}>
          <View accessibilityViewIsModal style={styles.card}>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
              <Text accessibilityRole="header" style={styles.title}>
                {state.gate.open ? 'Grown-ups only' : 'Send Feedback'}
              </Text>
              {state.gate.open ? (
                <FeedbackChallenge owner={owner} state={state} />
              ) : (
                <>
                  <Text style={styles.text}>{FEEDBACK_DISCLOSURE}</Text>
                  <Text style={styles.text}>{FEEDBACK_DRAFT_NOTICE}</Text>
                  {state.preview ? (
                    <>
                      <Text accessibilityRole="header" style={styles.title}>
                        Review your feedback
                      </Text>
                      <Text style={styles.text}>
                        Type:{' '}
                        {
                          REPORT_KINDS.find((kind) => kind.value === state.preview?.body.kind)
                            ?.label
                        }
                      </Text>
                      <Text selectable style={styles.text}>
                        {state.preview.body.message}
                      </Text>
                      {describeDeviceInfo(state.preview.body.device ?? {}).map((row) => (
                        <Text key={row.label} style={styles.text}>
                          {row.label}: {row.value}
                        </Text>
                      ))}
                      {!state.preview.body.device ? (
                        <Text style={styles.text}>Device details: not included</Text>
                      ) : null}
                      <Action label="Edit feedback" onPress={owner.editPreview} />
                      <Action
                        label={
                          sending
                            ? 'Sending…'
                            : state.delivery.status === 'idle' ||
                                state.delivery.status === 'success'
                              ? 'Send privately'
                              : 'Try sending again'
                        }
                        primary
                        disabled={
                          sending || state.delivery.status === 'throttled' || !state.policyReady
                        }
                        onPress={owner.send}
                      />
                    </>
                  ) : (
                    <FeedbackDraftFields owner={owner} state={state} input={input} />
                  )}
                  <Text accessibilityLiveRegion="polite" style={styles.text}>
                    {state.validation}
                  </Text>
                  {state.delivery.status !== 'idle' ? (
                    <Text accessibilityLiveRegion="polite" style={styles.text}>
                      {sending
                        ? 'Sending privately. You can close this form and keep drawing.'
                        : state.delivery.message}
                    </Text>
                  ) : null}
                  {sending ? (
                    <Action
                      label="Cancel sending"
                      onPress={() => {
                        if (state.delivery.status === 'sending')
                          owner.cancelSending(state.delivery.id);
                      }}
                    />
                  ) : null}
                  {!state.sharedParent ? (
                    <FeedbackPolicyChoices owner={owner} state={state} />
                  ) : null}
                </>
              )}
            </ScrollView>
            <Action
              label={state.gate.open ? 'Cancel challenge' : 'Close feedback'}
              onPress={close}
            />
          </View>
        </View>
      </NativeFrame>
    </Modal>
  );
}
type FeedbackProps = { owner: NativeFeedbackOwner; state: NativeFeedbackState };
function FeedbackChallenge({
  owner,
  state,
}: {
  owner: NativeFeedbackOwner;
  state: NativeFeedbackState;
}) {
  const styles = useDrawingStyles(themedStyles);
  const theme = useDrawingTheme();
  return (
    <>
      <Text style={styles.text}>Solve this multiplication problem to continue.</Text>
      <Text style={styles.title}>
        {state.gate.x} × {state.gate.y}
      </Text>
      <TextInput
        accessibilityLabel="Answer"
        value={state.gate.input}
        onChangeText={owner.gateInput}
        keyboardType="number-pad"
        autoFocus
        maxLength={GATE_ANSWER_MAX_LENGTH}
        editable={!state.gate.locked}
        style={styles.input}
        placeholderTextColor={theme.textSoft}
      />
      <Text accessibilityLiveRegion="polite" style={styles.text}>
        {state.gate.message}
      </Text>
      <Action label="Continue" disabled={state.gate.locked} onPress={owner.gateAnswer} />
    </>
  );
}

function FeedbackDraftFields({
  owner,
  state,
  input,
}: FeedbackProps & { input: RefObject<TextInput | null> }) {
  const styles = useDrawingStyles(themedStyles);
  const theme = useDrawingTheme();
  return (
    <>
      <View accessibilityRole="radiogroup" accessibilityLabel="Feedback type" style={styles.row}>
        {REPORT_KINDS.map((kind) => (
          <Pressable
            key={kind.value}
            accessibilityRole="radio"
            accessibilityLabel={kind.label}
            accessibilityState={{ checked: state.draft.kind === kind.value }}
            onPress={() => owner.setKind(kind.value)}
            style={styles.choice}
          >
            <Text style={styles.text}>
              {kind.label}
              {state.draft.kind === kind.value ? ' ✓' : ''}
            </Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        ref={input}
        accessibilityLabel="Feedback message"
        value={state.draft.message}
        onChangeText={owner.setMessage}
        maxLength={MAX_REPORT_MESSAGE_LENGTH}
        multiline
        autoComplete="off"
        autoCorrect={false}
        placeholder="Describe the problem or your idea"
        placeholderTextColor={theme.textSoft}
        style={[styles.input, styles.message]}
      />
      <Text style={styles.text}>
        {state.draft.message.length} / {MAX_REPORT_MESSAGE_LENGTH} characters
      </Text>
      {state.draft.kind === 'bug' ? (
        <>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityLabel="Include device details"
            accessibilityState={{ checked: state.draft.includeDevice }}
            onPress={() => owner.setIncludeDevice(!state.draft.includeDevice)}
            style={styles.choice}
          >
            <Text style={styles.text}>
              {state.draft.includeDevice ? '✓ ' : ''}Include device details
            </Text>
          </Pressable>
          <Text style={styles.text}>{FEEDBACK_DEVICE_NOTICE}</Text>
        </>
      ) : null}
      <Action label="Review feedback" onPress={owner.preview} />
    </>
  );
}
function FeedbackPolicyChoices({ owner, state }: FeedbackProps) {
  const styles = useDrawingStyles(themedStyles);
  return (
    <>
      <Text accessibilityRole="header" style={styles.title}>
        Feedback protection
      </Text>
      <Text style={styles.text}>{FEEDBACK_POLICY_NOTICE}</Text>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel="Feedback protection"
        style={styles.row}
      >
        {FEEDBACK_GATE_MODES.map((mode) => (
          <Pressable
            key={mode}
            accessibilityRole="radio"
            accessibilityLabel={`${FEEDBACK_GATE_LABELS[mode]} feedback protection`}
            accessibilityState={{
              checked: mode === state.policy,
              disabled: !state.policyReady,
            }}
            disabled={!state.policyReady}
            onPress={() => owner.changePolicy(mode)}
            style={styles.choice}
          >
            <Text style={styles.text}>
              {FEEDBACK_GATE_LABELS[mode]}
              {mode === state.policy ? ' ✓' : ''}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text accessibilityLiveRegion="polite" style={styles.text}>
        {state.policyMessage}
      </Text>
    </>
  );
}
const FEEDBACK_MAX_WIDTH = 560;
const FEEDBACK_MESSAGE_HEIGHT = 144;
const themedStyles = createDrawingStyles((palette) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: DRAWING_SCALE.space4,
      backgroundColor: DRAWING_SCRIM,
    },
    card: {
      width: '100%',
      maxWidth: FEEDBACK_MAX_WIDTH,
      maxHeight: '100%',
      borderRadius: DRAWING_SCALE.radiusLg,
      backgroundColor: palette.surface,
      padding: DRAWING_SCALE.space4,
      gap: DRAWING_SCALE.space3,
    },
    content: { gap: DRAWING_SCALE.space3 },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: DRAWING_SCALE.space3 },
    title: { color: palette.textStrong, fontSize: DRAWING_SCALE.fontSizeXl, fontWeight: '700' },
    text: { color: palette.text, fontSize: DRAWING_SCALE.fontSizeMd },
    input: {
      minHeight: TOUCH_TARGET,
      color: palette.textStrong,
      backgroundColor: palette.paper,
      borderColor: palette.borderWarm,
      borderWidth: 1,
      borderRadius: DRAWING_SCALE.radiusMd,
      padding: DRAWING_SCALE.space3,
      fontSize: DRAWING_SCALE.fontSizeMd,
    },
    message: { minHeight: FEEDBACK_MESSAGE_HEIGHT, textAlignVertical: 'top' },
    choice: {
      minWidth: TOUCH_TARGET,
      minHeight: TOUCH_TARGET,
      borderRadius: DRAWING_SCALE.radiusMd,
      backgroundColor: palette.paper,
      justifyContent: 'center',
      padding: DRAWING_SCALE.space3,
    },
  })
);
