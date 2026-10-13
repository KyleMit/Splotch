import { drawingPaperSize, type PaperReference } from './drawing/paperSpace';
import { useDrawingHistory } from './product/DrawingSession';
import { protectedDraftPageIds } from './platform/drawingDraft';
import { offlineLibrary } from './offlineLibrary/runtime';
import { useOfflineLibrary } from './offlineLibrary/useOfflineLibrary';
import { useEffect, useRef, useState, type RefObject } from 'react';
import type { DrawingSurfaceHandle } from './drawing/DrawingSurface';
import {
  changePage,
  addStrokes,
  hasDrawingInk,
  clearDrawing,
  undoDrawing,
  type History,
  type Stroke,
} from './drawing/model';
import { savedColoringPageIds } from './platform/drawingFiles';
import { capturePicture, keepPicture, savePicture } from './keepPicture';
import { isUnsaved, type UnsavedOutcome } from './export/pictureSave';
import { usePolaroidFlights, useSaveFailure } from './useSavePicture';
import { useDrawingMessages } from './drawingMessages';
import { useBrushPreferences } from './useBrushPreferences';
import {
  availableBrushes,
  brushControl,
  toggleEraser,
  type OptionalBrush,
} from './settings/brushPreferences';
import type { Brush } from './drawing/brushes';
import { pageLabel, type PageId } from './drawing/pages';
import { useRendererRecovery } from './useRendererRecovery';
import { useBackAwareDrawingState } from './platform/BrowserBack';
import { useVisibleInk } from './drawing/inkVisibility';
import { createEmptyScan, useInkObservers } from './drawingScan';

export function useDrawingScreen() {
  const historyOwner = useDrawingHistory();
  const replacementGuard = useHistoryReplacementGuard();
  const { history, historyRef, setHistory, currentDrawing } = historyOwner;
  const brushes = useBrushPreferences();
  const brush = brushes.state.brush;
  const brushActions = brushPreferenceActions(brushes);
  const [preparing, setPreparing] = useState(false);
  const [drawing, setDrawing] = useBackAwareDrawingState();
  const [commandBusy, setBusy] = useState(false);
  const busy = commandBusy || historyOwner.draftState.status === 'loading';
  const messages = useDrawingMessages();
  const { notice, setNotice, report } = messages;
  const saveFailure = useSaveFailure();
  const flights = usePolaroidFlights();
  const [pagePickerOpen, setPagePickerOpen] = useState(false);
  const library = useColoringLibrary(historyRef, drawing, pagePickerOpen);
  const settingsLease = useRef<(() => void) | null>(null);
  const surface = useRef<DrawingSurfaceHandle>(null);
  const rendererFault = useRef(false);

  const { command, runCommand, scanEmpty, ...surfaceActions } = useSurfaceCommands({
    historyRef,
    setHistory,
    surface,
    setBusy,
    ...messages,
    reportSaveFailure: saveFailure.report,
    afterClear: () => brushes.owner.current?.resetAfterClear(),
    blocked: () =>
      busy || rendererFault.current || preparing || drawing || settingsLease.current !== null,
  });

  // Strokes committed since this screen opened; the install banner waits on them.
  const [committedStrokes, setCommittedStrokes] = useState(0);
  // Whether the page shows ink: the screenshot camera's blank state.
  const ink = useVisibleInk(history.drawing, !drawing, scanEmpty);
  const finishCohort = createCohortCommit(historyRef, setHistory, setNotice, report, (strokes) => {
    setCommittedStrokes((total) => total + strokes.length);
    if (strokes.some((stroke) => stroke.brush === 'eraser')) ink.erased(historyRef.current.drawing);
  });

  const settings = useDrawingSettings({
    surface,
    settingsLease,
    blocked: () =>
      drawing || busy || preparing || pagePickerOpen || command.current || rendererFault.current,
    report,
  });
  const disabled =
    drawing ||
    busy ||
    preparing ||
    pagePickerOpen ||
    settings.sheetOpen ||
    brushes.state.status !== 'ready';

  const commandsBlocked = () =>
    command.current ||
    rendererFault.current ||
    preparing ||
    drawing ||
    busy ||
    settingsLease.current !== null;

  const coloring = createColoringPageActions(
    historyOwner,
    setPagePickerOpen,
    commandsBlocked,
    runCommand,
    setNotice,
    replacementGuard
  );

  const save = createSave({
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
    blocked: drawing || busy || pagePickerOpen || settings.sheetOpen,
    setPreparing,
    setDrawing,
    finishCohort,
    report,
    setNotice,
  });

  return {
    library,
    recovery,
    draftState: historyOwner.draftState,
    retryDraft: historyOwner.retryDraft,
    history,
    brush,
    ...brushActions,
    drawing,
    setDrawing,
    busy: busy || preparing || brushes.state.status !== 'ready',
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
    },
    flight: flights.flight,
    cameraTile: flights.cameraTile,
    landFlight: flights.land,
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

function brushPreferenceActions(brushes: ReturnType<typeof useBrushPreferences>) {
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
    selectInkBrush: () => brushes.owner.current?.selectInkBrush(),
    toggleEraser: () => (brushes.owner.current ? toggleEraser(brushes.owner.current) : false),
    setBrushAvailable: (next: OptionalBrush, enabled: boolean) =>
      brushes.owner.current?.setAvailable(next, enabled),
    retryBrushSave: () => {
      void brushes.owner.current?.retrySave();
    },
  };
}

