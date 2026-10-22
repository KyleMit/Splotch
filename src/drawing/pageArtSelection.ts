import type { useDrawingHistory } from '../product/DrawingSession';
import { offlineLibrary } from '../offlineLibrary/runtime';
import { changePage } from './model';
import { pageLabel, type PageId } from './pages';

export type PagePickerLifetime = {
  open: boolean;
  generation: number;
  revision: number;
  pending?: {
    dismiss: () => void;
    cancel: () => void;
  };
};

function waitForPickerRetirement(
  lifetime: PagePickerLifetime,
  generation: number,
  setPickerOpen: (open: boolean) => void
) {
  return new Promise<boolean>((resolve) => {
    let phase: { kind: 'dismissal' } | { kind: 'frame'; frame: number } | { kind: 'finished' } = {
      kind: 'dismissal',
    };
    function finish(retired: boolean) {
      if (phase.kind === 'finished') return;
      if (phase.kind === 'frame') cancelAnimationFrame(phase.frame);
      phase = { kind: 'finished' };
      if (lifetime.pending === pending) lifetime.pending = undefined;
      resolve(retired);
    }
    const pending = {
      dismiss() {
        if (phase.kind !== 'dismissal' || lifetime.pending !== pending) return;
        phase = {
          kind: 'frame',
          frame: requestAnimationFrame(() =>
            finish(lifetime.pending === pending && lifetime.generation === generation)
          ),
        };
      },
      cancel: () => finish(false),
    };
    lifetime.pending = pending;
    lifetime.open = false;
    setPickerOpen(false);
  });
}

export async function prepareColoringPage(
  history: ReturnType<typeof useDrawingHistory>,
  lifetime: PagePickerLifetime,
  setPickerOpen: (open: boolean) => void,
  setNotice: (message: string) => void,
  pageId: PageId,
  generation: number
): Promise<void> {
  const isOpen = () => lifetime.open && lifetime.generation === generation;
  if (!isOpen() || !history.coloringBookEnabled.current) return;
  const revision = lifetime.revision;
  const isCurrent = () => lifetime.generation === generation && lifetime.revision === revision;
  await offlineLibrary.openPage(pageId);
  if (!isCurrent() || !history.coloringBookEnabled.current || !isOpen()) return;
  if (
    !(await waitForPickerRetirement(lifetime, generation, setPickerOpen)) ||
    !isCurrent() ||
    !history.coloringBookEnabled.current
  )
    return;
  const next = changePage(history.historyRef.current, pageId);
  if (next !== history.historyRef.current) {
    history.setHistory(next);
    setNotice(`${pageLabel(pageId)} ready.`);
  }
}
