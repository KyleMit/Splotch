import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { View, LayoutChangeEvent } from 'react-native';
import { measurePaper } from '../drawing/measurePaper';
import { sameBox, sameSize, type AreaBox as Box, type AreaSize } from './edgeLayout';
import type { MeasuredPaperArea, MeasuredPaperAreaResult } from './useMeasuredPaperArea';

export function useMeasuredPaperArea({ width, height }: AreaSize): MeasuredPaperAreaResult {
  const host = useRef<View>(null);
  const [measured, setMeasured] = useState<MeasuredPaperArea>();
  const update = useCallback(
    (boxFor: (previous: Box | undefined) => Box) => {
      const window = { width, height };
      setMeasured((previous) => {
        const box = boxFor(previous?.box);
        return sameBox(previous?.box, box) && sameSize(previous?.window, window)
          ? previous
          : { box, window };
      });
    },
    [width, height]
  );
  const onLayout = useCallback(
    ({ nativeEvent }: LayoutChangeEvent) => update(() => nativeEvent.layout),
    [update]
  );
  useLayoutEffect(() => {
    let active = true;
    measurePaper(host.current, (frame) => {
      if (!active || !frame) return;
      update((previous) => ({
        x: previous?.x ?? 0,
        y: previous?.y ?? 0,
        width: frame.width,
        height: frame.height,
      }));
    });
    return () => {
      active = false;
    };
  }, [update]);
  return {
    host,
    onLayout,
    area: measured?.box,
    window: measured?.window ?? { width, height },
  };
}
