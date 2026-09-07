// The preview server's real /api/free-generation-grant has no configuration and
// fails, which hides the AI wand from the drawer — mock a fresh 10-of-10 grant
// so the drawer shows the app as a configured install sees it.
const mockFreeGrant = (page) =>
  page.route('**/api/free-generation-grant', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, limit: 10, remaining: 10, exhausted: false }),
    })
  );

// Capture mode (web/src/lib/storeCapture.ts) drops the free-generation count
// off the wand button: a per-install number that reads as noise in a marketing
// shot. Set before navigation so it is true by the app's first paint.
const enableCaptureMode = (page) =>
  page.addInitScript(() => {
    window.__storeCapture = true;
  });

// Every scene wants both: the app as a configured install shows it, without
// the install-specific badge.
export const prepareCapture = async (page) => {
  await mockFreeGrant(page);
  await enableCaptureMode(page);
};
