// @vitest-environment happy-dom
//
// The generated bootstrap, EXECUTED. The previous tests asserted substrings of
// the source, so disabling the whole theme branch with `if (false && ...)` left
// eleven of them green — they proved the code was written, never that it runs.
//
// The fixture stands in for the product: clicking a theme control is what sets
// `documentElement.dataset.theme`, exactly as the real Settings controls do, so
// the bootstrap has to actually find and click one to make the assertion pass.
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The bootstrap polls on the same budgets it uses on a device, so executing it
// costs seconds rather than milliseconds. That is the price of running the real
// thing instead of grepping it.
const BOOTSTRAP_TIMEOUT_MS = 20_000;
import { pageBootstrapSource } from '../split-capture/lib/page-bootstrap.mjs';
import { readinessThemeProblem } from '../lib/campaign-state.mjs';

const CANVAS_RECT = { x: 0, y: 0, width: 800, height: 600 };

function paintShell({ compact, startingTheme }) {
  document.documentElement.dataset.theme = startingTheme ?? '';
  document.body.innerHTML = `
    <canvas id="drawingCanvas"></canvas>
    <div class="canvas-stack"></div>
    <button aria-label="Expand controls"></button>
    <button id="brushButton"></button>
    <button id="penBrushButton" hidden></button>
    <button aria-label="Settings"></button>
    <dialog id="settingsModal">
      ${compact ? '<div class="quick-toggles"><button id="quickNightToggle" aria-checked="false"></button></div>' : ''}
      ${compact ? '' : '<button data-section="appearance"></button>'}
    </dialog>
  `;
  const canvas = document.querySelector('#drawingCanvas');
  canvas.getBoundingClientRect = () => CANVAS_RECT;
  document.elementFromPoint = () => document.querySelector('.canvas-stack');
  window.__committedBrushMode = () => 'pen';

  const modal = document.querySelector('#settingsModal');
  document.querySelector('button[aria-label="Settings"]').addEventListener('click', () => {
    modal.open = true;
    if (!compact && !document.querySelector('#themeOption-light')) return;
  });

  if (compact) {
    const toggle = document.querySelector('#quickNightToggle');
    toggle.addEventListener('click', () => {
      const next = toggle.getAttribute('aria-checked') === 'true' ? 'light' : 'dark';
      toggle.setAttribute('aria-checked', String(next === 'dark'));
      document.documentElement.dataset.theme = next;
    });
  } else {
    // The sectioned shell reveals the options only after the Appearance row.
    document.querySelector('button[data-section="appearance"]').addEventListener('click', () => {
      for (const theme of ['light', 'dark']) {
        const option = document.createElement('button');
        option.id = `themeOption-${theme}`;
        option.addEventListener('click', () => {
          document.documentElement.dataset.theme = theme;
        });
        modal.append(option);
      }
    });
  }
  const close = document.createElement('button');
  close.setAttribute('aria-label', 'Close');
  close.addEventListener('click', () => (modal.open = false));
  modal.append(close);
}

// The bootstrap now refuses to act for a page it was not opened for, so the
// fixture has to give the page the identity the plan names — which is the
// behaviour under test as much as the theme is.
function openedFor(nonce) {
  window.happyDOM?.setURL?.(`http://probe-host.test/?probe=${encodeURIComponent(nonce)}`);
}

function runBootstrap(plan) {
  openedFor(plan.nonce);
  const posted = [];
  let readyResolve;
  const readyPosted = new Promise((resolve) => (readyResolve = resolve));

  global.fetch = vi.fn(async (path, init) => {
    if (path === '/__probe/plan') return { json: async () => plan };
    const body = init?.body ? JSON.parse(init.body) : null;
    posted.push({ path, body });
    if (path === '/__probe/ready') readyResolve(body);
    return { json: async () => ({}) };
  });

  // The probe is a same-origin <script src> the fixture cannot fetch, so its
  // arrival is simulated at the point the bootstrap waits for it.
  const append = document.head.append.bind(document.head);
  document.head.append = (element) => {
    if (element.tagName === 'SCRIPT') {
      window.__probe = {
        counts: () => ({ frames: 0, events: 0, measures: 0 }),
        finish: () => ({ meta: { counts: {} } }),
        stop: () => {},
      };
      queueMicrotask(() => element.onload?.());
      return;
    }
    return append(element);
  };

  new Function(pageBootstrapSource())();
  return { readyPosted, posted };
}

