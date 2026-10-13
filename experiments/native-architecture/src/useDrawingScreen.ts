import type { Drawing7 } from './drawing/recordedTypes7';
import type { CompletedCohort7 } from './drawing/recordedContactCohort7';
import type { PaperReference } from './drawing/paperSpace';
import { useDrawingHistory } from './product/DrawingSession';
import { protectedDraftPageIds } from './platform/drawingDraft';
import { offlineLibrary } from './offlineLibrary/runtime';
import { useOfflineLibrary } from './offlineLibrary/useOfflineLibrary';
import { useEffect, useRef, useState, type RefObject } from 'react';
import type { DrawingSurfaceHandle } from './drawing/DrawingSurface';
import {
  changePage,
  addStrokes,
  addRecordedCohort,
  retainRecordedAllocation,
  hasDrawingInk,
  commitDrawing,
  clearDrawing,
  undoDrawing,
  type History,
  type Stroke,
} from './drawing/model';
import {
  listPictures,
  reopenPicture,
  savePicture,
  savedColoringPageIds,
  type SavedPicture,
} from './platform/drawingFiles';
import { useBrushPreferences } from './useBrushPreferences';
import { availableBrushes, brushControl, type OptionalBrush } from './settings/brushPreferences';
import type { Brush } from './drawing/brushes';
import { createInkObservation } from './drawing/inkCoverage';
import { pageLabel, type PageId } from './drawing/pages';
import { useRendererRecovery } from './useRendererRecovery';
import { usePngRecovery } from './usePngRecovery';

