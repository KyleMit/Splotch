import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { css, html } from 'react-strict-dom';
import { classifyCredential } from '../ai/credentialKind';
import type { NativeAiOwner } from '../ai/generation';
import type { AiCredentialResult, AiState } from '../ai/sessionContract';
import { aiJournalWaiting } from '../ai/uiState';
import { useDrawingTheme } from '../drawing/DrawingAppearance';
import {
  AI_SETTINGS_COPY as COPY,
  KEY_MESSAGES,
  KEY_STORAGE_NOTE,
  freeCreationsLeft,
} from '../settings/aiSettingsCopy';
import { styles as controlStyles } from './controls';
import { RsdButton } from './RsdButton';
import { RsdIcon } from './RsdIcon';
import { RsdOpenAiKeyHowTo } from './RsdOpenAiKeyHowTo';
import { RsdSettingCard } from './RsdSettingCard';
import { RsdStatusMessage, type MessageStatus } from './RsdStatusMessage';
import { brandColors, colors, dimensions, fonts } from './tokens.css';

// AiKeyManager.svelte's literals, local for the StyleX web compile; native-ai-settings-drift.test.mjs
// reads each back from that source.
const INTRO_BOTTOM_PX = 12;
const INTRO_LINE_HEIGHT = 1.5;
const LABEL_BOTTOM_PX = 4;
const ROW_GAP_PX = 8;
const INPUT_PADDING_PX = { block: 8, inline: 12 } as const;
const SAVED_LETTER_SPACING_PX = 0.5;
const NOTE_TOP_PX = 10;
const ACTIVE_NOTE_TOP_PX = 8;
const NOTE_GAP_PX = 6;
const NOTE_LINE_HEIGHT = 1.45;
const NOTE_ICON_PX = 13;
const NOTE_ICON_TOP_PX = 1;
// The design tokens' --font-mono face for a saved credential: strict.css sets the web's stack, and
// each native platform names its own face.
const MONO_IOS = 'Menlo';
const MONO_ANDROID = 'monospace';

const styles = css.create({
  intro: {
    marginTop: 0,
    marginRight: 0,
    marginBottom: INTRO_BOTTOM_PX,
    marginLeft: 0,
    color: colors.text,
    fontSize: dimensions.fontSizeSm,
    lineHeight: INTRO_LINE_HEIGHT,
  },
  activeIntro: { color: colors.textSoft },
  strong: { color: colors.textStrong },
  label: {
    marginBottom: LABEL_BOTTOM_PX,
    color: colors.text,
    fontSize: dimensions.fontSizeSm,
    fontFamily: fonts.mediumFamily,
    fontWeight: fonts.mediumWeight,
  },
  row: { display: 'flex', flexDirection: 'row', alignItems: 'stretch', gap: ROW_GAP_PX },
  input: {
    boxSizing: 'border-box',
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    margin: 0,
    paddingBlock: INPUT_PADDING_PX.block,
    paddingInline: INPUT_PADDING_PX.inline,
    fontFamily: fonts.family,
    fontSize: dimensions.fontSizeMd,
    color: colors.textStrong,
    backgroundColor: colors.surface,
    borderWidth: dimensions.borderWidth,
    borderStyle: 'solid',
    borderColor: { default: colors.borderWarmStrong, ':focus': brandColors.brand },
    borderRadius: dimensions.radiusSm,
    '::placeholder': { color: colors.textSoft },
  },
  saved: {
    color: colors.textSoft,
    backgroundColor: colors.surfaceHover,
    letterSpacing: SAVED_LETTER_SPACING_PX,
  },
  monoIos: { fontFamily: MONO_IOS },
  monoAndroid: { fontFamily: MONO_ANDROID },
  manager: { marginBottom: dimensions.space6 },
  submit: { flexShrink: 0 },
  note: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: NOTE_GAP_PX,
    marginTop: NOTE_TOP_PX,
  },
  activeNote: { marginTop: ACTIVE_NOTE_TOP_PX },
  noteIcon: { paddingTop: NOTE_ICON_TOP_PX },
  noteText: {
    flexShrink: 1,
    color: colors.successText,
    fontSize: dimensions.fontSizeXs,
    lineHeight: NOTE_LINE_HEIGHT,
  },
  status: { marginTop: dimensions.space3 },
});

