# Native Send Feedback construction

This private candidate implements ordinary feedback in the RN and released RSD drawing callers. The
campaign owner retains framework selection, integration, full-product acceptance and release. This
unit starts at Appearance commit 8c1059891fc4270b20b9b5c9a7c0aaf39fd2bc48 on
`codex/native-feedback`. The feedback worker owns subsequent repairs. Original Claude R2 closed with
zero findings and zero unverified items for the standalone 410b repair; two review rounds are used
and one remains under root authority. This changed joined composition is source-only and
unvalidated.

## Product behavior

Settings' Feedback row opens the feedback sheet. Parents choose a bug or an idea, write a nonempty
message of at most the canonical 4000 UTF-16 code units, and inspect the exact immutable request
before explicitly sending. Bug device details are optional and initially off; ideas cannot attach
them. The disclosure identifies the private support issue, connection IP exposure, sensitive-message
precautions and the absence of drawing, image and credential attachments.

The default native protection is **Every time**. Feedback can use **Per session** or **Never** only
after a fresh arithmetic challenge. Every preference edit requires that independent challenge, even
when the saved preference is Never. A failed or malformed preference read activates Every time.
Writes are serialized and verified by readback; a failed save activates Every time in memory. The
feature owns only feedback protection; the larger Parent Center policy family remains open.

A form dismissal clears the pending challenge destination and never grants authorization. One
visible challenge retargets to the latest requested operation. Wrong-answer streaks and escalating
lockouts survive challenge dismissal and form close/reopen for the lifetime of the feedback owner.
The operand range, lockout thresholds, quiet interval and duration owner follow ADR-0094 and are
pinned to the existing implementation. A successful answer resets escalation. Session proof and
failed-attempt memory reset when the mounted drawing application is disposed or the process exits;
persisting protection across termination is an explicit remaining product acceptance question.

Reports are memory-only. Closing the form allows drawing while the reviewed request finishes. That
immutable request can finish after reopening, but its success cannot erase a newer draft. Request
identifiers keep stale completion and stale cancellation from touching a newer request.
Cancellation, timeout and ambiguous replies explain that delivery may already have occurred. There
is no automatic retry. Throttling honors a bounded Retry-After delay before a manual retry. Drafts
and request status do not survive termination; both callers disclose this limitation.

## Source ownership and boundary

* `src/feedback/feedback.ts` owns draft revision, reviewed snapshot and operation coordination.
* `feedbackGate.ts` owns challenge continuation, authorization and attempt lifetime.
* `feedbackPolicy.ts` owns strict versioned preference validation and serialized changes.
* `feedbackPreview.ts` owns the immutable canonical request and consent-controlled device
  collection.
* `feedbackDelivery.ts` owns request identity, cancellation and throttle availability.
* `feedbackTransport.ts` owns the HTTPS endpoint, deadline, bounded stream reading and exact reply
  validation from unknown. Provider and transport exception text never reaches the interface.
* `FeedbackSheet.tsx` is the legacy RN caller; the RSD caller is the Settings Feedback section,
  `rsdDrawing/RsdFeedbackSection.tsx`, which sends through `submit()` with no review step.
  `useNativeFeedback.ts` retains their service owner while the form is closed.
* `platform/feedback.ts` uses the already-installed released `expo/fetch` streaming response and
  app-private Expo file storage. Its `.web.ts` counterpart uses browser fetch and local storage.

The only transport URL is `https://splotch.art/api/report`, with omitted credentials and rejected
redirects. The request vocabulary and device formatting belong to `web/src/lib/report.ts` and
`web/src/lib/platform/deviceReport.ts` under the API contract and ADR-0060. Candidate import
isolation prevents importing the hosted application's graph. Exact whole-file projection tests
therefore pin these dependency-free owners, `truncate.ts` and the pure parental lockout owner,
allowing only the isolated relative import. The origin and application version also have guards. No
hosted Svelte API, admin, PWA or existing server runtime file is changed. The sole new web file is a
controlled handler fixture test.

## Qualified local validation

The evidence packet beside the private repository retains every command's actual PID, PGID, start
time, exit code and complete stdout/stderr. The ordinary root Svelte check ran before tool tests to
create this checkout's own `.svelte-kit` configuration. Native TypeScript, lint, formatting,
installed native topology and targeted suites must be judged by their final saved exit receipts. A
targeted registration suite contains many specifier cases; its count is not full-tools acceptance.

Actual RN mounted tests exercise the menu, consent, preview, gate, transport outcomes and continued
drawing. Released RSD native tests exercise the actual caller and native input event bridge. The
wire fixture drives the actual controller and web transport into the real POST handler while
replacing all outbound issue creation and rate-limit effects with controlled fixtures. It does not
submit a report or make an outbound provider write.

Ten source mutations have actual failing checks and byte-identical restoration: newer-draft loss,
duplicate immediate send, dismissal unlock, permissive success reply, missing deadline abort,
ignored device opt-in, stale completion, stale cancellation, dismissal resetting wrong attempts, and
canonical message-cap drift. The private `NEGATIVE-CONTROLS.json` identifies each source hash,
selected test and rejection exit. Final positive checks run after restoration.

