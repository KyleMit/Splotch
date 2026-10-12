// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../../lib/proc.mjs';
import { DEFAULT_SIZE_LEVEL, SIZE_PX, replayInPage } from '../web/replay-input-recording.mjs';

// The replay module's Playwright import, loaded for real under happy-dom, opens
// a connection nothing answers and fails the run with an unhandled error.
vi.mock('@playwright/test', () => ({ chromium: {} }));

const INPUT_RECORDER = readFileSync(join(ROOT, 'tools/perf/probes/input-recorder.js'), 'utf8');

// The labels the app's size buttons carry, read from the component that renders
// them: the pen's while any drawing brush is active, the eraser's while erasing.
function appSizeLabelPrefixes() {
  const menu = readFileSync(join(ROOT, 'web/src/lib/components/StrokeWidthMenu.svelte'), 'utf8');
  const match = /aria-label=\{erasing \? `([^`$]+)\$\{size\}` : `([^`$]+)\$\{size\}`\}/.exec(menu);
  expect(match, 'StrokeWidthMenu.svelte size-button aria-label').not.toBeNull();
  return { eraser: match[1], pen: match[2] };
}

function addSizeButton(label) {
  const button = document.createElement('button');
  button.setAttribute('aria-label', label);
  document.body.append(button);
  return button;
}

afterEach(() => {
  window.__rec?.stop();
  delete window.__rec;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('input recorder size picks', () => {
  it('records a pick under either size label, and replays it at the width the app pushes', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const labels = appSizeLabelPrefixes();
    document.body.innerHTML = '<canvas id="drawingCanvas"></canvas>';
    const penSize = addSizeButton(`${labels.pen}5`);
    const eraserSize = addSizeButton(`${labels.eraser}1`);
    const eraserButton = document.createElement('button');
    eraserButton.id = 'eraserButton';
    document.body.append(eraserButton);

    Function(INPUT_RECORDER)();
    penSize.click();
    eraserButton.click();
    eraserSize.click();
    const actions = window.__rec.events.filter((event) => event.kind === 'action');

    expect(actions.map(({ name, value }) => [name, value])).toEqual([
      ['size', 5],
      ['brush', 'eraser'],
      ['eraser-size', 1],
    ]);

    const engine = {
      setStrokeWidth: vi.fn(),
      setEraserMode: vi.fn(),
      setMagicMode: vi.fn(),
      setCrayonMode: vi.fn(),
    };
    window.__engine = engine;
    vi.stubGlobal('requestAnimationFrame', (callback) => callback());
    await replayInPage({
      events: actions,
      recCanvas: { w: 1, h: 1 },
      sizePx: SIZE_PX,
      defaultSizeLevel: DEFAULT_SIZE_LEVEL,
      turbo: true,
      maxIdleGapMs: 0,
    });
    delete window.__engine;

    // The start width, the pen pick, the eraser's still-default level, then the
    // eraser pick — never the pen's width once the eraser is active.
    expect(engine.setStrokeWidth.mock.calls.flat()).toEqual([
      SIZE_PX[DEFAULT_SIZE_LEVEL],
      SIZE_PX[5],
      SIZE_PX[DEFAULT_SIZE_LEVEL],
      SIZE_PX[1],
    ]);
  });
});