function createColoringPageActions(
  history: ReturnType<typeof useDrawingHistory>,
  setPickerOpen: (open: boolean) => void,
  blocked: () => boolean,
  runCommand: (action: () => Promise<void>) => Promise<void>,
  setNotice: (message: string) => void,
  replacementGuard: () => () => boolean
) {
  return {
    setPagePickerOpen: (open: boolean) =>
      setPickerOpen(open && history.coloringBookEnabled.current),
    setColoringBookEnabled(enabled: boolean) {
      history.applyColoringBookEnabled(enabled);
      if (!enabled) setPickerOpen(false);
      offlineLibrary.setFeatureEnabled(enabled);
    },
    choosePage(pageId: PageId) {
      if (blocked() || !history.coloringBookEnabled.current) return;
      void runCommand(async () => {
        const isCurrent = replacementGuard();
        await offlineLibrary.openPage(pageId);
        if (!isCurrent() || !history.coloringBookEnabled.current) return;
        const next = changePage(history.historyRef.current, pageId);
        if (next !== history.historyRef.current) {
          history.setHistory(next);
          setNotice(`${pageLabel(pageId)} ready. Undo brings your picture back.`);
        }
        setPickerOpen(false);
      });
    },
  };
}

function useColoringLibrary(historyRef: RefObject<History>, drawing: boolean, pickerOpen: boolean) {
  const state = useOfflineLibrary(drawing, pickerOpen);
  return {
    owner: offlineLibrary,
    state,
    remove: () =>
      offlineLibrary.remove(async () => [
        ...(await savedColoringPageIds()),
        ...(await protectedDraftPageIds()),
        historyRef.current.drawing.pageId,
        ...historyRef.current.undo.map((entry) => entry.pageId),
      ]),
  };
}

function useHistoryReplacementGuard() {
  const lifetime = useRef({ active: true, revision: 0 });
  useEffect(() => {
    lifetime.current.active = true;
    return () => {
      lifetime.current.active = false;
      lifetime.current.revision += 1;
    };
  }, []);
  return () => {
    const revision = lifetime.current.revision;
    return () => lifetime.current.active && lifetime.current.revision === revision;
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
    openSettings: () => openSheet('settings'),
    closeSettings: closeSheet,
    openColorPicker: () => openSheet('colors'),
    closeColorPicker: closeSheet,
  };
}

