import { drawingPaperSize, type PaperReference } from './drawing/paperSpace';
import { useDrawingHistory } from './product/DrawingSession';
import { offlineLibrary } from './offlineLibrary/runtime';
import { useOfflineLibrary } from './offlineLibrary/useOfflineLibrary';
import { useEffect, useRef, useState, type RefObject } from 'react';
import type { DrawingSurfaceHandle } from './drawing/DrawingSurface';
import {
  clearColoringOverlay,
  addStrokes,
  hasDrawingInk,
  clearDrawing,
  emptyDrawing,
  type History,
  type Stroke,
  type Drawing,
} from './drawing/model';
import { capturePicture, savePicture } from './keepPicture';
import { isUnsaved, type UnsavedOutcome } from './export/pictureSave';
import { usePolaroidFlights, useSaveFailure, useSaveAction } from './useSavePicture';
import { useDrawingMessages } from './drawingMessages';
import { useBrushPreferences } from './useBrushPreferences';
import {
  availableBrushes,
  brushControl,
  toggleEraser,
  type OptionalBrush,
} from './settings/brushPreferences';
import type { Brush } from './drawing/brushes';
import { useRendererRecovery } from './useRendererRecovery';
import { useBackAwareDrawingState } from './platform/BrowserBack';
import { useVisibleInk } from './drawing/inkVisibility';
import { createEmptyScan, useInkObservers } from './drawingScan';
import { useUndoAction } from './useUndoAction';
import { pageArt } from './drawing/pageArtResource';
import type { PagePickerLifetime } from './drawing/pageArtSelection';
import type { PageId } from './drawing/pages';

function useBlankPaper(
  history: History,
  setHistory: ReturnType<typeof useDrawingHistory>['setHistory'],
  drawing: boolean,
  visible: boolean
) {
  useEffect(() => {
    if (drawing || visible || history.drawing.strokes.length === 0) return;
    const erased = history.drawing;
    setHistory((current) =>
      current.drawing === erased
        ? {
            ...current,
            drawing: emptyDrawing(erased.rainbow, erased.pageId),
          }
        : current
    );
  }, [drawing, visible, history.drawing, setHistory]);
}

