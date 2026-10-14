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
import {
  DEFAULT_COLOR_SETTINGS,
  isCustomColor,
  isPaintColor,
  rememberColor,
  type PaintColor,
} from '../drawing/palette';
import { DEFAULT_PARENT_PREFERENCES } from '../platform/parentDefaults';
import { defaultOrientation } from '../platform/orientationDefault';
import { isOrientationChoice, type OrientationChoice } from './orientation';
import { DEFAULT_SAVE_ON_DELETE_ENABLED } from './saveOnDelete';
import { PROTECTED_PARENT_POLICIES } from '../parentCenter/parentPolicy';
import { isButtonScale } from './buttonSize';
import { isReduceMotionPreference, type ReduceMotionPreference } from './reduceMotion';
import { WHATS_NEW_STAMP } from './whatsNew';
import { DEFAULT_PENCIL_SETTINGS } from './pencilEraser';
import { DEFAULT_AI_PREFERENCES, createAiActions } from './aiPreferences';
import { createParentSaves } from './parentSaves';
import {
  DEFAULT_ACCESSIBILITY_SETTINGS,
  DEFAULT_SOUND_SOURCE_SETTINGS,
  DEFAULT_WIDTH_SETTINGS,
  parseSoundSettings,
  sessionPaint,
  snapshot,
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
    version: 16,
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

function unreadSoundSettingsState(paint: ColorSettings): SoundSettingsState {
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
    message:
      'Drawing settings could not be read. Sound is off. Your choices work for this session. Choose your settings and retry saving.',
  };
}

type PreferenceActionContext = {
  getState: () => SoundSettingsState;
  isDisposed: () => boolean;
  hasReadFailed: () => boolean;
  publish: (state: SoundSettingsState) => void;
  persist: (settings: SoundSettings) => Promise<void>;
};

const SETTINGS_SAVE_FAILED_MESSAGE =
  'Your settings work for this session, but could not be saved. Please retry.';

// What the app records about itself rather than a choice a parent makes.
type SettingsMetadata = Partial<Pick<Choices, 'whatsNewSeen' | 'applePencilSeen'>>;

function unrecorded(state: SoundSettingsState, metadata: SettingsMetadata): SettingsMetadata {
  const { whatsNewSeen, applePencilSeen } = metadata;
  return {
    ...(whatsNewSeen !== undefined && whatsNewSeen !== state.whatsNewSeen ? { whatsNewSeen } : {}),
    ...(applePencilSeen && !state.applePencilSeen ? { applePencilSeen } : {}),
  };
}

// Metadata is written on its own rather than through persist, so a failed Parent Center save
// stays pending for its retry. Ordinary choices are already in the state it writes, so once that
// write lands, an earlier ordinary failure is recovered.
function createMetadataWriter(
  storage: SoundSettingsStorage,
  { getState, publish }: PreferenceActionContext,
  hasPendingParent: () => boolean
) {
  return async function persistMetadata(metadata: SettingsMetadata) {
    const state = getState();
    if (state.status !== 'ready') return;
    const { status: _status, saved, message, ...current } = state;
    const choices = { ...current, ...metadata };
    publish({ status: 'saving', ...choices, message });
    try {
      await storage.write(JSON.stringify(snapshot(choices)));
      const settled = { ...choices, ...sessionPaint(getState()) };
      if (saved || hasPendingParent()) publish({ status: 'ready', ...settled, saved, message });
      else publish({ status: 'ready', ...settled, saved: true, message: '' });
    } catch {
      const failure = saved ? SETTINGS_SAVE_FAILED_MESSAGE : message;
      publish({
        status: 'ready',
        ...choices,
        ...sessionPaint(getState()),
        saved: false,
        message: failure,
      });
    }
  };
}

