import { canonicalPaper } from '../../tests/native-paper-fixtures.mjs';
import { DEFAULT_BRUSH_AVAILABILITY } from '../../../experiments/native-architecture/src/settings/brushPreferences.ts';

export function drawingScreenPort(actual, caller, projectHistory) {
  return {
    useDrawingScreen: () =>
      caller.realScreen
        ? actual.useDrawingScreen()
        : {
            brushPreferences: {
              status: 'ready',
              availability: DEFAULT_BRUSH_AVAILABILITY,
              saved: true,
              message: '',
            },
            brushControl: { kind: 'none' },
            availableBrushes: [],
            draftState: { status: 'session', message: '' },
            retryDraft: async () => {},
            selectInkBrush() {},
            ...caller.screen,
            library: caller.library,
            setColoringBookEnabled(enabled) {
              caller.library.owner.setFeatureEnabled(enabled);
              if (caller.screen?.history?.drawing)
                caller.screen.history = projectHistory(caller.screen.history, enabled);
              if (!enabled && caller.screen) caller.screen.pagePickerOpen = false;
            },
          },
  };
}
export function offlineRuntimePort(caller) {
  return {
    snapshot: () => caller.library.owner.snapshot(),
    subscribe: (...args) => caller.library.owner.subscribe(...args),
    initialize: () => caller.library.owner.initialize(),
    setActive: (active) => caller.library.owner.setActive(active),
    setDrawing: (drawing) => caller.library.owner.setDrawing(drawing),
    engage: () => caller.library.owner.engage(),
    setFeatureEnabled: (enabled) => caller.library.owner.setFeatureEnabled(enabled),
    openPage: (page) => caller.library.owner.openPage(page),
    remove: (pages) => caller.library.owner.remove(pages),
  };
}
export function paperPort(React, strokeStyle, caller) {
  function PaperBoundary({ screen, sound, menuOpen }) {
    React.useImperativeHandle(
      screen.surface,
      () => ({
        lockInput: () => () => {},
        refreshGeometry() {},
      }),
      []
    );
    caller.paper = screen.history.drawing;
    return React.createElement('button', {
      'aria-label': 'Draw RSD fixture stroke',
      'data-testid': 'rsd-real-history-paper',
      'data-drawing': JSON.stringify(screen.history.drawing),
      disabled: screen.disabled || menuOpen || screen.pictures !== null,
      onClick: () =>
        screen.recovery.callbacks.onCohort(
          [
            {
              ...strokeStyle(
                screen.brush,
                sound.settings.selectedColor,
                screen.history.drawing,
                sound.settings.strokeWidth
              ),
              points: [
                { x: 20, y: 20 },
                { x: 100, y: 100 },
              ],
            },
          ],
          canonicalPaper()
        ),
    });
  }
  return {
    NativePaper: (props) => (caller.realScreen ? React.createElement(PaperBoundary, props) : null),
  };
}

export function nativeSettingsProps(owner, state) {
  return {
    settings: state,
    brushState: {
      status: 'ready',
      availability: DEFAULT_BRUSH_AVAILABILITY,
      saved: true,
      message: '',
    },
    onBrushAvailabilityChange() {},
    onRetryBrushSave() {},
    notice: state.message,
    onToggle: () => owner.setEnabled(!state.soundEnabled),
    onColoringBookChange: (enabled) => owner.setColoringBookEnabled(enabled),
    onUndoButtonChange: (enabled) => owner.setUndoButtonEnabled(enabled),
    onStrokeWidthControlChange: (enabled) => owner.setStrokeWidthControlEnabled(enabled),
    onSoundLevelChange: (level) => owner.setSoundLevel(level),
    onAppearanceChange: (appearance) => owner.setAppearance(appearance),
    onRetry: () => owner.retrySave(),
    onClose() {},
    onParentCenter() {},
  };
}

export function svgPort(React) {
  const Svg = ({ children }) => React.createElement('div', null, children);
  const SvgXml = ({ xml, width, height }) =>
    React.createElement('svg', { 'data-xml': xml, width, height });
  return { default: Svg, Defs: Svg, LinearGradient: Svg, Rect: Svg, Stop: Svg, SvgXml };
}