beforeEach(() => {
  window.matchMedia = () => ({ matches: false, addEventListener() {} });
  delete window.__probe;
});

describe('the bootstrap actually setting the theme', () => {
  // Landscape phones get CompactShell, which has one Night Mode toggle rather
  // than a three-way picker. Both shells are exercised, because the control flow
  // through them is different and only one was ever run on a device per session.
  it(
    'drives the CompactShell toggle until the page resolves to dark',
    async () => {
      paintShell({ compact: true, startingTheme: 'light' });

      const { readyPosted } = runBootstrap({ brush: 'pen', theme: 'dark', nonce: 'compact-dark' });

      expect((await readyPosted).resolvedTheme).toBe('dark');
      expect(document.documentElement.dataset.theme).toBe('dark');
    },
    BOOTSTRAP_TIMEOUT_MS
  );

  it(
    'navigates the sectioned shell to the Appearance options and picks light',
    async () => {
      paintShell({ compact: false, startingTheme: 'dark' });

      const { readyPosted } = runBootstrap({
        brush: 'pen',
        theme: 'light',
        nonce: 'sectioned-light',
      });

      expect((await readyPosted).resolvedTheme).toBe('light');
      expect(document.documentElement.dataset.theme).toBe('light');
    },
    BOOTSTRAP_TIMEOUT_MS
  );

  it(
    'leaves a page already on the requested theme alone',
    async () => {
      paintShell({ compact: true, startingTheme: 'dark' });

      const { readyPosted, posted } = runBootstrap({
        brush: 'pen',
        theme: 'dark',
        nonce: 'geometry-run',
      });

      expect((await readyPosted).resolvedTheme).toBe('dark');
      expect(posted.some((call) => call.path === '/__probe/log')).toBe(false);
    },
    BOOTSTRAP_TIMEOUT_MS
  );

  // Readiness is what the runner refuses a mismatch on, so it must carry the
  // observed value even when no theme was requested at all.
  it(
    'reports the resolved theme even when the plan asks for none',
    async () => {
      paintShell({ compact: true, startingTheme: 'light' });

      const { readyPosted } = runBootstrap({ brush: 'pen', nonce: 'default-theme-run' });

      expect((await readyPosted).resolvedTheme).toBe('light');
    },
    BOOTSTRAP_TIMEOUT_MS
  );
});

// The refusal both runners make before a device or a person spends the capture.
// It was inlined and unexercised; either branch could have been inverted without
// a test noticing.
describe('refusing a readiness payload the theme cannot be trusted from', () => {
  it('accepts a page reporting the theme that was asked for', () => {
    expect(readinessThemeProblem({ resolvedTheme: 'dark' }, 'dark')).toBeNull();
  });

  it('refuses a mismatch, naming both sides', () => {
    const problem = readinessThemeProblem({ resolvedTheme: 'light' }, 'dark');

    expect(problem).toContain('light');
    expect(problem).toContain('dark');
  });

  // Silence is refused as firmly as a mismatch. Treating it as consent is how the
  // request-echo defect worked: nobody checked, so nobody disagreed.
  it('refuses a page that reports no theme at all', () => {
    expect(readinessThemeProblem({}, 'dark')).toContain('cannot prove');
    expect(readinessThemeProblem(undefined, 'dark')).toContain('cannot prove');
  });

  it('still requires an answer when no theme was requested', () => {
    expect(readinessThemeProblem({}, undefined)).toContain('cannot prove');
    expect(readinessThemeProblem({ resolvedTheme: 'light' }, undefined)).toBeNull();
  });
});

// The guard itself, through the same executed bootstrap: a page that was opened
// for another run must do nothing at all — not report ready, not upload — and
// must say why, so a run that produces no capture is diagnosable.
describe('a page opened for a different run', () => {
  it(
    'stands down without reporting ready',
    async () => {
      paintShell({ compact: true, startingTheme: 'light' });
      window.happyDOM?.setURL?.('http://probe-host.test/?probe=an-earlier-cell');

      const posted = [];
      global.fetch = vi.fn(async (path, init) => {
        if (path === '/__probe/plan')
          return { json: async () => ({ brush: 'pen', nonce: 'this-cell' }) };
        posted.push({ path, body: init?.body ? JSON.parse(init.body) : null });
        return { json: async () => ({}) };
      });

      new Function(pageBootstrapSource())();
      await new Promise((resolve) => setTimeout(resolve, 500));

      expect(posted.some((call) => call.path === '/__probe/ready')).toBe(false);
      expect(posted.some((call) => call.path === '/__probe/report')).toBe(false);
      const stood = posted.find((call) => call.body?.kind === 'stale-page');
      expect(stood?.body).toMatchObject({ openedFor: 'an-earlier-cell', nonce: 'this-cell' });
    },
    BOOTSTRAP_TIMEOUT_MS
  );
});

