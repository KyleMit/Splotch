import { DrawingModal as Modal } from '../platform/DrawingModal';
import { NativeFrame } from '../rsdDrawing/NativeFrame';
import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../drawing/Text';
import { Action } from '../DrawingControls';
import { createDrawingStyles, useDrawingStyles } from '../drawing/DrawingAppearance';
import { DRAWING_SCALE, TOUCH_TARGET } from '../drawing/theme';
import {
  CREDENTIAL_KINDS,
  AI_DISCLOSURE,
  AI_WAIT_NOTICE,
  MAX_CREDENTIAL_CHARACTERS,
  type CredentialKind,
} from './contract';
import type { AiState, NativeAiOwner } from './generation';
import { aiCanGenerate, AI_RESULT_HEIGHT_PX } from './uiState';
import { useAiPictureViewer } from './useAiPictureViewer';
import { NativeReportablePicture, AiPictureReport, AiRefusalReportAction } from './AiPictureReport';
import { NativeAiStyleChoices } from './NativeAiStyleChoices';
import { AiRecoveryActions } from './AiRecoveryActions';
import { CurrentDrawingPreview } from './CurrentDrawingPreview';
import type { Drawing } from '../drawing/model';
import type { ArtworkMap } from '../offlineLibrary/artworkContext';
export function NativeAiSheet({
  owner,
  state,
  drawing,
  artwork,
  visible = state.open,
  onDismiss,
}: {
  owner: NativeAiOwner;
  state: AiState;
  drawing: Drawing;
  artwork: ArtworkMap;
  visible?: boolean;
  onDismiss?: () => void;
}) {
  const styles = useDrawingStyles(themedStyles);
  const waiting = !!state.journal && !['result', 'failed'].includes(state.journal.phase);
  const viewer = useAiPictureViewer(state, visible);
  const reporting = state.report && !['idle', 'gating'].includes(state.report.phase);
  return (
    <Modal
      statusBarTranslucent
      navigationBarTranslucent
      visible={visible}
      onDismiss={onDismiss}
      animationType="none"
      onRequestClose={
        reporting ? owner.cancelPictureReport : viewer.picture ? viewer.back : owner.close
      }
      accessibilityLabel="AI picture"
    >
      <NativeFrame>
        <View style={styles.screen}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            <Text accessibilityRole="header" style={styles.title}>
              {state.gate.open
                ? 'Grown-ups only'
                : viewer.picture
                  ? 'AI picture view'
                  : 'AI picture'}
            </Text>
            {state.gate.open ? (
              <AiParentalGate owner={owner} state={state} />
            ) : reporting ? (
              <AiPictureReport owner={owner} report={state.report} />
            ) : viewer.picture ? (
              <NativeReportablePicture owner={owner} state={state} picture={viewer.picture} />
            ) : state.authorized ? (
              <>
                <Text style={styles.text}>{AI_DISCLOSURE}</Text>
                <Text style={styles.text}>{AI_WAIT_NOTICE}</Text>
                <Action
                  label="Check AI allowance"
                  disabled={state.busy || waiting || !!state.recovery}
                  onPress={owner.refresh}
                />
                <Text style={styles.text}>
                  {state.credential === 'free'
                    ? state.remaining === null
                      ? 'Checking free allowance…'
                      : `${state.remaining} free pictures remaining`
                    : state.credential === 'unavailable'
                      ? 'Secure AI setup unavailable'
                      : state.credential === 'byok'
                        ? 'Using your OpenAI key'
                        : 'Using your access code'}
                </Text>
                <NativeAiStyleChoices
                  selected={state.style}
                  disabled={state.busy || waiting || !!state.recovery}
                  onChoose={owner.chooseStyle}
                />
                {visible && state.open ? (
                  <>
                    <Text style={styles.text}>Current drawing</Text>
                    <CurrentDrawingPreview drawing={drawing} artwork={artwork} />
                  </>
                ) : null}
                <Action
                  label="Send drawing for AI"
                  disabled={!aiCanGenerate(state)}
                  onPress={() => {
                    void owner.generate();
                  }}
                />
                <AiRecoveryActions owner={owner} state={state} waiting={waiting} />
                {waiting ? (
                  <>
                    <Text style={styles.text}>
                      The original drawing is saved. This attempt stays separate from anything you
                      draw next.
                    </Text>
                    <Action
                      label="Check waiting picture"
                      disabled={state.busy || !state.journal?.jobId}
                      onPress={owner.resume}
                    />
                    <Action
                      label="Release expired attempt"
                      disabled={state.busy}
                      onPress={owner.releaseExpired}
                    />
                  </>
                ) : null}
                <Text accessibilityLiveRegion="polite" style={styles.text}>
                  {state.message}
                </Text>
                <AiRefusalReportAction owner={owner} state={state} />
                <AiPictures owner={owner} state={state} onOpen={viewer.open} />
                <AiCredentialSetup owner={owner} state={state} />
              </>
            ) : null}
          </ScrollView>
          <AiFooter
            onClose={owner.close}
            onBack={reporting ? owner.cancelPictureReport : viewer.picture ? viewer.back : null}
          />
        </View>
      </NativeFrame>
    </Modal>
  );
}
function AiParentalGate({ owner, state }: { owner: NativeAiOwner; state: AiState }) {
  const styles = useDrawingStyles(themedStyles);
  return (
    <>
      <Text style={styles.text}>Solve this multiplication problem to continue.</Text>
      <Text style={styles.title}>
        {state.gate.x} × {state.gate.y}
      </Text>
      <TextInput
        accessibilityLabel="AI answer"
        value={state.gate.input}
        onChangeText={owner.gateInput}
        keyboardType="number-pad"
        editable={!state.gate.locked}
        style={styles.input}
      />
      <Text accessibilityLiveRegion="polite" style={styles.text}>
        {state.gate.message}
      </Text>
      <Action label="Continue to AI" onPress={owner.gateAnswer} disabled={state.gate.locked} />
    </>
  );
}
function AiFooter({ onClose, onBack }: { onClose: () => void; onBack: (() => void) | null }) {
  const styles = useDrawingStyles(themedStyles);
  return (
    <View style={styles.footer}>
      {onBack ? <Action label="Back" onPress={onBack} /> : null}
      <Action label="Keep drawing" onPress={onClose} />
    </View>
  );
}
function AiPictures({
  owner,
  state,
  onOpen,
}: {
  owner: NativeAiOwner;
  state: AiState;
  onOpen: (uri: string) => void;
}) {
  const styles = useDrawingStyles(themedStyles);
  return (
    <>
      {state.heldResult || state.journal?.result ? (
        <>
          <Image
            accessibilityLabel="Your AI picture"
            source={{ uri: (state.heldResult ?? state.journal?.result)?.uri }}
            resizeMode="contain"
            style={styles.image}
          />
          <Action
            label="Open AI picture"
            onPress={() => {
              const picture = state.heldResult ?? state.journal?.result;
              if (picture) onOpen(picture.uri);
            }}
          />
          {owner.hasHeldResult() ? (
            <Action
              label="Retry saving AI picture"
              disabled={state.busy}
              onPress={() => {
                void owner.retryRetention();
              }}
            />
          ) : null}
        </>
      ) : null}
    </>
  );
}
function AiCredentialSetup({ owner, state }: { owner: NativeAiOwner; state: AiState }) {
  const styles = useDrawingStyles(themedStyles);
  const [kind, setKind] = useState<CredentialKind>('managed');
  const [value, setValue] = useState('');
  const waiting = !!state.journal && !['result', 'failed'].includes(state.journal.phase);
  return (
    <>
      <Text accessibilityRole="header" style={styles.title}>
        AI service setup
      </Text>
      <Text style={styles.text}>
        A credential check sends your code to Splotch, or your OpenAI key through Splotch to OpenAI.
        A key check makes a small provider request. Saved credentials stay in this device’s secure
        storage. OpenAI charges your account for generations using your key.
      </Text>
      <View style={styles.row}>
        {CREDENTIAL_KINDS.map((next) => (
          <AiChoice
            key={next}
            label={next === 'managed' ? 'Use access code' : 'Use my OpenAI key'}
            selected={kind === next}
            disabled={state.busy || waiting || !!state.recovery}
            onPress={() => {
              setValue('');
              setKind(next);
            }}
          />
        ))}
      </View>
      <TextInput
        accessibilityLabel={kind === 'managed' ? 'AI access code' : 'OpenAI API key'}
        value={value}
        onChangeText={setValue}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={MAX_CREDENTIAL_CHARACTERS}
        editable={!state.busy && !waiting && !state.recovery}
        style={styles.input}
      />
      <Action
        label="Verify and save credential"
        disabled={state.busy || waiting || !!state.recovery || !value}
        onPress={() => {
          const pending = value;
          setValue('');
          void owner.setup(kind, pending);
        }}
      />
      <Action
        label="Remove access code"
        disabled={state.busy || waiting || !!state.recovery}
        onPress={() => {
          void owner.removeCredential('managed');
        }}
      />
      <Action
        label="Remove OpenAI key"
        disabled={state.busy || waiting || !!state.recovery}
        onPress={() => {
          void owner.removeCredential('byok');
        }}
      />
      <Action
        label="Refresh AI availability"
        disabled={state.busy || waiting || !!state.recovery}
        onPress={() => {
          void owner.refresh();
        }}
      />
    </>
  );
}
const themedStyles = createDrawingStyles((palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: palette.surface },
    content: { padding: DRAWING_SCALE.space4, gap: DRAWING_SCALE.space3 },
    footer: { padding: DRAWING_SCALE.space4, gap: DRAWING_SCALE.space3, flexShrink: 0 },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: DRAWING_SCALE.space2 },
    title: { color: palette.text, fontSize: DRAWING_SCALE.fontSizeXl, fontWeight: '700' },
    text: { color: palette.text, fontSize: DRAWING_SCALE.fontSizeMd },
    input: {
      minHeight: TOUCH_TARGET,
      padding: DRAWING_SCALE.space3,
      color: palette.text,
      backgroundColor: palette.paper,
      borderRadius: DRAWING_SCALE.radiusMd,
    },
    image: { width: '100%', height: AI_RESULT_HEIGHT_PX },
  })
);

function AiChoice({
  label,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const styles = useDrawingStyles(themedStyles);
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={styles.input}
    >
      <Text style={styles.text}>{label}</Text>
    </Pressable>
  );
}
