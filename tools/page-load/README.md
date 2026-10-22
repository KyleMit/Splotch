# Page-load performance gate

This capability runs pinned Lighthouse against Splotch's React Native web export on the same
simulated Slow 4G, 4× CPU, phone-portrait, and tablet-landscape profiles as the `audit-page-load`
skill. Each of the four device/visit cells is measured three times and judged by its median.

Both viewports intentionally keep Lighthouse's mobile form factor and Lantern model. This mirrors
the manual audit matrix exactly instead of inventing a desktop scoring curve for the wider viewport.
Although the current network-derived medians match, retaining the tablet cell detects responsive
changes to the LCP candidate and its render delay.

## Entry point

`npm run test:lighthouse:ci` builds the export (`npm run build:site`), starts the export host on an
explicit port, and writes JSON reports plus `summary.json` under `lighthouse-reports/ci/`. The CI
job does not build: it downloads the `rn-web-export` artifact the Native web build job uploaded,
unpacks it where `netlify.toml` publishes it, and runs the gate with `--no-build`, so it times the
bytes the deploy would serve. It uploads the gitignored reports directory and writes the headline
table to the GitHub job summary.

FCP and LCP are the only gated metrics. Total Blocking Time, Cumulative Layout Shift, and the
derived performance score are reported because they remain useful diagnostics, but the shared-runner
and Lighthouse-injected-work variance documented by the audit skill makes them unsuitable for an
absolute gate.

Lighthouse is pinned as a CI-only development dependency. Version 12 was evaluated because the
manual skill still invokes that major, but its final dependency tree carries a high-severity
`extract-zip` advisory with no published patched release. The CI gate therefore pins Lighthouse 13,
whose browser downloader no longer reaches that package; the repository's high-severity audit gate
proves the final installed tree instead of allowlisting a dormant downloader path.

## The host

`serve-export.mjs` serves the export as the Netlify deploy does. The site itself is `e2e/server`'s,
the one the RN web E2E suite runs against: `netlify.toml`'s headers and redirects, `404.html` with a
404 status, and `/api` from the real function. In front of it, `lib/edge-proxy.mjs` adds the two
things Netlify's edge does that the E2E site leaves out because no E2E assertion reads them: brotli
(gzip for a client that does not take it) on text, and ETag revalidation, so a repeat visit
revalidates the document with a 304 instead of fetching it again.

That layer is what makes the numbers mean anything. Measured on the same export and machine, the E2E
site alone gives a first-visit FCP of 1,828 ms and LCP of 2,101 ms, and a repeat visit of 1,820 /
2,100 ms; with the layer they are 771 / 1,057 ms and 623 / 900 ms. The first document is 253 KB raw
and 26 KB brotli, and the entry bundle is 818 KB raw and 221 KB brotli. Netlify does not publish the
level it compresses at, so the layer uses a mid level (`BROTLI_QUALITY`); output size moves a few
percent across it.

Even so, the host is HTTP/1.1 on loopback with no CDN, so the numbers are regression-harness values,
not the production CDN's public score. If the E2E site ever compresses and revalidates itself, the
layer can go.

The host runs in a process of its own, because the runner drives Lighthouse with a blocking spawn
that would stall a server in the runner's process. The runner keeps the host's stdin open and the
host stops when it closes, so a killed runner leaves no server holding the port. A port already in
use fails the run with the host's own error: choose another with `--port`, and do not stop the
listener that holds it. Before the first run the runner fetches `/` and every `/_expo/static` file
the document names, and refuses an export that is missing or that names a file it does not hold,
because a run against the 404 page or against markup whose bundle never loads would report a
plausible number for the wrong page.

Use `--no-build` only to time an export you just built from this checkout. Nothing proves a stale
export on disk is this checkout's, and one passes against code that no longer exists.

## What the gate sees

Both paints are decided by the prerendered first frame, a document of inline HTML and CSS that
paints before the bundle arrives (ADR-0180). The gate therefore moves with the first document's
size, with anything that blocks the paint, and with how a repeat visit is answered (cache headers
and revalidation). It does not move with the entry bundle's size, which the startup caps in
`tools/migration/check-native-web-startup.mjs` hold at build time: an export that grew its entry
chunk by 400 KB left every cell within a few milliseconds of its baseline.

The service worker is not part of either visit. It registers once the child has drawn a few strokes
(`src/lib/pwa/updates.ts`), which no Lighthouse load does, and no `sw.js` request appears in any
report. The repeat cell is therefore a returning visitor who has not drawn yet, served by the HTTP
cache and a 304 for the document; a visitor whose worker is installed loads faster than it shows.

Negative controls on 2026-10-21 against the limits committed with this change (first-visit FCP 1,300
ms and LCP 1,700 ms), each run with `--no-build` over a built export edited afterwards:

| Export edit                                      | Phone first FCP / LCP | Tablet first FCP / LCP | Gate                          |
| ------------------------------------------------ | --------------------- | ---------------------- | ----------------------------- |
| None                                             | 774 / 1,056 ms        | 773 / 1,054 ms         | passes                        |
| 300 KB of incompressible bytes in the document   | 1,826 / 2,107 ms      | 1,824 / 2,105 ms       | fails: all four first-visit   |
| The entry bundle loaded by a blocking `<script>` | 1,997 / 2,297 ms      | 759 / 1,053 ms         | fails: phone first FCP, LCP   |
| 400 KB of incompressible bytes in the entry      | 771 / 1,053 ms        | 772 / 1,053 ms         | passes: the byte caps hold it |