// Opening What's New or the first Apple Pencil double-tap can happen while settings load or
// another choice is still being written; the record then waits for that writer instead of being
// dropped. The owner awaits flushMetadata after each write it finishes.
function createMetadataActions({
  getState,
  isDisposed,
  hasReadFailed,
  publish,
  persistMetadata,
}: PreferenceActionContext & {
  persistMetadata: (metadata: SettingsMetadata) => Promise<void>;
}) {
  let queued: SettingsMetadata = {};
  async function record(metadata: SettingsMetadata) {
    if (isDisposed()) return;
    const state = getState();
    const missing = unrecorded(state, { ...queued, ...metadata });
    queued = state.status === 'ready' ? {} : missing;
    if (state.status !== 'ready' || Object.keys(missing).length === 0) return;
    if (hasReadFailed()) {
      publish({ ...state, ...missing });
      return;
    }
    await persistMetadata(missing);
    await flushMetadata();
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

// One validated choice: dropped while settings load or save, kept for the session alone after a
// failed read, and written otherwise.
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
    // Never written, so a pick lands even while another choice saves.
    setColor(selectedColor: PaintColor) {
      const state = getState();
      if (isDisposed() || state.status === 'loading') return;
      if (!isPaintColor(selectedColor)) throw new Error('Paint color is invalid.');
      publish({
        ...state,
        selectedColor,
        customColors: isCustomColor(selectedColor)
          ? rememberColor(state.customColors, selectedColor)
          : state.customColors,
      });
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
  let readFailed = false;
  function publish(next: SoundSettingsState) {
    if (disposed) return;
    state = next;
    onChange(state);
  }
  async function persist(settings: SoundSettings) {
    readFailed = false;
    parent.clearPending();
    const { version: _version, ...choices } = settings;
    publish({ status: 'saving', ...choices, ...sessionPaint(state), message: '' });
    try {
      await storage.write(JSON.stringify(settings));
      publish({ status: 'ready', ...choices, ...sessionPaint(state), saved: true, message: '' });
    } catch {
      publish({
        status: 'ready',
        ...choices,
        ...sessionPaint(state),
        saved: false,
        message: SETTINGS_SAVE_FAILED_MESSAGE,
      });
    }
    await metadata.flushMetadata();
  }
  const actionContext: PreferenceActionContext = {
    getState: () => state,
    isDisposed: () => disposed,
    hasReadFailed: () => readFailed,
    publish,
    persist,
  };
  const parent = createParentSaves({
    storage,
    ...actionContext,
    flushMetadata: () => metadata.flushMetadata(),
  });
  const metadata = createMetadataActions({
    ...actionContext,
    persistMetadata: createMetadataWriter(storage, actionContext, parent.hasPending),
  });
  return {
    async load() {
      if (disposed || state.status !== 'loading') return;
      try {
        const stored = await storage.read();
        const settings = stored === null ? defaultSoundSettings() : parseSoundSettings(stored);
        const { version: _version, ...choices } = settings;
        publish({ status: 'ready', ...choices, ...sessionPaint(state), saved: true, message: '' });
      } catch {
        readFailed = true;
        publish(unreadSoundSettingsState(sessionPaint(state)));
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
      if (readFailed) {
        publish({ ...state, message: 'Read settings again before saving Parent Center choices.' });
        return;
      }
      await persist(snapshot(state));
    },
    setParentPreferences: parent.setParentPreferences,
    setAiEnabled: parent.setAiEnabled,
    retryAiSave: parent.retryAiSave,
    aiSaveFailed: parent.aiSaveFailed,
    retryParentSave: parent.retryParentSave,
    async retryRead() {
      if (disposed || state.status !== 'ready' || !readFailed) return;
      try {
        const stored = await storage.read();
        const next =
          stored === null
            ? { ...snapshot(state), ...DEFAULT_PARENT_PREFERENCES }
            : parseSoundSettings(stored);
        const { version: _version, ...choices } = next;
        readFailed = false;
        publish({ status: 'ready', ...choices, ...sessionPaint(state), saved: true, message: '' });
      } catch {
        publish({
          ...state,
          message: 'Settings still could not be read. AI stays off and protection stays active.',
        });
      }
    },
    canEditParent: () => !disposed && !readFailed && state.status === 'ready',
    dispose() {
      disposed = true;
    },
  };
}
