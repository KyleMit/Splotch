# Handoff — aiImage OffscreenCanvas encode

> 2026-08-05 · branch `claude/audit-burndown-overnight-6isff3` · PR
> [#771](https://github.com/KyleMit/Splotch/pull/771) · Decide the fate of the main-realm
> `OffscreenCanvas` WebP encode in `aiImage.ts` — the one review thread on 771 left unresolved,
> blocked on a scope call the user has not yet made.

## Objective & non-goals

**Objective.** Close review thread
[`#discussion_r3719928468`](https://github.com/KyleMit/Splotch/pull/771#discussion_r3719928468) by
picking one of three options (below) and pushing it. The reviewer's critique was verified as
**correct**; what is undecided is the remedy, not whether there is a problem.

**Non-goals.**

* Re-litigating the other eight threads on 771 — all fixed, replied to, and resolved.
* Claiming any frame-budget result measured on target hardware. **No iPad or low-end tablet is
  reachable from a cloud container.** Do not assert a perf win you cannot produce; overstating an
  unmeasured claim is the exact defect this thread is about.

## State

Branch is pushed and clean; `HEAD` == `origin/claude/audit-burndown-overnight-6isff3` at
87bd24a07a512b6d044fec953ca9e10d85f2a89f. CI green on all 10 checks. PR 771 is out of draft.

The two commits that own the disputed code:

| sha                                      | what                                                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 7115f3eb5dc4b9a3299a3da431259366a6f87c0f | `perf(ai)`: encode the WebP upload via `OffscreenCanvas` when available — **the change under dispute** |
| b2ab28bb855542baca6dfc8e79da0c4166b73b82 | `fix(ai)`: fall through to the DOM canvas when `OffscreenCanvas` fails; doc fix                        |

Files in scope:

* `web/src/lib/drawing/aiImage.ts:30-72` — `encodeWebpUpload`, the branch in question.
* `web/src/lib/drawing/aiImage.test.ts:295-474` — the tests that cover it (branch selection, MIME
  behaviour, and the DOM fallback). These pass and are **not** what is contested.

## The critique, and why it holds

The reviewer's claim: a main-realm `OffscreenCanvas` moves neither the allocation nor the drawing
off the UI thread, so it is not a demonstrated fix for the jank the finding invoked; the added
branch buys unproven benefit, and the new tests prove branch selection rather than a frame result.

Verified against both ADRs it cites — the trial rows are unambiguous:

| ADR  | trial                                                                     | result                                                          |
| ---- | ------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 0091 | 02 — `OffscreenCanvas` for the Magic sheet only                           | 40 ms · **Fail**                                                |
| 0091 | 04 — worker raster after a main-thread `createImageBitmap`                | 45 ms · **Fail**                                                |
| 0091 | 14–15 — worker fetch **and** raster                                       | 28–30 ms · **Pass** (retained)                                  |
| 0091 | 16 — disable only the worker under the passing architecture               | 38 ms · **Fail**; "proved both retained changes were necessary" |
| 0088 | 08 — draw a 640 px preview canvas on the main thread                      | 247–472 ms · **Fail**                                           |
| 0088 | 24 — fresh main `OffscreenCanvas` **plus** fresh worker `OffscreenCanvas` | **Pass**                                                        |

So on this hardware the worker boundary, not the offscreen surface, is what has ever moved the
number.

## Decisions made (and why)

* **Left unresolved deliberately.** Every other thread on 771 was fixed and resolved; this one was
  escalated to the user and no answer came back. Resolving a thread whose remedy is undecided would
  misrepresent the state, so a reply with three ranked options was posted
  ([`#discussion_r3720347591`](https://github.com/KyleMit/Splotch/pull/771#discussion_r3720347591))
  and the thread left open.
* **Did not revert unilaterally.** The change is behaviourally safe — full DOM fallback, CI green —
  so there is no correctness pressure forcing a decision before the user weighs in.
* **Did not build the worker.** That is a substantial new module well beyond the one-line finding
  that started this, and it could not be verified from here even after building it.

## Unverified assumptions

Test these first.

1. **The premise about *what* jank this fixes is probably wrong, and this reframes everything.**
   `encodeWebpUpload` is called once per generation at `aiImage.ts:159`, inside `generateAiImage`,
   which is reached from a **button tap** — `AiImagePrompt.svelte:37` (style pick) and
   `ActionsPanel.svelte:269`. It is **not** on the style dial's per-frame path. What it can do is
   hitch the dial's *opening* frames, since `handleSelectStyle` hides the prompt and hands off to
   the result modal that shows the dial while this encode runs. So the honest framing is "one
   main-thread encode overlapping the dial's first frames", not "per-frame dial jank". **This was
   traced by reading the call graph, not measured** — confirm before relying on it.
2. That a worker version would actually remove that hitch. Strongly suggested by ADR-0091 trials
   14–16 and ADR-0088 trial 24, but never measured for *this* code path.
3. That `convertToBlob` off the main thread is the costly part at all. The `createImageBitmap`
   decode at `aiImage.ts:32` is also main-thread and also unmeasured — ADR-0091 trial 04 failed
   precisely because a main-thread `createImageBitmap` remained. **A worker that takes only the
   encode may repeat trial 04's mistake.**

## Done & verified

Everything below was actually run on 87bd24a07a51 and passed:

* `npm run check` — 1111 files, 0 errors, 0 warnings.
* `npm run test:unit` — 1167 passed (3 consecutive clean runs; see Risks).
* `npm run test:e2e -- tests/startup-bundle.spec.ts tests/flows-settings.spec.ts tests/feedback.spec.ts tests/settings-zoom.spec.ts`
  — 28 passed.
* `format:check`, `lint:tokens`, `gen:tokens:check`, `img:audit:check`, `check:assets:manifest`,
  `scrapbook:check`, `lint:dead` — all pass; eslint clean on every changed file.
* CI on PR 771 — 10/10 green.

Not verified: any frame-time or perf claim about `encodeWebpUpload`, on any device.

## Risks & next 3 steps

**Risks.**

* Option 3 is a trap if taken narrowly: moving only `convertToBlob` into a worker while leaving
  `createImageBitmap` on the main thread reproduces ADR-0091 trial 04, which **failed**. Move the
  decode too, or don't bother.
* One unit run during this session showed a single failure that cleared and did not reproduce across
  three subsequent full runs. The spec was never captured, so it is unnamed. Flagged on the PR. If
  you see a lone flake, it may be pre-existing rather than yours.
* A merged 771 means this branch cannot carry follow-up work — fork a fresh branch from the new
  `main` and open a new PR.

**Next 3 steps.**

1. **Get the scope decision** (this is the blocker — everything else is downstream):
   1. **Revert** 7115f3eb5dc4 and b2ab28bb8555 back to the DOM-canvas path, and file a `type:audit`
      GitHub issue for doing the worker properly. Smallest, fully reversible, removes branching
      whose benefit is unproven. **Recommended** — and assumption 1 above, if it holds, strengthens
      this: a once-per-tap encode is a weaker motivation than the finding implied.
   2. **Keep and correct the claim** — reword the rationale to say plainly that this only moves the
      encode off the DOM-canvas path and is *not* a measured frame fix, plus the same follow-up
      issue. Nothing regresses; complexity is retained for an unmeasured gain.
   3. **Build the worker** — decode *and* encode in a worker, DOM fallback retained. Mirror
      `web/src/lib/drawing/pngEncoder.worker.ts` (ADR-0088's shape, with its `pngEncoderProtocol.ts`
      request/response typing) or `magicSheet.worker.ts` (ADR-0091's).
2. Apply the choice on this branch, re-run the gates listed under **Done & verified**, and push.
3. Reply on
   [`#discussion_r3719928468`](https://github.com/KyleMit/Splotch/pull/771#discussion_r3719928468)
   citing the SHA — **copy it from `git log --format=%H`, never retype it** — then resolve the
   thread. Verify with `git rev-parse --verify --quiet "<sha>^{commit}"` before posting.

## Reread first

* `web/src/lib/drawing/aiImage.ts:30-72` — the disputed branch; `:159` — its one call site.
* `web/src/lib/drawing/aiImage.test.ts:295-474` — existing coverage.
* `docs/adrs/0091-alpha-overlays-and-worker-magic-sheets.md` — trials 02, 04, 14–16.
* `docs/adrs/0088-frame-bound-screenshot-export-on-ipad-webkit.md` — trials 08, 24.
* `web/src/lib/drawing/pngEncoder.worker.ts` + `pngEncoderProtocol.ts`, and `magicSheet.worker.ts` —
  the two working worker precedents, if option 3 is chosen.
* The `profiling` skill — if anyone with an iPad picks this up, that is how to get the number that
  would settle it outright.

> If the decision is option 1 or 2, the worker follow-up is a **durable backlog item**, not a
> handoff: file it as a `type:audit` GitHub issue per `docs/ISSUE-WORKFLOW.md` and delete this
> packet.
