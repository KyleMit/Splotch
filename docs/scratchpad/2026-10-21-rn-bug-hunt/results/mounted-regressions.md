# Mounted regression evidence

Candidate b236d639160459eecd60900926c759af5d4ae080. These are native RSD mounts in happy-dom with
the repository's platform seams. They do not establish browser/emulator UI parity.

* Eight existing files passed, 131 tests: selection, color picker, Parent Center, toolbar, web
  restart, Clear, AI and install banner. Command and full output in
  `../evidence/mounted-baseline-serial.log.txt`. Single worker, no file parallelism.
* `tools/migration/tests/rsd-native-settings-sliders.test.mjs`: 11 tests passed, including two
  additions. The new cases interrupt a real Settings Volume or Button Size drag via responder
  termination, assert that the audio/drawer preview stops, confirm the final saved value, and reject
  stale contact movement. Volume also proves that a fresh drag can start again.
* Deliberate break: `../repro/slider-negative-control.mjs` installs a temporary Vitest transform
  that replaces `onResponderTerminate={release}` with a no-op. Both new tests fail (9 pass, 2 fail,
  process exit 1): `../evidence/slider-negative-control.log.txt`. The temporary config is removed in
  `finally`; product files are never modified.

The initial default-worker run was interrupted after slow/no-progress output and rerun serially. The
serial baseline completed in 51.68 seconds. A redundant follow-up core run was canceled once that
completed result was read; it is not counted as additional validation.

## Second-run additions

Two parameterized mounted cases cover Volume and Button Size with another contact moving, then
remaining after the tracked contact leaves. The real Settings caller and settings owner preserve 60%
Volume / 106% Button Size and persist those values after release. All 13 slider tests pass in
`android-run2-slider-tests-positive.log.txt`. The transform-only negative control accepts the first
changed contact regardless of identifier; exactly these two cases fail. Its runner is
`repro/slider-contact-negative-control.mjs`, with output
`evidence/android-run2-slider-contact-negative-control.log.txt`. No product source is rewritten.
