import { useState } from 'react';
import { css, html } from 'react-strict-dom';
import { NativeDialog } from './NativeDialog';
import { RsdAction, styles } from './controls';
import { colors, dimensions } from './tokens.css';
import {
  CREDENTIAL_KINDS,
  AI_DISCLOSURE,
  AI_MINIMIZED_WAIT_NOTICE,
  MAX_CREDENTIAL_CHARACTERS,
  type CredentialKind,
} from '../ai/contract';
import { aiCanGenerate, aiJournalWaiting, aiRun, type AiRun } from '../ai/uiState';
import type { AiProgressOwner } from '../ai/aiProgress';
import { RsdAiRunPolaroid } from './RsdAiRunPolaroid';
import type { AiState, NativeAiOwner } from '../ai/generation';
import { useAiPictureViewer } from '../ai/useAiPictureViewer';
import { RsdAiPictureView } from './RsdAiPictureView';
import { AiReportAction, AiPictureReport, AiRefusalReportAction } from '../ai/AiPictureReport';
import { RsdAiStyleChoices } from './RsdAiStyleChoices';
import { AiRecoveryActions } from '../ai/AiRecoveryActions';
import { CurrentDrawingPreview } from '../ai/CurrentDrawingPreview';
import type { Drawing } from '../drawing/model';
import type { ArtworkMap } from '../offlineLibrary/artworkContext';
function inputValue(event: unknown) {
  if (
    !event ||
    typeof event !== 'object' ||
    !('target' in event) ||
    !event.target ||
    typeof event.target !== 'object' ||
    !('value' in event.target) ||
    typeof event.target.value !== 'string'
  )
    return null;
  return event.target.value;
}
export function RsdAiSheet({
  owner,
  state,
  drawing,
  artwork,
  progress,
  visible = state.open,
  onDismiss,
}: {
  owner: NativeAiOwner;
  state: AiState;
  drawing: Drawing;
  artwork: ArtworkMap;
  progress: AiProgressOwner;
  visible?: boolean;
  onDismiss?: () => void;
}) {
  const waiting = aiJournalWaiting(state);
  const run = aiRun(state);
  const framed = run && (run.phase === 'waiting' || run.picture) ? run : null;
  const viewer = useAiPictureViewer(state, visible);
  const reporting = state.report && !['idle', 'gating'].includes(state.report.phase);
  // While a sent picture is being made, leaving tucks it into the canvas corner
  // instead of closing the sheet: the run keeps going and the corner print is the
  // way back to it.
  const keepDrawing = waiting ? owner.minimize : owner.close;
  return (
    <NativeDialog
      visible={visible}
      onDismiss={onDismiss}
      label="AI picture"
      onClose={reporting ? owner.cancelPictureReport : viewer.picture ? viewer.back : keepDrawing}
      footer={
        <html.div style={styles.row}>
          {reporting || viewer.picture ? (
            <RsdAction
              label="Back to AI pictures"
              onClick={reporting ? owner.cancelPictureReport : viewer.back}
            />
          ) : null}
          <RsdAction label="Keep drawing" onClick={keepDrawing} />
        </html.div>
      }
    >
      <html.div style={styles.dialogContent}>
        <html.h1 style={styles.boldText}>
          {state.gate.open ? 'Grown-ups only' : viewer.picture ? 'AI picture view' : 'AI picture'}
        </html.h1>
        {state.gate.open ? (
          <RsdAiParentalGate owner={owner} state={state} />
        ) : reporting ? (
          <AiPictureReport owner={owner} report={state.report} />
        ) : viewer.picture ? (
          <>
            <RsdAiPictureView owner={owner} state={state} picture={viewer.picture} />
            <AiReportAction owner={owner} uri={viewer.picture.uri} />
          </>
        ) : state.authorized ? (
          <>
            {framed ? (
              <AiCurrentRun
                owner={owner}
                state={state}
                run={framed}
                progress={progress}
                onOpen={viewer.open}
              />
            ) : null}
            <html.span>{AI_DISCLOSURE}</html.span>
            <html.span>{AI_MINIMIZED_WAIT_NOTICE}</html.span>
            <RsdAction
              label="Check AI allowance"
              disabled={state.busy || waiting || !!state.recovery}
              onClick={owner.refresh}
            />
            <html.span>
              {state.credential === 'free'
                ? state.remaining === null
                  ? 'Checking free allowance…'
                  : `${state.remaining} free pictures remaining`
                : state.credential === 'unavailable'
                  ? 'Secure AI setup unavailable'
                  : state.credential === 'byok'
                    ? 'Using your OpenAI key'
                    : 'Using your access code'}
            </html.span>
            <RsdAiStyleChoices
              selected={state.style}
              disabled={state.busy || waiting || !!state.recovery}
              onChoose={owner.chooseStyle}
            />
            {visible && state.open ? (
              <>
                <html.span>Current drawing</html.span>
                <CurrentDrawingPreview drawing={drawing} artwork={artwork} />
              </>
            ) : null}
            <RsdAction
              label="Send drawing for AI"
              disabled={!aiCanGenerate(state)}
              onClick={() => {
                void owner.generate();
              }}
            />
            <AiRecoveryActions owner={owner} state={state} waiting={waiting} />
            {waiting ? <AiWaitingActions owner={owner} state={state} /> : null}
            <html.span aria-live="polite">{state.message}</html.span>
            <AiRefusalReportAction owner={owner} state={state} />
            <AiPictures owner={owner} state={state} framed={!!framed} onOpen={viewer.open} />
            <AiCredentialSetup owner={owner} state={state} />
          </>
        ) : null}
      </html.div>
    </NativeDialog>
  );
}
function AiWaitingActions({ owner, state }: { owner: NativeAiOwner; state: AiState }) {
  return (
    <>
      <html.span>
        The original drawing is saved. This attempt stays separate from anything you draw next.
      </html.span>
      <RsdAction
        label="Check waiting picture"
        disabled={state.busy || !state.journal?.jobId}
        onClick={owner.resume}
      />
      <RsdAction
        label="Release expired attempt"
        disabled={state.busy}
        onClick={owner.releaseExpired}
      />
    </>
  );
}
function RsdAiParentalGate({ owner, state }: { owner: NativeAiOwner; state: AiState }) {
  return (
    <>
      <html.span>Solve this multiplication problem to continue.</html.span>
      <html.span>
        {state.gate.x} × {state.gate.y}
      </html.span>
      <html.input
        aria-label="AI answer"
        value={state.gate.input}
        inputMode="numeric"
        disabled={state.gate.locked}
        onChange={(event: unknown) => {
          const next = inputValue(event);
          if (next !== null) owner.gateInput(next);
        }}
        style={aiStyles.input}
      />
      <html.span aria-live="polite">{state.gate.message}</html.span>
      <RsdAction label="Continue to AI" disabled={state.gate.locked} onClick={owner.gateAnswer} />
    </>
  );
}
function AiCurrentRun({
  owner,
  state,
  run,
  progress,
  onOpen,
}: {
  owner: NativeAiOwner;
  state: AiState;
  run: AiRun;
  progress: AiProgressOwner;
  onOpen: (uri: string) => void;
}) {
  const picture = run.picture;
  return (
    <>
      <RsdAiRunPolaroid key={run.id} run={run} progress={progress} />
      {picture ? (
        <>
          <RsdAction label="Open AI picture" onClick={() => onOpen(picture.uri)} />
          <RetryRetention owner={owner} state={state} />
        </>
      ) : null}
    </>
  );
}
function RetryRetention({ owner, state }: { owner: NativeAiOwner; state: AiState }) {
  return owner.hasHeldResult() ? (
    <RsdAction
      label="Retry saving AI picture"
      disabled={state.busy}
      onClick={() => {
        void owner.retryRetention();
      }}
    />
  ) : null;
}
function AiPictures({
  owner,
  state,
  framed,
  onOpen,
}: {
  owner: NativeAiOwner;
  state: AiState;
  framed: boolean;
  onOpen: (uri: string) => void;
}) {
  return (
    <>
      {!framed && (state.heldResult || state.journal?.result) ? (
        <>
          <html.img
            alt="Your AI picture"
            src={(state.heldResult ?? state.journal?.result)?.uri}
            style={aiStyles.image}
          />
          <RsdAction
            label="Open AI picture"
            onClick={() => {
              const picture = state.heldResult ?? state.journal?.result;
              if (picture) onOpen(picture.uri);
            }}
          />
          <RetryRetention owner={owner} state={state} />
        </>
      ) : null}
      {state.pictures.map((picture, index) => (
        <html.div key={picture.uri}>
          <html.img
            alt={`Saved AI picture ${index + 1}`}
            src={picture.uri}
            style={aiStyles.image}
          />
          <RsdAction
            label={`Open saved AI picture ${index + 1}`}
            onClick={() => onOpen(picture.uri)}
          />
        </html.div>
      ))}
    </>
  );
}
function AiCredentialSetup({ owner, state }: { owner: NativeAiOwner; state: AiState }) {
  const [kind, setKind] = useState<CredentialKind>('managed');
  const [value, setValue] = useState('');
  const waiting = aiJournalWaiting(state);
  return (
    <>
      <html.h2 style={styles.boldText}>AI service setup</html.h2>
      <html.span>
        A credential check sends your code to Splotch, or your OpenAI key through Splotch to OpenAI.
        A key check makes a small provider request. Saved credentials stay in this device’s secure
        storage. OpenAI charges your account for generations using your key.
      </html.span>
      <html.div role="radiogroup" aria-label="AI credential kind" style={styles.row}>
        {CREDENTIAL_KINDS.map((next) => (
          <RsdAction
            key={next}
            label={next === 'managed' ? 'Use access code' : 'Use my OpenAI key'}
            selection="radio"
            selected={kind === next}
            disabled={state.busy || waiting || !!state.recovery}
            onClick={() => {
              setValue('');
              setKind(next);
            }}
          />
        ))}
      </html.div>
      <html.input
        aria-label={kind === 'managed' ? 'AI access code' : 'OpenAI API key'}
        type="password"
        autoComplete="off"
        value={value}
        maxLength={MAX_CREDENTIAL_CHARACTERS}
        disabled={state.busy || waiting || !!state.recovery}
        onChange={(event: unknown) => {
          const next = inputValue(event);
          if (next !== null) setValue(next);
        }}
        style={aiStyles.input}
      />
      <RsdAction
        label="Verify and save credential"
        disabled={state.busy || waiting || !!state.recovery || !value}
        onClick={() => {
          const pending = value;
          setValue('');
          void owner.setup(kind, pending);
        }}
      />
      <RsdAction
        label="Remove access code"
        disabled={state.busy || waiting || !!state.recovery}
        onClick={() => {
          void owner.removeCredential('managed');
        }}
      />
      <RsdAction
        label="Remove OpenAI key"
        disabled={state.busy || waiting || !!state.recovery}
        onClick={() => {
          void owner.removeCredential('byok');
        }}
      />
      <RsdAction
        label="Refresh AI availability"
        disabled={state.busy || waiting || !!state.recovery}
        onClick={() => {
          void owner.refresh();
        }}
      />
    </>
  );
}
const aiStyles = css.create({
  input: {
    minHeight: dimensions.touchTarget,
    padding: dimensions.space3,
    borderRadius: dimensions.radiusMd,
    color: colors.text,
    backgroundColor: colors.paper,
    fontSize: dimensions.fontSizeMd,
  },
  image: { width: '100%', height: dimensions.aiResultHeight, objectFit: 'contain' },
});