// Issue 1302: the eraser fill used to be fired and forgotten, so a fill that
// silently did nothing left a capture that measured erasing blank paper and
// looked completely normal. Executed here: the fill must be verified, its
// evidence must travel with readiness, and a fill that did not take must fail
// the capture through the error report rather than banking a plausible number.
describe('the bootstrap verifying the eraser fill', () => {
  function paintEraserShell(tiles) {
    paintShell({ compact: true, startingTheme: 'light' });
    const eraserButton = document.createElement('button');
    eraserButton.id = 'eraserButton';
    eraserButton.addEventListener('click', () => {
      window.__committedBrushMode = () => 'eraser';
    });
    document.body.append(eraserButton);
    // The fill verifies through a 1x1 willReadFrequently scratch it creates
    // itself, so createElement hands out a scratch whose samples resolve from
    // the drawn source tile at the sampled coordinates.
    const createElement = document.createElement.bind(document);
    document.createElement = (tag) => {
      const element = createElement(tag);
      if (tag === 'canvas') {
        let sampled = null;
        element.getContext = (kind, options) =>
          options?.willReadFrequently === true
            ? {
                clearRect() {
                  sampled = null;
                },
                drawImage(source, x, y) {
                  sampled = source.alphaAt ? source.alphaAt(x, y) : 0;
                },
                getImageData() {
                  return { data: [124, 77, 255, sampled ?? 0] };
                },
              }
            : null;
      }
      return element;
    };
    return tiles.map((tile) => {
      const canvas = createElement('canvas');
      canvas.setAttribute('data-live-tile', '');
      canvas.dataset.tileBacking = tile.backing;
      canvas.width = tile.width;
      canvas.height = tile.height;
      const context = {
        fillStyle: null,
        fillRects: [],
        globalAlpha: 0.5,
        globalCompositeOperation: 'destination-out',
        save() {},
        restore() {},
        setTransform() {},
        fillRect(...args) {
          this.fillRects.push(args);
        },
      };
      canvas.getContext = () => context;
      canvas.alphaAt = (x, y) => {
        if (tile.alpha === 0) return 0;
        const covered = context.fillRects.some(
          ([rx, ry, rw, rh]) => x >= rx && y >= ry && x < rx + rw && y < ry + rh
        );
        return covered ? 255 : 0;
      };
      document.body.append(canvas);
      return { canvas, context };
    });
  }

  it(
    'fills, refills between passes, and reports both kinds of evidence',
    async () => {
      const tiles = paintEraserShell([
        { backing: '100x80', width: 100, height: 80 },
        { backing: '90x70', width: 90, height: 70 },
      ]);

      const plan = {
        brush: 'eraser',
        theme: 'light',
        nonce: 'eraser-fill-run',
        finish: false,
        // Two strokes per pass, four strokes total: one refill boundary at
        // stroke 2, and the final stroke must not refill.
        eraserRefill: { everyStrokes: 2, totalStrokes: 4 },
      };
      const { readyPosted, posted } = runBootstrap(plan);
      const ready = await readyPosted;

      expect(ready.eraserFill).toEqual({
        tiles: 2,
        backings: ['100x80', '90x70'],
        transparentTiles: [],
      });
      // One paint before readiness: the post-settle check verifies WITHOUT
      // painting, and a stable fill records no repair.
      expect(ready.eraserFill.repairedAfterSettle).toBeUndefined();
      expect(tiles[0].context.fillRects).toEqual([[0, 0, 100, 80]]);
      expect(tiles[1].context.fillStyle).toBe('#7c4dff');

      const stack = document.querySelector('.canvas-stack');
      for (let strokeIndex = 0; strokeIndex < 4; strokeIndex++) {
        stack.dispatchEvent(new Event('pointerup', { bubbles: true }));
      }
      plan.finish = true;
      const report = await vi.waitFor(() => {
        const found = posted.find((entry) => entry.path === '/__probe/report');
        if (!found) throw new Error('no report yet');
        return found;
      });

      expect(report.body.eraserRefills).toEqual([
        { afterStroke: 2, pending: false, transparentTiles: [] },
      ]);
      // The refill is the second paint; the final stroke deliberately adds none.
      expect(tiles[0].context.fillRects).toHaveLength(2);
    },
    BOOTSTRAP_TIMEOUT_MS
  );

  it(
    'fails the capture through the error report when the fill does not take',
    async () => {
      paintEraserShell([{ backing: '100x80', width: 100, height: 80, alpha: 0 }]);

      const { posted } = runBootstrap({
        brush: 'eraser',
        theme: 'light',
        nonce: 'eraser-bad-fill',
      });

      const report = await vi.waitFor(() => {
        const found = posted.find((entry) => entry.path === '/__probe/report');
        if (!found) throw new Error('no report yet');
        return found;
      });
      expect(report.body.nonce).toBe('eraser-bad-fill');
      expect(report.body.error).toContain('transparent');
      expect(posted.some((call) => call.path === '/__probe/ready')).toBe(false);
    },
    BOOTSTRAP_TIMEOUT_MS
  );
});

