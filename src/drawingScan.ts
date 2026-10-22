import { useEffect, useRef, type RefObject } from 'react';
import type { CapturedPaper, DrawingSurfaceHandle } from './drawing/DrawingSurface';
import { createInkObservation } from './drawing/inkCoverage';
import type { Drawing, History } from './drawing/model';

// The eraser's idle blank-page check: it reads the ink back as Clear does, on its own observer so
// it never holds Clear's, under the surface's background lease. Any foreground claim on the paper
// (a contact, a command, Undo, a sheet, AI preparation) preempts that lease before it proceeds, so
// the check never refuses or delays one; a check that was preempted, or found the paper busy,
// asks to be tried after another idle wait.
export function createEmptyScan({
  command,
  mounted,
  observations,
  surface,
  historyRef,
  blocked,
}: {
  command: RefObject<boolean>;
  mounted: RefObject<boolean>;
  observations: RefObject<ReturnType<typeof createInkObservation> | null>;
  surface: RefObject<DrawingSurfaceHandle | null>;
  historyRef: RefObject<History>;
  blocked: () => boolean;
}) {
  return async (snapshot: Drawing): Promise<boolean | 'busy'> => {
    const owner = surface.current;
    if (command.current || blocked() || !owner || historyRef.current.drawing !== snapshot)
      return 'busy';
    let preempted = false;
    let observation: ReturnType<NonNullable<typeof observations.current>['begin']> | undefined;
    let release: () => void;
    try {
      release = owner.lockBackground(() => {
        preempted = true;
        observation?.cancel();
      });
    } catch {
      return 'busy';
    }
    const isCurrent = () =>
      !preempted &&
      mounted.current &&
      historyRef.current.drawing === snapshot &&
      surface.current === owner;
    let captured: CapturedPaper | undefined;
    try {
      captured = await owner.captureInk(snapshot);
      const pixels = captured;
      observation = observations.current?.begin(
        () => isCurrent() && pixels.isCurrent(),
        pixels.size
      );
      if (!observation) throw new Error('Picture observation is not ready.');
      const empty = await observation.observe(captured.base64);
      return preempted || !captured.isCurrent() ? 'busy' : empty;
    } catch (error) {
      if (preempted || (captured && !captured.isCurrent())) return 'busy';
      throw error;
    } finally {
      observation?.cancel();
      release();
    }
  };
}

// Clear's ink observer and the idle blank-page check's own, live while the screen is mounted.
export function useInkObservers() {
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
      owners.forEach((owner) => owner.dispose());
      if (observations.current === owners[0]) observations.current = null;
      if (scanObservations.current === owners[1]) scanObservations.current = null;
    };
  }, []);
  return { mounted, observations, scanObservations };
}
