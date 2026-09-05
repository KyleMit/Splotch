// Builds the E2E tuning scrapbook page (ADR-0059) — the committed record of the
// Playwright worker-count study behind ADR-0078: what was measured, on what
// hardware, what the numbers were, and which flake hypotheses were falsified.
//
// The measurements live in this file as literals rather than in a committed
// results dump, because they ARE the finding — a future re-tune re-runs the
// sweep, replaces the dataset below, and regenerates the page. See RE_TUNE for
// the exact commands.
//
// Deterministic, no network. `npm run gen:e2e-tuning-report`.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ROOT } from '../lib/proc.mjs';
import { esc } from '../lib/html.mjs';
import { chromeStyle, masthead, siteFooter } from '../scrapbook/lib/scrapbook-chrome.mjs';

const OUT = join(ROOT, 'scrapbook/e2e-tuning/index.html');

const RUN_DATE = '2026-07-29';
// The re-measure behind the retry decision (issue #653), run after the harness
// defect below was fixed.
const RE_MEASURE_DATE = '2026-07-30';

const REPO_URL = 'https://github.com/KyleMit/Splotch';
const ADR_URL = `${REPO_URL}/blob/main/docs/adrs/0078-playwright-worker-count-and-flake-tuning.md`;
const actionsRun = (id) => `${REPO_URL}/actions/runs/${id}`;
const issueUrl = (n) => `${REPO_URL}/issues/${n}`;

// The worker counts the study settled on, per environment. The page highlights
// these rows in every sweep so the reader can find the shipped setting at a
// glance, including in the sweeps where it was not the best-looking row.
const SHIPPED = { local: 2, ci: 4, ciRetries: 2 };

// The rule the counts are derived from (ADR-0078 §1b): a worker needs about two
// cores, local runs sit at capacity, CI runs at twice capacity. The page's
// calculator applies the same rule to a core count the reader types in.
const CORES_PER_WORKER = 2;
const CI_OVERSUBSCRIPTION = 2;

const HARDWARE = {
  local: {
    label: 'Local (cloud dev container)',
    detail: 'Intel Xeon @ 2.80GHz · 4 physical cores · no SMT (1 thread/core) · 15 GB',
    facts: [
      ['CPU', 'Intel Xeon @ 2.80 GHz'],
      ['Cores', '4 physical, 1 thread each'],
      ['Memory', '15 GB'],
      ['GPU', 'none'],
    ],
  },
  ci: {
    label: 'GitHub Actions ubuntu-latest',
    detail: '4 vCPU · 16 GB · no GPU (Chromium falls back to software rasterization)',
    facts: [
      ['Runner', 'ubuntu-latest'],
      ['Cores', '4 vCPU'],
      ['Memory', '16 GB'],
      ['GPU', 'none, so Chromium rasterizes canvas in software'],
    ],
  },
};

// Round-robin sweep, 8 reps per worker count (w=1 got 3 — it costs ~3 min/run).
// `fails` counts failing test executions out of `execs`; `redRuns` counts runs
// with at least one failure. `infl` is the mean per-test duration divided by
// that test's own mean at 1 worker — the contention tax, measured per test.
const LOCAL_PREFIX = [
  { w: 1, wall: 168.7, runs: 3, execs: 609, fails: 1, redRuns: 1, infl: 1.0, cpu: 152.4 },
  { w: 2, wall: 94.6, runs: 8, execs: 1624, fails: 0, redRuns: 0, infl: 1.27, cpu: 179.5 },
  { w: 3, wall: 85.3, runs: 8, execs: 1624, fails: 3, redRuns: 2, infl: 1.67, cpu: 225.4 },
  { w: 4, wall: 80.2, runs: 8, execs: 1624, fails: 3, redRuns: 3, infl: 2.13, cpu: 293.3 },
  { w: 6, wall: 81.4, runs: 8, execs: 1624, fails: 17, redRuns: 8, infl: 3.06, cpu: null },
  { w: 8, wall: 85.8, runs: 8, execs: 1624, fails: 27, redRuns: 8, infl: 4.1, cpu: null },
];

// After the three magic-brush fixes. w=2 and w=3 come from one 16-rep
// round-robin session; w=4 from an earlier 8-rep session on the same box.
const LOCAL_POSTFIX = [
  { w: 2, wall: 92.3, runs: 16, execs: 3248, fails: 1, redRuns: 1 },
  { w: 3, wall: 80.8, runs: 16, execs: 3248, fails: 3, redRuns: 3 },
  { w: 4, wall: 82.1, runs: 8, execs: 1624, fails: 5, redRuns: 4 },
];

// GitHub Actions ubuntu-latest, 5 reps per worker count, one runner each, with
// the magic-brush fixes in place and retries disabled. `cpu` is the summed
// duration of every passing test; `infl` divides it by the uncontended w=1
// figure. Raw reports: run 30474047690 artifacts.
//
// The `fails`/`redRuns` columns here are contaminated and kept for the record
// rather than as a rate — every rep shared one preview server, so it inherited
// the previous rep's spent rate-limit windows (see HARNESS_ARTIFACT and the
// re-measure below). The wall-clock column is unaffected.
const CI_SWEEP = [
  { w: 1, wall: 95.2, runs: 5, execs: 1015, fails: 3, redRuns: 3, cpu: 92.3, infl: 1.0 },
  { w: 2, wall: 69.6, runs: 5, execs: 1015, fails: 2, redRuns: 2, cpu: 127.7, infl: 1.38 },
  { w: 3, wall: 63.1, runs: 5, execs: 1015, fails: 1, redRuns: 1, cpu: 173.8, infl: 1.88 },
  { w: 4, wall: 60.2, runs: 5, execs: 1015, fails: 2, redRuns: 2, cpu: 216.1, infl: 2.34 },
  { w: 6, wall: 63.5, runs: 5, execs: 1015, fails: 2, redRuns: 1, cpu: 330.7, infl: 3.58 },
  { w: 8, wall: 60.4, runs: 5, execs: 1015, fails: 9, redRuns: 5, cpu: 401.9, infl: 4.35 },
];
const CI_SWEEP_RUN = 30474047690;

// Targeted re-measure after MAGIC_REVEAL_TIMEOUT went 15s -> 30s (run
// 30476652762). Only 1 and 4 workers were re-extracted: 4 is what CI ships, and
// 1 is the cleanest read on whether a change helps for reasons other than
// contention. The result is genuinely two-sided, so both halves are recorded —
// `shows` names which half its row is the evidence for, and is what the rendered
// card emphasises.
const REVEAL_BUDGET_EXPERIMENT = [
  {
    w: 4,
    shipped: true,
    wall: 64.8,
    runs: 5,
    execs: 1015,
    failsBefore: 2,
    fails: 0,
    wallBefore: 60.2,
    shows: 'fails',
  },
  {
    w: 1,
    wall: 138.1,
    runs: 5,
    execs: 1015,
    failsBefore: 3,
    fails: 3,
    wallBefore: 95.2,
    shows: 'wall',
  },
];
const REVEAL_BUDGET_RUN = 30476652762;

// The re-measure #653 asked for, on the same runner image with the sweep driver
// starting a fresh preview server per rep. `redRuns` is the quantity a retry
// count is chosen against: how often an unretried run would go red.
// Run 30512081902, 15 reps per worker count, retries off. `execs` is 15 × 204.
//
// `wall` is seconds per rep from the sweep step's own duration, so unlike the
// CI_SWEEP column above it INCLUDES the ~4s the driver spends starting and
// probing a fresh preview server. Compare shapes, not absolute values, across the
// two tables.
const CI_RESIDUAL = [
  { w: 1, wall: 140.2, runs: 15, execs: 3060, fails: 6, redRuns: 6 },
  { w: 2, wall: 84.2, runs: 15, execs: 3060, fails: 3, redRuns: 2 },
  { w: 3, wall: 69.7, runs: 15, execs: 3060, fails: 0, redRuns: 0 },
  { w: 4, wall: 66.5, runs: 15, execs: 3060, fails: 6, redRuns: 6 },
  { w: 6, wall: 65.3, runs: 15, execs: 3060, fails: 15, redRuns: 15 },
  { w: 8, wall: 63.9, runs: 15, execs: 3060, fails: 23, redRuns: 15 },
];
const CI_RESIDUAL_RUN = 30512081902;

