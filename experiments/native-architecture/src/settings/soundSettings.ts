import {
  DEFAULT_DRAWING_CONTROL_PREFERENCES,
  type DrawingControlPreferences,
} from './drawingControlPreferences';
import { DEFAULT_COLORING_BOOK_ENABLED } from './coloringBook';
import { isSoundVolume } from './soundVolume';
import { DEFAULT_TOOLBAR_STYLE, isToolbarStyle, type ToolbarStyle } from './toolbarStyle';
import {
  DEFAULT_APPEARANCE,
  isAppearancePreference,
  type AppearancePreference,
} from './appearance';
import { isStrokeWidth, type StrokeWidth } from '../drawing/strokeWidth';
import { DEFAULT_COLOR_SETTINGS } from '../drawing/palette';
import { createPaintActions } from './paintSettings';
import { DEFAULT_PARENT_PREFERENCES } from '../platform/parentDefaults';
import { defaultOrientation } from '../platform/orientationDefault';
import { isOrientationChoice, type OrientationChoice } from './orientation';
import { DEFAULT_SAVE_ON_DELETE_ENABLED } from './saveOnDelete';
import { PROTECTED_PARENT_POLICIES } from '../parentCenter/parentPolicy';
import { isButtonScale } from './buttonSize';
import { isReduceMotionPreference, type ReduceMotionPreference } from './reduceMotion';
import { WHATS_NEW_STAMP } from './whatsNewStamp';
import { DEFAULT_PENCIL_SETTINGS } from './pencilEraser';
import { DEFAULT_AI_PREFERENCES, createAiActions } from './aiPreferences';
import { createParentSaves } from './parentSaves';
import { createLatestWriter, createSettingsReset, createWriteQueue } from './settingsWriteQueue';
import {
  readStoredSettings,
  UNREAD_SETTINGS_MESSAGES,
  type SettingsReadFailure,
} from './settingsRead';
import {
  DEFAULT_ACCESSIBILITY_SETTINGS,
  DEFAULT_SOUND_SOURCE_SETTINGS,
  DEFAULT_WIDTH_SETTINGS,
  sessionPaint,
  snapshot,
  SOUND_SETTINGS_VERSION,
  type Choices,
  type ColorSettings,
  type SoundSettings,
  type SoundSettingsState,
  type SoundSettingsStorage,
  type SoundSourceSettings,
} from './soundSettingsCodec';
export {
  MAX_SETTINGS_BYTES,
  parseSoundSettings,
  type SoundSettings,
  type SoundSettingsState,
  type SoundSettingsStorage,
} from './soundSettingsCodec';

const DEFAULT_SOUND_ENABLED = true;

export function initialSoundSettingsState(): SoundSettingsState {
  return {
    status: 'loading',
    coloringBookEnabled: DEFAULT_COLORING_BOOK_ENABLED,
    soundEnabled: false,
    ...DEFAULT_SOUND_SOURCE_SETTINGS,
    ...DEFAULT_DRAWING_CONTROL_PREFERENCES,
    ...DEFAULT_WIDTH_SETTINGS,
    ...DEFAULT_COLOR_SETTINGS,
    ...DEFAULT_PARENT_PREFERENCES,
    appearance: DEFAULT_APPEARANCE,
    toolbarStyle: DEFAULT_TOOLBAR_STYLE,
    orientation: defaultOrientation(),
    saveOnDeleteEnabled: DEFAULT_SAVE_ON_DELETE_ENABLED,
    ...DEFAULT_ACCESSIBILITY_SETTINGS,
    ...DEFAULT_PENCIL_SETTINGS,
    ...DEFAULT_AI_PREFERENCES,
    message: '',
  };
}

function defaultSoundSettings(): SoundSettings {
  return {
    version: SOUND_SETTINGS_VERSION,
    coloringBookEnabled: DEFAULT_COLORING_BOOK_ENABLED,
    soundEnabled: DEFAULT_SOUND_ENABLED,
    ...DEFAULT_SOUND_SOURCE_SETTINGS,
    ...DEFAULT_DRAWING_CONTROL_PREFERENCES,
    ...DEFAULT_WIDTH_SETTINGS,
    ...DEFAULT_PARENT_PREFERENCES,
    appearance: DEFAULT_APPEARANCE,
    toolbarStyle: DEFAULT_TOOLBAR_STYLE,
    orientation: defaultOrientation(),
    saveOnDeleteEnabled: DEFAULT_SAVE_ON_DELETE_ENABLED,
    ...DEFAULT_ACCESSIBILITY_SETTINGS,
    ...DEFAULT_PENCIL_SETTINGS,
    ...DEFAULT_AI_PREFERENCES,
  };
}

const STILL_UNAVAILABLE_MESSAGE =
  'Settings still could not be read. AI stays off and protection stays active.';