export function useDrawingScreen() {
  const historyOwner = useDrawingHistory();
  const replacementGuard = useHistoryReplacementGuard();
  const { history, historyRef, setHistory, currentDrawing } = historyOwner;
  const brushes = useBrushPreferences();
  const brush = brushes.state.brush;
  const brushActions = brushPreferenceActions(brushes);
  const [preparing, setPreparing] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [commandBusy, setBusy] = useState(false);
  const busy = commandBusy || historyOwner.draftState.status === 'loading';
  const [notice, setNotice] = useState('Pick a color and draw.');
  const [pictures, setPictures] = useState<SavedPicture[] | null>(null);
  const [pagePickerOpen, setPagePickerOpen] = useState(false);
  const library = useColoringLibrary(historyRef, drawing, pagePickerOpen);
  const settingsLease = useRef<(() => void) | null>(null);
  const surface = useRef<DrawingSurfaceHandle>(null);
  const rendererFault = useRef(false);
  const pngRecovery = usePngRecovery();
  const report = (error: unknown) => setNotice(drawingErrorMessage(error));

  const { command, runCommand, ...surfaceActions } = useSurfaceCommands({
    historyRef,
    setHistory,
    surface,
    setBusy,
    setNotice,
    report,
    afterClear: () => brushes.owner.current?.resetAfterClear(),
    blocked: () =>
      busy || rendererFault.current || preparing || drawing || settingsLease.current !== null,
  });

  const finishCohort = createCohortCommit(historyRef, setHistory, setNotice, report);

  const { finishRecordedCohort, retainAllocation } = recordedCommitActions(
    historyRef,
    setHistory,
    setNotice
  );

  const settings = useDrawingSettings({
    surface,
    settingsLease,
    blocked: () =>
      drawing ||
      busy ||
      preparing ||
      pagePickerOpen ||
      pictures !== null ||
      command.current ||
      rendererFault.current,
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

  const pictureActions = usePictureActions({
    historyRef,
    setHistory,
    surface,
    runCommand,
    setNotice,
    setPictures,
    pngRecovery,
    commandsBlocked,
    report,
    replacementGuard,
  });

  const recovery = useRendererRecovery({
    surface,
    rendererFault,
    command,
    blocked: drawing || busy || pagePickerOpen || settings.sheetOpen || pictures !== null,
    setPreparing,
    setDrawing,
    finishCohort,
    finishRecordedCohort,
    retainAllocation,
    report,
    setNotice,
  });

  return {
    library,
    recovery,
    pngRecovery,
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
    pictures,
    setPictures,
    surface,
    pagePickerOpen,
    ...coloring,
    ...settings,
    disabled,
    report,
    currentDrawing,
    finishCohort,
    ...pictureActions,
  };
}

function recordedCommitActions(
  historyRef: RefObject<History>,
  setHistory: ReturnType<typeof useDrawingHistory>['setHistory'],
  setNotice: (notice: string) => void
) {
  function finishRecordedCohort(base: Drawing7, cohort: CompletedCohort7): Drawing7 {
    const next = addRecordedCohort(historyRef.current, base, cohort);
    if (next.drawing.version !== 7) throw new Error('The recorded drawing mode changed.');
    setHistory(next);
    setNotice('');
    return next.drawing;
  }

  function retainAllocation(base: Drawing7, cursor: number) {
    const next = retainRecordedAllocation(historyRef.current, base, cursor);
    if (next !== historyRef.current) setHistory(next);
  }

  return { finishRecordedCohort, retainAllocation };
}

function createCohortCommit(
  historyRef: RefObject<History>,
  setHistory: ReturnType<typeof useDrawingHistory>['setHistory'],
  setNotice: (notice: string) => void,
  report: (error: unknown) => void
) {
  return (strokes: readonly Stroke[], paper: PaperReference) => {
    try {
      setHistory(addStrokes(historyRef.current, strokes, paper));
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
    selectInkBrush: () => brushes.owner.current?.selectInkBrush(),
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

function drawingErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'That did not finish. Your picture is still here.';
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

function usePictureActions({
  historyRef,
  setHistory,
  surface,
  runCommand,
  setNotice,
  setPictures,
  pngRecovery,
  commandsBlocked,
  report,
  replacementGuard,
}: {
  historyRef: RefObject<History>;
  setHistory: (next: History | ((current: History) => History)) => void;
  surface: RefObject<DrawingSurfaceHandle | null>;
  runCommand: (action: () => Promise<void>) => Promise<void>;
  setNotice: (notice: string) => void;
  setPictures: (pictures: SavedPicture[] | null) => void;
  pngRecovery: ReturnType<typeof usePngRecovery>;
  commandsBlocked: () => boolean;
  report: (error: unknown) => void;
  replacementGuard: () => () => boolean;
}) {
  function showPictures() {
    if (commandsBlocked()) return;
    try {
      setPictures(listPictures());
      setNotice('');
    } catch (error) {
      report(error);
    }
  }

  async function save() {
    await runCommand(async () => {
      const snapshot = historyRef.current.drawing;
      await savePicture(snapshot);
      setNotice('Picture saved on this device.');
    });
  }

  async function exportPicture() {
    await runCommand(async () => {
      const snapshot = historyRef.current.drawing;
      const base64 = await surface.current?.capturePng(snapshot);
      if (!base64) throw new Error('The drawing paper is not ready to export.');
      if (historyRef.current.drawing !== snapshot)
        throw new Error('The picture changed before export finished. Please try again.');
      await pngRecovery.submit(base64);
      setNotice('');
    });
  }

  async function openPicture(picture: SavedPicture) {
    await runCommand(async () => {
      const isCurrent = replacementGuard();
      setNotice('');
      const saved = await reopenPicture(picture.id);
      if (!isCurrent()) return;
      setHistory((current) => commitDrawing(current, saved));
      setPictures(null);
      setNotice('Picture opened. Undo returns to your previous picture.');
    });
  }

  return { save, exportPicture, openPicture, showPictures };
}

function useSurfaceCommands({
  historyRef,
  setHistory,
  surface,
  setBusy,
  setNotice,
  report,
  blocked,
  afterClear,
}: {
  historyRef: RefObject<History>;
  setHistory: (next: History | ((current: History) => History)) => void;
  surface: RefObject<DrawingSurfaceHandle | null>;
  setBusy: (busy: boolean) => void;
  setNotice: (notice: string) => void;
  report: (error: unknown) => void;
  blocked: () => boolean;
  afterClear: () => void;
}) {
  const command = useRef(false);
  const mounted = useRef(true);
  const observations = useRef<ReturnType<typeof createInkObservation> | null>(null);
  if (!observations.current) observations.current = createInkObservation();
  useEffect(() => {
    if (!observations.current) observations.current = createInkObservation();
    const owner = observations.current;
    mounted.current = true;
    return () => {
      mounted.current = false;
      owner.dispose();
      if (observations.current === owner) observations.current = null;
    };
  }, []);
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

  async function clearCurrentPicture(saveFirst: boolean) {
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
        ? observations.current?.begin(isCurrent)
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
        if (saveFirst) {
          await savePicture(snapshot.drawing);
          if (!isCurrent())
            throw new Error('Picture saved. The drawing changed, so it was kept on the paper.');
        }
        setHistory(clearDrawing(snapshot, empty));
        afterClear();
        setNotice(
          saveFirst
            ? 'Picture saved on this device. Pick a color and draw.'
            : 'Pick a color and draw.'
        );
      } finally {
        observation?.cancel();
      }
    });
  }

  return {
    command,
    runCommand,
    undo,
    clear: () => clearCurrentPicture(false),
    saveAndClear: () => clearCurrentPicture(true),
  };
}