type Feedback = Readonly<{ status: MessageStatus; text: string }> | null;

// The shipping words for each outcome; a refusal the server worded keeps its own words.
function credentialFeedback(result: AiCredentialResult): Feedback {
  switch (result.outcome) {
    case 'accepted':
      return { status: 'success', text: KEY_MESSAGES.accepted[result.kind] };
    case 'forgotten':
      return null;
    case 'invalid':
    case 'throttled':
      return { status: 'error', text: result.detail ?? KEY_MESSAGES.invalid[result.kind] };
    case 'checkUnavailable':
      return { status: 'error', text: result.detail ?? KEY_MESSAGES.invalid.checkUnavailable };
    case 'unreachable':
      return { status: 'error', text: KEY_MESSAGES.unreachable };
    case 'saveFailed':
      return { status: 'error', text: KEY_MESSAGES.saveFailed[result.kind] };
    case 'forgetFailed':
      return { status: 'error', text: KEY_MESSAGES.forgetFailed[result.kind] };
  }
}

const KEY_STORAGE =
  KEY_STORAGE_NOTE[Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web'];

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

// Views, not shipping's <p>: React Native lays a text's children out inline, which set the lock
// against the note's first word and wrapped the note under it.
function StorageNote({ active }: { active: boolean }) {
  const ink = useDrawingTheme().successText;
  return (
    <html.div style={[styles.note, active && styles.activeNote]}>
      <html.div aria-hidden style={styles.noteIcon}>
        <RsdIcon name="lock" size={NOTE_ICON_PX} ink={ink} muted={false} />
      </html.div>
      <html.span style={styles.noteText}>{KEY_STORAGE}</html.span>
    </html.div>
  );
}

function Strong({ children }: { children: string }) {
  return <html.strong style={[controlStyles.semiboldText, styles.strong]}>{children}</html.strong>;
}

// What the entry panel says first: the free creations left, or that they are used up or cannot be
// counted right now, then where a key would live.
function AllowanceIntro({ state }: { state: AiState | null }) {
  const lead =
    !state || state.checking ? (
      <Strong>{COPY.checkingAllowance}</Strong>
    ) : state.credential === 'free' && state.remaining !== null && state.remaining > 0 ? (
      <>
        <Strong>{freeCreationsLeft(state.remaining)}</Strong>
        {` ${COPY.afterAllowance}`}
      </>
    ) : state.credential === 'free' && state.remaining === 0 ? (
      <>
        <Strong>{COPY.allowanceUsedUp}</Strong>
        {` ${COPY.addKeyToContinue}`}
      </>
    ) : (
      COPY.allowanceUnavailable
    );
  return (
    <html.p style={styles.intro}>
      {lead}
      {` ${COPY.keyPromise}`}
    </html.p>
  );
}

function SavedCredential({
  kind,
  value,
  disabled,
  onForget,
}: {
  kind: 'byok' | 'managed';
  value: string;
  disabled: boolean;
  onForget: () => void;
}) {
  const byok = kind === 'byok';
  return (
    <>
      <html.p style={[styles.intro, styles.activeIntro]}>
        {byok ? COPY.ownKeyLead : COPY.codeLead}
        <Strong>{byok ? COPY.ownKeyStrong : COPY.codeStrong}</Strong>
        {byok ? COPY.ownKeyTail : COPY.codeTail}
      </html.p>
      <html.span style={styles.label}>{byok ? COPY.keyLabel : COPY.codeLabel}</html.span>
      <html.div style={styles.row}>
        <html.input
          type="text"
          readOnly
          aria-label={byok ? COPY.maskedKeyLabel : COPY.savedCodeLabel}
          value={value}
          style={[
            styles.input,
            styles.saved,
            Platform.OS === 'ios' && styles.monoIos,
            Platform.OS === 'android' && styles.monoAndroid,
          ]}
        />
        <html.div style={styles.submit}>
          <RsdButton variant="danger" disabled={disabled} onPress={onForget}>
            {COPY.forget}
          </RsdButton>
        </html.div>
      </html.div>
      {byok ? <StorageNote active /> : null}
    </>
  );
}

function KeyEntry({
  state,
  disabled,
  onSubmit,
  onOpenKeysPage,
}: {
  state: AiState | null;
  disabled: boolean;
  onSubmit: (value: string) => void;
  onOpenKeysPage: () => void;
}) {
  const [value, setValue] = useState('');
  const result = state?.credentialResult ?? null;
  useEffect(() => {
    if (result?.outcome === 'accepted') setValue('');
  }, [result]);
  const submit = () => {
    if (value.trim() && !disabled) onSubmit(value.trim());
  };
  return (
    <>
      <AllowanceIntro state={state} />
      <RsdOpenAiKeyHowTo onOpenKeysPage={onOpenKeysPage} />
      <html.span style={styles.label}>{COPY.keyLabel}</html.span>
      <html.div style={styles.row}>
        <html.input
          type="text"
          aria-label={COPY.keyLabel}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder={COPY.keyPlaceholder}
          value={value}
          onChange={(event: unknown) => {
            const next = inputValue(event);
            if (next !== null) setValue(next);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit();
          }}
          style={styles.input}
        />
        <html.div style={styles.submit}>
          <RsdButton variant="brand" disabled={!value.trim() || disabled} onPress={submit}>
            {state?.busy && !state.checking ? COPY.checking : COPY.save}
          </RsdButton>
        </html.div>
      </html.div>
      <StorageNote active={false} />
    </>
  );
}

// The shipping AI key manager (AiKeyManager.svelte's enabled panel): with no credential saved, the
// free allowance, the how-to and one field that takes an OpenAI key or an access code; with one
// saved, the masked key or the code and Forget. Saving and forgetting go through the AI owner,
// which checks a credential with the server before the secure vault keeps it. Each visit starts
// with no feedback from an earlier one.
export function RsdAiKeyManager({
  owner,
  state,
  onOpenKeysPage,
}: {
  owner: NativeAiOwner | null;
  state: AiState | null;
  onOpenKeysPage: () => void;
}) {
  const [seen] = useState(() => state?.credentialResult?.id ?? 0);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const result = state?.credentialResult ?? null;
  useEffect(() => {
    if (result && result.id > seen) setFeedback(credentialFeedback(result));
  }, [result, seen]);
  const disabled = !owner || !state || state.busy || aiJournalWaiting(state) || !!state.recovery;
  const credential = state?.credential;
  const submit = (value: string) => {
    const kind = classifyCredential(value);
    if (kind === 'retiredGeminiKey') {
      setFeedback({ status: 'error', text: KEY_MESSAGES.invalid.retiredGeminiKey });
      return;
    }
    setFeedback(null);
    void owner?.setup(kind, value);
  };
  // Shipping's .setting-group margin, which the enabled stack's gap adds to.
  return (
    <html.div style={styles.manager}>
      <RsdSettingCard>
        {(credential === 'byok' || credential === 'managed') && state?.saved ? (
          <SavedCredential
            kind={credential}
            value={state.saved}
            disabled={disabled}
            onForget={() => {
              setFeedback(null);
              void owner?.removeCredential(credential);
            }}
          />
        ) : (
          <KeyEntry
            state={state}
            disabled={disabled}
            onSubmit={submit}
            onOpenKeysPage={onOpenKeysPage}
          />
        )}
      </RsdSettingCard>
      {feedback ? (
        <html.div style={styles.status}>
          <RsdStatusMessage status={feedback.status}>{feedback.text}</RsdStatusMessage>
        </html.div>
      ) : null}
    </html.div>
  );
}
