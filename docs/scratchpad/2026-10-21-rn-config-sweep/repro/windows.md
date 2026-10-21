# Window checks and accepted evidence

On API34, `am start --windowingMode 3` created a legacy mode3 root task with full-screen bounds. It
was not a usable split screen. The task had only Splotch and was removed by its recorded root-task
id27; this tester-requested removal reset the activity/process and was followed by a fresh house. It
is not a product-loss finding. Do not reuse task ids from this note; discover the current owned task
first.

The accepted API34 split uses Recents: open Splotch, press `KEYCODE_APP_SWITCH`, tap the Splotch
icon, choose **Split screen**, then select the Settings card. Tap Splotch's purple swatch to focus
its window before dumping/accessing its controls. The first unfocused capture includes both windows
in its PNG, but its UI tree belongs to Settings and must not be used for paper-pixel or Undo
conclusions.

The initial app bounds were `(9,0)-(1071,1187)`, with divider center at y1200 on a1080×2400 display.
Dragging that divider toward y1600 snapped it to y1644 and enlarged Splotch to height1631. The next
attempt starting at y1600 missed the divider; captures named `split-small` and `split-exited` still
have the larger bounds and do not establish those transitions. Corrected captures use the actual
snapped divider position. Always inspect effective bounds after every drag and derive the next
handle coordinate from the current bounds; a requested destination is not necessarily the final
divider position.

Each accepted state has a fresh focused screenshot/tree, PID, activity creation count, and actual
Undo screenshot. A resize with unchanged bounds is an unsupported attempt, not a pass. Confirm
leaving split screen by full-screen `mWindowingMode` and restored display bounds.

API36 tablet uses Recents' **Split** action directly, then the Settings thumbnail. Splotch is the
right pane. Actual pane bounds changed from x1290–2560 to x1696–2560; divider touch region is
recorded in `split-input.txt`. The first entry frame was white but settled to the house/chrome
without input. Accepted focused captures verify Undo. Repeated divider exit gestures and a
windowingMode1 launch left split bounds unchanged. To leave, the helper verified task16 belonged to
Settings, then called ActivityTaskManager.removeTask(16); this closes only the paired Settings task.
`split-exited-close-other` verifies Splotch's full bounds and retained activity/history. Do not
reuse task ids on another run.

API28's legacy mode3 launch initially created an empty primary stack while Splotch and Settings
stayed secondary. The recorded stack list identified Settings task12 and empty primary stack3;
moving that task into that stack produced a visible Settings/Splotch pair. The divider was then
dragged to reduce Splotch to effective392×220dp, where the L-shaped compact panel's icons remain
visible. Exit by dragging the actual divider to the top settled to full screen. Android9's
activity-side `mCurrentConfig` can retain transitional split fields; use the recorded server stack
list and settled focused captures as the window oracle. Drawing/Undo remain intact throughout.
