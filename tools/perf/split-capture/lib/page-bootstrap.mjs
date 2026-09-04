// The script the probe host injects into the drawing route.
//
// This is the "measurement" half of the split: the page instruments itself and
// uploads its own report over ordinary HTTP, so no script channel into the
// device is needed. Input arrives separately, as real trusted touch. That is the
// whole point — every existing capture path drives input and reads measurement
// down the same debugger connection, and on a modern iPad that connection is the
// part that is unavailable.
//
// It is a string because it runs in the page, not here. It is injected as a
// same-origin `<script src>` rather than eval'd: the route's enforcing CSP
// (ADR-0073) allows `script-src 'self'` and does not allow `unsafe-eval`, so
// nothing about the policy has to be relaxed to measure the page.
import { BRUSH_BUTTON_BY_MODE } from '../../ios/capture-xcuitest-screen.mjs';
import { STAND_DOWN_PATH } from './chrome-tabs.mjs';
import {
  COMPACT_SHELL_MARKER,
  QUICK_NIGHT_TOGGLE,
  RESOLVED_THEME_EXPRESSION,
  SETTINGS_BUTTON,
  SETTINGS_CLOSE_BUTTON,
  SETTINGS_MODAL,
  settingsSectionRow,
  themeOption,
} from '../../lib/campaign-state.mjs';
import {
  ERASER_FILL_BACKING_TIMEOUT_MS,
  ERASER_REFILL_IDLE_FRAMES,
  eraserFillFunctionSource,
} from '../../lib/eraser-fill.mjs';
import {
  EXPAND_CONTROLS_SELECTOR,
  UNDO_ACTION_PAUSE_MS,
  UNDO_BUTTON_SELECTOR,
  undoActionFunctionSource,
  undoActionProblem,
} from '../../lib/undo-driver.mjs';

// The page polls its plan while it waits for the runner to end the phase. Long
// enough not to spin, short enough that a finished gesture is not left banking
// idle contact time.
const PLAN_POLL_MS = 400;
const READY_TIMEOUT_MS = 25_000;
const HYDRATION_TIMEOUT_MS = 20_000;
const BRUSH_COMMIT_TIMEOUT_MS = 12_000;
const THEME_TIMEOUT_MS = 20_000;
// Long enough that a landed click opens the dialog before another is sent.
const SETTINGS_OPEN_RETRY_MS = 400;
const BRUSH_ATTEMPTS = 4;
// One settle after the fill, so the paint is committed before contact banking
// starts — the same 400 ms the unverified fill always waited.
const ERASER_FILL_SETTLE_MS = 400;
// The probe's own row accessors page through its ring buffers; this is the slice
// size, not a cap on the capture.
const REPORT_SLICE_ROWS = 5_000;
// Each drawing surface is downscaled into a scratch this many pixels on a side
// before its pixels are hashed. The same sampler proves whole-pass output and
// that each undo changed rendered pixels; 64 px keeps a narrow pen stroke visible
// while the reads stay outside both measured windows.
const CANVAS_DELTA_GRID_PX = 64;
// FNV-1a's offset basis and prime — algorithm constants, not tuning.
const FNV_OFFSET_BASIS = 2166136261;
const FNV_PRIME = 16777619;

