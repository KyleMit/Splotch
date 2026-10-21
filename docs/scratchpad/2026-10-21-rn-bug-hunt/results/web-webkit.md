# RN web — webkit

Candidate b236d639160459eecd60900926c759af5d4ae080. 01:57Z, 2026-10-21 UTC.

Production export and precache/startup checks: **pass**. See `../evidence/rn-web-build.log.txt`.
Local static host started on 127.0.0.1:6100, with real `web/static/coloring` assets and a
no-forwarding API response.

Phone 390×844 touch browser admission: **blocked before page creation**. See
`../evidence/browser-capabilities.json` and `browser-capabilities.log.txt`. Chromium: macOS
MachPortRendezvous bootstrap registration permission denied (1100), SIGTRAP. WebKit: Playwright
runner abort trap 6. Firefox: headless process SIGABRT. Installed binaries are present; this is
runtime admission failure, not missing dependencies.

D01 and all subsequent public UI cases are blocked by this engine admission failure. Tablet 820×1180
touch and desktop 1280×800 mouse are also blocked by the same launch prerequisite; they were not
represented as independent attempted UI runs. No product finding is inferred.

Reproduce admission with `node docs/scratchpad/2026-10-21-rn-bug-hunt/repro/check-capabilities.mjs`
while the local server is running. The first Chromium attempt used the phone options in
`repro/inspect.mjs`; it failed at browser launch. No page screenshots were produced.
