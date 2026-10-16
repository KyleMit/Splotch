import { useCallback, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { View, LayoutChangeEvent } from 'react-native';
import { measurePaper } from '../drawing/measurePaper';
import { createResizeListener } from '../../../../web/src/lib/drawing/resizeListener';
import { sameBox, sameSize, type AreaBox as Box, type AreaSize } from './edgeLayout';

export type MeasuredPaperArea = Readonly<{ box: Box; window: AreaSize; layoutOnly?: boolean }>;

export type MeasuredPaperAreaResult = Readonly<{
  host: RefObject<View | null>;
  onLayout: (event: LayoutChangeEvent) => void;
  area?: Box;
  window: AreaSize;
  layoutOnly?: boolean;
}>;

export function useMeasuredPaperArea({ width, height }: AreaSize): MeasuredPaperAreaResult {
  const host = useRef<View>(null);
  const [measured, setMeasured] = useState<MeasuredPaperArea>();
  const current = useRef<{
    box?: Box;
    window: AreaSize;
    generation: number;
    active: boolean;
  }>({ window: { width, height }, generation: 0, active: false });
  // Insets and toolbar layout settle after window metrics; provisional boxes cannot adopt paper.
  const resize = useMemo(() => {
    const publish = (settled: boolean, layoutOnly: boolean) => {
      const { box, window } = current.current;
      if (!box || !current.current.active) return;
      setMeasured((previous) => {
        const confirmedWindow = settled ? window : (previous?.window ?? window);
        return sameBox(previous?.box, box) &&
          sameSize(previous?.window, confirmedWindow) &&
          previous?.layoutOnly === layoutOnly
          ? previous
          : { box, window: confirmedWindow, layoutOnly };
      });
    };
    return createResizeListener(
      () => publish(false, true),
      (layoutOnly) => publish(true, layoutOnly)
    );
  }, []);
  const onLayout = useCallback(
    ({ nativeEvent }: LayoutChangeEvent) => {
      if (!current.current.active) return;
      current.current.generation += 1;
      current.current.box = nativeEvent.layout;
      resize.handleLayoutResize();
    },
    [resize]
  );
  useLayoutEffect(() => {
    const state = current.current;
    state.active = true;
    state.window = { width, height };
    const generation = ++state.generation;
    resize.handleResize();
    measurePaper(host.current, (frame) => {
      if (!state.active || state.generation !== generation || !frame) return;
      state.box = {
        x: state.box?.x ?? 0,
        y: state.box?.y ?? 0,
        width: frame.width,
        height: frame.height,
      };
      resize.handleLayoutResize();
    });
    return () => {
      state.active = false;
      state.generation += 1;
      resize.dispose();
    };
  }, [width, height, resize]);
  return {
    host,
    onLayout,
    area: measured?.box,
    window: measured?.window ?? { width, height },
    layoutOnly: measured?.layoutOnly,
  };
}
