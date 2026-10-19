import type { PaperReference } from './drawing/paperSpace';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { DrawingSurfaceHandle } from './drawing/DrawingSurface';
import type { Stroke } from './drawing/model';

type RecoveryOptions = {
  surface: RefObject<DrawingSurfaceHandle | null>;
  command: RefObject<boolean>;
  rendererFault: RefObject<boolean>;
  blocked: boolean;
  setPreparing: (busy: boolean) => void;
  setDrawing: (drawing: boolean) => void;
  setActivePaper: (paper: PaperReference | null) => void;
  finishCohort: (strokes: readonly Stroke[], paper: PaperReference) => void;
  report: (error: unknown) => void;
  setNotice: (notice: string) => void;
};

export function useRendererRecovery(options: RecoveryOptions) {
  const [generation, setGeneration] = useState(0);
  const [failed, setFailed] = useState(false);
  const currentGeneration = useRef(generation);
  const faultGeneration = useRef<number | null>(null);
  const recoveringGeneration = useRef<number | null>(null);
  const mounted = useRef(true);
  const current = useRef(options);
  current.current = options;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  function valid() {
    return mounted.current && currentGeneration.current === generation;
  }

  function retry() {
    if (
      !valid() ||
      faultGeneration.current !== generation ||
      current.current.command.current ||
      current.current.blocked
    )
      return;
    let release: (() => void) | undefined;
    try {
      release = current.current.surface.current?.lockInput();
      const next = generation + 1;
      currentGeneration.current = next;
      faultGeneration.current = null;
      recoveringGeneration.current = next;
      current.current.rendererFault.current = false;
      current.current.setPreparing(true);
      setFailed(false);
      setGeneration(next);
      current.current.setNotice('Preparing your picture.');
    } catch (error) {
      current.current.report(error);
    } finally {
      release?.();
    }
  }

  // The paper's handlers stay the same objects for a generation, so a drawing-screen render that
  // changes nothing the paper shows leaves its memoized surface alone (NativePaper.tsx). Each reads
  // the latest options through `current`.
  const callbacks = useMemo(() => {
    const valid = () => mounted.current && currentGeneration.current === generation;
    return {
      onCohort(strokes: readonly Stroke[], paper: PaperReference) {
        if (valid()) current.current.finishCohort(strokes, paper);
      },
      onDrawingChange(drawing: boolean, paper: PaperReference | null) {
        if (valid()) {
          current.current.setDrawing(drawing);
          current.current.setActivePaper(paper);
        }
      },
      onPreparingChange(busy: boolean) {
        if (!valid() || (!busy && faultGeneration.current === generation)) return;
        current.current.setPreparing(busy);
        if (!busy && recoveringGeneration.current === generation) {
          recoveringGeneration.current = null;
          current.current.setNotice('Your picture is ready.');
        }
      },
      onError(error: unknown) {
        if (valid()) current.current.report(error);
      },
      onRendererFault(error: unknown) {
        if (!valid()) return;
        if (recoveringGeneration.current !== generation) {
          const next = generation + 1;
          currentGeneration.current = next;
          recoveringGeneration.current = next;
          current.current.rendererFault.current = false;
          current.current.setPreparing(true);
          setGeneration(next);
          return;
        }
        faultGeneration.current = generation;
        current.current.rendererFault.current = true;
        current.current.setPreparing(true);
        setFailed(true);
        current.current.report(error);
      },
    };
  }, [generation]);

  return {
    generation,
    failed,
    retry,
    retryDisabled: options.blocked,
    callbacks,
  };
}
