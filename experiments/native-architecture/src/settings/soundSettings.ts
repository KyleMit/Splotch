import { DEFAULT_DRAWING_CONTROL_PREFERENCES } from './drawingControlPreferences';
import { DEFAULT_COLORING_BOOK_ENABLED } from './coloringBook';
import { DEFAULT_SOUND_LEVEL, isSoundLevel, type SoundLevel } from './soundLevel';
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
import {
  isParentPolicies,
  PROTECTED_PARENT_POLICIES,
  type ParentPreferences,
} from '../parentCenter/parentPolicy';
import { isButtonScale } from './buttonSize';
import { isReduceMotionPreference, type ReduceMotionPreference } from './reduceMotion';
import { WHATS_NEW_STAMP } from './whatsNew';
import { DEFAULT_PENCIL_SETTINGS, type PencilSettings } from './pencilEraser';
import {
  DEFAULT_ACCESSIBILITY_SETTINGS,
  DEFAULT_WIDTH_SETTINGS,
  parseSoundSettings,
  snapshot,
  type SoundSettings,
  type SoundSettingsState,
  type SoundSettingsStorage,
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
    soundLevel: DEFAULT_SOUND_LEVEL,
    ...DEFAULT_DRAWING_CONTROL_PREFERENCES,
    ...DEFAULT_WIDTH_SETTINGS,
    ...DEFAULT_COLOR_SETTINGS,
    ...DEFAULT_PARENT_PREFERENCES,
    appearance: DEFAULT_APPEARANCE,
    orientation: defaultOrientation(),
    saveOnDeleteEnabled: DEFAULT_SAVE_ON_DELETE_ENABLED,
    ...DEFAULT_ACCESSIBILITY_SETTINGS,
    ...DEFAULT_PENCIL_SETTINGS,
    message: '',
  };
}

function defaultSoundSettings(): SoundSettings {
  return {
    version: 11,
    coloringBookEnabled: DEFAULT_COLORING_BOOK_ENABLED,
    soundEnabled: DEFAULT_SOUND_ENABLED,
    soundLevel: DEFAULT_SOUND_LEVEL,
    ...DEFAULT_DRAWING_CONTROL_PREFERENCES,
    ...DEFAULT_WIDTH_SETTINGS,
    ...DEFAULT_COLOR_SETTINGS,
    ...DEFAULT_PARENT_PREFERENCES,
    appearance: DEFAULT_APPEARANCE,
    orientation: defaultOrientation(),
    saveOnDeleteEnabled: DEFAULT_SAVE_ON_DELETE_ENABLED,
    ...DEFAULT_ACCESSIBILITY_SETTINGS,
    ...DEFAULT_PENCIL_SETTINGS,
  };
}

