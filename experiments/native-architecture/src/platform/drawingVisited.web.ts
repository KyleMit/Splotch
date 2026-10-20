// Stamps the session flag shipping's drawing route writes on mount (routes/+page.svelte), which
// drawingArrival.web.ts reads back on the information and not-found pages. The key and flag are
// written inline, not imported from backLabel.ts: that module ships in the lazy page chunk, and
// importing it here carries it onto the startup path check-native-web-startup.mjs budgets.
// rsd-native-web-app-pages.test.mjs marks through the drawing screen and reads through the pages,
// so a literal that drifts from DRAWING_VISITED_SESSION_KEY or DRAWING_VISITED_FLAG fails there.
export function markDrawingVisited() {
  try {
    sessionStorage.setItem('splotch-drawing-visited', '1');
  } catch {
    // Blocked storage leaves the back link on its cold-visit label.
  }
}
