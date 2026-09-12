import { scheduleIdle } from './idle';

export const QUICKSAND_FONT_FAMILY = 'Quicksand Variable';

/**
 * Warms the display font so the first text-bearing overlay does not flash the
 * system fallback.
 *
 * `@font-face` only fetches a font when text using it is first painted, and the
 * drawing screen paints none — so without this, Quicksand downloads at the
 * moment Settings or an AI prompt opens. That same fact is why the warm runs at
 * idle: there is no deadline before that overlay, so the fetch has no business
 * in the window the rest of the boot path is scheduled out of. Every comparable
 * prefetch here (bootHiddenOverlays, coloringPacks, the service-worker
 * registration) goes through $lib/idle too.
 *
 * Skipped under Save-Data, matching the offline install in pwa/updates.ts: a
 * parent who asked for less traffic should not be spent ~28 KB on a font no
 * visible text needs yet. @font-face still fetches it when a dialog paints.
 *
 * Returns the canceller, so a caller unmounting before the idle slot arrives
 * does not leave the work queued.
 */
export function warmDisplayFont(): () => void {
  return scheduleIdle(() => {
    if (navigator.connection?.saveData === true) return;
    if (!('fonts' in document)) return;
    document.fonts.load(`1em "${QUICKSAND_FONT_FAMILY}"`).catch(() => {});
  });
}