// The drawing gates are purely temporal, so a renderer that painted NOTHING
// passed every one of them (capture 7c37d255: blank output, fidelity PASS,
// ~3790 measures). This proves the canvas CHANGED during the pass — any pixel
// delta, which covers the eraser's removals as well as the brushes' additions —
// by hashing a downscale of every drawing surface before contact banking starts
// and again after drawing ends, before any optional undo. The reads go through a small
// willReadFrequently scratch (the product's emptyScan.ts pattern, same as the
// eraser fill's verifier) so the accelerated tiles are never read back directly:
// a check must not change the thing being measured, and both samples run outside
// the measured window anyway.
export function canvasDeltaFunctionSource() {
  return `function sampleCanvasDelta() {
    try {
      const surfaces = [...document.querySelectorAll('canvas[data-live-tile]')];
      if (!surfaces.length) {
        const main = document.querySelector('#drawingCanvas');
        if (main) surfaces.push(main);
      }
      if (!surfaces.length) return { error: 'no drawing surfaces to sample' };
      const scratch = document.createElement('canvas');
      scratch.width = ${CANVAS_DELTA_GRID_PX};
      scratch.height = ${CANVAS_DELTA_GRID_PX};
      const context = scratch.getContext('2d', { willReadFrequently: true });
      if (!context) return { error: 'no 2d scratch context to sample through' };
      const digests = [];
      let inkedSamples = 0;
      for (const canvas of surfaces) {
        context.clearRect(0, 0, ${CANVAS_DELTA_GRID_PX}, ${CANVAS_DELTA_GRID_PX});
        context.drawImage(canvas, 0, 0, ${CANVAS_DELTA_GRID_PX}, ${CANVAS_DELTA_GRID_PX});
        const data = context.getImageData(
          0, 0, ${CANVAS_DELTA_GRID_PX}, ${CANVAS_DELTA_GRID_PX}
        ).data;
        let hash = ${FNV_OFFSET_BASIS};
        for (let i = 0; i < data.length; i++) {
          hash = Math.imul(hash ^ data[i], ${FNV_PRIME}) >>> 0;
        }
        for (let i = 3; i < data.length; i += 4) {
          if (data[i] > 0) inkedSamples += 1;
        }
        digests.push(hash);
      }
      return { surfaces: surfaces.length, digests, inkedSamples };
    } catch (error) {
      return { error: String(error && error.message || error) };
    }
  }`;
}

