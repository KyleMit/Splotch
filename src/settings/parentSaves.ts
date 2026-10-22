import {
  PARENT_FEATURES,
  arePoliciesAvailable,
  isParentPolicies,
  type ParentPreferences,
} from '../parentCenter/parentPolicy';
import { PARENT_PLATFORM } from '../platform/parentPlatform';
import {
  sessionPaint,
  snapshot,
  type SoundSettings,
  type SoundSettingsState,
  type SoundSettingsStorage,
} from './soundSettingsCodec';

// What a save of the stored parent preferences says. AI Art's master switch is stored beside the
// Parent Center policies but is its own section's choice, so it speaks for itself.
const PARENT_SAVE_COPY = {
  saving: 'Saving Parent Center choices…',
  saved: 'Parent Center choices saved.',
  failed:
    'Parent Center choices were not saved. Previous protection is still active. Retry saving.',
};
const AI_SAVE_COPY = {
  saving: 'Saving the AI Art choice…',
  saved: 'AI Art choice saved.',
  failed: 'The AI Art choice was not saved. AI stays as it was. Retry saving.',
};
type ParentSaveCopy = typeof PARENT_SAVE_COPY;

// A Parent Center choice the platform's store rules forbid never reaches storage.
function isSavableParentPreferences(choices: ParentPreferences) {
  return (
    typeof choices.aiEnabled === 'boolean' &&
    isParentPolicies(choices.parentPolicies) &&
    arePoliciesAvailable(choices.parentPolicies, PARENT_PLATFORM)
  );
}

type ParentSaveContext = {
  storage: SoundSettingsStorage;
  getState: () => SoundSettingsState;
  isDisposed: () => boolean;
  hasReadFailed: () => boolean;
  publish: (state: SoundSettingsState) => void;
  flushMetadata: () => Promise<void>;
};

// The writes of the stored parent preferences: Parent Center's policies and AI Art's switch. A
// failed one stays pending, shown at its previous value, until its own section retries it.
export function createParentSaves({
  storage,
  getState,
  isDisposed,
  hasReadFailed,
  publish,
  flushMetadata,
}: ParentSaveContext) {
  let pending: SoundSettings | null = null;
  const editable = () => !isDisposed() && getState().status === 'ready' && !hasReadFailed();
  async function persistParent(settings: SoundSettings, copy: ParentSaveCopy) {
    const state = getState();
    if (state.status !== 'ready' || hasReadFailed()) return;
    pending = settings;
    const { version: _version, ...choices } = snapshot(state);
    publish({ status: 'saving', ...choices, ...sessionPaint(state), message: copy.saving });
    try {
      // Through snapshot, so the policies land in their saved order however the caller built them.
      await storage.write(JSON.stringify(snapshot(settings)));
      const { version: _nextVersion, ...next } = settings;
      pending = null;
      publish({
        status: 'ready',
        ...next,
        ...sessionPaint(getState()),
        saved: true,
        message: copy.saved,
      });
    } catch {
      publish({
        status: 'ready',
        ...choices,
        ...sessionPaint(getState()),
        saved: false,
        message: copy.failed,
      });
    }
    await flushMetadata();
  }
  // A pending save that changes only the AI switch, which AI Art retries itself.
  function aiSavePending() {
    const saving = pending;
    const state = getState();
    return (
      saving !== null &&
      state.status === 'ready' &&
      PARENT_FEATURES.every(
        (feature) => saving.parentPolicies[feature] === state.parentPolicies[feature]
      )
    );
  }
  async function retryAiSave() {
    if (!editable() || !pending || !aiSavePending()) return;
    await persistParent({ ...snapshot(getState()), aiEnabled: pending.aiEnabled }, AI_SAVE_COPY);
  }
  return {
    hasPending: () => pending !== null,
    clearPending() {
      pending = null;
    },
    aiSavePending,
    retryAiSave,
    aiSaveFailed: () => {
      const state = getState();
      return !isDisposed() && state.status === 'ready' && !state.saved && aiSavePending();
    },
    async setParentPreferences(choices: ParentPreferences) {
      if (!editable()) return;
      if (!isSavableParentPreferences(choices)) throw new Error('Parent Center choice is invalid.');
      await persistParent({ ...snapshot(getState()), ...choices }, PARENT_SAVE_COPY);
    },
    async setAiEnabled(aiEnabled: boolean) {
      if (!editable()) return;
      if (typeof aiEnabled !== 'boolean') throw new Error('AI Art choice is invalid.');
      await persistParent({ ...snapshot(getState()), aiEnabled }, AI_SAVE_COPY);
    },
    async retryParentSave() {
      if (!editable() || !pending) return;
      await persistParent(
        {
          ...snapshot(getState()),
          aiEnabled: pending.aiEnabled,
          parentPolicies: pending.parentPolicies,
        },
        PARENT_SAVE_COPY
      );
    },
  };
}
