# Standalone site documents — run 4

Candidate cbfa2dc91a861aa41ba64219c34feb0875a37ce7. The main matrix and focused follow-ups are
complete.

`npm run build:site` and the reference `npm run build` both exited zero. The candidate is served
from `experiments/native-architecture/dist/web` at `http://127.0.0.1:6150`: an existing file,
otherwise `<path>.html`, otherwise `404.html` with HTTP 404. `/` serves `index.html`. The host
answers every `/api/*` path locally; it never proxies. The document meta CSP and Netlify's
additional response CSP compose in the browser. Admin uses `run4-test-secret`, a fixture only.

The main matrix is Chromium, WebKit and Firefox × 390×844 phone, 820×1180 tablet, 1280×800 desktop
and 320×740 narrow phone × JavaScript on/off × light, dark and forced colors. Each context blocks
service workers for the network-document checks and rejects every nonlocal network request. Separate
worker checks distinguish navigation under a controlling worker. Viewports and media emulation do
not establish physical device acceptance.

Routes are `/`, `/privacy`, `/changelog`, `/beta`, `/beta?os=ios`, `/beta?os=android`, `/feedback`,
`/admin`, `/design` and a deeply nested unknown path. Every matrix row keeps DOM text, headings,
links, fragment targets, scroll geometry, images, console errors, page errors, CSP events and
requests. Captures show the initial view and the scrolled bottom. Privacy is checked against every
generated policy span; changelog against every release-note block after revealing older releases.
The styleguide must include every section and specimen category. Functional forms run only with
JavaScript: without it their explanatory fallback must read.

Every scripted review flag is provisional. Only disadvantages reproduced twice become entries in
`findings.jsonl`. Earlier harness failures stay in the evidence alongside corrected reruns.

Evidence: [build and ownership receipt](../evidence/run4/build-and-ownership.json),
[raw page ledger](../evidence/run4/pages-observations.jsonl),
[page captures and DOM trees](../evidence/run4/pages/).

## Main matrix

| Engine                 | Recorded combinations | Pass | Geometry flags |
| ---------------------- | --------------------: | ---: | -------------: |
| Chromium 153.0.8010.12 |                   240 |  234 |              6 |
| WebKit 26.6            |                   240 |  234 |              6 |
| Firefox 155.0          |                   240 |  234 |              6 |
| Total                  |                   720 |  702 |             18 |

These are recorder combinations, not independent requirements. All eighteen geometry flags name the
same 320 px admin masthead: its document measures 323 px wide. The functional admin checks still
complete. Two fresh reproductions per engine and the SvelteKit comparison confirm WEB-004 below.

The complete matrix records zero page/runtime errors, zero CSP events and zero attempted automatic
cross-origin requests. Its 12,748 HTTP requests all name `127.0.0.1:6150`. Deliberate fixture
403/503 and not-found 404 console messages are retained separately from runtime errors. The `forced`
arm really matches `(forced-colors: active)` in all 240 applicable rows. JavaScript-off rows cannot
run the CSP event listener; their browser console and exported policy/build guards remain checked.

All 36 scripted feedback contexts show the fixture failure, retain the draft, retry successfully,
and reset via **Send another** activated with Enter. All 36 scripted admin contexts reject the wrong
test secret, sign in, read tokens/stats, add and remove a test code, survive a reload with the
derived session, and sign out without retaining the test secret. The no-script form checks verify
the explicit explanation and disabled/hidden controls; they do **not** count as executed submissions
or sign-ins. Shipping's feedback form can submit without JavaScript; the candidate deliberately
requires it.

All 72 unknown-path visits retain HTTP 404 and the friendly page. Every non-drawing row follows its
Start drawing/Back to drawing link to `/`. Privacy matches every generated text span; changelog
matches every generated release-note block after older releases open; design includes all 23
sections. Full contents-link sweeps and beta troubleshooting disclosures are recorded separately.

## Confirmed findings