function unreadSoundSettingsState(
  paint: ColorSettings,
  failure: SettingsReadFailure
): SoundSettingsState {
  return {
    status: 'ready',
    coloringBookEnabled: false,
    soundEnabled: false,
    ...DEFAULT_SOUND_SOURCE_SETTINGS,
    ...DEFAULT_DRAWING_CONTROL_PREFERENCES,
    ...DEFAULT_WIDTH_SETTINGS,
    ...paint,
    aiEnabled: false,
    parentPolicies: PROTECTED_PARENT_POLICIES,
    appearance: DEFAULT_APPEARANCE,
    toolbarStyle: DEFAULT_TOOLBAR_STYLE,
    orientation: defaultOrientation(),
    saveOnDeleteEnabled: DEFAULT_SAVE_ON_DELETE_ENABLED,
    ...DEFAULT_ACCESSIBILITY_SETTINGS,
    ...DEFAULT_PENCIL_SETTINGS,
    ...DEFAULT_AI_PREFERENCES,
    saved: false,
    message: UNREAD_SETTINGS_MESSAGES[failure],
  };
}

export type PreferenceActionContext = {
  getState: () => SoundSettingsState;
  isDisposed: () => boolean;
  hasReadFailed: () => boolean;
  publish: (state: SoundSettingsState) => void;
  persist: (settings: SoundSettings) => Promise<void>;
};

// What the app records about itself rather than a choice a parent makes.
type SettingsMetadata = Partial<Pick<Choices, 'whatsNewSeen' | 'applePencilSeen'>>;

function unrecorded(state: SoundSettingsState, metadata: SettingsMetadata): SettingsMetadata {
  const { whatsNewSeen, applePencilSeen } = metadata;
  return {
    ...(whatsNewSeen !== undefined && whatsNewSeen !== state.whatsNewSeen ? { whatsNewSeen } : {}),
    ...(applePencilSeen && !state.applePencilSeen ? { applePencilSeen } : {}),
  };
}

// Opening What's New or the first Apple Pencil double-tap can happen while settings load or a
// Parent Center save holds the record; the record then waits for it instead of being dropped.
// Metadata is written with the choices rather than through persist, so a failed Parent Center
// save stays pending for its retry. The owner awaits flushMetadata after each save it finishes.
function createMetadataActions({
  getState,
  isDisposed,
  hasReadFailed,
  publish,
  writeLatest,
}: PreferenceActionContext & {
  writeLatest: () => Promise<void>;
}) {
  let queued: SettingsMetadata = {};
  async function record(metadata: SettingsMetadata) {
    if (isDisposed()) return;
    const state = getState();
    const missing = unrecorded(state, { ...queued, ...metadata });
    queued = state.status === 'ready' ? {} : missing;
    if (state.status !== 'ready' || Object.keys(missing).length === 0) return;
    publish({ ...state, ...missing });
    if (hasReadFailed()) return;
    await writeLatest();
  }
  async function flushMetadata() {
    if (isDisposed() || getState().status !== 'ready' || Object.keys(queued).length === 0) return;
    const pending = queued;
    queued = {};
    await record(pending);
  }
  return {
    actions: {
      markWhatsNewSeen: () => record({ whatsNewSeen: WHATS_NEW_STAMP }),
      markApplePencilSeen: () => record({ applePencilSeen: true }),
    },
    flushMetadata,
  };
}

// One validated choice: dropped while settings load or a Parent Center save holds the record, kept
// for the session alone after a failed read, and written otherwise.
function createChoiceSetter({
  getState,
  isDisposed,
  hasReadFailed,
  publish,
  persist,
}: PreferenceActionContext) {
  return async function choose(choice: Partial<Choices>, valid: boolean, invalid: string) {
    const state = getState();
    if (isDisposed() || state.status !== 'ready') return;
    if (!valid) throw new Error(invalid);
    if (hasReadFailed()) {
      publish({ ...state, ...choice });
      return;
    }
    await persist({ ...snapshot(state), ...choice });
  };
}

type Choose = ReturnType<typeof createChoiceSetter>;

function createAccessibilityActions(choose: Choose) {
  return {
    setButtonScale: (buttonScale: number) =>
      choose({ buttonScale }, isButtonScale(buttonScale), 'Button Size choice is invalid.'),
    setReduceMotion: (reduceMotion: ReduceMotionPreference) =>
      choose(
        { reduceMotion },
        isReduceMotionPreference(reduceMotion),
        'Reduce Motion choice is invalid.'
      ),
  };
}