// …and the same two candidate counts again, 35 reps each, after the one spec that
// dominated the table above was fixed (runs 30512301335 and 30513168659). This is
// what the shipped worker count and retry count are chosen against.
const CI_POST_SPEC_FIX = [
  { w: 3, wall: 69.7, runs: 35, execs: 7175, fails: 3, redRuns: 3 },
  { w: 4, wall: 66.5, runs: 35, execs: 7175, fails: 1, redRuns: 1 },
];
const CI_POST_SPEC_FIX_RUNS = [30512301335, 30513168659];

// The three zoom/pinch specs above turned out to be ONE bug, and fixing it did not
// move the rate — the next spec down took over. Run 30581020210, 35 reps at the
// shipped count, retries off. `execs` is 35 × 204.
const CI_POST_ZOOM_FIX = [{ w: 4, wall: 74.7, runs: 35, execs: 7140, fails: 1, redRuns: 1 }];
const CI_POST_ZOOM_FIX_RUN = 30581020210;

// What that sweep leaves as the residual: one spec, in a different subsystem, that
// had not failed once in the 70 reps behind the table above.
const ZOOM_FIX_RESIDUAL_SPECS = [
  ['pointer exploration still snaps a hexagon gap and commits the highlighted color', '1 of 35'],
];

// The specs those red runs belong to, across both counts. All zoom/pinch gesture
// state, which is a better starting point for the next pass than a rate is. All
// three are fixed as of CI_POST_ZOOM_FIX.
const RESIDUAL_SPECS = [
  ['closing the overlay resets the zoom for the next open', '2 of 35 at 3 workers'],
  ['navigating to another section resets the zoom', '1 of 35 at 4 workers'],
  [
    'a pinch swallows the trailing click, so it never toggles the control beneath it',
    '1 of 35 at 3 workers',
  ],
];

// Each hypothesis that was tested, and how it was killed or confirmed. The
// falsified ones are the point: they are cheap to re-derive and expensive to
// re-test.
const HYPOTHESES = [
  {
    claim: 'CPU contention makes Chromium drop or merge pointer events, so strokes change shape',
    verdict: 'falsified',
    how: 'Instrumented the page to count pointermove events and getCoalescedEvents() samples, then repeated the stroke with 12 busy-loop processes saturating every core.',
    result:
      'Identical to idle: 2 pointermove events and 2 coalesced samples, every time. Input delivery does not lose events under load.',
  },
  {
    claim:
      'The eraser test under-counts its baseline because it reads the canvas once instead of polling until the reading settles',
    verdict: 'falsified',
    how: 'Replaced the single read with a poll that waits for two equal readings, then re-ran the test 200 times at 8 workers.',
    result:
      'Failure rate went from 16 of 200 to 15 of 200, which is no change. (A single un-polled read is still an anti-pattern under .claude/rules/testing.md. It just was not this bug.)',
  },
  {
    claim:
      'pickBrush() returns before the brush is active, so waiting for aria-pressed="true" will fix it',
    verdict: 'falsified',
    how: 'Added await expect(entry).toHaveAttribute("aria-pressed", "true") inside pickBrush() and re-ran the test 200 times at 8 workers.',
    result:
      '16 of 200 before, 16 of 200 after. The spec file header already explains why: the mode reaches the engine through a Svelte $effect, so the button is correct while the engine is not. Reverted rather than kept as a wait that buys nothing.',
  },
  {
    claim:
      'The strokes commit in the wrong brush mode, and counting filled pixels cannot detect it',
    verdict: 'overturned',
    how: 'Read the actual assertion values out of the failing reports. Then, once the engine could be queried directly (ADR-0080), read its committed mode and the painted colours at each failure.',
    result:
      'The `revealed` pixel count came back as a few distinct values (132, 874, 895, 2314) where about 2314 is a real magic reveal. Redrawing all three sites took the file from 16 of 200 failures to 4 of 200, so that fix worked. The explanation did not: the 132 pixels were the coloring page’s own colours, not ink, and the engine reported the correct mode at every failure across about 700 recorded reveals. The stroke was a magic stroke the engine had cut short. A sample more than 100 ms and more than 10% of the paper away from the last one reads as a lifted finger (strokeMath.pointerWasResumed), which is exactly what a starved worker dispatching 180 px hops produces. Redrawing helped only by giving it a second, luckier stroke. Pacing the samples fixed it at the source, and the redraws are gone.',
  },
];

const VERDICT_LABEL = { confirmed: 'Held up', falsified: 'Wrong', overturned: 'Half right' };

const RE_TUNE = `# 1. Build once. The sweep driver builds nothing, so this is the only build, and
#    PUBLIC_ENABLE_DEV_HARNESS has to be set HERE — it gates the /dev/* routes
#    the specs drive.
PUBLIC_ENABLE_DEV_HARNESS=true ADMIN_ACCESS_TOKEN=test-admin-secret \\
  node tools/run-web-tool.mjs vite build

# 2. Sweep. The driver owns the whole protocol: a fresh preview server per rep,
#    CI unset for the run, and one SWEEPRESULT line per rep.
for w in 1 2 3 4 6 8; do
  node tools/e2e-tuning/run-worker-sweep.mjs --workers=$w --reps=30 --out=runs
done

# 3. On CI hardware the same driver runs from .github/workflows/worker-sweep.yml
#    (manual dispatch, one runner per worker count so configs never contend):
#      Actions -> "Worker sweep (manual)" -> Run workflow -> reps
#    Read the numbers straight out of each job log:
#      grep SWEEPRESULT

# Why the driver rather than a loop over \`playwright test\`: reps that share one
# server are not independent. generate-image.spec.ts deliberately fills the
# per-IP BYOK rate-limit bucket, which takes 60s to clear, and a rep takes about
# that long — so the next rep's guard tests take a 429 where they expect a 415
# and the sweep measures a flake it manufactured. A fresh server per rep clears
# the in-memory limiter and matches what CI does: one server, one suite run.`;

// The sticky section nav. `id` doubles as the section anchor.
const SECTIONS = [
  { id: 'answer', label: 'The answer' },
  { id: 'method', label: 'Method' },
  { id: 'local', label: 'Local sweep' },
  { id: 'ci', label: 'CI sweep' },
  { id: 'harness', label: 'Harness bug' },
  { id: 'fixes', label: 'Test fixes & retries' },
  { id: 'hypotheses', label: 'What was tried' },
  { id: 'retune', label: 'Re-tune' },
];