export function useDrawingScreen() {
  const historyOwner = useDrawingHistory();
  const { history, historyRef, setHistory, currentDrawing } = historyOwner;
  const brushes = useBrushPreferences();
  const brush = brushes.state.brush;
  const [preparing, setPreparing] = useState(false);
  const { drawing, setDrawing, isDrawing } = useDrawingActivity();
  const [commandBusy, setBusy] = useState(false);
  const busy = commandBusy;
  const messages = useDrawingMessages();
  const { notice, setNotice, report } = messages;
  const saveFailure = useSaveFailure();
  const flights = usePolaroidFlights();
  const [pagePickerOpen, setPagePickerOpen] = useState(false);
  const [committedStrokes, setCommittedStrokes] = useState(0);
  const library = useColoringLibrary(setHistory, drawing, pagePickerOpen, committedStrokes);
  const settingsLease = useRef<(() => void) | null>(null);
  const surface = useRef<DrawingSurfaceHandle>(null);
  const brushActions = brushPreferenceActions(brushes, () => surface.current?.finishInput());
  const rendererFault = useRef(false);
  const visibleInk = useRef<ReturnType<typeof useVisibleInk> | null>(null);

  const { command, runCommand, scanEmpty, commandsBlocked, ...surfaceActions } = useSurfaceCommands(
    {
      historyRef,
      setHistory,
      surface,
      setBusy,
      ...messages,
      reportSaveFailure: saveFailure.report,
      afterClear: () => brushes.owner.current?.resetAfterClear(),
      knownEmpty: (drawing) => visibleInk.current?.empty(drawing),
      inputActive: isDrawing,
      blocked: () => busy || rendererFault.current || preparing || settingsLease.current !== null,
    }
  );

  // Whether the page shows ink: the screenshot camera's blank state.
  const ink = useVisibleInk(history.drawing, !drawing, scanEmpty);
  useBlankPaper(history, setHistory, drawing, ink.visible);
  visibleInk.current = ink;
  const finishCohort = createCohortCommit(historyRef, setHistory, setNotice, report, (strokes) => {
    setCommittedStrokes((total) => total + strokes.length);
    if (strokes.some((stroke) => stroke.brush === 'eraser')) ink.erased(historyRef.current.drawing);
  });

  const settings = useDrawingSettings({
    surface,
    settingsLease,
    blocked: () => commandsBlocked() || pagePickerOpen,
    report,
  });
  // Chrome stays live during a stroke: Undo changes committed ink, and a paint pick or Clear
  // finishes the live cohort before the next action. Dialogs and capture wait for the lift.
  const disabled = preparing || brushes.state.status !== 'ready';
  // A dialog leaves the chrome at full strength under its scrim, as shipping's modal leaves the
  // page: the chrome is held rather than disabled while one is open.
  const dialogOpen = pagePickerOpen || settings.sheetOpen;

  const coloring = useColoringPageActions(
    historyOwner,
    setPagePickerOpen,
    commandsBlocked,
    runCommand,
    setNotice
  );

  const save = useSaveAction({
    historyRef,
    surface,
    runCommand,
    setNotice,
    flights,
    reportSaveFailure: saveFailure.report,
  });

  const recovery = useRendererRecovery({
    surface,
    rendererFault,
    command,
    blocked: drawing || busy || dialogOpen,
    setPreparing,
    setDrawing,
    finishCohort,
    report,
    setNotice,
  });

  return {
    library,
    recovery,
    history,
    brush,
    ...brushActions,
    finishInput: () => surface.current?.finishInput(),
    drawing,
    isDrawing,
    setDrawing,
    busy: busy || preparing || brushes.state.status !== 'ready',
    commandBusy,
    setPreparing,
    ...surfaceActions,
    notice: brushes.state.message || notice,
    routineNotice: brushes.state.message || messages.routineNotice,
    failure: messages.failure,
    dismissFailure: messages.dismissFailure,
    surface,
    pagePickerOpen,
    ...coloring,
    ...settings,
    disabled,
    dialogOpen,
    report,
    currentDrawing,
    finishCohort,
    committedStrokes,
    inkVisible: ink.visible,
    save,
    saveFailure: {
      ...saveFailure.getState(),
      retry: saveFailure.retry,
      dismiss: saveFailure.dismiss,
      // Another surface's save that did not land (the AI Result's Download).
      report: saveFailure.report,
    },
    flight: flights.flight,
    screenshotFeedback: flights.feedback,
    cameraTile: flights.cameraTile,
    landFlight: flights.land,
  };
}

function useDrawingActivity() {
  const [drawing, setDrawingState] = useBackAwareDrawingState();
  const current = useRef(drawing);
  current.current = drawing;
  return {
    drawing,
    isDrawing: () => current.current,
    setDrawing(next: boolean) {
      current.current = next;
      setDrawingState(next);
    },
  };
}

function createCohortCommit(
  historyRef: RefObject<History>,
  setHistory: ReturnType<typeof useDrawingHistory>['setHistory'],
  setNotice: (notice: string) => void,
  report: (error: unknown) => void,
  onCommitted: (strokes: readonly Stroke[]) => void
) {
  return (strokes: readonly Stroke[], paper: PaperReference) => {
    try {
      setHistory(addStrokes(historyRef.current, strokes, paper));
      onCommitted(strokes);
      setNotice('');
    } catch (error) {
      report(error);
    }
  };
}

function brushPreferenceActions(
  brushes: ReturnType<typeof useBrushPreferences>,
  finishInput: () => void
) {
  return {
    setBrush: (next: Brush) => brushes.owner.current?.selectBrush(next),
    brushPreferences: brushes.state,
    availableBrushes: availableBrushes(brushes.state.availability),
    brushControl: brushControl(brushes.state.availability),
    toggleBrush: () => brushes.owner.current?.toggleOptional(),
    // Shipping's normalizeDisabledBrushes once the Tool Drawer switch hides every optional brush:
    // selecting Pen also makes it the last ink brush the eraser and magic brush return to.
    fallBackFromOptionalBrushes() {
      const owner = brushes.owner.current;
      if (owner && owner.getState().brush !== 'pen') owner.selectBrush('pen');
    },
    selectInkBrush() {
      finishInput();
      brushes.owner.current?.selectInkBrush();
    },
    toggleEraser: () => (brushes.owner.current ? toggleEraser(brushes.owner.current) : false),
    setBrushAvailable: (next: OptionalBrush, enabled: boolean) =>
      brushes.owner.current?.setAvailable(next, enabled),
    retryBrushSave: () => {
      void brushes.owner.current?.retrySave();
    },
  };
}

