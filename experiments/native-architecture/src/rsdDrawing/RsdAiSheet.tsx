import { useState } from 'react';
import { css, html } from 'react-strict-dom';
import { NativeDialog } from './NativeDialog';
import { RsdAction, styles } from './controls';
import { colors, dimensions } from './tokens.css';
import {
  AI_STYLES,
  CREDENTIAL_KINDS,
  AI_DISCLOSURE,
  AI_WAIT_NOTICE,
  MAX_CREDENTIAL_CHARACTERS,
  type CredentialKind,
} from '../ai/contract';
import { aiCanGenerate } from '../ai/uiState';
import type { AiState, NativeAiOwner } from '../ai/generation';
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
  visible = state.open,
  onDismiss,
}: {
  owner: NativeAiOwner;
  state: AiState;
  visible?: boolean;
  onDismiss?: () => void;
}) {
  const waiting = !!state.journal && !['result', 'failed'].includes(state.journal.phase);
  return (
    <NativeDialog
      visible={visible}
      onDismiss={onDismiss}
      label="AI picture"
      onClose={owner.close}
      footer={
        <RsdAction
          label="Keep drawing"
          onClick={() => {
            owner.close();
          }}
        />
      }
    >
      <html.div style={styles.dialogContent}>
        <html.h1>{state.gate.open ? 'Grown-ups only' : 'AI picture'}</html.h1>
        {state.gate.open ? (
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
            <RsdAction
              label="Continue to AI"
              disabled={state.gate.locked}
              onClick={owner.gateAnswer}
            />
          </>
        ) : state.authorized ? (
          <>
            <html.span>{AI_DISCLOSURE}</html.span>
            <html.span>{AI_WAIT_NOTICE}</html.span>
            <RsdAction
              label="Check AI allowance"
              disabled={state.busy || waiting}
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
            <html.div role="radiogroup" aria-label="AI art style" style={styles.row}>
              {AI_STYLES.map((style) => (
                <RsdAction
                  key={style}
                  label={`${style} AI style`}
                  text={style}
                  selection="radio"
                  selected={state.style === style}
                  disabled={state.busy || waiting}
                  onClick={() => owner.chooseStyle(style)}
                />
              ))}
            </html.div>
            <RsdAction
              label="Send drawing for AI"
              disabled={!aiCanGenerate(state)}
              onClick={() => {
                void owner.generate();
              }}
            />
            {waiting ? (
              <>
                <html.span>
                  The original drawing is saved. This attempt stays separate from anything you draw
                  next.
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
            ) : null}
            <html.span aria-live="polite">{state.message}</html.span>
            <AiPictures owner={owner} state={state} />
            <AiCredentialSetup owner={owner} state={state} />
          </>
        ) : null}
      </html.div>
    </NativeDialog>
  );
}
function AiPictures({ owner, state }: { owner: NativeAiOwner; state: AiState }) {
  return (
    <>
      {state.heldResult || state.journal?.result ? (
        <>
          <html.img
            alt="Your AI picture"
            src={(state.heldResult ?? state.journal?.result)?.uri}
            style={aiStyles.image}
          />
          {owner.hasHeldResult() ? (
            <RsdAction
              label="Retry saving AI picture"
              disabled={state.busy}
              onClick={() => {
                void owner.retryRetention();
              }}
            />
          ) : null}
        </>
      ) : null}
      {state.pictures.map((picture, index) => (
        <html.img
          key={picture.uri}
          alt={`Saved AI picture ${index + 1}`}
          src={picture.uri}
          style={aiStyles.image}
        />
      ))}
    </>
  );
}
function AiCredentialSetup({ owner, state }: { owner: NativeAiOwner; state: AiState }) {
  const [kind, setKind] = useState<CredentialKind>('managed');
  const [value, setValue] = useState('');
  const waiting = !!state.journal && !['result', 'failed'].includes(state.journal.phase);
  return (
    <>
      <html.h2>AI service setup</html.h2>
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
            disabled={state.busy || waiting}
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
        disabled={state.busy || waiting}
        onChange={(event: unknown) => {
          const next = inputValue(event);
          if (next !== null) setValue(next);
        }}
        style={aiStyles.input}
      />
      <RsdAction
        label="Verify and save credential"
        disabled={state.busy || waiting || !value}
        onClick={() => {
          const pending = value;
          setValue('');
          void owner.setup(kind, pending);
        }}
      />
      <RsdAction
        label="Remove access code"
        disabled={state.busy || waiting}
        onClick={() => {
          void owner.removeCredential('managed');
        }}
      />
      <RsdAction
        label="Remove OpenAI key"
        disabled={state.busy || waiting}
        onClick={() => {
          void owner.removeCredential('byok');
        }}
      />
      <RsdAction
        label="Refresh AI availability"
        disabled={state.busy}
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
