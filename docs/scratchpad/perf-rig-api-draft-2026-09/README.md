# perf-rig: API draft for extracting the performance harness

Working material for issue #1523. The question this folder answers: if the capture harness under
`tools/perf` were an independently shippable package, what would its public surface be, and can
Splotch express every one of its forty `perf:*` scripts against that surface without reaching past
it?

The answer is a typed draft, not prose. `package/types/*.d.ts` is the surface; `splotch/*.ts` is
Splotch's side written against it; `tsconfig.json` type-checks both together:

```sh
node_modules/.bin/tsc -p docs/scratchpad/perf-rig-api-draft-2026-09/tsconfig.json
```

`perf-rig` is a placeholder name. The package does not exist; nothing here runs. The first
implemented step is the nested package under `tools/` (ADR-0053's middle rung), not a separate
repository; `migration.md` says why and what each phase must prove.

## Contents

| Path                        | What it is                                                                                                                       |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `boundary.md`               | Every file under `tools/perf`, `tools/app-driver`, and the probes, with its verb: moves, splits, or stays.                       |
| `package/README.md`         | The package as a stranger would meet it: entry points, what it owns, what you declare, the first capture, rules.                 |
| `package/package.json`      | Dependencies, peers, engines, exports and the install notes that follow from ADR-0119.                                           |
| `package/types/`            | The public surface. `index.d.ts` lists it by lifecycle.                                                                          |
| `package/docs/endpoints.md` | The ten capture endpoints: prerequisites, guards added, validations left to you, customisation, traps.                           |
| `package/docs/guards.md`    | The trust-ledger vocabulary: every guard and verdict, what it checks, how, and when it does not apply.                           |
| `package/docs/gotchas.md`   | The plausible-wrong-number catalogue, each mapped to where the package catches it.                                               |
| `splotch/`                  | Splotch's contract, targets, gates, scenarios, rig, campaign, operator steps, engine scripts, legacy upgrader, and `scripts.ts`. |
| `use-case-matrix.md`        | The script table in prose, plus what the surface grew and lost to cover it.                                                      |
| `migration.md`              | How the extraction lands without breaking a script, in phases with their proof.                                                  |
| `critique-rounds.md`        | Each adversarial review, what it found, what changed, and what was declined with the reason.                                     |

The decision the draft supports is ADR-0164. The surveys that produced `boundary.md` read every
module in those trees on 2026-09-09; the dispositions cite line numbers from that tree.

## How to read the surface

Start with `package/types/index.d.ts` for the lifecycle, then `app.d.ts`: the app contract is the
seam, and everything else is either a transport that reads it or a scorer that takes its values as
arguments. `procedure.d.ts` is the step vocabulary that lets one declared procedure run through
Playwright, Appium, and an injected same-origin script alike; it exists because the split-capture
transport has no script channel, so the same interaction must compile to page code the route's CSP
will run. `artifact.d.ts` is the envelope every capture writes, with evidence typed per scenario
kind so the package's acceptance rules and Splotch's read the same fields.

Then `splotch/app.ts` to see the contract filled in with Splotch's real selectors and hooks, and
`splotch/scripts.ts` to see each npm script as a call.