**WEB-003, S3:** canonical section addresses and the footer's **What's new** link fail without
JavaScript. There is no element with the requested unsuffixed ID. A copied suffixed link opened at a
different layout/theme instead finds a hidden variant. Reproduced twice in each engine; rebuilt
SvelteKit reaches the canonical target in every corresponding no-script comparison. Same-variant
in-page links and scripted canonical visits work.

[Finding](../findings.jsonl) · [raw deep-link observations](../evidence/run4/deep-links.jsonl) ·
[minimal repro](../repro/web-003-deep-links.mjs).

**WEB-004, S4:** the admin masthead exceeds a 320 px viewport by about 3 px, clipping the brand
suffix and losing the right gutter. Reproduced twice per engine with light/dark and scripts on/off;
the corresponding SvelteKit page fits. Sign-in and console actions still pass.

**WEB-005, S4, shared with SvelteKit:** the no-script light design picker paints white selected text
on its gray track, about 1.21:1 contrast. RN omits the measured selection backing; SvelteKit's
backing is zero width. Reproduced twice in every engine and implementation. This is a static
specimen defect; the report does not expect the preview picker to operate without JavaScript.

**WEB-006, S3:** at desktop 1280×800 the design sidebar's padded scroll box ends at y856. At its own
maximum scroll position, the final **Dottie** label lies around y802–820, below the viewport. The
anchor retains a clickable sliver and keyboard activation reaches its section. Reproduced twice per
engine with scripts on/off. SvelteKit contains the final label inside its scroll box.

[Full reproduction records](../findings.jsonl) ·
[admin measurements](../evidence/run4/admin-review.jsonl) ·
[picker measurements](../evidence/run4/design-segments.jsonl) ·
[sidebar measurements](../evidence/run4/design-sidebar.jsonl). Each new finding has an intentionally
failing minimal script under `repro/`; none is installed as a failing CI test.

## Supplemental coverage

| Supplement                                                   | Accepted combinations | Clean | Review flags |
| ------------------------------------------------------------ | --------------------: | ----: | -----------: |
| Ordinary motion, light, scripts on, four layouts             |                   120 |   117 |   3, WEB-004 |
| Forced colors with dark system, scripts on/off, four layouts |                   240 |   234 |   6, WEB-004 |
| Short landscape 915×412, three media modes, scripts on/off   |                   180 |   180 |            0 |

The short arm uses the initial Chromium/WebKit observations and the `short-ready` Firefox rerun. The
first Firefox short take retained five hydration errors during immediate cross-document reloads; its
raw rows remain. The accepted rerun waits for the beta radio's actual checked state after a
navigation and reload. This changes only the QA driver.

The main matrix uses engine-default user agents, DPR 1 and touch-enabled non-desktop viewports. The
ordinary-motion, forced-dark and short supplements additionally set mobile viewport mode in
Chromium/WebKit. Firefox does not support that Playwright option. These are browser emulations.

* Contents sweeps cover privacy, changelog and design across all four layouts and scripts on/off.
  Seventy of 72 pointer sweeps finish. Two desktop/no-script design sweeps stop after 14 of 23 links
  when automatic pointer scrolling cannot expose the next link. Separate keyboard sweeps activate
  all 23 design links in all three engines. The sidebar's actual label clipping is recorded as
  WEB-006 rather than calling its sections unreachable.
* Forty-eight beta contexts open, close and reopen every visible native troubleshooting disclosure,
  including with scripts disabled. The requested `?os=ios` and `?os=android` views are checked in
  every main combination, and scripted switching survives reload.
* Eighty-four saved-theme visits, set through drawing Settings, respect explicit light/dark choices
  against the opposite system setting. Design preview theme changes do not write those settings.
