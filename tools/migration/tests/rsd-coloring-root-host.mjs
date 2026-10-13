import { useReducer } from 'react';
import { canonicalPaper } from '../../tests/native-paper-fixtures.mjs';
import { DEFAULT_BRUSH_AVAILABILITY } from '../../../experiments/native-architecture/src/settings/brushPreferences.ts';

export function drawingScreenPort(actual, caller, projectHistory) {
  return {
    useDrawingScreen: () => (caller.realScreen ? actual.useDrawingScreen() : useStubScreen()),
  };
  // The stub's own Settings open and close, so a product route that opens Settings (a Parent
  // Center unlock) renders it; a test that stubs either one keeps its own.
  function useStubScreen() {
    const [, rerender] = useReducer((count) => count + 1, 0);
    const setSettingsOpen = (open) => {
      caller.screen.settingsOpen = open;
      rerender();
    };
    return {
      openSettings: () => setSettingsOpen(true),
      closeSettings: () => setSettingsOpen(false),
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
      saveFailure: {
        outcome: null,
        pictureCount: 0,
        retrying: false,
        retry: async () => {},
        dismiss() {},
      },
      flight: null,
      cameraTile: { current: null },
      landFlight() {},
      ...caller.screen,
      library: caller.library,
      setColoringBookEnabled(enabled) {
        caller.library.owner.setFeatureEnabled(enabled);
        if (caller.screen?.history?.drawing)
          caller.screen.history = projectHistory(caller.screen.history, enabled);
        if (!enabled && caller.screen) caller.screen.pagePickerOpen = false;
      },
    };
  }
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
        // A save's photo library copy; what the library does with it is the test's port.
        capturePng: async () => caller.capturePng?.() ?? 'cmVhbC1wbmc=',
      }),
      []
    );
    caller.paper = screen.history.drawing;
    return React.createElement('button', {
      'aria-label': 'Draw RSD fixture stroke',
      'data-testid': 'rsd-real-history-paper',
      'data-drawing': JSON.stringify(screen.history.drawing),
      disabled: screen.disabled || menuOpen,
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
    onSaveOnDeleteChange: (enabled) => owner.setSaveOnDeleteEnabled(enabled),
    onDrawingSoundChange: (enabled) => owner.setDrawingSoundEnabled(enabled),
    onDeleteSoundChange: (enabled) => owner.setDeleteSoundEnabled(enabled),
    onAppearanceChange: (appearance) => owner.setAppearance(appearance),
    onToolbarStyleChange: (style) => owner.setToolbarStyle(style),
    onOrientationChange: (orientation) => owner.setOrientation(orientation),
    buttonScale: {
      value: state.buttonScale,
      active: false,
      onInput() {},
      onActiveChange() {},
    },
    soundVolume: {
      value: state.soundVolume,
      active: false,
      onInput() {},
      onActiveChange() {},
    },
    onReduceMotionChange: (preference) => owner.setReduceMotion(preference),
    onWhatsNewSeen: () => owner.markWhatsNewSeen(),
    onRetry: () => owner.retrySave(),
    onClose() {},
    parentCenter: { unlocked: false, checkDue: true, onUnlock() {}, onLeave() {}, section: null },
    gate: null,
    onFeedback() {},
    downloadedBooks: 0,
    ai: null,
  };
}

export function svgPort(React) {
  const Svg = ({ children }) => React.createElement('div', null, children);
  const SvgXml = ({ xml, width, height }) =>
    React.createElement('svg', { 'data-xml': xml, width, height });
  const Path = ({ d, fill, stroke, strokeWidth }) =>
    React.createElement('path', { d, fill, stroke, 'stroke-width': strokeWidth });
  const Polygon = ({ points, fill }) => React.createElement('polygon', { points, fill });
  // Gradients keep the geometry and stops a wash is drawn from, for tests that read it.
  const RadialGradient = ({ children, id, r }) =>
    React.createElement('div', { 'data-gradient': id, 'data-r': r }, children);
  const Stop = ({ offset, stopOpacity }) =>
    React.createElement('i', { 'data-offset': offset, 'data-stop-opacity': stopOpacity });
  return {
    default: Svg,
    Polygon,
    Circle: Svg,
    ClipPath: Svg,
    Defs: Svg,
    G: Svg,
    Image: Svg,
    Mask: Svg,
    LinearGradient: Svg,
    Path,
    RadialGradient,
    Rect: Svg,
    Stop,
    SvgXml,
  };
}

// Each inset boundary renders a marked element and records its props; insets come from records.
export function safeAreaPort(React, records) {
  const boundary = (kind) => (props) => {
    records.props.push(props);
    return React.createElement(
      'div',
      { 'data-safe-area-kind': kind, 'data-testid': props.testID },
      props.children
    );
  };
  return {
    initialWindowMetrics: null,
    SafeAreaProvider: boundary('provider'),
    SafeAreaView: boundary('padding'),
    useSafeAreaInsets: () => records.insets,
  };
}