function createDrawingPreferenceActions({
  getState,
  isDisposed,
  hasReadFailed,
  publish,
  persist,
}: PreferenceActionContext) {
  async function setControl(key: keyof DrawingControlPreferences, enabled: boolean) {
    const state = getState();
    if (isDisposed() || state.status !== 'ready') return;
    if (typeof enabled !== 'boolean') throw new Error('Drawing control choice is invalid.');
    if (hasReadFailed()) {
      publish({ ...state, [key]: enabled });
      return;
    }
    await persist({ ...snapshot(state), [key]: enabled });
  }
  return {
    setUndoButtonEnabled: (enabled: boolean) => setControl('undoButtonEnabled', enabled),
    setStrokeWidthControlEnabled: (enabled: boolean) =>
      setControl('strokeWidthControlEnabled', enabled),
    setToolDrawerEnabled: (enabled: boolean) => setControl('toolDrawerEnabled', enabled),
    setScreenshotEnabled: (enabled: boolean) => setControl('screenshotEnabled', enabled),
    async setColoringBookEnabled(coloringBookEnabled: boolean) {
      const state = getState();
      if (isDisposed() || state.status !== 'ready') return;
      if (typeof coloringBookEnabled !== 'boolean')
        throw new Error('Coloring book choice is invalid.');
      if (hasReadFailed()) {
        publish({ ...state, coloringBookEnabled });
        return;
      }
      await persist({ ...snapshot(state), coloringBookEnabled });
    },
    async setSaveOnDeleteEnabled(saveOnDeleteEnabled: boolean) {
      const state = getState();
      if (isDisposed() || state.status !== 'ready') return;
      if (typeof saveOnDeleteEnabled !== 'boolean')
        throw new Error('Auto-Save on Delete choice is invalid.');
      if (hasReadFailed()) {
        publish({ ...state, saveOnDeleteEnabled });
        return;
      }
      await persist({ ...snapshot(state), saveOnDeleteEnabled });
    },
    async setEnabled(soundEnabled: boolean) {
      const state = getState();
      if (isDisposed() || state.status !== 'ready') return;
      if (typeof soundEnabled !== 'boolean') throw new Error('Sound choice is invalid.');
      if (hasReadFailed()) {
        publish({ ...state, soundEnabled });
        return;
      }
      await persist({ ...snapshot(state), soundEnabled });
    },
    async setWidth(tool: 'drawing' | 'eraser', width: StrokeWidth) {
      const state = getState();
      if (isDisposed() || state.status !== 'ready') return;
      if ((tool !== 'drawing' && tool !== 'eraser') || !isStrokeWidth(width))
        throw new Error('Drawing width choice is invalid.');
      const choices = {
        strokeWidth: tool === 'drawing' ? width : state.strokeWidth,
        eraserWidth: tool === 'eraser' ? width : state.eraserWidth,
      };
      if (hasReadFailed()) {
        publish({ ...state, ...choices });
        return;
      }
      await persist({ ...snapshot(state), ...choices });
    },
    async setAppearance(appearance: AppearancePreference) {
      const state = getState();
      if (isDisposed() || state.status !== 'ready') return;
      if (!isAppearancePreference(appearance)) throw new Error('Appearance choice is invalid.');
      if (hasReadFailed()) {
        publish({ ...state, appearance });
        return;
      }
      await persist({ ...snapshot(state), appearance });
    },
    async setOrientation(orientation: OrientationChoice) {
      const state = getState();
      if (isDisposed() || state.status !== 'ready') return;
      if (!isOrientationChoice(orientation)) throw new Error('Orientation choice is invalid.');
      if (hasReadFailed()) {
        publish({ ...state, orientation });
        return;
      }
      await persist({ ...snapshot(state), orientation });
    },
  };
}

function createSoundActions(choose: Choose) {
  const source = (choice: Partial<SoundSourceSettings>, enabled: boolean) =>
    choose(choice, typeof enabled === 'boolean', 'Sound source choice is invalid.');
  return {
    setSoundVolume: (soundVolume: number) =>
      choose({ soundVolume }, isSoundVolume(soundVolume), 'Volume is invalid.'),
    setDrawingSoundEnabled: (drawingSoundEnabled: boolean) =>
      source({ drawingSoundEnabled }, drawingSoundEnabled),
    setDeleteSoundEnabled: (deleteSoundEnabled: boolean) =>
      source({ deleteSoundEnabled }, deleteSoundEnabled),
  };
}

function createPencilActions(choose: Choose) {
  return {
    setPencilEraserEnabled: (pencilEraserEnabled: boolean) =>
      choose(
        { pencilEraserEnabled },
        typeof pencilEraserEnabled === 'boolean',
        'Apple Pencil choice is invalid.'
      ),
  };
}

