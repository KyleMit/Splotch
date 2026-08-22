# iOS pointer-coordinate skew — how issue 1194 was actually diagnosed

Investigation record for the defect filed as "undo doesn't restore the drawing after a blank
landscape rotation on iOS". It is not an undo bug, and the diagnosis recorded in the issue's own
comments is wrong. This is the chronology and the measurements, kept because the conclusion is not
derivable from the fix diff and because three claims in the issue thread still point future readers
at the wrong file.

Measured 2026-08-21 on an iPad mini (A17 Pro) Simulator, iPadOS 26.5, native Capacitor WKWebView,
against `main` at f7ca7e8f.

## The mechanism

WKWebView configured with `ios.contentInset: "always"` reports `PointerEvent` client coordinates
shifted up by the WebView's top content inset, while `TouchEvent` coordinates, layout, and
hit-testing are not shifted. One trusted tap on `#undoButton`, with the button's layout box spanning
Y 750–805:

| Event                       | `clientY` | `pageY` | Dispatch target  | `elementFromPoint(clientY)` |
| --------------------------- | --------- | ------- | ---------------- | --------------------------- |
| `touchstart` / `touchend`   | 778       | 746     | `undoButton`     | `undoButton`                |
| `pointerdown` / `pointerup` | **746**   | 746     | `undoButton`     | `.actions-panel`            |
| `click` (synthesized)       | **737**   | 737     | `.drawer-toggle` | `.drawer-toggle`            |

The finger really was at 778 — dead centre of the button. The pointer event names the right target
and reports a coordinate 32px above it. That 32px is the viewport's own
`screen.height - innerHeight` (1133 − 1101), so it exists in portrait and is zero in landscape,
which is the entire orientation asymmetry the issue was filed around.

`clientY`, `pageY`, `screenY`, and `offsetY` on the pointer event all carry the skew, so there is no
correct accessor to reach for. The only skew-free signal is `e.target`.

The failure is then entirely in app code. `scribbleTap` discards the dispatched target and
re-derives one from the coordinates (`web/src/lib/actions/scribbleGuard.ts`):

```js
const hit = node.ownerDocument.elementFromPoint(e.clientX, e.clientY); // 746, not 778
return node.contains(hit); // false
```

It is called twice — from `up()` to decide the release landed on the control, and from `move()` to
decide the press became a drag. Both get the wrong answer, which matters for how the fixes were
ranked below.

## What this rules out

* **Not the undo/paper-restore logic.** The engine, `peekTiledUndoPaper()`, and the code added by
  issue 1193 are all healthy. A scripted `.click()` in the wedged state restores correctly.
* **Not layout settling.** The issue's final comment blames a toolbar still reflowing. Measured with
  the drawer open, the button's layout box is 750–805 and its hit-test band is 750–802. They agree.
* **Not undo-specific.** Every control using `scribbleTap` — save, coloring books, brush, stroke
  width — is dead to a portrait touch on iOS native.
* **Not fixable by a scroll nudge.** `window.scrollTo(0, 0)` leaves the skew unchanged.

Touch pointers also get implicit pointer capture here: after dragging 300px away, `pointerup.target`
is still the original button. So `e.target` alone cannot distinguish a tap from a drag-off; the
movement-based `dragged` latch is what does that.

## Two setup steps that invalidate a run if skipped

Both were got wrong at least once, producing confident non-reproductions:

1. **Rotation is locked by a persisted app setting.** Clear `splotch-lock-rotation` and reload, or
   every orientation scenario silently measures one orientation.
2. **Undo lives inside the collapsible drawer, closed by default.** Tapping it while collapsed hits
   a `visibility: hidden` control; `getBoundingClientRect()` still returns a plausible box, so the
   run looks valid and reproduces nothing. The issue thread contains the same class of error — an
   early repro clicked `#clearButton` instead of performing the drag-away gesture, so the canvas was
   never blank.

Separately, Appium's WebInspector connection on the simulator wedges after repeated sessions and
surfaces as "The remote Safari debugger did not respond … JavaScript execution is blocked" while the
app is visibly healthy. Rebooting the simulator is the fix. A related trap: patching
`capacitor.config.json` inside the simulator's app bundle drops `packageClassList` if the file is
overwritten wholesale, which unregisters every native plugin and hangs the app's plugin calls — edit
the value in place instead.

## The four candidate fixes, as measured

Each was built on its own branch, passed the full unit suite and `svelte-check`, then was driven
through the four scenarios now preserved as `npm run perf:ios:verify:tap`.

|   | Fix                                        | Intervenes at     | Source diff | Scenarios |
| - | ------------------------------------------ | ----------------- | ----------- | --------- |
| 1 | Trust `e.target` in `up()`                 | The release check | +12         | 3 of 4    |
| 2 | Calibrate the skew from the touch stream   | The hit test      | +42         | 4 of 4    |
| 3 | Hit-test at the touch stream's coordinates | The hit test      | +34         | 4 of 4    |
| 4 | `ios.contentInset: "never"`                | The cause         | 1           | 4 of 4    |

```text
baseline    FAIL restore-after-LANDSCAPE-start · PASS portrait-start · PASS drag-off
option 1    PASS · PASS · PASS · FAIL wiggle-tap-activates
option 2    PASS · PASS · PASS · PASS
option 3    PASS · PASS · PASS · PASS
option 4    PASS · PASS · PASS · PASS
```

**The wiggle-tap scenario is why option 1 was rejected**, and it is the reason this record exists.
Option 1 is the smallest diff, fixes the bug exactly as filed, and would have read as obviously
correct in review. But it patches only `up()`; by the time `up()` runs, `move()` has already seen
12px of travel, asked the same broken `eventHitsControl()` whether the finger is still on the
button, and latched `dragged = true`. Any tap with more than 8px of smudge stays dead. That is not
an edge case for the intended user.

Option 3 works but installs a window-level `touchmove` listener that lives for the life of the app
and fires on every move of every stroke — the hot-path rule in `.claude/rules/svelte.md` forbids
exactly that, in an app whose performance story is stroke latency. The cost was not measured; this
is a code-level judgement.

Option 4 was chosen: it removes the skew at its source, so every control and every gesture is
correct rather than one call site being compensated, at one line and no runtime cost. It also lands
the Notch Band on iOS, which ADR-0026 designed, shipped on Android, and named `ios.contentInset` as
the reason it never worked here. Its cost is a visible layout change verified only on the simulator
so far, and it is specific to this source of skew — option 2 would survive a future one, so it stays
the runner-up if the visual change is unwanted.

## Corrections owed to the issue thread

Issue 1194's comments currently tell the next reader that the toolbar's post-rotation layout is
still settling, that the regression test belongs in `tiledRendererBlankUndo.test.ts` covering both
rotation directions, and that the symptom is undo failing to restore. All three are contradicted
above. The regression test belongs in `scribbleGuard.test.ts`, or at this level in
`perf:ios:verify:tap`.
