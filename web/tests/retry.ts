import { expect, type Locator } from '@playwright/test';

// The suite's retrying-interaction primitive. It lives in its own module rather
// than in helpers.ts because admin-helpers.ts needs it and that module is
// imported by playwright.shared.ts — i.e. by the Playwright config itself, whose
// import graph must not reach into web/src.

// Open an overlay/flyout/dialog robustly and leave it open. Several of these
// controls idle-mount (ADR-0049) or reposition on the first frame, so the first
// click can land before the handler is wired and be dropped; a flyout toggle
// must also not be re-clicked when it's already open (that would toggle it
// shut). Retry the whole open until `ready` — the control's presence sentinel —
// is visible, skipping the click whenever it already is. `open` owns the click
// (and its own per-click timeout); `settle` is the per-attempt wait for `ready`.
export async function retryOpen(
  ready: Locator,
  open: () => Promise<void>,
  { timeout = 10_000, settle = 1500 }: { timeout?: number; settle?: number } = {}
) {
  await expect(async () => {
    if (!(await ready.isVisible().catch(() => false))) await open();
    await expect(ready).toBeVisible({ timeout: settle });
  }).toPass({ timeout });
}
