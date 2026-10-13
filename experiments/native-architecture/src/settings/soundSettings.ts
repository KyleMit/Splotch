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
import {
  isParentPolicies,
  PROTECTED_PARENT_POLICIES,
  type ParentPreferences,
} from '../parentCenter/parentPolicy';
import {
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
    message: '',
  };
}

function defaultSoundSettings(): SoundSettings {
  return {
    version: 8,
    coloringBookEnabled: DEFAULT_COLORING_BOOK_ENABLED,
    soundEnabled: DEFAULT_SOUND_ENABLED,
    soundLevel: DEFAULT_SOUND_LEVEL,
    ...DEFAULT_DRAWING_CONTROL_PREFERENCES,
    ...DEFAULT_WIDTH_SETTINGS,
    ...DEFAULT_COLOR_SETTINGS,
    ...DEFAULT_PARENT_PREFERENCES,
    appearance: DEFAULT_APPEARANCE,
    orientation: defaultOrientation(),
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
    saved: false,
    message:
      'Drawing settings could not be read. Sound is off. Your choices work for this session. Choose your settings and retry saving.',
  };
}

function createDrawingPreferenceActions({
  getState,
  isDisposed,
  hasReadFailed,
  publish,
  persist,
}: {
  getState: () => SoundSettingsState;
  isDisposed: () => boolean;
  hasReadFailed: () => boolean;
  publish: (state: SoundSettingsState) => void;
  persist: (settings: SoundSettings) => Promise<void>;
}) {
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
        message: 'Your settings work for this session, but could not be saved. Please retry.',
      });
    }
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
      publish({
        status: 'ready',
        ...choices,
        saved: false,
        message:
          'Parent Center choices were not saved. Previous protection is still active. Retry saving.',
      });
    }
  }
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
    },
    ...createDrawingPreferenceActions({
      getState: () => state,
      isDisposed: () => disposed,
      hasReadFailed: () => readFailed,
      publish,
      persist,
    }),
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