describe('the pulse and the error report', () => {
  // The wait loop pulses the live event count so the runner can tell "the
  // injected touches are landing on another tab" (issue 1294) from "the report
  // is still coming". The plan flips finish on the second poll so the loop runs
  // exactly one pulsing pass.
  it(
    'pulses the live event count under the run nonce while waiting for finish',
    async () => {
      paintShell({ compact: true, startingTheme: 'light' });

      const plan = { brush: 'pen', theme: 'light', nonce: 'pulse-run', finish: false };
      const { readyPosted, posted } = runBootstrap(plan);
      await readyPosted;

      const pulse = await vi.waitFor(() => {
        const found = posted.find((entry) => entry.path === '/__probe/pulse');
        if (!found) throw new Error('no pulse yet');
        return found;
      });
      plan.finish = true;
      expect(pulse.body).toEqual({ nonce: 'pulse-run', events: 0 });
    },
    BOOTSTRAP_TIMEOUT_MS
  );

  // Issue 1300: a ready page that never uploads was indistinguishable between
  // never-saw-finish, finish() threw, upload failed, and suspended. The two
  // heartbeats split the space, so they must actually fire, in order, under the
  // run nonce, before the report.
  it(
    'logs finish-observed and uploading around the report upload',
    async () => {
      paintShell({ compact: true, startingTheme: 'light' });

      const plan = { brush: 'pen', theme: 'light', nonce: 'heartbeat-run', finish: false };
      const { readyPosted, posted } = runBootstrap(plan);
      await readyPosted;
      plan.finish = true;

      const report = await vi.waitFor(() => {
        const found = posted.find((entry) => entry.path === '/__probe/report');
        if (!found) throw new Error('no report yet');
        return found;
      });
      const heartbeats = posted.filter((entry) => entry.path === '/__probe/log');
      expect(heartbeats.map((entry) => entry.body.kind)).toEqual(['finish-observed', 'uploading']);
      expect(heartbeats.map((entry) => entry.body.nonce)).toEqual([
        'heartbeat-run',
        'heartbeat-run',
      ]);
      expect(posted.indexOf(heartbeats[1])).toBeLessThan(posted.indexOf(report));
    },
    BOOTSTRAP_TIMEOUT_MS
  );

  // The catch posts the error report; nonce used to be try-scoped, so every
  // page-side error threw ReferenceError there and the host heard nothing —
  // a ready page going quiet with nothing saying why.
  it(
    'a failure after readiness still posts an error report under the run nonce',
    async () => {
      paintShell({ compact: true, startingTheme: 'light' });

      const plan = { brush: 'pen', theme: 'light', nonce: 'error-run', finish: false };
      const { readyPosted, posted } = runBootstrap(plan);
      await readyPosted;
      const workingFetch = global.fetch;
      global.fetch = async (path, init) => {
        if (path === '/__probe/plan') throw new Error('plan poll exploded');
        return workingFetch(path, init);
      };

      const report = await vi.waitFor(() => {
        const found = posted.find((entry) => entry.path === '/__probe/report');
        if (!found) throw new Error('no report yet');
        return found;
      });
      expect(report.body.nonce).toBe('error-run');
      expect(report.body.error).toContain('plan poll exploded');
    },
    BOOTSTRAP_TIMEOUT_MS
  );
});
