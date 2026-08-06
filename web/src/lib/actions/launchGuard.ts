// A toddler rarely hits a launch button just once: they mash the spot several
// times before registering that anything happened. The first tap opens the
// modal; the follow-ups land on the freshly-raised backdrop right where the
// button was — and a backdrop tap dismisses the dialog, so the modal flickers
// shut the instant it opened.
//
// ColorPicker already carved out a permanent block zone around its launching
// swatch to survive this (see isPointInGradientBlockZone). This generalises
// that idea for every modal, but deliberately *not* forever: a launch registers
// a circular dead zone around the triggering button that swallows taps for just
// long enough (the ~0.35s fly-in plus a beat to notice) before self-clearing.
// After it lapses a deliberate tap in the same spot dismisses as usual.
//
// modalDialog registers the zone on open and consults it before dismissing on a
// backdrop tap, so any modal that passes an `origin` is covered automatically.
//
// The hazard is not really about modals, though — it is about any tap that
// repaints something else under the finger, which the follow-up taps then work.
// guardTapZone exposes the primitive for those: the coloring book picker arms a
// zone when a cover tile swaps the grid for that book's pages, so the rest of
// the burst can't pick whichever page landed under the finger and close the
// picker before the child ever saw the pages.
import type { Origin } from '$lib/state/modal.svelte';

// Buttons are 48px; a 72px radius covers the target plus the slop of a
// toddler's aim without reaching neighbouring controls.
export const DEFAULT_RADIUS = 72;
// Long enough to outlast a toddler's tap burst, and past the modal fly-in
// (0.35s in app.css) so the dialog is plainly present before the backdrop goes
// live.
export const DEFAULT_DURATION_MS = 600;

interface DeadZone {
  x: number;
  y: number;
  radiusSq: number;
  expiresAt: number;
}

// Module-level singleton, intentionally: there is only ever one modal-launch
// context in the app, and modalDialog owns clearing it via clearLaunchZones()
// on close.
let zones: DeadZone[] = [];

// Arm a dead zone at a tap point. Callers outside a modal launch pass the
// pointer's own coordinates rather than the tapped element's center: a coloring
// tile is far wider than the 48px buttons DEFAULT_RADIUS was sized for, so a
// zone centred on the tile would leave a corner tap's repeats outside it.
export function guardTapZone(x: number, y: number) {
  pruneLapsedZones();
  zones.push({
    x,
    y,
    radiusSq: DEFAULT_RADIUS * DEFAULT_RADIUS,
    expiresAt: Date.now() + DEFAULT_DURATION_MS,
  });
}

// Arm a dead zone at the launching button's center. A null origin (a modal
// opened with no anchor, e.g. via keyboard) simply arms nothing.
export function guardLaunchZone(origin: Origin | null) {
  if (!origin) return;
  guardTapZone(origin.x, origin.y);
}

// True while a point sits inside an unexpired dead zone.
export function isPointInLaunchZone(x: number, y: number): boolean {
  return pruneLapsedZones().some((zone) => (x - zone.x) ** 2 + (y - zone.y) ** 2 <= zone.radiusSq);
}

// Drop every armed zone. modalDialog calls this on close so a zone from the
// modal just dismissed can't bleed into whichever one opens next.
export function clearLaunchZones() {
  zones = [];
}

// Drops lapsed zones in place and returns what survives. Both the arm and the
// query path run it, which is the timer-free reclamation strategy — and the
// reason isPointInLaunchZone has a write behind it.
function pruneLapsedZones(): DeadZone[] {
  const now = Date.now();
  zones = zones.filter((zone) => zone.expiresAt > now);
  return zones;
}
