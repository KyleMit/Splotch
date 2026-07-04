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
import type { Origin } from '$lib/state/ui.svelte';

// Buttons are 48px; a 72px radius covers the target plus the slop of a
// toddler's aim without reaching neighbouring controls.
const DEFAULT_RADIUS = 72;
// Fly-in is 0.35s (app.css); hold a little past it so the dialog is plainly
// present before the backdrop goes live.
const DEFAULT_DURATION_MS = 600;

interface DeadZone {
  x: number;
  y: number;
  radiusSq: number;
  expiresAt: number;
}

let zones: DeadZone[] = [];

export interface LaunchGuardOptions {
  radius?: number;
  durationMs?: number;
}

// Arm a dead zone at the launching button's center. A null origin (a modal
// opened with no anchor, e.g. via keyboard) simply arms nothing.
export function guardLaunchZone(origin: Origin | null, options: LaunchGuardOptions = {}) {
  if (!origin) return;
  const radius = options.radius ?? DEFAULT_RADIUS;
  const durationMs = options.durationMs ?? DEFAULT_DURATION_MS;
  zones = liveZones();
  zones.push({
    x: origin.x,
    y: origin.y,
    radiusSq: radius * radius,
    expiresAt: Date.now() + durationMs,
  });
}

// True while a point sits inside an unexpired dead zone. Prunes lapsed zones as
// it goes, so no timer is needed to reclaim them.
export function isPointInLaunchZone(x: number, y: number): boolean {
  const now = Date.now();
  let hit = false;
  const surviving: DeadZone[] = [];
  for (const zone of zones) {
    if (zone.expiresAt <= now) continue;
    surviving.push(zone);
    const dx = x - zone.x;
    const dy = y - zone.y;
    if (dx * dx + dy * dy <= zone.radiusSq) hit = true;
  }
  zones = surviving;
  return hit;
}

// Drop every armed zone. modalDialog calls this on close so a zone from the
// modal just dismissed can't bleed into whichever one opens next.
export function clearLaunchZones() {
  zones = [];
}

function liveZones() {
  const now = Date.now();
  return zones.filter((zone) => zone.expiresAt > now);
}