const styles = `
  main.shell { display: flex; flex-direction: column; gap: clamp(40px, 6vw, 64px); }
  .lede { font-size: clamp(1.02rem, 1.5vw, 1.12rem); color: var(--muted); max-width: 64ch; margin: 0; }
  .lede b { color: var(--ink); font-weight: 650; }
  section { display: flex; flex-direction: column; gap: 16px; scroll-margin-top: calc(var(--jump-h, 60px) + 12px); }
  section > h2 { margin: 0; font-size: clamp(1.35rem, 2.4vw, 1.6rem); letter-spacing: -0.015em; line-height: 1.15; }
  section > h2 .eyebrow { display: block; margin-bottom: 6px; }
  section > p, .sub > p { margin: 0; color: var(--muted); max-width: 70ch; }
  section > p b, .sub > p b, .notes b { color: var(--ink); font-weight: 650; }
  .sub { display: flex; flex-direction: column; gap: 14px; margin-top: 10px; }
  .sub > h3 { margin: 0; font-size: 1.12rem; letter-spacing: -0.01em; }
  code { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 0.9em; }
  pre { margin: 0; overflow-x: auto; background: var(--card-2); border: 1px solid var(--hair); border-radius: var(--r-sm); padding: 14px 16px; font-size: 12.5px; line-height: 1.55; }
  pre code { background: none; padding: 0; font-size: 1em; }

  /* sticky section nav */
  .jump { position: sticky; top: 0; z-index: 20; background: color-mix(in srgb, var(--paper) 86%, transparent); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); border-bottom: 1px solid var(--hair); }
  .jump .shell { display: flex; align-items: center; gap: 12px; padding-top: 0; padding-bottom: 0; }
  .jump-scroll { position: relative; display: flex; gap: 4px; overflow-x: auto; scrollbar-width: none; padding: 8px 0; margin: 0 -4px; flex: 1; min-width: 0; -webkit-overflow-scrolling: touch; }
  .jump-scroll.overflows { padding-right: 24px; mask-image: linear-gradient(90deg, #000 calc(100% - 28px), transparent); -webkit-mask-image: linear-gradient(90deg, #000 calc(100% - 28px), transparent); }
  .jump-scroll::-webkit-scrollbar { display: none; }
  .jump a { flex: 0 0 auto; padding: 5px 10px; border-radius: 999px; font-size: 0.8rem; font-weight: 600; color: var(--muted); white-space: nowrap; transition: background .12s, color .12s; }
  .jump a:hover { color: var(--ink); text-decoration: none; background: color-mix(in srgb, var(--ink) 6%, transparent); }
  .jump a.is-active { background: var(--accent-wash); color: var(--accent-ink); }
  .jump-answer { display: none; flex: 0 0 auto; gap: 6px; align-items: center; font-size: 0.78rem; color: var(--muted); }
  .jump-answer b { color: var(--ink); font-weight: 700; }
  .jump-answer .sep { color: var(--faint); }
  @media (min-width: 1080px) { .jump-answer { display: inline-flex; } }

  /* answer tiles */
  .tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .tile { background: var(--card); border: 1px solid var(--hair); border-radius: var(--r-md); padding: 18px 20px 16px; box-shadow: var(--shadow-sm); display: flex; flex-direction: column; gap: 4px; border-top: 4px solid var(--tile-hue, var(--accent)); }
  .tile .k { font-size: 0.74rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted); font-weight: 700; }
  .tile .v { font-size: clamp(2.2rem, 4vw, 2.8rem); line-height: 1; font-weight: 800; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; margin-top: 4px; }
  .tile .rule { font-size: 0.85rem; font-weight: 650; color: var(--muted); }
  .tile .why { color: var(--muted); font-size: 0.9rem; margin: 6px 0 0; }
  .tile .why b { color: var(--ink); font-weight: 650; }

  .calc { display: grid; grid-template-columns: 1fr auto; gap: 10px 22px; align-items: center; background: var(--card); border: 1px solid var(--hair); border-radius: var(--r-md); padding: 16px 20px; box-shadow: var(--shadow-sm); }
  .calc label { display: flex; flex-direction: column; gap: 6px; font-weight: 650; font-size: 0.92rem; }
  .calc label span { color: var(--muted); font-weight: 500; font-size: 0.85rem; }
  .calc .row { display: flex; align-items: center; gap: 12px; max-width: 420px; }
  .calc input[type=range] { flex: 1; accent-color: var(--accent); min-width: 120px; }
  .calc output.cores { font-variant-numeric: tabular-nums; font-weight: 800; font-size: 1.3rem; min-width: 2.2ch; text-align: right; }
  .calc .unit { color: var(--muted); font-weight: 500; font-size: 0.85rem; }
  .calc .out { display: flex; gap: 18px; }
  .calc .out div { display: flex; flex-direction: column; align-items: center; gap: 2px; min-width: 64px; }
  .calc .out output { font-size: 1.7rem; font-weight: 800; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; line-height: 1; }
  .calc .out .k { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); font-weight: 700; }
  .calc .fine { grid-column: 1 / -1; margin: 0; font-size: 0.82rem; color: var(--faint); }

  /* hardware + glossary */
  .duo { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; }
  .hw { background: var(--card); border: 1px solid var(--hair); border-radius: var(--r-md); padding: 16px 18px; box-shadow: var(--shadow-sm); }
  .hw h3 { margin: 0 0 10px; font-size: 1rem; display: flex; align-items: center; gap: 8px; }
  .hw h3 .dot { width: 10px; height: 10px; border-radius: 99px; background: var(--hue); }
  .hw dl { margin: 0; display: grid; grid-template-columns: max-content 1fr; gap: 4px 14px; font-size: 0.9rem; }
  .hw dt { color: var(--faint); }
  .hw dd { margin: 0; color: var(--ink); }
  details.glossary-box { background: var(--card); border: 1px solid var(--hair); border-radius: var(--r-md); box-shadow: var(--shadow-sm); }
  details.glossary-box summary { cursor: pointer; padding: 12px 18px; font-weight: 700; font-size: 0.95rem; list-style: none; display: flex; align-items: center; gap: 10px; }
  details.glossary-box summary::-webkit-details-marker { display: none; }
  details.glossary-box summary .chev { margin-left: auto; color: var(--faint); transition: transform .15s; }
  details.glossary-box[open] summary .chev { transform: rotate(180deg); }
  .glossary { margin: 0; padding: 4px 18px 16px; display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px 20px; font-size: 0.88rem; }
  .glossary div { display: flex; flex-direction: column; gap: 2px; }
  .glossary dt { font-weight: 700; }
  .glossary dd { margin: 0; color: var(--muted); }

  /* sweep card: one row per worker count, bars inline with the numbers */
  .sweep { margin: 0; background: var(--card); border: 1px solid var(--hair); border-radius: var(--r-md); box-shadow: var(--shadow-sm); overflow: hidden; }
  .sweep-cap { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; padding: 14px 18px 12px; border-bottom: 1px solid var(--hair); background: var(--card-2); }
  .sweep-cap b { font-size: 0.98rem; }
  .sweep-cap span { color: var(--muted); font-size: 0.85rem; }
  .sweep-cap .src { margin-left: auto; font-size: 0.8rem; }
  .sw-row, .sw-head { display: grid; grid-template-columns: 5.6rem minmax(150px, 1.5fr) minmax(130px, 1.1fr) 9.5rem; gap: 0 18px; align-items: center; padding: 0 18px; }
  .sweep.has-cpu .sw-row, .sweep.has-cpu .sw-head { grid-template-columns: 5.6rem minmax(150px, 1.5fr) minmax(130px, 1.1fr) 9.5rem 5.4rem 5.4rem; }
  .sw-head { padding-top: 10px; padding-bottom: 8px; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.09em; color: var(--muted); font-weight: 700; border-bottom: 1px solid var(--hair); }
  .sw-head small { display: block; text-transform: none; letter-spacing: 0; font-weight: 500; color: var(--faint); font-size: 0.74rem; }
  .sw-row { padding-top: 10px; padding-bottom: 10px; border-bottom: 1px solid var(--hair); font-variant-numeric: tabular-nums; }
  .sw-row:last-child { border-bottom: 0; }
  .sw-row.is-shipped { background: var(--accent-wash); }
  .sw-w { display: flex; flex-direction: column; align-items: flex-start; gap: 3px; }
  .sw-w .n { display: inline-flex; align-items: baseline; gap: 5px; font-weight: 800; font-size: 1.15rem; letter-spacing: -0.02em; }
  .sw-w small { font-weight: 600; font-size: 0.72rem; color: var(--muted); letter-spacing: 0; }
  .tag { display: inline-block; padding: 1px 7px; border-radius: 999px; font-size: 0.64rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; line-height: 1.5; white-space: nowrap; }
  .tag.ship { background: var(--accent); color: #fff; }
  .tag.fast { background: color-mix(in srgb, var(--ok) 18%, transparent); color: var(--ok); }
  .bar { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 10px; min-width: 0; }
  .bar .lbl { display: none; }
  .bar .track { height: 12px; border-radius: 999px; background: color-mix(in srgb, var(--ink) 7%, transparent); overflow: hidden; }
  .bar .fill { height: 100%; width: calc(var(--v) * 100%); border-radius: 999px; background: var(--fill, var(--accent)); min-width: 3px; }
  .bar .fill.zero { min-width: 0; width: 0; }
  .bar .val { font-weight: 700; white-space: nowrap; font-size: 0.95rem; text-align: right; display: inline-flex; align-items: center; gap: 6px; justify-content: flex-end; }
  .bar .val small { font-weight: 500; color: var(--muted); font-size: 0.78rem; }
  .bar.wall { --fill: var(--c-blue); }
  .bar.wall.fastest { --fill: var(--ok); }
  .bar.red.ok { --fill: var(--ok); }
  .bar.red.warn { --fill: var(--warn); }
  .bar.red.bad { --fill: var(--bad); }
  .bar.tainted .fill { background: repeating-linear-gradient(135deg, var(--faint) 0 4px, transparent 4px 8px); opacity: .55; }
  .bar.tainted .val { color: var(--faint); font-weight: 600; }
  .sw-meta { font-size: 0.88rem; color: var(--ink); white-space: nowrap; }
  .sw-meta small { color: var(--muted); font-size: 0.8rem; display: block; }
  .sw-meta.tainted { color: var(--faint); }
  .sw-meta .lbl { display: none; }
  .sweep-foot { padding: 10px 18px 12px; font-size: 0.82rem; color: var(--muted); border-top: 1px solid var(--hair); background: var(--card-2); }
  .sweep-foot p { margin: 0; }
  .sweep-foot p + p { margin-top: 4px; }
  .legend { display: inline-flex; align-items: center; gap: 6px; font-weight: 650; color: var(--ink); }
  .legend i { display: inline-block; width: 22px; height: 9px; border-radius: 99px; background: repeating-linear-gradient(135deg, var(--faint) 0 4px, transparent 4px 8px); opacity: .7; }
  @media (max-width: 900px) {
    .sw-head { display: none; }
    .sw-row, .sweep.has-cpu .sw-row { grid-template-columns: 1fr; gap: 6px; padding-top: 12px; padding-bottom: 12px; }
    .sw-w { flex-direction: row; align-items: center; gap: 10px; }
    .sw-w .n { font-size: 1.05rem; }
    .sw-meta b + small::before { content: " · "; color: var(--faint); }
    .bar { grid-template-columns: 4.2rem 1fr auto; }
    .bar .lbl { display: block; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); font-weight: 700; }
    .sw-metas { display: flex; flex-wrap: wrap; gap: 4px 16px; margin-top: 2px; }
    .sw-meta small { display: inline; }
    .sw-meta .lbl { display: inline; color: var(--muted); }
    .sw-meta .lbl::after { content: ": "; }
  }
  @media (min-width: 901px) { .sw-metas { display: contents; } }

  /* before/after cards */
  .deltas { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
  .delta { background: var(--card); border: 1px solid var(--hair); border-radius: var(--r-md); padding: 14px 18px; box-shadow: var(--shadow-sm); }
  .delta.is-shipped { border-color: color-mix(in srgb, var(--accent) 40%, var(--hair)); }
  .delta h4 { margin: 0 0 10px; font-size: 1rem; display: flex; align-items: center; gap: 8px; }
  .delta .line { display: grid; grid-template-columns: 6.2rem 1fr auto; align-items: baseline; gap: 10px; padding: 6px 0; border-top: 1px solid var(--hair); font-variant-numeric: tabular-nums; }
  .delta .line .k { color: var(--muted); font-size: 0.85rem; }
  .delta .line .ba { font-size: 1.05rem; font-weight: 700; }
  .delta .line .ba .arr { color: var(--faint); font-weight: 400; margin: 0 6px; }
  .delta .line .d { font-size: 0.8rem; font-weight: 700; padding: 2px 8px; border-radius: 999px; }
  .delta .d.good { color: var(--ok); background: color-mix(in srgb, var(--ok) 14%, transparent); }
  .delta .d.bad { color: var(--bad); background: color-mix(in srgb, var(--bad) 14%, transparent); }
  .delta .d.flat { color: var(--muted); background: color-mix(in srgb, var(--ink) 7%, transparent); }
  .delta .line.emph .ba { color: var(--ink); }
  .delta .line:not(.emph) .ba { color: var(--muted); font-weight: 600; }

  /* callouts + notes */
  .callout { background: var(--card); border: 1px solid var(--hair); border-left: 4px solid var(--callout-hue, var(--accent)); border-radius: var(--r-md); padding: 16px 20px; box-shadow: var(--shadow-sm); display: flex; flex-direction: column; gap: 8px; }
  .callout h3 { margin: 0; font-size: 1.05rem; }
  .callout p { margin: 0; color: var(--muted); max-width: 72ch; }
  .callout p b { color: var(--ink); font-weight: 650; }
  .callout.warn { --callout-hue: var(--warn); }
  ul.notes { margin: 0; padding-left: 20px; color: var(--muted); display: flex; flex-direction: column; gap: 8px; max-width: 78ch; }
  ul.notes li::marker { color: var(--faint); }
  ul.specs { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; }
  ul.specs li { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; font-size: 0.9rem; }
  ul.specs li .n { flex: 0 0 auto; min-width: 9.5rem; font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
  ul.specs li code { flex: 0 1 auto; }
  .tag.fixed { background: color-mix(in srgb, var(--ok) 16%, transparent); color: var(--ok); }

  /* hypotheses */
  .hyp { display: flex; flex-direction: column; gap: 10px; }
  details.hyp-item { background: var(--card); border: 1px solid var(--hair); border-radius: var(--r-md); box-shadow: var(--shadow-sm); border-left: 4px solid var(--hyp-hue, var(--hair-strong)); }
  details.hyp-item.falsified { --hyp-hue: var(--bad); }
  details.hyp-item.overturned { --hyp-hue: var(--warn); }
  details.hyp-item.confirmed { --hyp-hue: var(--ok); }
  details.hyp-item summary { display: flex; align-items: flex-start; gap: 12px; padding: 14px 16px; cursor: pointer; list-style: none; font-weight: 650; line-height: 1.4; }
  details.hyp-item summary::-webkit-details-marker { display: none; }
  details.hyp-item summary .pill { flex: 0 0 auto; margin-top: 2px; }
  details.hyp-item summary .chev { margin-left: auto; flex: 0 0 auto; color: var(--faint); transition: transform .15s; margin-top: 4px; }
  details.hyp-item[open] summary .chev { transform: rotate(180deg); }
  details.hyp-item dl { margin: 0; padding: 0 16px 16px 16px; display: grid; grid-template-columns: max-content 1fr; gap: 6px 14px; font-size: 0.92rem; }
  details.hyp-item dt { color: var(--faint); font-size: 0.7rem; letter-spacing: 0.08em; text-transform: uppercase; padding-top: 4px; font-weight: 700; }
  details.hyp-item dd { margin: 0; color: var(--muted); }
  .pill { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 0.68rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: var(--hyp-hue); background: color-mix(in srgb, var(--hyp-hue) 14%, transparent); }

  /* code with copy */
  .codebox { position: relative; }
  .codebox .copy { position: absolute; top: 10px; right: 10px; font: inherit; font-size: 0.76rem; font-weight: 700; padding: 5px 10px; border-radius: 999px; border: 1px solid var(--hair-strong); background: var(--card); color: var(--muted); cursor: pointer; }
  .codebox .copy:hover { color: var(--ink); border-color: var(--ink); }
  .codebox .copy.done { color: var(--ok); border-color: var(--ok); }

  @media (max-width: 760px) {
    .tiles { grid-template-columns: 1fr; }
    .calc { grid-template-columns: 1fr; }
    .calc .out { justify-content: space-between; }
    details.hyp-item summary { flex-wrap: wrap; gap: 8px 12px; }
    details.hyp-item summary .pill { order: 1; }
    details.hyp-item summary .chev { order: 2; margin-top: 0; }
    details.hyp-item summary .claim { order: 3; flex: 1 1 100%; }
    details.hyp-item dl { grid-template-columns: 1fr; gap: 2px 0; }
    details.hyp-item dd { margin-bottom: 8px; }
    .delta .line { grid-template-columns: 5rem 1fr; }
    .delta .line .d { grid-column: 2; justify-self: start; }
  }
  @media (prefers-reduced-motion: reduce) { .jump a, details.hyp-item summary .chev { transition: none; } }
`;