* The latest keyboard ledger has 72 passing combinations across 320 px and desktop. It exercises
  contents activation, older releases, beta arrow/Space keys and native details, design preview,
  feedback failure/retry/reset, admin login/add/remove/sign-out, and return to drawing. One earlier
  Chromium changelog jump timed out; five fresh repetitions pass. The isolated failed observation is
  retained and does not establish a twice-reproduced defect.
* Controlled-worker navigation returns the exact rebuilt bytes for all eight documents in each
  engine, including an HTTP 404 for an unknown path. Admin bypasses the worker. All three settled
  completions have no page errors, unexpected console errors or requests to another origin.

[Contents ledger](../evidence/run4/anchor-observations.jsonl) ·
[beta disclosures](../evidence/run4/beta-details.jsonl) ·
[saved themes](../evidence/run4/saved-themes.jsonl) ·
[keyboard ledger](../evidence/run4/keyboard.jsonl) ·
[worker byte receipts](../evidence/run4/worker-pages.jsonl) ·
[worker completions](../evidence/run4/worker-completions.jsonl).

## Rapid-navigation diagnostics

The zero-error main-matrix result is not a blanket clean-console claim. The first cross-document
link sweep navigated again as soon as fonts loaded, before the deferred React entry necessarily
committed. It retained hydration mismatch errors in WebKit/Firefox; cumulative context errors then
flagged later rows too. Its destination links still landed. The initial fast worker probe also
recorded Firefox hydration errors and canceled-resource messages while leaving a document.

A lifecycle trace places the reproduced immediate-reload error between the outgoing document's
`beforeunload` and `pagehide`, followed by a successful replacement document. Settled worker and
short-viewport reruns pass. No active-page crash, lost form or wrong destination has been
established from these messages; they remain an unmet strict clean-console stress condition. The
slow-start/tiered-hydration work already tracked as issue #3011 is not re-reported here.

The revised local-link sweep reads React DOM's current-root `isDehydrated` flag without changing it,
and waits for the commit before navigating again. Its purpose is to distinguish completed-page link
behaviour from the raw unload stress take, not to erase that take. Its latest 168 observations
contain 120 clean rows and 48 no-script WEB-003 rows, with no other review flags. All 48 direct
`.html` document visits also pass across the engines and scripts on/off; their HTTP bodies match the
exported files. A direct request for `404.html` is HTTP 200 as an existing file; unknown routes
remain HTTP 404.

[Link ledger, including both takes](../evidence/run4/local-links.jsonl) ·
[attributed worker stress cases](../evidence/run4/worker-diagnostic.jsonl) ·
[short reload lifecycle trace](../evidence/run4/short-firefox-navigation-trace.log.txt).

## Evidence review

[Filterable captures](../evidence/run4/pages-gallery.html). Initial captures follow loaded fonts;
they can precede the deferred page entry. Outcome captures and the follow-up contents snapshots
record their explicit readiness conditions. The main matrix reduces motion; an ordinary-motion
supplement is separate.

Representative manual inspection: WebKit 320 px dark/no-script privacy; Firefox tablet forced-colors
design; Chromium desktop dark iOS beta; Chromium phone no-script button specimens; Chromium tablet
no-script named-chrome specimens; RN/SvelteKit desktop sidebar bottoms; and the no-script canonical
privacy visit. Typography and reading flow are visible in these samples. This is representative
inspection, not a claim of judging every captured pixel by eye.

## Tests

Two added mounted regressions cover feedback's delivered page state and its **Send another** reset.
The targeted file passes five tests; the related feedback pair passes 32. Each new case fails its
intended assertion under an in-memory mutation of the production module, whose disk bytes remain
unchanged. The existing browser-PNG tests pass two cases. Type checking and lint pass; lint reports
three warnings in unchanged files.

[New tests](../../../../tools/migration/tests/rsd-native-web-feedback-page.test.mjs) ·
[positive log](../evidence/run4/feedback-related.log.txt) ·
[negative-control runner](../repro/feedback-negative-run4.mjs) ·
[negative logs](../evidence/run4/feedback-negative-recheck.log.txt).
