import { useEffect, useRef, useState, type RefObject } from 'react';
import type { DrawingSurfaceHandle } from './drawing/DrawingSurface';
import type { Stroke } from './drawing/model';

type RecoveryOptions = {
  surface: RefObject<DrawingSurfaceHandle | null>;
  command: RefObject<boolean>;
  rendererFault: RefObject<boolean>;
  blocked: boolean;
  setPreparing: (busy: boolean) => void;
  setDrawing: (drawing: boolean) => void;
  finishStroke: (stroke: Stroke) => void;
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
      if (!current.current.surface.current) throw new Error('The drawing paper is not ready.');
      release = current.current.surface.current.lockInput();
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

  return {
    generation,
    failed,
    retry,
    retryDisabled: options.blocked,
    callbacks: {
      onStroke(stroke: Stroke) {
        if (valid()) current.current.finishStroke(stroke);
      },
      onDrawingChange(drawing: boolean) {
        if (valid()) current.current.setDrawing(drawing);
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
        faultGeneration.current = generation;
        current.current.rendererFault.current = true;
        current.current.setPreparing(true);
        setFailed(true);
        current.current.report(error);
      },
    },
  };
}