function cancelPagePicker(lifetime: PagePickerLifetime) {
  lifetime.open = false;
  lifetime.revision += 1;
  lifetime.pending?.cancel();
}

function useColoringPageActions(
  history: ReturnType<typeof useDrawingHistory>,
  setPickerOpen: (open: boolean) => void,
  blocked: () => boolean,
  runCommand: (action: () => Promise<void>) => Promise<void>,
  setNotice: (message: string) => void
) {
  const lifetime = useRef<PagePickerLifetime>({
    open: false,
    generation: 0,
    revision: 0,
  }).current;
  useEffect(() => () => cancelPagePicker(lifetime), [lifetime]);
  const generation = lifetime.generation;
  return {
    pagePickerDismissed(finalize: () => void) {
      if (lifetime.generation !== generation) return;
      lifetime.pending?.dismiss();
      finalize();
    },
    setPagePickerOpen(open: boolean) {
      if (open && blocked()) return;
      const enabled = open && history.coloringBookEnabled.current;
      if (enabled && !lifetime.open) lifetime.generation += 1;
      lifetime.open = enabled;
      setPickerOpen(enabled);
    },
    setColoringBookEnabled(enabled: boolean) {
      history.applyColoringBookEnabled(enabled);
      if (!enabled) {
        cancelPagePicker(lifetime);
        setPickerOpen(false);
      }
      offlineLibrary.setFeatureEnabled(enabled);
    },
    choosePage(pageId: PageId) {
      if (
        blocked() ||
        !history.coloringBookEnabled.current ||
        !lifetime.open ||
        lifetime.generation !== generation
      )
        return;
      void runCommand(async () =>
        (await pageArt().load()).prepareColoringPage(
          history,
          lifetime,
          setPickerOpen,
          setNotice,
          pageId,
          generation
        )
      );
    },
  };
}

function useColoringLibrary(
  setHistory: ReturnType<typeof useDrawingHistory>['setHistory'],
  drawing: boolean,
  pickerOpen: boolean,
  committedStrokes: number
) {
  const state = useOfflineLibrary(drawing, pickerOpen, committedStrokes);
  return {
    owner: offlineLibrary,
    state,
    remove: async () => {
      await offlineLibrary.remove();
      if (offlineLibrary.snapshot().status === 'ready') setHistory(clearColoringOverlay);
    },
  };
}

function useDrawingSettings({
  surface,
  settingsLease,
  blocked,
  report,
}: {
  surface: RefObject<DrawingSurfaceHandle | null>;
  settingsLease: RefObject<(() => void) | null>;
  blocked: () => boolean;
  report: (error: unknown) => void;
}) {
  const [sheet, setSheet] = useState<'settings' | 'colors' | null>(null);
  // Settings › AI Art, where a grown-up sets up the AI picture, opens there rather than the hub.
  const [settingsSection, setSettingsSection] = useState<'ai' | null>(null);
  useEffect(() => () => settingsLease.current?.(), [settingsLease]);
  function openSheet(next: 'settings' | 'colors') {
    if (blocked() || settingsLease.current) return;
    try {
      if (!surface.current) throw new Error('The drawing paper is not ready.');
      settingsLease.current = surface.current.lockInput();
      setSheet(next);
    } catch (error) {
      report(error);
    }
  }
  function closeSheet() {
    settingsLease.current?.();
    settingsLease.current = null;
    setSheet(null);
  }
  return {
    sheetOpen: sheet !== null,
    settingsOpen: sheet === 'settings',
    colorPickerOpen: sheet === 'colors',
    settingsSection,
    openSettings: () => {
      setSettingsSection(null);
      openSheet('settings');
    },
    openAiSettings: () => {
      setSettingsSection('ai');
      openSheet('settings');
    },
    closeSettings: closeSheet,
    openColorPicker: () => openSheet('colors'),
    closeColorPicker: closeSheet,
  };
}