// The polaroid starts as soon as the picture is captured, so the child sees the save answer at
// once; a save that turns out not to land takes it back, and the parent's explanation and Try
// again go to the Save Failure Banner with the captured picture. A success says nothing more.
function createSave({
  historyRef,
  surface,
  runCommand,
  setNotice,
  flights,
  reportSaveFailure,
}: {
  historyRef: RefObject<History>;
  surface: RefObject<DrawingSurfaceHandle | null>;
  runCommand: (action: () => Promise<void>) => Promise<void>;
  setNotice: (notice: string) => void;
  flights: ReturnType<typeof usePolaroidFlights>;
  reportSaveFailure: (outcome: UnsavedOutcome, pngBase64: string | null) => void;
}) {
  return () =>
    runCommand(async () => {
      const drawing = historyRef.current.drawing;
      const pngBase64 = await capturePicture(drawing, surface.current);
      const flight = pngBase64 ? flights.launch(pngBase64, drawingPaperSize(drawing)) : null;
      const outcome = pngBase64 ? await savePicture(pngBase64) : 'failed';
      if (!isUnsaved(outcome)) {
        setNotice('');
        return;
      }
      if (flight !== null) flights.discard(flight);
      reportSaveFailure(outcome, pngBase64);
    });
}

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
}: {
  historyRef: RefObject<History>;
  setHistory: (next: History | ((current: History) => History)) => void;
  surface: RefObject<DrawingSurfaceHandle | null>;
  setBusy: (busy: boolean) => void;
  setNotice: (notice: string) => void;
  reportSaveFailure: (outcome: UnsavedOutcome, pngBase64: string | null) => void;
  report: (error: unknown) => void;
  blocked: () => boolean;
  afterClear: () => void;
}) {
  const command = useRef(false);
  const { mounted, observations, scanObservations } = useInkObservers();
  async function runCommand(action: () => Promise<void>) {
    if (command.current || blocked()) return;
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

  function undo() {
    if (command.current || blocked()) return;
    let release: (() => void) | undefined;
    try {
      release = surface.current?.lockInput();
      setHistory(undoDrawing);
      setNotice('');
    } catch (error) {
      report(error);
    } finally {
      release?.();
    }
  }

  async function clearCurrentPicture(keepInked: boolean) {
    await runCommand(async () => {
      const snapshot = historyRef.current;
      const owner = surface.current;
      const isCurrent = () =>
        mounted.current &&
        command.current &&
        !blocked() &&
        historyRef.current === snapshot &&
        surface.current === owner;
      const observation = hasDrawingInk(snapshot.drawing)
        ? observations.current?.begin(isCurrent, drawingPaperSize(snapshot.drawing))
        : null;
      try {
        const pixels = hasDrawingInk(snapshot.drawing)
          ? await owner?.captureInk(snapshot.drawing)
          : null;
        if (hasDrawingInk(snapshot.drawing) && (!pixels || !observation))
          throw new Error('The drawing paper is not ready to check.');
        const empty = pixels && observation ? await observation.observe(pixels) : true;
        if (!isCurrent())
          throw new Error('The picture changed before Clear finished. Please try again.');
        const saved = keepInked && !empty ? await keepPicture(snapshot.drawing, owner) : null;
        // No copy stays inside the app, so a picture Auto-Save could not keep stays on the paper.
        if (saved && isUnsaved(saved.outcome)) {
          reportSaveFailure(saved.outcome, saved.pngBase64);
          return;
        }
        if (saved !== null && !isCurrent())
          throw new Error('Picture saved. The drawing changed, so it was kept on the paper.');
        setHistory(clearDrawing(snapshot, empty));
        afterClear();
        setNotice('Pick a color and draw.');
      } finally {
        observation?.cancel();
      }
    });
  }

  return {
    command,
    runCommand,
    scanEmpty: createEmptyScan({
      command,
      mounted,
      observations: scanObservations,
      surface,
      historyRef,
      blocked,
    }),
    undo,
    clear: (saveOnDelete: boolean) => clearCurrentPicture(saveOnDelete),
  };
}