const s1 = (n) => n.toFixed(1);
const int = (n) => n.toLocaleString('en-US');
const sum = (rows, key) => rows.reduce((acc, r) => acc + r[key], 0);
// A failure rate as "1 in N" test executions, which reads at a glance where a
// four-decimal percentage does not.
const oneIn = (row) => `1 in ${int(Math.round(row.execs / row.fails))}`;
const redSeverity = (row) => {
  const share = row.redRuns / row.runs;
  return share === 0 ? 'ok' : share <= 0.25 ? 'ok' : share <= 0.6 ? 'warn' : 'bad';
};
const link = (href, text) =>
  `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(text)}</a>`;
const runLinks = (ids) => ids.map((id, i) => link(actionsRun(id), `run ${i + 1}`)).join(' · ');

const LOCAL_RUNS = sum(LOCAL_PREFIX, 'runs') + sum(LOCAL_POSTFIX, 'runs');
const CI_RUNS =
  sum(CI_SWEEP, 'runs') +
  sum(REVEAL_BUDGET_EXPERIMENT, 'runs') +
  sum(CI_RESIDUAL, 'runs') +
  sum(CI_POST_SPEC_FIX, 'runs') +
  sum(CI_POST_ZOOM_FIX, 'runs');

// The three CI re-measure cards share one bar scale so a bar's length means the
// same seconds in each, including the single-row card at the end.
const CI_REMEASURE_WALL_SCALE = Math.max(...CI_RESIDUAL.map((r) => r.wall));

