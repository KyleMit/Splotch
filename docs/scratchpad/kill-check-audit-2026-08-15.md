# Kill-check audit of the drift-guard and security tests — 2026-08-15

The one-off audit issue \#1066 asked for: for each listed test file, revert the behaviour it guards
(one side only for drift guards; the property, not the plumbing, for security assertions), confirm
the suite goes red, restore. This file records every verdict — including the sound guards — so the
audit is never re-run from zero. Fixes landed on the same branch as this record; each fix was
kill-checked against the exact mutation that exposed it.

Method notes, restated from the issue because they earned their place during the run:

* A drift-guard mutation changes **one side only**. A guard that only fails when both sides change
  is testing something else.
* A security mutation weakens the **property** (accept the invalid credential, skip the charge, drop
  the escaping), never the plumbing around it.
* "Suite" below means the test file under audit run in isolation. Where a mutation stayed green
  there, sibling suites were checked before calling it a finding.

## Drift guards

| File                                                 | Mutations (one side only)                                                                                                     | Verdict                                                              |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `web/src/app.html.test.ts`                           | boot-script boolean default flipped; clamp min 70→60; boot script's own dark theme-color hex                                  | sound — each red                                                     |
| `web/src/browserFloor.test.ts`                       | `BROWSER_TARGETS` ios floor raised past `IPHONEOS_DEPLOYMENT_TARGET`; ios entry deleted                                       | sound — each red                                                     |
| `web/src/lib/state/saveFolder.svelte.test.ts`        | inline capability probe renamed; inline SSR guard dropped                                                                     | sound — each red                                                     |
| `tools/mobile/android/tests/android-config.test.mjs` | `docs/MOBILE/android.md` floor claim drifted                                                                                  | sound — red (spot-confirm; strengthened + kill-checked in PR \#1068) |
| `tools/tests/run-quality-checks.test.mjs`            | step added to CI's Quality job only                                                                                           | sound — red                                                          |
| `tools/tests/enumerated-build-paths.test.mjs`        | capability dropped from `knip.json` brace list; `tools/icons` dropped from the Netlify ignore pathspec                        | sound — each red                                                     |
| `tools/tests/e2e-server-env.test.mjs`                | declared var deleted from `playwright.shared.ts`; new `env.BRAND_NEW_SECRET` read added to app code (reds both server checks) | sound — each red                                                     |
| `tools/tests/tool-specifier-resolution.test.mjs`     | stale `vi.mock()` path; `ROOT` walk depth in `proc.mjs`; `tools/lib` → capability import                                      | **finding, fixed** — see below                                       |
| `tools/tests/skill-reference-syntax.test.mjs`        | `/build` sigil planted in `docs/CONTRIBUTING.md`                                                                              | sound — red                                                          |
| `tools/tests/ignore-surfaces.test.mjs`               | `.prettierignore` entry commented out                                                                                         | sound — red (spot-confirm; kill-checked at birth in \#1055)          |
| `tools/tests/scroll-cue-viewports.test.mjs`          | spec viewport literal drifted from its inventory id                                                                           | sound — red (spot-confirm; kill-checked at birth in \#1061)          |
| `web/src/lib/server/config.test.ts`                  | `.env.example` PAT-scoping repo drifted                                                                                       | sound — red                                                          |
| `web/src/lib/server/securityHeaders.test.ts`         | `netlify.toml` CSP `default-src` loosened to `*`; `X-Frame-Options` line deleted                                              | sound — each red                                                     |

### Finding: `tool-specifier-resolution.test.mjs` was blind to bare side-effect imports

`RELATIVE_SPECIFIER` matched `from`, dynamic `import(`, `vi.mock`-family calls, and `new URL(` — so
a bare `import './x.mjs';` was invisible to all three checks. A broken bare import and a bare
`tools/lib` → capability import both stayed green; the same imports spelled with `from` went red.
Fixed by adding a trailing `import\s*` alternative (ordered after the dynamic-import alternative so
that keeps first claim on its paren). Fix kill-checked: clean tree green, both bare-import mutations
red.

## Security-relevant

| File                                                      | Mutations (property, not plumbing)                                                                           | Verdict                        |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| `web/src/lib/server/admin.test.ts`                        | compare accepts any same-length value; login skips the throttle charge; session token returns the raw secret | sound — each red               |
| `web/src/lib/server/tokens.test.ts`                       | `isAllowedToken` accepts any string; mutation writes on a degraded read; `persist` ignores the CAS result    | sound — each red               |
| `web/src/lib/server/reportToken.test.ts`                  | v2 expiry check deleted; v2 signature verification deleted                                                   | **finding, fixed** — see below |
| `web/src/lib/server/rateLimit.test.ts`                    | limiter never limits; rejected attempts recorded as hits; peek charges                                       | **finding, fixed** — see below |
| `web/src/lib/server/generationAuthorization.test.ts`      | invalid managed token authorized; failed guess uncharged; installation-id check skipped                      | sound — each red               |
| `web/src/lib/server/report.test.ts`                       | honeypot removed; message escaping dropped; length cap dropped                                               | **finding, fixed** — see below |
| `web/src/routes/api/report/server.test.ts`                | throttle deleted; failure mapping inverted to `{ ok: true }`; honeypot removed (from `report.ts`)            | sound — each red               |
| `web/src/routes/api/report-image/server.test.ts`          | authorization check skipped; size cap raised 1000×                                                           | sound — each red               |
| `web/src/routes/api/free-generation-grant/server.test.ts` | throttle deleted; installation-id check skipped                                                              | **finding, fixed** — see below |

### Finding: `reportToken.test.ts` had zero adversarial coverage of the v2 format

Every negative case (binding mismatch, rotated secret, malformed token, expiry) ran against the
legacy free-picture format only. The v2 context-bearing path's **entire signature verification**
could be deleted with the suite green — a forged v2 token carrying attacker-authored refusal context
had no failing test — and likewise its expiry check. Fixed by parametrizing the adversarial cases
over both formats and adding v2-specific cases (rewritten context segment, missing/extra segment).
Fix kill-checked against both deletions.

### Finding: `rateLimit.test.ts`'s retry-after case could not observe its own property

The case named "unblocks a client that retries after retryAfter, even if it retried while limited"
carried the comment "rejected attempts must not extend the window" — but with a budget of three,
recording the rejection as a hit still passed: the one stray hit never re-reached the limit once the
original hits aged out. A budget of one makes the violation observable (the recorded rejection keeps
the key limited past retryAfter). This is the issue's trap 2 in mild form: the scenario could pass
whether or not the property held. Fixed; mutation now reds the case.

### Finding: `report.test.ts` pinned neither the markdown escaping nor the message cap

Dropping `escapeIssueMarkdown` from the message path, and separately the `MAX_REPORT_MESSAGE_LENGTH`
slice, left every suite green (`github.test.ts` covers the escape function in isolation; nothing
covered `submitReport` applying it). The suite's header says the rest of `submitReport` is covered
by the route test and API smoke — true for the honeypot (red at the route), not for these two. Fixed
with cases for message escaping, device-value escaping, and the cap; each verified red against its
mutation.

### Finding: `free-generation-grant/server.test.ts` never exercised its gates

The endpoint's only gates — the per-IP throttle and installation-id validation — could both be
deleted with the suite green; the three existing cases exercised the availability branches behind
them. Fixed with a case per gate, each red under its deletion.

## Traps hit during the run (confirming the issue's warnings)

* The `report.ts` honeypot mutation stayed green in `report.test.ts` and correctly red in the route
  suite — a green isolated suite is not yet a finding; check the suites that claim the property
  before filing.
* One tools-tier baseline run failed (1 of 341) before any mutation and never reproduced across four
  re-runs; treated as transient flake, not part of this audit.
