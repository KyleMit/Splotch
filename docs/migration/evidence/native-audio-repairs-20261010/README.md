# Native audio repair source and evidence

This follow-up to 73179b36eee307d6836382b135164139a3d1a3c4 publishes the owned Expo Audio reset
patch, its exact pnpm registration and source qualification, and the React Native cancellation guard
repair. The historical prepared Settings/audio README and prior receipts remain unchanged. This is a
provisional development candidate; no framework or campaign acceptance is implied.

The native loader used `signal.throwIfAborted()` after audio-mode setup and before player
allocation. React Native 0.86.3 installs abort-controller 3.0.0, which provides `aborted` and event
listeners but lacks that method. Expo's patch adds only static `timeout` and `any`. The retained
joined Android packager map includes this exact provider and loader call. The repair checks
`signal.aborted` and rejects with the existing cancellation error. This explains a deterministic
pre-player rejection; the visible generic native failure notice did not retain an error stack.

The adapter regressions resolve the actual installed provider through React Native's dependency. All
adapter fixtures use that provider, and three explicit cases cover normal readiness, already-aborted
input, and abort during pending audio-mode setup. The focused adapter/controller suites passed 30
tests. Replacing only the repaired guard with the old call caused the exact new normal case to fail
before player creation; restoring exact source passed. Native TypeScript, repository check, lint and
changed-code formatting passed. These bridge-boundary mocks do not establish real playback. The
required current full tools tier is recorded in the publication receipt; no historical full-tier
pass covers this follow-up.

The Expo Audio 57.0.5 iOS patch retires the current player on media-services reset: clears playback
intent, mutes, pauses, cancels pending seeks, tears down observers and emits reset status. It
removes the reset-only replacement/readiness/seek-resume path. Existing JavaScript disposal and
later fresh-player recovery remain. The 1,751-byte patch is registered in the exact pnpm-emitted
lock and workspace. The qualifier authenticates all 190 effective published source files and four
exact owned pnpm executable links before projecting the declared registration delta to the inherited
Audio/N1 inputs. Unknown source/link/target changes reject; inherited Forge/scanner owners are
unchanged.

A real hostless iOS XCTest target compiled the installed patched AudioPlayer and ran three cases:
stopped, source with pending readiness, and loaded then paused. All three passed. Replacing only the
reset body with the upstream body failed the exact pending-readiness case; restoring patched Swift
passed all three again. The fixture, raw terminal logs, xcresult summaries and predicate receipts
are retained here. The simulator's existing boot state/data were preserved. The fixture does not
force a late callback, exercise the JS bridge, move a stroke, or measure physical output.

The first native negative attempt timed out during Xcode's failure diagnostics and was not accepted
as a qualified negative. Its fixture also skipped release on an early throwing unwrap; a deferred
release repaired that cleanup. Installed Xcode's supported `-collect-test-diagnostics never` option
made the later bounded failure/restoration sequence terminate. The missing defer was not proved to
cause Xcode's diagnostic wait. The first hook-free install succeeded but source authentication
refused generated package-local bin links; the finite four-link authentication repair and rejecting
controls retain the 190-file/source/archive boundary. Both failures remain in the evidence.

The first full tools run for this follow-up exited 1: 8,264 tests passed and seven failed in two
inherited Forge fixtures. Both passed the raw workspace's new Audio patch registration to the
unchanged single-patch Forge guard. Their inputs now consume the Audio owner's authenticated
inherited workspace, matching the production call path; every positive and refusal assertion is
unchanged. The failed terminal, stacks and fresh closure remain here. The wrapper's per-PID absence
scans also exceeded the nominal 60-second cleanup allowance; its 229.93-second total remained within
the original 360-second overall cap. The follow-up wrapper uses one absence snapshot and fresh
identity checks for any survivor before signaling.

Q5 stays open for real native playback/error recovery, bridge/reset arrival, physical speaker/gain
and forced-late timing evidence. Native rendering, full drawing/audio fidelity, permissions/release
and performance acceptance remain separate. Original Claude conversation
2e99851f-258c-4af7-81a6-e1a63f050a5b remains one round used and two remaining; this publication
starts no review round.
