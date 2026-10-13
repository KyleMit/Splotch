import { useEffect, useRef, type RefObject } from 'react';
import type { DrawingSurfaceHandle } from './drawing/DrawingSurface';
import { createInkObservation } from './drawing/inkCoverage';
import type { Drawing, History } from './drawing/model';
import { drawingPaperSize } from './drawing/paperSpace';

// The eraser's idle blank-page check: it reads the ink back as Clear does, on its own observer so
// it never holds Clear's. It takes the paper only when nothing else holds it, and gives the paper
// up the moment a command or Undo wants it; a check that gave way or found the paper busy asks to
// be tried after another idle wait.
export function createEmptyScan({
  command,
  scanning,
  mounted,
  observations,
  surface,
  historyRef,
  blocked,
}: {
  command: RefObject<boolean>;
  scanning: RefObject<(() => void) | null>;
  mounted: RefObject<boolean>;
  observations: RefObject<ReturnType<typeof createInkObservation> | null>;
  surface: RefObject<DrawingSurfaceHandle | null>;
  historyRef: RefObject<History>;
  blocked: () => boolean;
}) {
  return async (snapshot: Drawing): Promise<boolean | 'busy'> => {
    const owner = surface.current;
    if (
      command.current ||
      scanning.current ||
      blocked() ||
      !owner ||
      historyRef.current.drawing !== snapshot
    )
      return 'busy';
    let release: () => void;
    try {
      release = owner.lockInput();
    } catch {
      return 'busy';
    }
    let yielded = false;
    let observation: ReturnType<NonNullable<typeof observations.current>['begin']> | undefined;
    function stop() {
      observation?.cancel();
      release();
      if (scanning.current === yieldPaper) scanning.current = null;
    }
    function yieldPaper() {
      yielded = true;
      stop();
    }
    scanning.current = yieldPaper;
    const isCurrent = () =>
      !yielded &&
      mounted.current &&
      historyRef.current.drawing === snapshot &&
      surface.current === owner;
    try {
      observation = observations.current?.begin(isCurrent, drawingPaperSize(snapshot));
      if (!observation) throw new Error('Picture observation is not ready.');
      const empty = await observation.observe(await owner.captureInk(snapshot));
      return yielded ? 'busy' : empty;
    } catch (error) {
      if (yielded) return 'busy';
      throw error;
    } finally {
      stop();
    }
  };
}

// Clear's ink observer and the idle blank-page check's own, live while the screen is mounted.
export function useInkObservers(scanning: RefObject<(() => void) | null>) {
  const mounted = useRef(true);
  const observations = useRef<ReturnType<typeof createInkObservation> | null>(null);
  const scanObservations = useRef<ReturnType<typeof createInkObservation> | null>(null);
  if (!observations.current) observations.current = createInkObservation();
  if (!scanObservations.current) scanObservations.current = createInkObservation();
  useEffect(() => {
    if (!observations.current) observations.current = createInkObservation();
    if (!scanObservations.current) scanObservations.current = createInkObservation();
    const owners = [observations.current, scanObservations.current];
    mounted.current = true;
    return () => {
      mounted.current = false;
      scanning.current?.();
      owners.forEach((owner) => owner.dispose());
      if (observations.current === owners[0]) observations.current = null;
      if (scanObservations.current === owners[1]) scanObservations.current = null;
    };
  }, [scanning]);
  return { mounted, observations, scanObservations };
}
