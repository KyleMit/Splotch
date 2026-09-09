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

`perf-rig` is a placeholder name. The package does not exist; nothing here runs.

## Contents

| Path                        | What it is                                                                                                 |
| --------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `boundary.md`               | Every file under `tools/perf`, `tools/app-driver`, and the probes, with its verb: moves, splits, or stays. |
| `package/README.md`         | The package as a stranger would meet it: what it owns, what you declare, the first capture, the rules.     |
| `package/types/`            | The public surface. `index.d.ts` lists it by lifecycle.                                                    |
| `package/docs/endpoints.md` | The nine capture endpoints: prerequisites, guards run, validations left to you, customisation, traps.      |
| `package/docs/gotchas.md`   | The plausible-wrong-number catalogue, each mapped to where the package catches it.                         |
| `splotch/`                  | Splotch's contract, targets, gates, scenarios, rig, campaign, and the forty-script mapping (`scripts.ts`). |
| `use-case-matrix.md`        | The script table in prose, plus what the surface had to grow to cover it.                                  |
| `migration.md`              | How the extraction lands without breaking a script, in phases with their proof.                            |
| `critique-rounds.md`        | Each adversarial review, what it found, and what changed.                                                  |

The decision the draft supports is ADR-0164. The surveys that produced `boundary.md` read every
module in those trees on 2026-09-09; the dispositions cite line numbers from that tree.

## How to read the surface

Start with `package/types/index.d.ts` for the lifecycle, then `app.d.ts`: the app contract is the
seam, and everything else is either a transport that reads it or a scorer that takes its values as
arguments. `procedure.d.ts` is the small step vocabulary that lets one declared procedure run
through Playwright, Appium, and an injected same-origin script alike; it exists because the
split-capture transport has no script channel and the route's CSP forbids eval.

Then `splotch/app.ts` to see the contract filled in with Splotch's real selectors and hooks, and
`splotch/scripts.ts` to see each npm script as a call.