const row = (env, w) => (env === 'local' ? LOCAL_POSTFIX : CI_POST_SPEC_FIX).find((r) => r.w === w);
const localShipped = row('local', SHIPPED.local);
const localFastest = row('local', 4);
const ciShipped = row('ci', SHIPPED.ci);
const ciRunnerUp = row('ci', 3);

function bar({ kind, label, value, share, fill, sub = '', extraClass = '' }) {
  const zero = share === 0;
  return `<div class="bar ${kind} ${extraClass}"${fill ? ` style="--fill:${fill}"` : ''}>
        <span class="lbl">${esc(label)}</span>
        <div class="track"><div class="fill${zero ? ' zero' : ''}" style="--v:${share.toFixed(3)}"></div></div>
        <span class="val">${value}${sub ? `<small>${sub}</small>` : ''}</span>
      </div>`;
}

// One sweep as a card: a row per worker count with wall clock and red runs as
// inline bars, the failure rate as "1 in N", and the contention columns when the
// dataset has them. `shipped` marks the row CI or local runs with; `tainted`
// strikes the failure columns of a dataset whose rate the harness manufactured.
function sweepCard(
  rows,
  { title, caption, source, shipped, tainted = false, foot = [], wallScale = null }
) {
  const hasCpu = rows.some((r) => r.cpu != null || r.infl != null);
  const wallMax = wallScale ?? Math.max(...rows.map((r) => r.wall));
  const wallMin = Math.min(...rows.map((r) => r.wall));
  const body = rows
    .map((r) => {
      const fastest = r.wall === wallMin && rows.length > 1;
      const sev = redSeverity(r);
      const metas = [
        `<div class="sw-meta${tainted ? ' tainted' : ''}"><span class="lbl">Failed tests</span><b>${r.fails}</b><small>${r.fails ? oneIn(r) : 'none'}</small></div>`,
        hasCpu
          ? `<div class="sw-meta"><span class="lbl">Slowdown</span><b>${r.infl != null ? `${r.infl.toFixed(2)}×` : '—'}</b></div>` +
            `<div class="sw-meta"><span class="lbl">CPU</span><b>${r.cpu != null ? `${r.cpu.toFixed(0)}s` : '—'}</b></div>`
          : '',
      ].join('');
      return `<div class="sw-row${r.w === shipped ? ' is-shipped' : ''}">
      <div class="sw-w"><span class="n">${r.w}<small>worker${r.w === 1 ? '' : 's'}</small></span>${r.w === shipped ? '<span class="tag ship">shipped</span>' : ''}</div>
      ${bar({
        kind: 'wall',
        label: 'Wall',
        value: `${s1(r.wall)}s`,
        share: r.wall / wallMax,
        extraClass: fastest ? 'fastest' : '',
        sub: fastest ? '<span class="tag fast">fastest</span>' : '',
      })}
      ${bar({
        kind: 'red',
        label: 'Red',
        value: `${r.redRuns}<small>of ${r.runs}</small>`,
        share: r.redRuns / r.runs,
        extraClass: `${sev}${tainted ? ' tainted' : ''}`,
      })}
      <div class="sw-metas">${metas}</div>
    </div>`;
    })
    .join('');
  const head = `<div class="sw-head">
      <div>Workers</div>
      <div>Wall clock<small>median per run</small></div>
      <div>Red runs<small>runs with a failure</small></div>
      <div>Failed tests<small>total · one in N run</small></div>
      ${hasCpu ? '<div>Slowdown<small>per test vs 1 worker</small></div><div>CPU<small>seconds per run</small></div>' : ''}
    </div>`;
  const footer = foot.length
    ? `<div class="sweep-foot">${foot.map((f) => `<p>${f}</p>`).join('')}</div>`
    : '';
  return `<figure class="sweep${hasCpu ? ' has-cpu' : ''}">
    <figcaption class="sweep-cap"><b>${esc(title)}</b><span>${caption}</span>${source ? `<span class="src">${source}</span>` : ''}</figcaption>
    ${head}
    ${body}
    ${footer}
  </figure>`;
}

// The reverted reveal-budget experiment as one card per worker count, with the
// line that row is the evidence for drawn in full ink.
function deltaCards(rows) {
  const signed = (n, unit) =>
    `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(unit === 's' ? 1 : 0)}${unit}`;
  const cls = (n, lowerIsBetter = true) =>
    n === 0 ? 'flat' : n < 0 === lowerIsBetter ? 'good' : 'bad';
  return `<div class="deltas">${rows
    .map((r) => {
      const dFails = r.fails - r.failsBefore;
      const dWall = +(r.wall - r.wallBefore).toFixed(1);
      return `<div class="delta${r.shipped ? ' is-shipped' : ''}">
      <h4>${r.w} worker${r.w === 1 ? '' : 's'}${r.shipped ? '<span class="tag ship">shipped</span>' : ''}</h4>
      <div class="line${r.shows === 'fails' ? ' emph' : ''}"><span class="k">Failing tests</span><span class="ba">${r.failsBefore}<span class="arr">→</span>${r.fails}</span><span class="d ${cls(dFails)}">${dFails === 0 ? 'no change' : signed(dFails, '')}</span></div>
      <div class="line${r.shows === 'wall' ? ' emph' : ''}"><span class="k">Wall clock</span><span class="ba">${s1(r.wallBefore)}s<span class="arr">→</span>${s1(r.wall)}s</span><span class="d ${cls(dWall)}">${signed(dWall, 's')}</span></div>
    </div>`;
    })
    .join('')}</div>`;
}

function specList(specs, { fixed = false } = {}) {
  return `<ul class="specs">${specs
    .map(
      ([name, share]) =>
        `<li><span class="n">${esc(share)}</span><code>${esc(name)}</code>${fixed ? '<span class="tag fixed">fixed since</span>' : ''}</li>`
    )
    .join('')}</ul>`;
}

