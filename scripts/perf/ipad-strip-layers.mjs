// Strip every optional compositing layer from the live page on a connected iPad,
// without navigating (a reload would undo it). Leaves the drawing canvas and
// nothing else, so a Timeline recorded afterwards measures the FLOOR: what
// compositing costs when the app contributes no extra layers at all.
//
//   npm run perf:ipad:strip-layers        then record the Timeline — do NOT reload
//
// This is a bisect rung, not a proposed fix: if the floor still stalls at the
// stroke commit, no amount of layer removal will help and the cost is the canvas
// itself. Layers removed, and why each is a suspect:
//
//   .crayon-overlay      two FULL-SIZE canvases, always in the DOM regardless of
//                        the selected brush, one carrying `mix-blend-mode: darken`
//                        — a blended full-screen layer forces the compositor to
//                        read its backdrop every frame
//   .paper-view          the line-art wrapper (blend + will-change: transform)
//   .paper-sheet         the paper texture, a repeating background image
//   .brush-ring / .eraser-bubble   the pointer halos

import { isMain, runMain } from '../lib/proc.mjs';
import { connectDevice } from './ipad-session.mjs';
import { attachToPage, listPages } from './webkit-inspector.mjs';

const STYLE_ID = '__stripLayers';
const CSS = `
  .crayon-overlay { display: none !important; }
  .paper-view { display: none !important; }
  .paper-sheet { display: none !important; }
  .brush-ring, .eraser-bubble { display: none !important; }
`;

export async function stripDeviceLayers(argv = process.argv.slice(2)) {
  const deviceId = argv.find((arg) => arg.startsWith('--device-id='))?.split('=')[1];
  const { device, stopProxy } = await connectDevice(deviceId);
  let session;
  try {
    const pages = await listPages(device);
    const page = pages.find((candidate) => candidate.url.includes(':417'));
    if (!page) {
      throw new Error(`no app tab found — tabs: ${pages.map((p) => p.url).join(', ')}`);
    }
    session = await attachToPage(page.webSocketDebuggerUrl);
    // Reports what each selector resolved to rather than assuming: a renamed
    // class would otherwise strip nothing and the recording would look like a
    // negative result.
    const applied = await session.readJson(`(() => {
      document.getElementById(${JSON.stringify(STYLE_ID)})?.remove();
      const style = document.createElement('style');
      style.id = ${JSON.stringify(STYLE_ID)};
      style.textContent = ${JSON.stringify(CSS)};
      document.head.append(style);
      const gone = (selector) => {
        const el = document.querySelector(selector);
        return el ? getComputedStyle(el).display === 'none' : 'absent';
      };
      return {
        url: location.href,
        crayonOverlays: document.querySelectorAll('.crayon-overlay').length,
        crayonHidden: gone('.crayon-overlay'),
        paperSheetHidden: gone('.paper-sheet'),
        paperViewHidden: gone('.paper-view'),
      };
    })()`);
    console.log(JSON.stringify(applied, null, 2));
    console.log('\nLayers stripped. Do NOT reload the page — record the Timeline now.');
    return applied;
  } finally {
    session?.close();
    stopProxy();
  }
}

if (isMain(import.meta.url)) runMain(stripDeviceLayers);