Root's initial full-tools run failed; the fixture repair's qualified retry passed. Further repairs
require new root-owned full-tools acceptance. No full E2E, native build, native runtime, device,
performance, live API acceptance, release validation or independent review is claimed. Native
streaming, keyboard/accessibility, background lifecycle and persistent policy storage require
on-device acceptance. Composition with the separately repaired Appearance unit must apply its
DrawingStatusBar and consistent translucent modal/window backing to the new feedback modal when that
source is integrated. This baseline has no such future symbol to import. Both operating systems,
including opposite-OS Light/Dark system bar and modal pixels, remain open. The gate's termination
lifetime and the broader parent-policy family remain explicit acceptance items.

## Reproducing the owned install

Use the exact root lockfile, patches, hoisted linker, lifecycle hooks and allowBuilds policy. Never
install with npm. The private clone used pnpm 11.22.0 through its locally verified Node and
`dist/pnpm.mjs`, COREPACK_ENABLE_NETWORK=0, `--frozen-lockfile`, `--package-import-method=copy`,
`--offline`, the approved existing store and an explicit owned `--cache-dir`. The exact argv and
complete process receipts are retained outside the repository.

Copy only authenticated metadata into the owned cache. A copied `lockfile-verified.jsonl` can reuse
an older supply-chain verdict, and an existing installed tree can take a fast path after that
verdict is deleted. This unit preserved those actual faults, superseded only its own installed tree,
removed the copied verdict and performed a clean normal offline install. That clean receipt records
1527 fresh supply-chain entries passing, 1451 packages added, 1363 reused and zero downloads.
Corepack's disabled-network bootstrap and the incorrectly nested cache lookup faults are retained.
An offline miss stops work; no network fallback, policy override or external dependency alias is
used.

## Private ownership and integration

`feedback-ownership.json` is the durable ownership boundary. The external private packet supplies
actual commit, feature patch, whole-source manifest, preservation and check hashes after sealing. It
remains on this Mac and is not a pushed handoff. Integration must preserve the independent
Appearance and offline-library units, repeat the appropriate root-owned acceptance tiers and open a
fresh review for this new unit without spending or resetting any original review identity.

## Fixture and inventory repair after first full tools

Root's qualified default full-tools run against the first feature commit completed with actual exit
1: 422 files, 416 passed and six failed; 9191 cases, 9190 passed and one failed. Five standalone
mounted drawing suites reached the newly mounted feedback hook's native SDK adapter and attempted to
load Expo's untransformed `expo/fetch` entry in their Node fixture. The remaining failure was the
finite candidate source inventory omitting the sixteen new production files. The original command,
complete stdout/stderr, process closure and sealed feature artifacts are retained separately.

The drawing fixtures import `tools/tests/native-feedback-drawing-fixture.mjs`, which replaces only
the feedback platform I/O boundary. The actual feedback hook, controller, gate and policy owner
remain mounted. Its teardown asserts that unrelated drawing tests never submit feedback, collect
device details or change protection. No general test alias or product transport fallback is added.
The candidate import inventory names all sixteen production additions explicitly and retains its
exact-file comparison and generated-output exclusions.

The adapter test sends an actual chunked response through the native adapter and deadline reader,
requires that response stream to be consumed, and forbids global fetch. Production continues to
import released `expo/fetch`; native SDK/runtime acceptance remains open. Fault controls remove a
mounted fixture boundary, substitute global fetch for Expo, omit a finite inventory path and allow
unexpected fixture I/O, with actual rejected checks and exact restoration recorded in the repair
packet. That checkpoint had no review rounds spent. The same worker retains implementation
ownership.

## First independent review repairs

Root's first independent Claude review closed against the fixture repair with four nonblocking
findings and no unverified findings. That first-round checkpoint spent one review round; root
retains review execution authority. The earlier failed full-tools run, subsequent qualified pass and
both private evidence seals remain immutable history.

React Native's installed navigator setup defines `product`, not connectivity. The owned candidate
graph has no native network-state provider, so its offline precheck returns `null` for unknown.
Browser preview retains its browser precheck. A failure after transport starts remains an uncertain
connection outcome even if a later connectivity check would say offline. The parent sees the
concrete tradeoff: Splotch may already have received it, and sending again could send it twice.
Nothing retries automatically or reveals private provider errors.

A draft edit resets settled delivery outcomes to idle. Active sends retain their immutable request
and cancellation identity; throttling remains enforced across edits until its original deadline.
Expiry returns the form to idle without submitting. The revision and request-id controls still
protect newer drafts and separate newer requests from older completion or cancellation.

The standalone 410b screen retains one feedback owner for its lifetime. Its RN or RSD sheet
subscribes through `useSyncExternalStore`, with gate and throttle timers inside that wrapper.
Unchanged unlocked gate ticks do not publish. Its qualified mounted render-count guards cover
feedback typing, local gate input and closed-form throttle ticks without canvas renders. The joined
product uses a shared Parent Gate and foreground ticker instead; its distinct source-only adaptation
and remaining gate-input render subcase are described below. No device frame-time or performance
acceptance is claimed.

## Joined product composition proposal

The source-only proposal preserves the shared Parent Center authorization port, native modal
visibility/dismissal route and Appearance overlay backing. The product owns the foreground feedback
throttle ticker, including while feedback is closed. Feedback wrappers subscribe to draft and
outcome changes; the product screen publishes only when feedback opens or closes. Shared Parent Gate
input still publishes product state and remains an open canvas-render subcase. The original Claude
second round closed without findings for standalone 410b; the changed joined composition has not
been imported, checked, tested, built or independently reviewed.
