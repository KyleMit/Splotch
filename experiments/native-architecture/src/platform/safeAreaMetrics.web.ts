import { useSyncExternalStore } from 'react';
import type { Metrics } from 'react-native-safe-area-context';
import { firstFrameWindow } from './firstFrameWindow';

const NO_SUBSCRIPTION = () => () => {};
const MEASURED_INSETS = () => null;

let metrics: Metrics | undefined;
function firstFrameSafeAreaMetrics(): Metrics {
  const { width, height } = firstFrameWindow();
  if (metrics?.frame.width !== width || metrics.frame.height !== height)
    metrics = {
      frame: { x: 0, y: 0, width, height },
      insets: { top: 0, right: 0, bottom: 0, left: 0 },
    };
  return metrics;
}

// The safe-area provider renders nothing until the browser reports its insets, a frame after
// mount. The build's render and the browser's hydrating render start from no insets instead (the
// server snapshot); every later mount measures, as it does without a prerendered frame.
export function useInitialSafeAreaMetrics(): Metrics | null {
  return useSyncExternalStore(NO_SUBSCRIPTION, MEASURED_INSETS, firstFrameSafeAreaMetrics);
}