function unreadSoundSettingsState(): SoundSettingsState {
  return {
    status: 'ready',
    coloringBookEnabled: false,
    soundEnabled: false,
    soundLevel: DEFAULT_SOUND_LEVEL,
    ...DEFAULT_DRAWING_CONTROL_PREFERENCES,
    ...DEFAULT_WIDTH_SETTINGS,
    ...DEFAULT_COLOR_SETTINGS,
    aiEnabled: false,
    parentPolicies: PROTECTED_PARENT_POLICIES,
    appearance: DEFAULT_APPEARANCE,
    orientation: defaultOrientation(),
    saveOnDeleteEnabled: DEFAULT_SAVE_ON_DELETE_ENABLED,
    ...DEFAULT_ACCESSIBILITY_SETTINGS,
    ...DEFAULT_PENCIL_SETTINGS,
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

// The What's New stamp is written on its own rather than through persist, so a failed Parent
// Center save stays pending for its retry. Ordinary choices are already in the state it writes,
// so once that write lands, an earlier ordinary failure is recovered.
function createStampWriter(
  storage: SoundSettingsStorage,
  { getState, publish }: PreferenceActionContext,
  hasPendingParent: () => boolean
) {
  return async function persistStamp() {
    const state = getState();
    if (state.status !== 'ready') return;
    const { status: _status, saved, message, ...current } = state;
    const choices = { ...current, whatsNewSeen: WHATS_NEW_STAMP };
    publish({ status: 'saving', ...choices, message });
    try {
      await storage.write(JSON.stringify(snapshot(choices)));
      if (saved || hasPendingParent()) publish({ status: 'ready', ...choices, saved, message });
      else publish({ status: 'ready', ...choices, saved: true, message: '' });
    } catch {
      const failure = saved ? SETTINGS_SAVE_FAILED_MESSAGE : message;
      publish({ status: 'ready', ...choices, saved: false, message: failure });
    }
  };
}

// The owner awaits flushWhatsNewSeen after each write it finishes.
function createAccessibilityActions({
  getState,
  isDisposed,
  hasReadFailed,
  publish,
  persist,
  persistStamp,
}: PreferenceActionContext & { persistStamp: () => Promise<void> }) {
  let whatsNewSeenQueued = false;
  const actions = {
    async setButtonScale(buttonScale: number) {
      const state = getState();
      if (isDisposed() || state.status !== 'ready') return;
      if (!isButtonScale(buttonScale)) throw new Error('Button Size choice is invalid.');
      if (hasReadFailed()) {
        publish({ ...state, buttonScale });
        return;
      }
      await persist({ ...snapshot(state), buttonScale });
    },
    async setReduceMotion(reduceMotion: ReduceMotionPreference) {
      const state = getState();
      if (isDisposed() || state.status !== 'ready') return;
      if (!isReduceMotionPreference(reduceMotion))
        throw new Error('Reduce Motion choice is invalid.');
      if (hasReadFailed()) {
        publish({ ...state, reduceMotion });
        return;
      }
      await persist({ ...snapshot(state), reduceMotion });
    },
    // Opening What's New can happen while another choice is still being written; the stamp then
    // waits for that writer instead of being dropped, so the dot clears once it finishes.
    async markWhatsNewSeen() {
      const state = getState();
      if (isDisposed() || state.whatsNewSeen === WHATS_NEW_STAMP) return;
      if (state.status !== 'ready') {
        whatsNewSeenQueued = true;
        return;
      }
      if (hasReadFailed()) {
        publish({ ...state, whatsNewSeen: WHATS_NEW_STAMP });
        return;
      }
      await persistStamp();
    },
  };
  async function flushWhatsNewSeen() {
    if (!whatsNewSeenQueued || isDisposed() || getState().status !== 'ready') return;
    whatsNewSeenQueued = false;
    await actions.markWhatsNewSeen();
  }
  return { actions, flushWhatsNewSeen };
}

function createDrawingPreferenceActions({
  getState,
  isDisposed,
  hasReadFailed,
  publish,
  persist,
}: PreferenceActionContext) {
  async function setControl(
    key: 'undoButtonEnabled' | 'strokeWidthControlEnabled',
    enabled: boolean
  ) {
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
    async setSoundLevel(soundLevel: SoundLevel) {
      const state = getState();
      if (isDisposed() || state.status !== 'ready') return;
      if (!isSoundLevel(soundLevel)) throw new Error('Sound level is invalid.');
      if (hasReadFailed()) {
        publish({ ...state, soundLevel });
        return;
      }
      await persist({ ...snapshot(state), soundLevel });
    },
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
    async setColor(selectedColor: PaintColor) {
      const state = getState();
      if (isDisposed() || state.status !== 'ready') return;
      if (!isPaintColor(selectedColor)) throw new Error('Paint color is invalid.');
      const choices = {
        selectedColor,
        customColors: isCustomColor(selectedColor)
          ? rememberColor(state.customColors, selectedColor)
          : state.customColors,
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

// A double-tap landing while another choice is being written is recorded by the next double-tap.
function createPencilActions({
  getState,
  isDisposed,
  hasReadFailed,
  publish,
  persist,
}: PreferenceActionContext) {
  async function setPencil(choice: Partial<PencilSettings>) {
    const state = getState();
    if (isDisposed() || state.status !== 'ready') return;
    if (hasReadFailed()) {
      publish({ ...state, ...choice });
      return;
    }
    await persist({ ...snapshot(state), ...choice });
  }
  return {
    async setPencilEraserEnabled(pencilEraserEnabled: boolean) {
      if (typeof pencilEraserEnabled !== 'boolean')
        throw new Error('Apple Pencil choice is invalid.');
      await setPencil({ pencilEraserEnabled });
    },
    async markApplePencilSeen() {
      if (!getState().applePencilSeen) await setPencil({ applePencilSeen: true });
    },
  };
}

const PARENT_SAVE_FAILED_MESSAGE =
  'Parent Center choices were not saved. Previous protection is still active. Retry saving.';

export function createSoundSettings(
  storage: SoundSettingsStorage,
  onChange: (state: SoundSettingsState) => void
) {
  let state = initialSoundSettingsState();
  let disposed = false;
  let readFailed = false;
  let pendingParent: SoundSettings | null = null;
  function publish(next: SoundSettingsState) {
    if (disposed) return;
    state = next;
    onChange(state);
  }
  async function persist(settings: SoundSettings) {
    readFailed = false;
    pendingParent = null;
    const { version: _version, ...choices } = settings;
    publish({ status: 'saving', ...choices, message: '' });
    try {
      await storage.write(JSON.stringify(settings));
      publish({ status: 'ready', ...choices, saved: true, message: '' });
    } catch {
      publish({
        status: 'ready',
        ...choices,
        saved: false,
        message: SETTINGS_SAVE_FAILED_MESSAGE,
      });
    }
    await accessibility.flushWhatsNewSeen();
  }
  async function persistParent(settings: SoundSettings) {
    if (state.status !== 'ready' || readFailed) return;
    const previous = snapshot(state);
    pendingParent = settings;
    const { version: _version, ...choices } = previous;
    publish({ status: 'saving', ...choices, message: 'Saving Parent Center choices…' });
    try {
      await storage.write(JSON.stringify(settings));
      const { version: _nextVersion, ...next } = settings;
      pendingParent = null;
      publish({ status: 'ready', ...next, saved: true, message: 'Parent Center choices saved.' });
    } catch {
      publish({ status: 'ready', ...choices, saved: false, message: PARENT_SAVE_FAILED_MESSAGE });
    }
    await accessibility.flushWhatsNewSeen();
  }
  const actionContext: PreferenceActionContext = {
    getState: () => state,
    isDisposed: () => disposed,
    hasReadFailed: () => readFailed,
    publish,
    persist,
  };
  const accessibility = createAccessibilityActions({
    ...actionContext,
    persistStamp: createStampWriter(storage, actionContext, () => pendingParent !== null),
  });
  return {
    async load() {
      if (disposed || state.status !== 'loading') return;
      try {
        const stored = await storage.read();
        const settings = stored === null ? defaultSoundSettings() : parseSoundSettings(stored);
        const { version: _version, ...choices } = settings;
        publish({ status: 'ready', ...choices, saved: true, message: '' });
      } catch {
        readFailed = true;
        publish(unreadSoundSettingsState());
      }
      await accessibility.flushWhatsNewSeen();
    },
    ...createDrawingPreferenceActions(actionContext),
    ...createPencilActions(actionContext),
    ...accessibility.actions,
    async retrySave() {
      if (disposed || state.status !== 'ready' || state.saved) return;
      if (pendingParent) {
        publish({ ...state, message: 'Open Parent Center to retry saving its choices.' });
        return;
      }
      if (readFailed) {
        publish({ ...state, message: 'Read settings again before saving Parent Center choices.' });
        return;
      }
      await persist(snapshot(state));
    },
    async setParentPreferences(choices: ParentPreferences) {
      if (disposed || state.status !== 'ready' || readFailed) return;
      if (typeof choices.aiEnabled !== 'boolean' || !isParentPolicies(choices.parentPolicies))
        throw new Error('Parent Center choice is invalid.');
      await persistParent({ ...snapshot(state), ...choices });
    },
    async retryParentSave() {
      if (disposed || state.status !== 'ready' || !pendingParent || readFailed) return;
      await persistParent({
        ...snapshot(state),
        aiEnabled: pendingParent.aiEnabled,
        parentPolicies: pendingParent.parentPolicies,
      });
    },
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
        publish({ status: 'ready', ...choices, saved: true, message: '' });
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
