import { dev } from '$app/environment';

// The /dev/engine harness intentionally mutates this unlike the drawing route's
// read-only seams: simulated rotation has no equivalent DOM state to drive.
// The compile-time gate drops both the state and currentScreenAngle branch from
// release builds.
let screenAngleOverride: number | null = null;
export function setScreenAngleOverride(angle: number | null) {
  if (!dev && !__DEV_HARNESS__) return;
  screenAngleOverride = angle;
}

// The Screen Orientation angle the paper's rotation lock compares against
// (ADR-0050); a browser without the API reads 0, so rotation degrades to a
// plain resize.
export function currentScreenAngle(): number {
  if ((dev || __DEV_HARNESS__) && screenAngleOverride !== null) return screenAngleOverride;
  const angle = window.screen?.orientation?.angle;
  return typeof angle === 'number' ? angle : 0;
}
