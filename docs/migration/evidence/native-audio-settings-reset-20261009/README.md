# Native audio media reset refusal source repair

This source-only repair refuses Expo Audio's `mediaServicesDidReset` event before processing
playback or readiness. The owned adapter mutes, cancels its gain/load timers, unsubscribes, removes
the registry entry and releases the player. Pending initialization rejects; a settled loop reports
failure to the existing controller, which drops the active stroke and permits a fresh player on the
next gesture. Calls and queued events after disposal cannot restart the refused player.

The retained Expo Audio 57.0.5 archive's `AudioPlayer.swift` replaces its AVQueuePlayer on reset
without carrying the volume and can resume playback. An active stationary stroke can have intended
zero gain with no pending ramp. Refusal avoids trusting the replacement's gain. The wrapper receives
the native event after native recovery begins; this patch does not establish physical speaker timing
or eliminate a possible interval before that event reaches JavaScript.

Prepared regression cases cover active quiet strokes with no timers, stopped-player next starts,
loading reset before readiness, ramp cancellation and late events. A mutation fixture transpiles the
actual adapter after removing only the reset refusal and requires the active-quiet assertion to
fail. The fixture replaces imports with the same native binding mocks and production gain/time
constants. No shipping browser/rune modules, existing qualification policies or prior receipt bytes
change.

No formatter, tests, install, build, server, playback, reviewer or Git mutation ran in this
source-only window. These checks require a separate lease:

* Format the two edited code files and this README, then run `npm run format:check` (cap 180
  seconds).
* Run
  `npm run test:tools -- tests/native-audio-adapter.test.mjs tests/native-drawing-audio.test.mjs --maxWorkers=1`
  (cap 120 seconds; preserve any failure and run bounded concrete repairs with the same owner).
* Run candidate TypeScript with
  `node node_modules/typescript/bin/tsc --project experiments/native-architecture/tsconfig.json --noEmit`
  (cap 120 seconds).
* Run `node tools/migration/check-native-audio-inputs.mjs`, then `npm run check` and `npm run lint`
  (each cap 180 seconds).

If this worktree lacks dependencies at execution time, reproduce its exact lock with an own
`pnpm install --frozen-lockfile --ignore-scripts --ignore-pnpmfile` only under the authorized
install lease (cap 180 seconds). Full tools, browser/native output and speaker behavior need later
explicit host windows. This repair remains unformatted, unexecuted and unaccepted.