export function pageBootstrapSource() {
  return `
(async () => {
  const BRUSH_BUTTONS = ${JSON.stringify(BRUSH_BUTTON_BY_MODE)};
  const post = (path, body) =>
    fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  const log = (payload) => post('/__probe/log', payload);
  window.addEventListener('error', (event) =>
    log({ kind: 'error', message: String(event.message) })
  );
  window.addEventListener('unhandledrejection', (event) =>
    log({ kind: 'rejection', message: String(event.reason && event.reason.message || event.reason) })
  );
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const until = async (test, timeoutMs = ${READY_TIMEOUT_MS}) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (test()) return true;
      await wait(150);
    }
    return false;
  };
  // Declared OUTSIDE the try, because the catch posts the error report under
  // this nonce — and a try-scoped const is invisible there, so the report post
  // itself threw ReferenceError. The host's console still saw the error (the
  // log() above the post, then the unhandledrejection listener), but the
  // RUNNER-visible error report never arrived: an immediate named failure
  // became a full report timeout. An error thrown before the plan fetch still
  // posts with an undefined nonce, which the host rightly refuses — identity
  // it cannot prove is identity it does not claim.
  let nonce;
  try {
    const plan = await fetch('/__probe/plan').then((response) => response.json());
    // Safari keeps earlier tabs alive, and their bootstraps poll the same plan.
    // Each run stamps a nonce so only the page that started under it reports;
    // otherwise a suspended tab's near-empty tables overwrite the real capture.
    nonce = plan.nonce;
    // The page must be the one this run OPENED, not merely a page that read this
    // run's plan. Chrome restores tabs across the force-stop a launch does, and a
    // restored tab re-runs this bootstrap, reads the CURRENT plan, adopts its
    // nonce and reports ready — while carrying the previous cell's URL and
    // receiving almost none of the injected touch. One such page banked a cell
    // with 517 events where its neighbours had 7104.
    //
    // The launch URL carries the nonce, so the page can prove its own identity
    // rather than inheriting it. A page that cannot stands down silently: it is
    // not an error, it is a leftover.
    // A page can only prove which run opened it when the URL it was opened with
    // carried the nonce. The Capacitor WebView loads a server.url fixed at build
    // time, and a hand capture is opened by a person typing the host - so for
    // those the runner asks for no proof, and records that it did not get any.
    // The browser path keeps a guarantee the native path cannot offer, and
    // neither of them pretends otherwise.
    const openedFor = new URLSearchParams(location.search).get('probe');
    if (plan.requirePageIdentity !== false && openedFor !== nonce) {
      await log({ kind: 'stale-page', openedFor, nonce });
      // Standing down is not enough. Chrome restores every tab a previous cell
      // left behind, so leftovers ACCUMULATE — a landscape cell reached ten of
      // them, and the page the run actually opened reported ready and was then
      // evicted before it could upload. Navigating away leaves a blank tab that
      // will never run this again, which is the only part of that pile this
      // page can do anything about.
      location.replace('${STAND_DOWN_PATH}');
      return;
    }
    const sized = await until(() => {
      const canvas = document.querySelector('#drawingCanvas');
      return canvas && canvas.getBoundingClientRect().width > 0;
    });
    if (!sized) throw new Error('no sized #drawingCanvas');

    // The route's buttons are server-rendered, so a page whose modules failed to
    // load still looks complete and still answers every selector — it just does
    // nothing when clicked. The dev-harness seam only exists after hydration, so
    // it is the honest test, and one reload is enough to recover.
    const hydrated = await until(
      () => typeof window.__committedBrushMode === 'function',
      ${HYDRATION_TIMEOUT_MS}
    );
    if (!hydrated) {
      const url = new URL(location.href);
      if (!url.searchParams.has('rehydrate')) {
        url.searchParams.set('rehydrate', '1');
        await log({ kind: 'rehydrate', href: url.toString() });
        location.replace(url.toString());
        return;
      }
      throw new Error('route never hydrated');
    }

    const undoCount = plan.undoCount ?? 0;
    const undoPauseMs = plan.undoPauseMs ?? ${UNDO_ACTION_PAUSE_MS};
    if (!Number.isSafeInteger(undoCount) || undoCount < 0) {
      throw new Error('the split capture received an invalid undo count');
    }
    if (!Number.isSafeInteger(undoPauseMs) || undoPauseMs < 0) {
      throw new Error('the split capture received an invalid undo pause');
    }
    if (undoCount > 0 && plan.brush !== 'pen') {
      throw new Error('split undo capture is supported only for the pen cell');
    }
    if (undoCount > 0) {
      const historyReady = await until(() => !!window.__drawingDebug?.getUndoDebug);
      if (!historyReady) throw new Error('the production route did not expose __drawingDebug');
    }

    // Every brush is selected explicitly, pen included: the tool choice is
    // persisted, so a capture that assumed pen was the default drew its "pen"
    // strokes with whatever the previous capture had left selected.
    {
      const selector = BRUSH_BUTTONS[plan.brush];
      let committed = false;
      for (let attempt = 0; attempt < ${BRUSH_ATTEMPTS} && !committed; attempt++) {
        document.querySelector('button[aria-label="Expand controls"]')?.click();
        await until(() => document.querySelector('#brushButton'), 8000);
        document.querySelector('#brushButton')?.click();
        await until(() => document.querySelector(selector), 8000);
        document.querySelector(selector)?.click();
        committed = await until(
          () => window.__committedBrushMode?.() === plan.brush,
          ${BRUSH_COMMIT_TIMEOUT_MS}
        );
        if (!committed) {
          await log({ kind: 'brush-retry', attempt, mode: window.__committedBrushMode?.() ?? null });
          await wait(800);
        }
      }
      if (!committed) throw new Error('engine never committed ' + plan.brush);

      // Selecting through the menu can leave it open over the paper, and then
      // every synthesized touch lands on the menu instead of the canvas — which
      // produced captures with frames but no pointer events at all. Close it,
      // then prove the paper is what a touch at the canvas centre would hit.
      //
      // Openness is read from layout, not from the option existing: BrushMenu
      // renders its options unconditionally and only sets the hidden
      // attribute, so a presence check is true even when the menu is shut.
      // That check ran the
      // toggle its full three times on an already-closed menu and left it open
      // on the odd click — invisible in portrait, where the flyout misses the
      // canvas centre, and fatal in landscape, where it covers it.
      const menuStillOpen = () => !!document.querySelector(selector)?.offsetParent;
      for (let attempt = 0; attempt < 3 && menuStillOpen(); attempt++) {
        document.querySelector('#brushButton')?.click();
        await wait(500);
      }
    }
    // The theme was recorded as provenance and never set or observed, so a
    // capture requested as dark could be written with a dark label while the page
    // stayed on whatever theme the previous run persisted. It is driven through
    // the product's own Settings controls — the same elements a parent taps —
    // rather than by writing state the UI cannot reach.
    const resolvedTheme = () => ${RESOLVED_THEME_EXPRESSION};
    if (plan.theme && resolvedTheme() !== plan.theme) {
      // The trigger is eager but the dialog may still be waiting on the lazy
      // overlay chunk. The first click latches the state-driven open request;
      // retries also cover a trigger whose hydration has not landed yet.
      const opened = await until(() => {
        if (document.querySelector('${SETTINGS_MODAL}')?.open === true) return true;
        document.querySelector('${SETTINGS_BUTTON}')?.click();
        return false;
      }, ${THEME_TIMEOUT_MS});
      if (!opened) throw new Error('Settings never opened for the theme');

      const compact = !!document.querySelector('${COMPACT_SHELL_MARKER}');
      if (compact) {
        // CompactShell offers Night Mode as one toggle rather than a three-way
        // picker, so aim at the resolved appearance instead of a named option.
        const wantsDark = plan.theme === 'dark';
        const toggle = document.querySelector('${QUICK_NIGHT_TOGGLE}');
        if (toggle?.getAttribute('aria-checked') !== String(wantsDark)) toggle?.click();
      } else {
        if (!document.querySelector('${themeOption('light')}')) {
          const row = document.querySelector(${JSON.stringify(settingsSectionRow('appearance'))});
          if (!row) throw new Error('Settings did not expose the Appearance section');
          row.click();
          await until(() => document.querySelector('${themeOption('light')}'));
        }
        document.querySelector('#themeOption-' + plan.theme)?.click();
      }

      const settled = await until(() => resolvedTheme() === plan.theme, ${THEME_TIMEOUT_MS});
      if (!settled) throw new Error('the page never resolved to ' + plan.theme);
      document.querySelector('${SETTINGS_CLOSE_BUTTON}')?.click();
      await until(() => document.querySelector('${SETTINGS_MODAL}')?.open !== true);
      await wait(${SETTINGS_OPEN_RETRY_MS});
    }

    // The eraser needs something to erase, or it measures clearing blank paper.
    // The fill is verified rather than trusted (issue 1302), and the evidence
    // travels with readiness so the artifact can prove the eraser had ink.
    let eraserFill = null;
    let refillEraserInk = null;
    if (plan.brush === 'eraser') {
      ${eraserFillFunctionSource()}
      refillEraserInk = fillEraserInk;
      const fillVerified = async () => {
        await until(() => {
          eraserFill = fillEraserInk();
          return !eraserFill.pending && eraserFill.transparentTiles.length === 0;
        }, ${ERASER_FILL_BACKING_TIMEOUT_MS});
        if (eraserFill.pending) {
          throw new Error('live tile backings never realized for the eraser fill: ' + eraserFill.pending.join(', '));
        }
        if (eraserFill.transparentTiles.length) {
          throw new Error('the eraser fill left tiles transparent: ' + eraserFill.transparentTiles.join(', '));
        }
      };
      await fillVerified();
      await wait(${ERASER_FILL_SETTLE_MS});
      // Verify WITHOUT painting first: a deferred clear or resize inside the
      // settle window wiping a blessed fill is instability evidence that may
      // recur during the measured gesture. A clean check costs nothing; a wipe
      // is repaired, re-proved, and RECORDED rather than silently repainted.
      const afterSettle = fillEraserInk(true);
      if (afterSettle.pending || afterSettle.transparentTiles.length) {
        await fillVerified();
        eraserFill = { ...eraserFill, repairedAfterSettle: true, settleWipe: afterSettle };
      }
    }

    window.__probePhases = 'blank';
    window.__probeContactMs = plan.contactMs;
    window.__probeHud = false;
    await new Promise((resolve, reject) => {
      const element = document.createElement('script');
      element.src = '/__probe/probe.js';
      element.onload = resolve;
      element.onerror = () => reject(new Error('probe script failed to load'));
      document.head.append(element);
    });
    if (!window.__probe) throw new Error('probe did not install');

    const eraserRefills = refillEraserInk ? [] : null;
    let handledRefillSequence = 0;
    let previousTrustedCanvasPointerUps = 0;
    const waitForRefillIdleFrames = () => new Promise((resolve) => {
      let remaining = ${ERASER_REFILL_IDLE_FRAMES};
      const tick = () => {
        remaining -= 1;
        if (remaining === 0) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const serviceEraserRefill = async (request) => {
      if (!refillEraserInk || !request || request.sequence <= handledRefillSequence) return;
      let entry;
      try {
        const result = refillEraserInk();
        const counts = window.__probe.counts();
        const trustedCanvasPointerUps = window.__probe
          .events(0, counts.events)
          .filter((row) => row[2] === 2 && row[6] === 1 && row[8] === 1).length;
        entry = {
          afterStroke: request.afterStroke,
          pending: !!result.pending,
          transparentTiles: result.transparentTiles || [],
          trustedCanvasPointerUps,
        };
        if (trustedCanvasPointerUps <= previousTrustedCanvasPointerUps) {
          entry.error = 'no new trusted canvas pointerup after planned stroke ' +
            request.afterStroke + ': ' + previousTrustedCanvasPointerUps + ' -> ' +
            trustedCanvasPointerUps;
        }
        previousTrustedCanvasPointerUps = trustedCanvasPointerUps;
      } catch (error) {
        entry = { afterStroke: request.afterStroke, error: String(error?.message || error) };
      }
      await waitForRefillIdleFrames();
      eraserRefills.push(entry);
      handledRefillSequence = request.sequence;
      await post('/__probe/refill', { nonce, request, entry });
    };

    const rect = document.querySelector('#drawingCanvas').getBoundingClientRect();
    const centre = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    if (!centre || !centre.closest('.canvas-stack')) {
      throw new Error('canvas centre is covered by ' + (centre ? centre.tagName + '.' + centre.className : 'nothing'));
    }
    ${canvasDeltaFunctionSource()}
    const paintedBaseline = sampleCanvasDelta();
    await post('/__probe/ready', {
      nonce,
      brush: plan.brush,
      committed: window.__committedBrushMode?.() ?? null,
      // Reported so the runner can refuse a mismatch BEFORE a person or a device
      // spends the capture, rather than labelling the artifact from the request.
      resolvedTheme: resolvedTheme(),
      // The verified-fill evidence (issue 1302); null for every other brush.
      eraserFill,
      geometry: {
        canvas: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        viewport: { width: innerWidth, height: innerHeight },
        outerViewport: { width: outerWidth, height: outerHeight },
        screenX: window.screenX,
        screenY: window.screenY,
        dpr: window.devicePixelRatio,
        orientation: innerWidth > innerHeight ? 'LANDSCAPE' : 'PORTRAIT',
      },
    });

    let pulsed = 0;
    while (true) {
      const current = await fetch('/__probe/plan').then((response) => response.json());
      if (current.nonce !== nonce) return;
      if (current.finish) break;
      await serviceEraserRefill(current.eraserRefillRequest);
      // The live event count, so the runner can tell "the page is ready but the
      // injected touches are landing on another tab" (issue 1294) from "the
      // report is still on its way". The pulse's only question is whether input
      // arrives AT ALL, so it goes quiet after its first nonzero answer — the
      // measured window carries at most one pulse post beyond first contact.
      const events = window.__probe.counts().events;
      if (pulsed === 0 || events === 0) await post('/__probe/pulse', { nonce, events });
      pulsed = events;
      await wait(${PLAN_POLL_MS});
    }

    const paintedAfterDrawing = sampleCanvasDelta();

    const undoActions = [];
    let historyBeforeUndo = null;
    let historyAfterUndo = null;
    let undoVisual = null;
    if (undoCount > 0) {
      historyBeforeUndo = window.__drawingDebug.getUndoDebug();
      const beforeDepth = historyBeforeUndo.historyLength ?? historyBeforeUndo.snapshots;
      if (!Number.isSafeInteger(beforeDepth) || beforeDepth < undoCount) {
        throw new Error('the drawing did not create enough undo history');
      }

      document.querySelector(${JSON.stringify(EXPAND_CONTROLS_SELECTOR)})?.click();
      const undoReady = await until(() => {
        const button = document.querySelector(${JSON.stringify(UNDO_BUTTON_SELECTOR)});
        return !!button && !button.disabled;
      });
      if (!undoReady) throw new Error('the action drawer did not expose an enabled undo button');

      const runUndoAction = ${undoActionFunctionSource()};
      const actionProblem = ${undoActionProblem};
      const visualSamples = [paintedAfterDrawing];
      const visualSteps = [];
      await wait(undoPauseMs);
      for (let index = 0; index < undoCount; index++) {
        const action = await runUndoAction(index);
        const problem = actionProblem(action, index);
        if (problem) throw new Error(problem);
        undoActions.push(action);
        const before = visualSamples.at(-1);
        const after = sampleCanvasDelta();
        const changed = !before.error && !after.error && before.surfaces === after.surfaces &&
          JSON.stringify(before.digests) !== JSON.stringify(after.digests);
        visualSamples.push(after);
        visualSteps.push({ index, changed });
        if (!changed) {
          throw new Error('undo action ' + (index + 1) + ' did not restore different pixels');
        }
        await wait(undoPauseMs);
      }
      historyAfterUndo = window.__drawingDebug.getUndoDebug();
      const afterDepth = historyAfterUndo.historyLength ?? historyAfterUndo.snapshots;
      if (afterDepth !== beforeDepth - undoCount) {
        throw new Error(
          'undo history changed by ' + (beforeDepth - afterDepth) + ', expected ' + undoCount
        );
      }
      undoVisual = { samples: visualSamples, steps: visualSteps, changedEveryStep: true };
    }

    // The heartbeat issue 1300 asked for. A ready page that never uploads was
    // indistinguishable between four states: it never saw finish, finish()
    // threw, the upload failed, or the page was suspended first. These two log
    // lines split the space — a host log ending at finish-observed died inside
    // finish()/serialization, one ending at uploading died in the POST or was
    // suspended mid-flight, and neither line at all means the page never saw
    // the plan flip.
    await log({ kind: 'finish-observed', nonce });
    const report = window.__probe.finish();
    const counts = report.meta.counts;
    const read = (accessor, expected) => {
      const rows = [];
      while (rows.length < expected) {
        const slice = window.__probe[accessor](rows.length, ${REPORT_SLICE_ROWS});
        if (!slice || !slice.length) break;
        rows.push(...slice);
      }
      return rows;
    };
    report.frames = read('frames', counts.frames);
    report.events = read('events', counts.events);
    report.measures = read('measures', counts.measures);
    window.__probe.stop();
    // Any pixel delta between the two samples counts — additions and the
    // eraser's removals alike. A sample that could not be taken records its
    // error rather than a verdict; acceptance refuses what it cannot prove.
    report.paintedOutput = paintedBaseline.error || paintedAfterDrawing.error
      ? { error: paintedBaseline.error || paintedAfterDrawing.error }
      : {
          changed: JSON.stringify(paintedBaseline) !== JSON.stringify(paintedAfterDrawing),
          before: paintedBaseline,
          after: paintedAfterDrawing,
        };
    await log({ kind: 'uploading', nonce, events: report.events.length });
    await post('/__probe/report', {
      // The run this report belongs to. Readiness was nonce-checked from the
      // start and the report was not, so a page from an earlier run could upload
      // its frame and event tables under the CURRENT plan's label — the artifact
      // then took its mode from one page and its numbers from another.
      nonce,
      report,
      topology: window.__drawingDebug?.getLiveSurfaceTopology?.() ?? null,
      // Per-pass refill evidence (issue 1292); null for every non-eraser run.
      eraserRefills,
      undoActions,
      historyBeforeUndo,
      historyAfterUndo,
      undoVisual,
    });
  } catch (error) {
    await log({ kind: 'bootstrap', message: String(error?.message ?? error) });
    await post('/__probe/report', { nonce, error: String(error?.message ?? error) });
  }
})();
`;
}