function createPreferenceActions(context: PreferenceActionContext) {
  const choose = createChoiceSetter(context);
  return {
    ...createDrawingPreferenceActions(context),
    ...createPaintActions(context),
    ...createSoundActions(choose),
    ...createPencilActions(choose),
    ...createAiActions(choose),
    ...createAccessibilityActions(choose),
    setToolbarStyle: (toolbarStyle: ToolbarStyle) =>
      choose({ toolbarStyle }, isToolbarStyle(toolbarStyle), 'Button style choice is invalid.'),
  };
}

export function createSoundSettings(
  storage: SoundSettingsStorage,
  onChange: (state: SoundSettingsState) => void
) {
  let state = initialSoundSettingsState();
  let disposed = false;
  let readFailure: SettingsReadFailure | null = null;
  function publish(next: SoundSettingsState) {
    if (disposed) return;
    state = next;
    onChange(state);
  }
  const serialize = createWriteQueue();
  const writeLatest = createLatestWriter(storage, serialize, {
    getState: () => state,
    isDisposed: () => disposed,
    publish,
    hasPendingParent: () => parent.hasPending(),
    encode: (current) => JSON.stringify(snapshot(current)),
  });
  // The choice shows at once, with nothing left to retry, as shipping's synchronous storage
  // shows it; a write that does not land brings the retry back.
  async function persist(settings: SoundSettings) {
    parent.clearPending();
    const { version: _version, ...choices } = settings;
    publish({ status: 'ready', ...choices, ...sessionPaint(state), saved: true, message: '' });
    await writeLatest();
    await metadata.flushMetadata();
  }
  const actionContext: PreferenceActionContext = {
    getState: () => state,
    isDisposed: () => disposed,
    hasReadFailed: () => readFailure !== null,
    publish,
    persist,
  };
  const parent = createParentSaves({
    storage: {
      read: storage.read,
      write: (snapshot) => serialize(() => storage.write(snapshot)),
    },
    ...actionContext,
    flushMetadata: () => metadata.flushMetadata(),
  });
  const metadata = createMetadataActions({ ...actionContext, writeLatest });
  const reset = createSettingsReset(storage, serialize, {
    ...actionContext,
    defaults: () => snapshot(defaultSoundSettings()),
    getReadFailure: () => readFailure,
    recovered() {
      readFailure = null;
    },
    unreadState: () => unreadSoundSettingsState(sessionPaint(state), 'malformed'),
    paint: () => sessionPaint(state),
    flushMetadata: metadata.flushMetadata,
  });
  return {
    async load() {
      if (disposed || state.status !== 'loading') return;
      const read = await readStoredSettings(storage);
      if (read.kind === 'failed') {
        readFailure = read.failure;
        publish(unreadSoundSettingsState(sessionPaint(state), read.failure));
      } else {
        const { version: _version, ...choices } = read.settings ?? defaultSoundSettings();
        publish({ status: 'ready', ...choices, ...sessionPaint(state), saved: true, message: '' });
      }
      await metadata.flushMetadata();
    },
    ...createPreferenceActions(actionContext),
    ...metadata.actions,
    async retrySave() {
      if (disposed || state.status !== 'ready' || state.saved) return;
      if (parent.aiSavePending()) {
        await parent.retryAiSave();
        return;
      }
      if (parent.hasPending()) {
        publish({ ...state, message: 'Open Parent Center to retry saving its choices.' });
        return;
      }
      if (readFailure === 'unavailable') {
        publish({ ...state, message: 'Read settings again before saving Parent Center choices.' });
        return;
      }
      if (readFailure !== null) return;
      await persist(snapshot(state));
    },
    setParentPreferences: parent.setParentPreferences,
    setAiEnabled: parent.setAiEnabled,
    retryAiSave: parent.retryAiSave,
    aiSaveFailed: parent.aiSaveFailed,
    retryParentSave: parent.retryParentSave,
    async retryRead() {
      if (disposed || state.status !== 'ready' || readFailure === null) return;
      const read = await readStoredSettings(storage);
      if (read.kind === 'failed') {
        readFailure = read.failure;
        publish({
          ...state,
          message:
            read.failure === 'unavailable'
              ? STILL_UNAVAILABLE_MESSAGE
              : UNREAD_SETTINGS_MESSAGES[read.failure],
        });
        return;
      }
      const { version: _version, ...choices } = read.settings ?? {
        ...snapshot(state),
        ...DEFAULT_PARENT_PREFERENCES,
      };
      readFailure = null;
      publish({ status: 'ready', ...choices, ...sessionPaint(state), saved: true, message: '' });
    },
    ...reset,
    // Ordinary retries cannot replace an unreadable record without the parent's explicit reset.
    retryCanRecover: () => readFailure !== 'malformed' && readFailure !== 'newer',
    canEditParent: () => !disposed && readFailure === null && state.status === 'ready',
    dispose() {
      disposed = true;
    },
  };
}