The blocking script is found by one viewport at a time. A first run slowed the tablet cell in all
three samples (1,996 ms) and the phone cell in one (2,004 ms against 756 and 767), and the second
run above slowed the phone cell in all three and the tablet in none. Lantern decides from the
observed load whether a script sits on the paint's path, and on a loopback host a script finishes
within a few milliseconds of that line; the cause was not isolated further. Treat a
blocking-resource regression as something the gate finds on a run or two, not as something one green
run rules out. The inflated document moves both first-visit cells on every sample and leaves the
repeat visit alone, which a 304 answers.

## Baseline and staleness

`baseline.json` holds the measured medians and deliberately wide limits. Before a gated run, the
runner hashes the files `MEASURED_SURFACE` names: the React Native app's source, assets and
configuration, the modules that build and prerender the export, the shared modules the app imports
from `web/`, `netlify.toml`, and the resolved dependency tree, plus the production dependency
declarations. `lighthouse-ci.test.mjs` fails when a file the build imports falls outside that list,
so the list cannot silently fall behind the build. A mismatch emits a visible warning in the
console, GitHub job summary, and `summary.json`, but the run continues because the committed limits
are absolute. The warning prevents stale medians from claiming currency while still producing the
measurements needed to recalibrate after an ordinary product change.

To recalibrate, first run the complete matrix without trusting the old gate:

```bash
node tools/page-load/run-lighthouse-ci.mjs --report-only --port=4197 --samples=3
```

Repeat that command on a quiet host. Review the per-sample spread in
`lighthouse-reports/ci/summary.json`; never copy one run or a noisy TBT/score into a gate. Update
the four FCP/LCP medians and limits in `baseline.json`, replace `sourceDigest` with the report's
exact digest, then rerun `npm run test:lighthouse:ci -- --port=4197`. Limits are a reviewed
performance decision: keep enough space above the worst repeated median to absorb the measured
run-to-run spread, while retaining a useful regression tripwire.

## Calibration

The 2026-10-21 calibration used two complete three-sample campaigns on the same quiet Mac (headless
Chromium 155, Lighthouse 13.5.0), each over a fresh `build:site` export, and then the first run of
the CI job on its Ubuntu runner. `baseline.json` holds the six-sample medians of the Mac campaigns:

| Profile          | Visit  | FCP median (six samples) | CI run | LCP median (six samples) | CI run | FCP / LCP limits |
| ---------------- | ------ | ------------------------ | ------ | ------------------------ | ------ | ---------------- |
| Phone portrait   | first  | 773 ms (768–780)         | 808 ms | 1,056 ms (1,053–1,061)   | 1,057  | 1,300 / 1,700 ms |
| Phone portrait   | repeat | 623 ms (621–624)         | 646 ms | 900 ms (900–901)         | 901    | 1,100 / 1,500 ms |
| Tablet landscape | first  | 774 ms (763–776)         | 802 ms | 1,054 ms (1,053–1,056)   | 1,059  | 1,300 / 1,700 ms |
| Tablet landscape | repeat | 622 ms (621–624)         | 652 ms | 900 ms (900–901)         | 901    | 1,100 / 1,500 ms |

The other reported values held steady: CLS was 0 in every run, TBT 437–542 ms on the Mac and 229–322
ms on CI, and the performance score 86–89 on the Mac and 93–96 on CI.

Each limit is 1.6 times the worst median seen on either host, rounded up to 100 ms. That sits
448–641 ms above the worst median, against a spread of at most 13 ms between samples and 35 ms
between the Mac and CI. Half a second is about 100 KB more brotli in the first document at Slow 4G's
1.6 Mbit/s, or three of its 150 ms round trips. The margin is narrower than the SvelteKit baseline's
33–143%, which had to absorb a first-visit LCP mode that differed by seconds between hosts; nothing
like it showed in any run here. A limit is a reviewed performance decision, so the way to widen one
is a diff to `baseline.json` with the run that justified it. The startup byte caps bound how far the
first document can grow before this gate sees it.

## Failure behavior

Missing reports, two consecutive runtime errors for one invocation, an even or single-sample run,
and FCP/LCP medians above their limits exit nonzero. Each invocation gets one retry and each attempt
is capped at 120 seconds so a transient Chrome failure cannot consume the workflow's full budget.
The first-visit profile is recreated before its retry to preserve cold-cache semantics. Reports are
replaced whole on each run so an interrupted audit cannot reuse an older JSON file. The export host
and Chrome profiles are stopped or removed in the failure path.

Because the run replaces its reports folder, `--out` is checked before the run reads, builds, or
deletes anything, and again at the moment the folder is replaced. A refusal exits nonzero with one
line naming the resolved path. A relative `--out` resolves against the repository and an absolute
one is taken as given. The run refuses the repository root, a path outside the repository (symlinks
resolved), and a file. It replaces a folder that already exists only when the folder is empty or
carries `.page-load-reports`, the mark the runner leaves in every folder it makes, and holds nothing
besides an earlier run's reports, `summary.json`, Chrome profiles, and Finder's `.DS_Store`. A
reports folder written before the mark existed is refused once: remove it by hand. `--baseline`
resolves like `--out` and is only read.
