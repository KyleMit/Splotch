import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { useBundledPageOutlines } from '../../src/drawing/bundledOutlines.ts';

const OUTLINE_LOAD_TIMEOUT_MS = 5000;
const OUTLINE_POLL_MS = 5;

// The native apps read a page's line art on first use, so a test renders a consumer of each page
// until it has loaded; every later render of those pages, synchronous ones included, sees it.
// Needs a DOM environment (happy-dom).
export async function loadNativePageOutlines(pageIds) {
  const loaded = {};
  function Probe({ pageId }) {
    const outlines = useBundledPageOutlines(pageId);
    if (outlines) loaded[pageId] = outlines;
    return null;
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(document.createElement('div'));
  const deadline = Date.now() + OUTLINE_LOAD_TIMEOUT_MS;
  try {
    await act(async () =>
      root.render(pageIds.map((pageId) => createElement(Probe, { key: pageId, pageId })))
    );
    while (pageIds.some((pageId) => !loaded[pageId])) {
      if (Date.now() > deadline)
        throw new Error(`Native line art did not load within ${OUTLINE_LOAD_TIMEOUT_MS} ms`);
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, OUTLINE_POLL_MS));
      });
    }
  } finally {
    act(() => root.unmount());
  }
  return loaded;
}
