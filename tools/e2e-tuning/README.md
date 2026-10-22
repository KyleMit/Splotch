# E2E tuning evidence

This capability renders the committed worker-count study behind ADR-0078. The SvelteKit sweep runner
and its CI workflow retired with that frontend; the recorded measurements and scrapbook page remain
evidence about that study.

## Report generation

`gen-tuning-report.mjs` owns the curated measurement literals and deterministic presentation:

```sh
npm run gen:e2e-tuning-report
```

It writes `scrapbook/e2e-tuning/index.html`, needs installed project dependencies, and makes no
network calls. Regenerate the page when maintaining its explanation or correcting a recorded
measurement, and commit source and output together. Preserve the original hardware, workload, retry
policy, and harness caveats when interpreting the data.

There is no retained command here for measuring the React Native E2E suite. A fresh worker-count
study needs a protocol for that suite before its results can be compared with the historical set.