function hypotheses(items) {
  return `<div class="hyp">${items
    .map(
      (h) => `<details class="hyp-item ${h.verdict}">
      <summary><span class="pill">${esc(VERDICT_LABEL[h.verdict])}</span><span class="claim">${esc(h.claim)}</span><span class="chev" aria-hidden="true">▾</span></summary>
      <dl>
        <dt>Tested by</dt><dd>${esc(h.how)}</dd>
        <dt>Result</dt><dd>${esc(h.result)}</dd>
      </dl>
    </details>`
    )
    .join('')}</div>`;
}

// The wall-clock savings of each step up in worker count, from the data rather
// than retyped.
function wallSteps(rows) {
  return rows
    .slice(1)
    .map((r, i) => {
      const prev = rows[i];
      const delta = +(prev.wall - r.wall).toFixed(1);
      const verb =
        delta > 0 ? `saves ${s1(delta)}s` : delta < 0 ? `costs ${s1(-delta)}s` : 'saves nothing';
      return `${prev.w}→${r.w} ${verb}`;
    })
    .join(', ');
}

const hardwareCard = (hw, hue) => `<div class="hw" style="--hue:var(--c-${hue})">
      <h3><span class="dot"></span>${esc(hw.label)}</h3>
      <dl>${hw.facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
    </div>`;

const jumpNav = `<nav class="jump" aria-label="Sections">
  <div class="shell">
    <div class="jump-scroll">${SECTIONS.map((s) => `<a href="#${s.id}">${esc(s.label)}</a>`).join('')}</div>
    <div class="jump-answer" aria-label="The answer"><span>Local <b>${SHIPPED.local}</b></span><span class="sep">·</span><span>CI <b>${SHIPPED.ci}</b></span><span class="sep">·</span><span>CI retries <b>${SHIPPED.ciRetries}</b></span></div>
  </div>
</nav>`;

const script = `
(() => {
  const nav = document.querySelector('.jump');
  const links = [...nav.querySelectorAll('a[href^="#"]')];
  const scroller = nav.querySelector('.jump-scroll');
  const targets = links.map((a) => document.getElementById(a.getAttribute('href').slice(1)));
  const root = document.documentElement;

  const measureNav = () => {
    root.style.setProperty('--jump-h', nav.offsetHeight + 'px');
    scroller.classList.toggle('overflows', scroller.scrollWidth > scroller.clientWidth + 1);
  };
  measureNav();
  addEventListener('resize', measureNav);

  let current = null;
  const setActive = () => {
    const line = nav.offsetHeight + 24;
    let active = targets[0];
    for (const t of targets) if (t && t.getBoundingClientRect().top <= line) active = t;
    if (innerHeight + scrollY >= root.scrollHeight - 2) active = targets[targets.length - 1];
    if (active === current) return;
    current = active;
    links.forEach((a, i) => {
      const on = targets[i] === active;
      a.classList.toggle('is-active', on);
      if (!on) return;
      const chip = a.getBoundingClientRect();
      const box = scroller.getBoundingClientRect();
      if (chip.left < box.left || chip.right > box.right - 28) {
        scroller.scrollTo({ left: a.offsetLeft - 12, behavior: 'smooth' });
      }
    });
  };
  let ticking = false;
  addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; setActive(); });
  }, { passive: true });
  setActive();

  for (const btn of document.querySelectorAll('[data-copy]')) {
    btn.addEventListener('click', async () => {
      const text = document.getElementById(btn.dataset.copy).textContent;
      try {
        await navigator.clipboard.writeText(text);
        btn.textContent = 'Copied';
        btn.classList.add('done');
      } catch {
        btn.textContent = 'Copy failed';
      }
      setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('done'); }, 1600);
    });
  }

  const cores = document.getElementById('cores');
  if (cores) {
    const out = (id) => document.getElementById(id);
    const CORES_PER_WORKER = ${CORES_PER_WORKER};
    const CI_OVERSUBSCRIPTION = ${CI_OVERSUBSCRIPTION};
    const update = () => {
      const c = Number(cores.value);
      const saturation = c / CORES_PER_WORKER;
      out('cores-out').value = c;
      out('local-out').value = Math.max(1, Math.floor(saturation));
      out('ci-out').value = Math.max(2, Math.floor(saturation * CI_OVERSUBSCRIPTION));
    };
    cores.addEventListener('input', update);
    update();
  }
})();
`;

