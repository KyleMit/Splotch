import type { PwaDrawingState } from './pwaDrawingState';

// The native apps bundle every asset, so only the web export registers a worker.
export function usePWAUpdates(_state: PwaDrawingState, _active: boolean) {}
