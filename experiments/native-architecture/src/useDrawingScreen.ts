import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from 'react';
import { AppState } from 'react-native';
import type { DrawingSession } from './drawing/session';
import type { DrawingSurfaceHandle } from './drawing/DrawingSurface';
import {
  changePage,
  addStrokes,
  commitDrawing,
  clearDrawing,
  undoDrawing,
  type History,
  type Stroke,
} from './drawing/model';
import {
  exportPng,
  listPictures,
  reopenPicture,
  savePicture,
  type SavedPicture,
} from './platform/drawingFiles';
import type { Brush } from './drawing/brushes';
import { createInkObservation } from './drawing/inkCoverage';
import { COLORING_PAGES, type PageId } from './drawing/pages';
import { useRendererRecovery } from './useRendererRecovery';

export function useDrawingScreen(session: DrawingSession) {
  const drawingHistory = useDrawingHistory(session);
  const { history, historyRef, setHistory, currentDrawing, scene, sceneCurrent } = drawingHistory;
  const [brush, setBrush] = useState<Brush>('marker');
  const [preparing, setPreparing] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('Pick a color and draw.');
  const [pictures, setPictures] = useState<SavedPicture[] | null>(null);
  const [pagePickerOpen, setPagePickerOpen] = useState(false);
  const settingsLease = useRef<(() => void) | null>(null);
  const surface = useRef<DrawingSurfaceHandle>(null);
  const rendererFault = useRef(false);

  const { command, runCommand, undo, clear, interruptCommands } = useSurfaceCommands({
    historyRef,
    setHistory,
    surface,
    setBusy,
    setNotice,
    report,
    scene,
    blocked: () => rendererFault.current || preparing || drawing || settingsLease.current !== null,
  });
  const foreground = useSceneLifetime(
    session,
    drawingHistory,
    surface,
    interruptCommands,
    setPreparing
  );

  function report(error: unknown) {
    setNotice(drawingErrorMessage(error));
  }

  function finishCohort(strokes: readonly Stroke[]) {
    try {
      const next = addStrokes(historyRef.current, strokes);
      setHistory(next);
      setNotice('');
    } catch (error) {
      report(error);
    }
  }

  const settings = useDrawingSettings({
    surface,
    settingsLease,
    blocked: () => commandsBlocked() || pagePickerOpen || pictures !== null,
    report,
  });
  const disabled =
    !foreground || drawing || busy || preparing || pagePickerOpen || settings.sheetOpen;

  function commandsBlocked() {
    return (
      command.current ||
      rendererFault.current ||
      preparing ||
      drawing ||
      busy ||
      settingsLease.current !== null
    );
  }

  function choosePage(pageId: PageId) {
    if (commandsBlocked()) return;
    const next = changePage(historyRef.current, pageId);
    if (next !== historyRef.current) {
      setHistory(next);
      setNotice(`${COLORING_PAGES[pageId].label} ready. Undo brings your picture back.`);
    }
    setPagePickerOpen(false);
  }

  const pictureActions = usePictureActions({
    historyRef,
    setHistory,
    surface,
    runCommand,
    setNotice,
    setPictures,
  });

  function showPictures() {
    if (commandsBlocked()) return;
    try {
      setPictures(listPictures());
      setNotice('');
    } catch (error) {
      report(error);
    }
  }

  const recovery = useRendererRecovery({
    surface,
    rendererFault,
    command,
    blocked: drawing || busy || pagePickerOpen || settings.sheetOpen || pictures !== null,
    setPreparing,
    setDrawing,
    finishCohort,
    report,
    setNotice,
    isCurrent: sceneCurrent,
  });

  return {
    recovery,
    history,
    brush,
    setBrush,
    drawing,
    setDrawing,
    busy: busy || preparing || !foreground,
    setPreparing,
    clear,
    undo,
    notice,
    pictures,
    setPictures,
    surface,
    pagePickerOpen,
    setPagePickerOpen,
    ...settings,
    choosePage,
    disabled,
    report,
    currentDrawing,
    finishCohort,
    ...pictureActions,
    showPictures,
  };
}

function useSceneLifetime(
  session: DrawingSession,
  { scene, renderScene }: ReturnType<typeof useDrawingHistory>,
  surface: RefObject<DrawingSurfaceHandle | null>,
  interruptCommands: () => void,
  setPreparing: (preparing: boolean) => void
) {
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  useLayoutEffect(() => {
    scene.current = session.attach();
    if (AppState.currentState !== 'active') scene.current.revoke();
    renderScene(scene.current);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        surface.current?.interrupt();
        scene.current?.revoke();
        interruptCommands();
        setForeground(false);
        renderScene(null);
      } else if (!scene.current?.current()) {
        scene.current = session.attach();
        renderScene(scene.current);
        setForeground(true);
        surface.current?.refreshGeometry();
        setPreparing(surface.current?.isReady() !== true);
      }
    });
    return () => {
      surface.current?.interrupt();
      scene.current?.revoke();
      subscription.remove();
    };
  }, [session]);
  return foreground;
}

function drawingErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'That did not finish. Your picture is still here.';
}