const body = `
${masthead({
  title: 'E2E tuning: workers, retries, and three real flakes',
  tagline:
    'How many Playwright workers the suite runs with, and how many retries CI gets. Measured on two machines rather than guessed, along with the test bugs and the harness bug found on the way.',
  crumbs: [{ label: 'Scrapbook', href: '../index.html' }, { label: 'E2E tuning' }],
  home: '../index.html',
  stats: `<span class="chip">Measured from ${esc(RUN_DATE)}</span><span class="chip"><b>${LOCAL_RUNS}</b> local runs</span><span class="chip"><b>${CI_RUNS}</b> CI runs</span><span class="chip">203–204 tests per run</span>`,
})}

${jumpNav}

<main class="shell">
  <p class="lede">
    The full suite ran at 1, 2, 3, 4, 6 and 8 workers, many times over, on the local dev box and on
    GitHub's CI runner. <b>Wall clock stops improving long before the flake rate stops rising.</b>
    This page records where that crossover sits on each machine, and what it took to tell real
    test bugs apart from CPU contention.
  </p>

  <section id="answer">
    <h2>The answer</h2>
    <div class="tiles">
      <div class="tile" style="--tile-hue:var(--c-green)">
        <span class="k">Local workers</span>
        <span class="v">${SHIPPED.local}</span>
        <span class="rule">cores ÷ ${CORES_PER_WORKER}, no retries</span>
        <p class="why">On the 4-core dev box. Runs finish <b>${s1(localShipped.wall - localFastest.wall)}s later</b> than at 4 workers, and went red <b>${localShipped.redRuns} time in ${localShipped.runs}</b> instead of ${localFastest.redRuns} in ${localFastest.runs}.</p>
      </div>
      <div class="tile" style="--tile-hue:var(--c-blue)">
        <span class="k">CI workers</span>
        <span class="v">${SHIPPED.ci}</span>
        <span class="rule">one per core, retries on</span>
        <p class="why">On the 4-vCPU runner. The fastest setting measured, at <b>${s1(ciShipped.wall)}s</b> a run, and it went red <b>${ciShipped.redRuns} time in ${ciShipped.runs}</b> against ${ciRunnerUp.redRuns} in ${ciRunnerUp.runs} for 3 workers.</p>
      </div>
      <div class="tile" style="--tile-hue:var(--c-orange)">
        <span class="k">CI retries</span>
        <span class="v">${SHIPPED.ciRetries}</span>
        <span class="rule">kept, and re-measured</span>
        <p class="why">1 red run in 35 is 2.9%, but the 95% confidence interval reaches <b>12.9%</b>. That is not enough evidence to drop a retry.</p>
      </div>
    </div>
    <p>
      <b>The two machines want different settings because a red run costs different things.</b>
      Locally there are no retries, so one flaky test means running the suite again and stopping
      to look at why. That costs far more than the 10 seconds a higher worker count saves, so the
      local count stays where the machine is not oversubscribed. On CI, retries make one flaky test
      cheap, so the fastest count wins as long as its red-run rate is no worse than the alternatives.
    </p>
    <p>
      <b>One finding held on both machines: a Playwright worker needs about ${CORES_PER_WORKER} cores.</b>
      A worker is a whole Chromium (browser, renderer, GPU, network and utility processes) plus a
      Node runner. Total CPU time per run grew in step with workers ÷ 2 on both machines, which
      put the cost at 2.0–2.5 cores per worker locally and 2.2–2.8 on CI. So
      <code>workers: '100%'</code>, one worker per core, oversubscribes any machine by about 2×.
    </p>
    <div class="calc">
      <label for="cores">Try the rule on your own machine<span>Drag to your logical core count. The rule from ADR-0078 gives the worker counts.</span>
        <div class="row"><input id="cores" type="range" min="1" max="32" value="4"><output class="cores" id="cores-out" for="cores">4</output><span class="unit">cores</span></div>
      </label>
      <div class="out">
        <div><output id="local-out" for="cores">2</output><span class="k">Local</span></div>
        <div><output id="ci-out" for="cores">4</output><span class="k">CI</span></div>
        <div><output>${SHIPPED.ciRetries}</output><span class="k">CI retries</span></div>
      </div>
      <p class="fine">Only 4-core machines were ever measured, and both ran one thread per core. On a hyper-threaded machine the physical core count is the better input.</p>
    </div>
  </section>

  <section id="method">
    <h2>How it was measured</h2>
    <p>
      Both machines have 4 cores and no GPU, which makes the comparison about scheduling rather
      than hardware class. The whole study ran with retries turned off, so nothing could hide a
      failure from the count.
    </p>
    <div class="duo">
      ${hardwareCard(HARDWARE.local, 'green')}
      ${hardwareCard(HARDWARE.ci, 'blue')}
    </div>
    <ul class="notes">
      <li><b>Local runs went round-robin</b> across the worker counts, so a slow hour on the box could not favour any one setting.</li>
      <li><b>CI runs got one runner per worker count</b>, so settings never competed with each other for CPU.</li>
      <li><b>Every repetition is a full suite run</b> of 203 tests (204 after one was added), and a "red run" is any repetition with at least one failing test.</li>
    </ul>
    <details class="glossary-box">
      <summary>How to read the sweep cards<span class="chev" aria-hidden="true">▾</span></summary>
      <dl class="glossary">
      <div><dt>Wall clock</dt><dd>Median seconds for one full suite run. Lower is better; the fastest row in each card is tagged.</dd></div>
      <div><dt>Red runs</dt><dd>Runs with at least one failing test, out of the runs measured. This is what a retry count is chosen against.</dd></div>
      <div><dt>Failing tests</dt><dd>Failed test executions across all runs, shown as one failure in every N executions.</dd></div>
      <div><dt>Slowdown</dt><dd>Each test's mean duration divided by its own mean at 1 worker. Above 1× means tests are waiting on the CPU.</dd></div>
      <div><dt>CPU</dt><dd>Total test seconds in one run. The same tests run every time, so any growth is time lost to contention.</dd></div>
      </dl>
    </details>
  </section>

  <section id="local">
    <h2>Local sweep</h2>
    <p>
      ${esc(HARDWARE.local.label)}. First as the suite stood, then after three magic-brush tests
      were fixed.
    </p>
    ${sweepCard(LOCAL_PREFIX, {
      title: 'Before the test fixes',
      caption: `${esc(RUN_DATE)} · 8 runs per count (3 at 1 worker, at about 3 minutes each)`,
      shipped: SHIPPED.local,
    })}
    <ul class="notes">
      <li><b>Almost all the speed-up comes from the first extra worker.</b> ${esc(wallSteps(LOCAL_PREFIX))}.</li>
      <li><b>Past 4 workers every run goes red.</b> The number of distinct failing tests goes 2, 2, 10, 18 at 3, 4, 6 and 8 workers. At 8, tests with no canvas timing in them start failing too.</li>
      <li><b>Even 1 worker flaked</b> once in 3 runs, so a lower count on its own could never reach a clean suite. Some tests were genuinely broken.</li>
    </ul>
    <div class="sub">
      <h3>After fixing three magic-brush tests</h3>
      <p>Same box, a freshly started preview server, and the three repaired tests. Only the candidate counts were re-run.</p>
      ${sweepCard(LOCAL_POSTFIX, {
        title: 'After the test fixes',
        caption: '16 runs each at 2 and 3 workers, 8 at 4',
        shipped: SHIPPED.local,
      })}
      <ul class="notes">
        <li><b>Magic-brush dropped out of the failure lists</b> at 3 and 4 workers entirely, and 6 workers went from 0 green runs in 8 to 5 in 8.</li>
        <li><b>The best count did not move.</b> At 4 workers, 5 failures in 1,624 test executions after the fix is the same rate as 3 in 1,624 before it. Other tests with thin timing margins took over. The worker count sets the flake rate; test fixes only raise how high the count can go.</li>
        <li><b>So local stays at 2 workers.</b> ${s1(localShipped.wall)}s and ${localShipped.redRuns} red run in ${localShipped.runs}, against ${s1(localFastest.wall)}s and ${localFastest.redRuns} red runs in ${localFastest.runs} at 4.</li>
      </ul>
    </div>
  </section>

  <section id="ci">
    <h2>CI sweep</h2>
    <p>
      ${esc(HARDWARE.ci.label)}, with the magic-brush fixes in place. The production config
      sets <code>retries: ${SHIPPED.ciRetries}</code> on CI, which would hide the very rate being measured, so retries
      were off here too.
    </p>
    ${sweepCard(CI_SWEEP, {
      title: 'First CI sweep',
      caption: '5 runs per count, one runner each',
      source: link(actionsRun(CI_SWEEP_RUN), `run ${CI_SWEEP_RUN}`),
      shipped: SHIPPED.ci,
      tainted: true,
      foot: [
        `<span class="legend"><i class="stripe"></i>Failure columns are not a real rate.</span> Every run reused one preview server and inherited the previous run's spent rate-limit windows, so some failures here were manufactured by the harness. The <a href="#harness">harness bug</a> section explains; the wall-clock column is unaffected.`,
      ],
    })}
    <ul class="notes">
      <li><b>Wall clock bottoms out at 4 workers</b> (${s1(CI_SWEEP[3].wall)}s). 8 workers is no faster and fails far more often.</li>
      <li><b>1 worker still failed, with nothing to contend with.</b> Two of its three failures were 30-second timeouts. The runner has no GPU, so Chromium rasterizes the magic-brush reveal in software and that test sits near its 15-second budget however many workers run.</li>
      <li><b>CI is faster than the local box overall</b> (${CI_SWEEP[3].wall.toFixed(0)}–${CI_SWEEP[0].wall.toFixed(0)}s against ${LOCAL_PREFIX[3].wall.toFixed(0)}–${LOCAL_PREFIX[0].wall.toFixed(0)}s) while being slower at canvas work. "Faster hardware" is not one number.</li>
    </ul>
    <div class="sub">
      <h3>A bigger reveal timeout, tried and reverted</h3>
      <p>
        The CI failures landed right at the magic-reveal budget, so it was raised from 15s to 30s and
        the two most informative counts were re-measured (${link(actionsRun(REVEAL_BUDGET_RUN), `run ${REVEAL_BUDGET_RUN}`)}).
        The change helped in one place and hurt in the other.
      </p>
      ${deltaCards(REVEAL_BUDGET_EXPERIMENT)}
      <ul class="notes">
        <li><b>At 4 workers it worked.</b> 5 green runs in 5 where there had been 3, for about 4.6s of wall clock per run.</li>
        <li><b>At 1 worker it did not.</b> The same three tests failed, and now cost far more: with <code>test.slow()</code> in play, a reveal that never converges ran to its full 90s budget instead of failing at 30s. The median run went from 95s to 138s.</li>
        <li><b>Those failures were never short on time.</b> The reveal helper loops draw, check, undo, redraw. A bigger budget just lets a loop that never converges run longer.</li>
        <li><b>Reverted.</b> At 4 workers the two failures it fixed were already covered by retries, while a stuck reveal becoming the longest test in the run was a real cost. Bounding the loop's attempts fixed the genuinely slow cases instead.</li>
      </ul>
    </div>
  </section>

  <section id="harness">
    <h2>The harness was measuring itself</h2>
    <p>
      Every rate above came from runs that shared one preview server per worker count. That sharing
      turned out to be most of what was being measured, so the retry question could not be answered
      until the sweep driver was fixed and the CI numbers re-taken on ${esc(RE_MEASURE_DATE)}.
    </p>
    <div class="callout warn">
      <h3>What went wrong</h3>
      <p>
        The suite deliberately fills the API's 60-second per-IP rate-limit windows: one spec
        exhausts the bring-your-own-key bucket and bursts the managed token's. A run takes about as
        long as those windows last, so the next run started with a spent budget, and its guard tests
        got a <code>429 Too Many Requests</code> where they assert a <code>415</code>.
      </p>
      <ul class="notes">
        <li>On the CI runner at 4 workers, <code>throttles a managed token hammered in a burst</code> failed in 12 of 12 runs. A deterministic failure had been counted as a flake rate.</li>
        <li>Locally at 4 workers, the bring-your-own-key guard tests were 4 of the 5 failures across 7 runs.</li>
        <li>Those are the specs most of the failure columns above are made of.</li>
      </ul>
      <p>
        <b>The fix:</b> every run gets its own freshly started preview server, which clears the
        in-memory limiter and matches what CI does anyway: one server, one suite run. The sweep
        driver started that server itself at the time; Playwright's own <code>webServer</code> starts it
        per run now (${link(issueUrl(1044), 'issue 1044')}).
      </p>
    </div>
    ${sweepCard(CI_RESIDUAL, {
      title: 'Re-measured with a fresh server per run',
      caption: `${esc(RE_MEASURE_DATE)} · 15 runs per count, one runner each`,
      source: link(actionsRun(CI_RESIDUAL_RUN), `run ${CI_RESIDUAL_RUN}`),
      shipped: SHIPPED.ci,
      foot: [
        'Wall clock here includes the 4 or so seconds the driver spends starting and probing each fresh server, so compare the shape with the first CI sweep, not the values.',
      ],
    })}
    <ul class="notes">
      <li><b>Almost all of this card is one test.</b> 6 workers failing in 15 of 15 runs is not a flake rate, it is a deterministic failure. <code>a burst of screenshot taps shares one save before allowing the next</code> waited a fixed 500ms for a save, so the more starved the worker, the more reliably it missed. Read on its own, the card says the rate climbs steeply with workers, and the first pass of this study believed it and set CI to 3 workers.</li>
      <li><b>1 worker is still one of the worst settings</b> (6 red in 15) with no contention to blame. The GPU-less runner keeps canvas-heavy tests near their budgets however few workers run. That is why the curve is a U rather than a slope, and why the worker count alone could never reach zero.</li>
    </ul>
  </section>

  <section id="fixes">
    <h2>Fixing the tests, and the retry decision</h2>
    <p>
      Same runner image, 35 runs each at the two candidate counts, retries still off. This is the
      evidence the shipped worker count and retry count rest on.
    </p>
    ${sweepCard(CI_POST_SPEC_FIX, {
      title: 'After fixing the screenshot-save test',
      caption: '35 runs per count',
      source: runLinks(CI_POST_SPEC_FIX_RUNS),
      shipped: SHIPPED.ci,
      wallScale: CI_REMEASURE_WALL_SCALE,
    })}
    <p><b>The four red runs came from three tests</b>, all about zoom and pinch gesture state:</p>
    ${specList(RESIDUAL_SPECS, { fixed: true })}
    <ul class="notes">
      <li><b>The climb was the test, not the worker count.</b> 3 and 4 workers are statistically the same (Fisher's exact test, p = 0.61) and 4 is ${s1(ciRunnerUp.wall - ciShipped.wall)}s faster per run, so CI went back to one worker per core. The detour through 3 workers stays in the record because the mistake generalises: a worker count tuned against a rate that one bad test dominates is really tuned around that test.</li>
      <li><b>Retries stay at ${SHIPPED.ciRetries}, and the confidence interval is the whole argument.</b> 1 red run in 35 is 2.9%, but one failure in 35 cannot establish a rate: the 95% interval reaches 12.9%. <code>retries: 0</code> goes red every time that happens. <code>retries: 1</code> needs the same test to fail twice, which looks like 0.1% if the attempts were independent, and they are not: the retry runs straight afterwards on the same starved machine. (The 3-worker row is kept separate on purpose. Pooling the two into "4 in 70" would quote a figure for a setting that was measured 35 times.)</li>
      <li><b>Retried passes are no longer silent.</b> Each one becomes a GitHub Actions annotation plus a row in the job summary, so "green, but only on attempt 2" shows on the run page instead of in a log nobody opens.</li>
      <li><b>Lowering the retry count depends on fixing those tests</b>, not on another sweep. Fixing one test took 4 workers from 6 red runs in 15 to 1 in 35.</li>
    </ul>
    <div class="sub">
      <h3>The three zoom tests were one bug, and the rate stayed put</h3>
      <p>Same runner image, 35 runs at the shipped count, retries still off.</p>
      ${sweepCard(CI_POST_ZOOM_FIX, {
        title: 'After fixing the zoom and pinch tests',
        caption: '35 runs',
        source: link(actionsRun(CI_POST_ZOOM_FIX_RUN), `run ${CI_POST_ZOOM_FIX_RUN}`),
        shipped: SHIPPED.ci,
        wallScale: CI_REMEASURE_WALL_SCALE,
      })}
      <p><b>The one red run came from a test that had never failed before</b>, in a different part of the app:</p>
      ${specList(ZOOM_FIX_RESIDUAL_SPECS)}
      <ul class="notes">
        <li><b>All three were one missing wait</b> in a helper they shared. A dialog opens by flying in from the button that launched it, starting at 5% scale on top of that button. The modal also ignores pointer events within 72px of that launch point for 600ms, so the tap that opened it cannot land on the content. For the first frames the whole dialog sits inside that dead zone: the Settings pane starts 6px from the launch point and only clears the radius about 13ms in. The tests read the pane's live rectangle and dispatched synthetic pointer events at it, skipping the checks a real click performs, so the pinch landed in the dead zone and did nothing.</li>
        <li><b>A CSS animation only advances when a frame renders</b>, which is how contention got in: a starved worker holds the dialog on that first keyframe far longer than 13ms. The tell was <code>a two-finger pinch enlarges the pane</code>, a structurally identical test with 0 failures in 70 runs, whose one extra round trip lets the fly-in move on first.</li>
        <li><b>Fixing it did not move the retry count.</b> The three tests went 0 for 35, and in the same sweep a colour-picker test that had never failed went red once. The red-run rate at the shipped count is where it was, so <code>retries: ${SHIPPED.ciRetries}</code> stays and the next fix starts from that test. A rate that one test dominates is still not a rate.</li>
      </ul>
    </div>
  </section>

  <section id="hypotheses">
    <h2>What was tried</h2>
    <p>
      Three of these four explanations for the magic-brush flakes were wrong. They are recorded
      because they are cheap to think of again and expensive to re-test.
    </p>
    ${hypotheses(HYPOTHESES)}
  </section>

  <section id="retune">
    <h2>Re-tuning later</h2>
    <p>
      The numbers above belong to their hardware. The shape of the curve, with saturation near
      cores ÷ ${CORES_PER_WORKER}, should carry over; the exact optimum will not. To measure again:
    </p>
    <div class="codebox">
      <button class="copy" type="button" data-copy="retune-cmd">Copy</button>
      <pre><code id="retune-cmd">${esc(RE_TUNE)}</code></pre>
    </div>
    <p>
      Then replace the datasets at the top of <code>tools/e2e-tuning/gen-tuning-report.mjs</code> and run
      <code>npm run gen:e2e-tuning-report</code>. The decision and its reasoning live in
      ${link(ADR_URL, 'ADR-0078')}.
    </p>
  </section>
</main>

${siteFooter({ home: '../index.html' })}
<script>${script}</script>`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>E2E tuning — Splotch scrapbook</title>
${chromeStyle(styles)}
</head>
<body>
${body}
</body>
</html>
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, html);
console.log(`wrote ${OUT} (${(html.length / 1024).toFixed(1)} kB)`);
