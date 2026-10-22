import { createInkObservationController } from './inkObservation';

export async function inkPngIsEmpty(base64: string): Promise<boolean> {
  const decoder = await import('./inkPng.web');
  return decoder.inkPngIsEmpty(base64);
}

export function createInkObservation() {
  return createInkObservationController(
    () => ({ grid: null, current: () => true, dispose() {} }),
    (base64) => inkPngIsEmpty(base64)
  );
}