function useDrawingHistory(session: DrawingSession) {
  const history = useSyncExternalStore(session.subscribe, session.current, session.current);
  const historyRef = {
    get current() {
      return session.current();
    },
  };
  const scene = useRef<ReturnType<DrawingSession['attach']> | null>(null);
  const [lease, renderScene] = useState<ReturnType<DrawingSession['attach']> | null>(null);
  function setHistory(next: History | ((current: History) => History)) {
    scene.current?.update(next);
  }
  function currentDrawing() {
    return session.current().drawing;
  }
  return {
    history,
    historyRef,
    setHistory,
    currentDrawing,
    scene,
    renderScene,
    sceneCurrent: () => lease?.current() === true,
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
}: {
  historyRef: RefObject<History>;
  setHistory: (next: History | ((current: History) => History)) => void;
  surface: RefObject<DrawingSurfaceHandle | null>;
  runCommand: (action: (current: () => boolean) => Promise<void>) => Promise<void>;
  setNotice: (notice: string) => void;
  setPictures: (pictures: SavedPicture[] | null) => void;
}) {
  async function save() {
    await runCommand(async (current) => {
      const snapshot = historyRef.current.drawing;
      await savePicture(snapshot);
      if (current()) setNotice('Picture saved on this device.');
    });
  }

  async function exportPicture() {
    await runCommand(async (current) => {
      const snapshot = historyRef.current.drawing;
      const base64 = await surface.current?.capturePng(snapshot);
      if (!current()) return;
      if (!base64) throw new Error('The drawing paper is not ready to export.');
      if (historyRef.current.drawing !== snapshot)
        throw new Error('The picture changed before export finished. Please try again.');
      await exportPng(base64);
      if (current()) setNotice('PNG ready. Your picture is still here.');
    });
  }

  async function openPicture(picture: SavedPicture) {
    await runCommand(async (current) => {
      setNotice('');
      const saved = await reopenPicture(picture.id);
      if (!current()) return;
      setHistory((current) => commitDrawing(current, saved));
      setPictures(null);
      setNotice('Picture opened. Undo returns to your previous picture.');
    });
  }

  return { save, exportPicture, openPicture };
}

function useSurfaceCommands({
  historyRef,
  setHistory,
  surface,
  setBusy,
  setNotice,
  report,
  blocked,
  scene,
}: {
  historyRef: RefObject<History>;
  setHistory: (next: History | ((current: History) => History)) => void;
  surface: RefObject<DrawingSurfaceHandle | null>;
  setBusy: (busy: boolean) => void;
  setNotice: (notice: string) => void;
  report: (error: unknown) => void;
  blocked: () => boolean;
  scene: RefObject<ReturnType<DrawingSession['attach']> | null>;
}) {
  const command = useRef(false);
  const mounted = useRef(true);
  const operation = useRef<object | null>(null);
  const observations = useRef<ReturnType<typeof createInkObservation> | null>(null);
  if (!observations.current) observations.current = createInkObservation();
  useEffect(() => {
    if (!observations.current) observations.current = createInkObservation();
    mounted.current = true;
    return () => {
      mounted.current = false;
      observations.current?.dispose();
      observations.current = null;
    };
  }, []);
  function interruptCommands() {
    operation.current = null;
    command.current = false;
    observations.current?.dispose();
    observations.current = createInkObservation();
    setBusy(false);
  }
  async function runCommand(action: (current: () => boolean) => Promise<void>) {
    const lease = scene.current;
    if (!lease?.current() || command.current || blocked()) return;
    const token = {};
    operation.current = token;
    const current = () => mounted.current && lease.current() && operation.current === token;
    let release: (() => void) | undefined;
    try {
      if (!surface.current) throw new Error('The drawing paper is not ready.');
      release = surface.current.lockInput();
      command.current = true;
      setBusy(true);
      await action(current);
    } catch (error) {
      if (current()) report(error);
    } finally {
      release?.();
      if (current()) {
        operation.current = null;
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
    } catch (error) {
      report(error);
    } finally {
      release?.();
    }
  }

  async function clear() {
    await runCommand(async (current) => {
      const snapshot = historyRef.current;
      const owner = surface.current;
      const isCurrent = () =>
        current() &&
        command.current &&
        !blocked() &&
        historyRef.current === snapshot &&
        surface.current === owner;
      const observation = snapshot.drawing.strokes.length
        ? observations.current?.begin(isCurrent)
        : null;
      try {
        const pixels = snapshot.drawing.strokes.length
          ? await owner?.captureInk(snapshot.drawing)
          : null;
        if (snapshot.drawing.strokes.length && (!pixels || !observation))
          throw new Error('The drawing paper is not ready to check.');
        const empty = pixels && observation ? await observation.observe(pixels) : true;
        if (!isCurrent())
          throw new Error('The picture changed before Clear finished. Please try again.');
        setHistory(clearDrawing(snapshot, empty));
        setNotice('Pick a color and draw.');
      } finally {
        observation?.cancel();
      }
    });
  }

  return { command, runCommand, undo, clear, interruptCommands };
}
