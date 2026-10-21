# RN web QA — run 4

Candidate cbfa2dc91a861aa41ba64219c34feb0875a37ce7. Fresh `npm run build:site` and reference
`npm run build` both pass. [Build receipt](evidence/run4/build-and-ownership.json). Product source
is unchanged; changes are QA artifacts and two regression tests. No commits, GitHub writes, devices,
real secrets or real AI generation were used.

## AI fixes

**All eighteen previously blocked units pass.** The accepted AI batch has 39/39 passing recorder
units, thirteen per engine. WebKit and Firefox complete fixture generation at phone, tablet and
desktop sizes. Each engine shows **Out of space** after one simulated failed IndexedDB write, then
**Try again** completes exactly one fixture generation without reloading.

Three additional actual HTTP captures prove uploads reach the local AI-1 fixture: WebKit sends a
32,563-byte PNG; Chromium and Firefox send WebP. All decode to 780×1538. This closes the remote
WebKit request object's zero-body observability gap.

WEB-001 (#3110/#3116) and WEB-002 (#3111/#3112) remain as historical records, with run-4 fixed
verification attached. [AI report and every blocked unit](results/ai-run4.md).

## Standalone pages

The RN export is served with file → `<path>.html` → HTTP-404-document resolution and local API
fixtures. The eight documents, beta OS queries and an unknown deep path run in all three engines,
four layouts including 320 px, JavaScript on/off, light, dark and forced colors.

| Engine   | Main combinations | Clean | Admin width flags |
| -------- | ----------------: | ----: | ----------------: |
| Chromium |               240 |   234 |                 6 |
| WebKit   |               240 |   234 |                 6 |
| Firefox  |               240 |   234 |                 6 |
| Total    |               720 |   702 |                18 |

All eighteen flags describe WEB-004 below. The main matrix has zero runtime errors, CSP events or
automatic cross-origin requests. Its 36 feedback flows cover failure/draft retention/retry/success/
reset. Its 36 admin flows cover wrong-secret rejection, login, tokens/stats, add/remove, reload and
sign-out. No-script forms provide their explicit explanation; they are not executed submissions.

Another 540 accepted combinations cover ordinary motion, forced colors with dark system, and 915×412
short landscape. Nine repeat the admin width flag; the rest are clean. Other supplements cover full
contents sweeps, 48 beta disclosure contexts, 84 saved-theme visits, 72 latest passing keyboard
combinations, all 48 engine/script/direct-file visits, and 24 controlled-worker document responses
with exact artifact hashes. These counts overlap in behaviour and are not independent requirements.

The local-link ledger's latest 168 source/profile/script observations contain 120 clean rows and 48
reproductions of WEB-003. Rapid navigation before React's deferred entry commits can log hydration
errors on unload. Failed stress takes and attributed lifecycle traces remain in the evidence; the
clean main matrix is not a blanket zero-console claim. One keyboard changelog jump timed out once
and passed five fresh repetitions. Neither observation is hidden by the latest passing rows.

[Complete page results and limits](results/pages.md) ·
[filterable screenshots](evidence/run4/pages-gallery.html).

## New confirmed findings

* **WEB-003, S3:** no-script canonical section URLs and the footer release link lose their target;
  copied variant-specific anchors can point to hidden content at another layout/theme.
* **WEB-004, S4:** `/admin` overflows at 320 px and clips the right end of its masthead.
* **WEB-005, S4, shared with SvelteKit:** the no-script design picker loses its selected backing,
  leaving white text on gray at about 1.21:1 contrast.
* **WEB-006, S3:** the desktop design sidebar's final Contents label is below the viewport at its
  own maximum scroll position. Its section remains reachable by keyboard or the anchor's sliver.

Each has two fresh reproductions per engine, evidence and a minimal failing repro; SvelteKit
comparisons distinguish the shared issue from RN regressions. [Full records](findings.jsonl).

WEB-003 to WEB-006 were filed as #3136 and fixed by #3138 after this run; the results above describe
the candidate this run tested.

## Regression tests and checks

Two added mounted feedback tests verify the delivered success page and **Send another** restoring a
clean draft. The targeted file passes five tests; the related pair passes 32. Both added cases fail
their intended assertions against separate in-memory source mutations; production bytes never
change. [Tests](../../../tools/migration/tests/rsd-native-web-feedback-page.test.mjs) ·
[positive log](evidence/run4/feedback-related.log.txt) ·
[negative controls](evidence/run4/feedback-negative-recheck.log.txt).

The existing browser-PNG tests pass two cases. `npm run check`, `npm run check:migration:types` and
`npm run lint` pass. Lint has three warnings in unchanged files.
[Final lint](evidence/run4/lint-final.log.txt). The full formatting check also passes;
[format log](evidence/run4/format-full-final.log.txt).

## Evidence and residual scope

Run-4 bulk evidence is outside the checkout at `/private/tmp/splotch-bughunt-web-run4-evidence`,
linked through `evidence/run4/`. Prior failed harness takes remain alongside corrected runs. Browser
viewports, touch/media emulation, simulated disk exhaustion and local transport fixtures do not
establish physical devices, real full disk, hosted Netlify delivery, screen readers or provider
delivery. Actual browser-chrome zoom and the previous OS-only limits remain unproven.

The previous 1,472-pair drawing visual matrix and broader drawing regression results belong to the
earlier candidate; they were not silently promoted to this head. [Archived run 3](summary-run3.md) ·
[coverage inventory](results/coverage-scope.md).

Final integrity and cleanup receipts accompany the report. All owned servers are stopped; the
orchestrator's browser server on 6190 is left running. [Integrity](evidence/run4/verification.json)
· [cleanup](evidence/run4/cleanup.json) · [file hashes](evidence/manifest.json) ·
[timestamped status](status.md).