type SurfaceCommandOptions = {
  historyRef: RefObject<History>;
  setHistory: (next: History | ((current: History) => History)) => void;
  surface: RefObject<DrawingSurfaceHandle | null>;
  setBusy: (busy: boolean) => void;
  setNotice: (notice: string) => void;
  reportSaveFailure: (outcome: UnsavedOutcome, pngBase64: string | null) => void;
  report: (error: unknown) => void;
  blocked: () => boolean;
  afterClear: () => void;
  knownEmpty: (drawing: Drawing) => boolean | undefined;
  inputActive: () => boolean;
};

function useSurfaceCommands({
  historyRef,
  setHistory,
  surface,
  setBusy,
  setNotice,
  reportSaveFailure,
  report,
  blocked,
  afterClear,
  knownEmpty,
  inputActive,
}: SurfaceCommandOptions) {
  const command = useRef(false);
  const { mounted, observations, scanObservations } = useInkObservers();
  function commandsBlocked() {
    return command.current || blocked() || inputActive();
  }
  async function runCommand(action: () => Promise<void>) {
    if (commandsBlocked()) return;
    let release: (() => void) | undefined;
    try {
      if (!surface.current) throw new Error('The drawing paper is not ready.');
      release = surface.current.lockInput();
      command.current = true;
      setBusy(true);
      await action();
    } catch (error) {
      report(error);
    } finally {
      if (release) {
        release();
        command.current = false;
        setBusy(false);
      }
    }
  }

  const undo = useUndoAction({
    historyRef,
    setHistory,
    surface,
    command,
    blocked,
    inputActive,
    setNotice,
    report,
  });

  function clearSnapshot(snapshot: History, empty: boolean) {
    setHistory(clearDrawing(snapshot, empty));
    afterClear();
    setNotice('Pick a color and draw.');
  }

  async function clearCurrentPicture(keepInked: boolean) {
    if (command.current || blocked()) return;
    surface.current?.finishInput();
    const snapshot = historyRef.current;
    const empty = knownEmpty(snapshot.drawing);
    if (!keepInked && empty !== undefined) {
      clearSnapshot(snapshot, empty);
      return;
    }
    const save: { requested: boolean; pngBase64: string | null } = {
      requested: false,
      pngBase64: null,
    };
    await runCommand(async () => {
      const snapshot = historyRef.current;
      const owner = surface.current;
      const isCurrent = () =>
        mounted.current &&
        command.current &&
        !blocked() &&
        historyRef.current === snapshot &&
        surface.current === owner;
      const known = knownEmpty(snapshot.drawing);
      const needsScan = known === undefined && hasDrawingInk(snapshot.drawing);
      const observation = needsScan
        ? observations.current?.begin(isCurrent, drawingPaperSize(snapshot.drawing))
        : null;
      try {
        const pixels = needsScan ? await owner?.captureInk(snapshot.drawing) : null;
        if (needsScan && (!pixels || !observation))
          throw new Error('The drawing paper is not ready to check.');
        const empty = known ?? (pixels && observation ? await observation.observe(pixels) : true);
        if (!isCurrent())
          throw new Error('The picture changed before Clear finished. Please try again.');
        const keep = keepInked && !empty;
        const pngBase64 = keep ? await capturePicture(snapshot.drawing, owner) : null;
        if (!isCurrent())
          throw new Error('The picture changed before Clear finished. Please try again.');
        clearSnapshot(snapshot, empty);
        save.requested = keep;
        save.pngBase64 = pngBase64;
      } finally {
        observation?.cancel();
      }
    });
    if (save.requested) saveClearedPicture(save.pngBase64, reportSaveFailure);
  }

  return {
    command,
    runCommand,
    commandsBlocked,
    scanEmpty: createEmptyScan({
      command,
      mounted,
      observations: scanObservations,
      surface,
      historyRef,
      blocked,
    }),
    ...undo,
    clear: (saveOnDelete: boolean) => clearCurrentPicture(saveOnDelete),
  };
}

function saveClearedPicture(
  pngBase64: string | null,
  reportFailure: (outcome: UnsavedOutcome, pngBase64: string | null) => void
) {
  if (!pngBase64) {
    reportFailure('failed', null);
    return;
  }
  void savePicture(pngBase64).then((outcome) => {
    if (isUnsaved(outcome)) reportFailure(outcome, pngBase64);
  });
}
