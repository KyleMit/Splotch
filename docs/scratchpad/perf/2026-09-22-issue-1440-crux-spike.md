# Issue 1440 — CrUX field data for splotch.art: what the public API needs (spike)

Spike evidence for [issue 1440](https://github.com/KyleMit/Splotch/issues/1440), run from a Claude
Code cloud container on 2026-09-22. The question the issue puts first — *does splotch.art have a
CrUX entry at all?* — could not be answered from here, and this note records exactly why and what
the one missing piece is.

## What the requests returned

Every request went through the cloud session's egress proxy; the proxy was not the blocker (the
API's discovery document came back fine).

| Request                                                                     | Result                                                                                                                       |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `POST chromeuxreport.googleapis.com/v1/records:queryRecord` with no key     | HTTP 404, Google's generic HTML "Not Found" page — the API does not accept anonymous calls and does not say so in JSON        |
| Same request with `?key=PLACEHOLDER`                                        | HTTP 404, same page                                                                                                          |
| `GET chromeuxreport.googleapis.com/$discovery/rest?version=v1`              | HTTP 200 — the endpoint is reachable from the container                                                                      |
| `GET pagespeedonline/v5/runPagespeed?url=https://splotch.art/` with no key  | HTTP 429 `RESOURCE_EXHAUSTED`: the shared anonymous quota project (`583797351490`) is out of daily queries — for everyone     |
| Same with `?key=PLACEHOLDER`                                                | HTTP 400 `API key not valid` — a real key is the only thing between this request and an answer                              |

PageSpeed Insights matters because its response embeds the same CrUX origin record
(`originLoadingExperience`), so it is a second door to the same data with the same lock.

## The one missing piece

A **Google Cloud API key** with the *Chrome UX Report API* enabled on its project. Steps, all in the
Google Cloud console, all free:

1. Create (or pick) a Google Cloud project.
2. APIs & Services → Library → enable "Chrome UX Report API".
3. APIs & Services → Credentials → Create credentials → API key. Restrict it to that one API.
4. Export it as `CRUX_API_KEY` locally, or add it as a repository secret of that name for the
   workflow sketch.

Default quota is 150 queries per minute. No billing account is required for this API.

## What the spike adds

* `tools/read-crux-field-data.mjs` — a dependency-free reader. Prints the p75 and good / needs
  improvement / poor split of each metric CrUX has for the origin, per form factor, or the 40-week
  history. Exit code 3 means "CrUX has no entry for this origin", which is the issue's close-it
  outcome and is kept distinct from a broken request.
* `.github/workflows/crux-field-data.yml` — a sketch of the scheduled-workflow landing option: one
  run a month, three form factors, results as a run artifact. Nothing publishes it anywhere yet.

Neither is wired into `package.json`, `scripts-info`, the scrapbook index or the performance matrix.
That wiring is the "cost to finish" and is listed in the decision brief on the issue.

## A zero-cost check the owner can do in a browser

<https://pagespeed.web.dev/> for `https://splotch.art` shows a "Discover what your real users are
experiencing" panel when CrUX has an origin record, and says "no data" when it does not. That is the
same lookup as the API call above without the key, and it answers the issue's first question in
under a minute.

## What CrUX would and would not tell us

CrUX reports LCP, INP, CLS, FCP and TTFB as p75 over a 28-day window, from Chrome users who opted
into usage statistics, on the origin as a whole (no per-page split below the threshold). It says
nothing about stroke latency, undo cost or frame pacing while drawing — the drawing half of the
performance axis stays with the `perf:*` harness and the device matrix. It also covers Chrome only:
Safari on iPad, the app's highest-fidelity target, contributes no field data anywhere.
