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
import { ROOT } from './lib/proc.mjs';
import { esc } from './lib/html.mjs';
import { chromeStyle, masthead, siteFooter } from './lib/scrapbook-chrome.mjs';

const OUT = join(ROOT, 'scrapbook/e2e-tuning/index.html');

const RUN_DATE = '2026-07-29';
// The re-measure behind the retry decision (issue #653), run after the harness
// defect below was fixed.
const RE_MEASURE_DATE = '2026-07-30';

const HARDWARE = {
  local: {
    label: 'Local (cloud dev container)',
    detail: 'Intel Xeon @ 2.80GHz · 4 physical cores · no SMT (1 thread/core) · 15 GB',
  },
  ci: {
    label: 'GitHub Actions ubuntu-latest',
    detail: '4 vCPU · 16 GB · no GPU (Chromium falls back to software rasterization)',
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
  {
    w: 4,
    wall: 60.2,
    runs: 5,
    execs: 1015,
    fails: 2,
    redRuns: 2,
    cpu: 216.1,
    infl: 2.34,
    recommended: true,
  },
  { w: 6, wall: 63.5, runs: 5, execs: 1015, fails: 2, redRuns: 1, cpu: 330.7, infl: 3.58 },
  { w: 8, wall: 60.4, runs: 5, execs: 1015, fails: 9, redRuns: 5, cpu: 401.9, infl: 4.35 },
];

// Targeted re-measure after MAGIC_REVEAL_TIMEOUT went 15s -> 30s (run
// 30476652762). Only 1 and 4 workers were re-extracted: 4 is what CI ships, and
// 1 is the cleanest read on whether a change helps for reasons other than
// contention. The result is genuinely two-sided, so both halves are recorded —
// `shows` names which half its row is the evidence for, and is what the rendered
// table emphasises.
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
  { w: 3, wall: 69.7, runs: 15, execs: 3060, fails: 0, redRuns: 0, recommended: true },
  { w: 4, wall: 66.5, runs: 15, execs: 3060, fails: 6, redRuns: 6 },
  { w: 6, wall: 65.3, runs: 15, execs: 3060, fails: 15, redRuns: 15 },
  { w: 8, wall: 63.9, runs: 15, execs: 3060, fails: 23, redRuns: 15 },
];

// What that re-measure found first, before it could measure anything: the sweep
// was manufacturing most of its own flake rate.
const HARNESS_ARTIFACT = {
  cause:
    'Every rep ran against one shared preview server, and the suite deliberately fills 60-second ' +
    'per-IP rate-limit windows — generate-image.spec.ts exhausts the BYOK bucket and bursts the ' +
    'managed token’s. A rep takes about as long as those windows last, so the next rep inherited a ' +
    'spent budget and its guard tests took a 429 where they assert a 415.',
  evidence: [
    'On ubuntu-latest at 4 workers, “throttles a managed token hammered in a burst” failed in 12 of ' +
      '12 reps — a deterministic failure counted as a flake rate.',
    'Locally at 4 workers, the BYOK guard tests were 4 of 5 failures across 7 reps.',
    'Both are specs the earlier per-worker-count failure columns are largely made of.',
  ],
  fix:
    'scripts/e2e-sweep.mjs starts and stops a preview server per rep, which clears the in-memory ' +
    'limiter and matches what CI does anyway: one server, one suite run.',
};

// What the re-measured numbers mean, and the retry count they settle. Raw HTML so
// a note can mark up a value; keep them factual and short.
const RESIDUAL_NOTES = [
  '<b>The rate is not flat from 1 to 6 workers.</b> It breaks at <b>6</b>, not 8, and 4 workers is ' +
    'already significantly worse than 3 (Fisher p = 0.017). The earlier sweep read it as flat ' +
    'because the artifact fired at every worker count alike, burying the differences under a ' +
    'constant.',
  '<b>So “wall clock decides on CI” cannot rest on that flatness.</b> Four workers buys 2.9s over ' +
    'three (60.2s vs 63.1s) and costs 6/15 unretried-red runs. The shipped coefficient is 1.5× ' +
    'capacity because of this row.',
  '<b>One worker is still among the worst settings</b> (6/15), with no contention to blame — the ' +
    'GPU-less runner rasterizes canvas work in software, so those specs sit near their budgets ' +
    'however few workers run. That is why the curve is a U rather than a slope, and why worker ' +
    'tuning alone was never going to reach zero.',
  '<b>Going past three workers buys almost nothing.</b> 3→4 saves 3.2s per run, 4→8 another 2.6s — ' +
    'against 0/15 red runs becoming 6/15 and then 15/15. The wall-clock curve is flat exactly where ' +
    'the flake curve turns steep.',
];

// Each hypothesis that was tested, and how it was killed or confirmed. The
// falsified ones are the point: they are cheap to re-derive and expensive to
// re-test.
const HYPOTHESES = [
  {
    claim:
      'CPU contention makes Chromium drop or coalesce pointer events, changing stroke geometry',
    verdict: 'falsified',
    how: 'Instrumented the page to count pointermove events and getCoalescedEvents() samples, then repeated the stroke with 12 busy-loop processes saturating every core.',
    result:
      'Identical to idle — 2 pointermove events, 2 coalesced samples, every time. Input delivery is lossless under load.',
  },
  {
    claim:
      'The eraser test under-counts its baseline because `revealed` is captured with a bare, un-polled canvas read',
    verdict: 'falsified',
    how: 'Replaced the bare read with a poll that settles on two equal readings, then re-ran 200 instances at 8 workers.',
    result:
      'Failure rate moved 16/200 → 15/200, i.e. not at all. (The bare read is still an anti-pattern per .claude/rules/testing.md — it just was not this bug.)',
  },
  {
    claim: 'pickBrush() returns before the brush is active, so asserting aria-pressed will fix it',
    verdict: 'falsified',
    how: 'Added `await expect(entry).toHaveAttribute("aria-pressed", "true")` inside pickBrush() and re-ran 200 instances at 8 workers.',
    result:
      '16/200 before, 16/200 after. The spec file header already explains why: the mode reaches the engine through a Svelte $effect, so the BUTTON is correct while the engine is not. Reverted rather than left in as a wait that buys nothing.',
  },
  {
    claim: 'The strokes commit in the wrong brush mode, and a canvas-fill count cannot detect it',
    verdict: 'overturned',
    how: 'Read the actual assertion values out of the failing reports — then, once the engine could be asked directly (ADR-0080), read its committed mode and the painted colours at each failure.',
    result:
      "`revealed` came back as discrete values — 132, 874, 895, 2314 — where ~2314 is a real magic reveal. Redrawing all three sites did take the file from 16/200 to 4/200, so the FIX worked. The reading of 132 did not: those pixels are the coloring page's own colours, not ink, and the engine reported the right mode at every failure across ~700 recorded reveals. It is a magic stroke the engine TRUNCATED — a sample >100ms and >10% of the paper apart reads as a lifted finger (strokeMath.pointerWasResumed), which is exactly what a starved worker dispatching 180px hops produces. Redrawing rescued it by getting a second, luckier stroke. Pacing the samples fixes it at the source, and the retries are gone.",
  },
];

const RE_TUNE = `# 1. Build once. The sweep driver builds nothing, so this is the only build, and
#    PUBLIC_ENABLE_DEV_HARNESS has to be set HERE — it gates the /dev/* routes
#    the specs drive.
PUBLIC_ENABLE_DEV_HARNESS=true ADMIN_ACCESS_TOKEN=test-admin-secret \\
  node scripts/web.mjs vite build

# 2. Sweep. The driver owns the whole protocol: a fresh preview server per rep,
#    CI unset for the run, and one SWEEPRESULT line per rep.
for w in 1 2 3 4 6 8; do
  node scripts/e2e-sweep.mjs --workers=$w --reps=30 --out=runs
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

const styles = `
  main.shell { display: flex; flex-direction: column; gap: 34px; padding-bottom: 64px; }
  .lede { font-size: 17px; color: var(--muted); max-width: 66ch; margin: 0; }
  section { display: flex; flex-direction: column; gap: 14px; }
  section > h2 { margin: 0; font-size: 22px; letter-spacing: -0.01em; }
  section > p { margin: 0; color: var(--muted); max-width: 74ch; }
  .panel { background: var(--card); border: 1px solid var(--hair); border-radius: var(--r-md); padding: 20px 22px; box-shadow: var(--shadow-sm); }
  .verdict { border-left: 4px solid var(--accent); }
  .verdict h3 { margin: 0 0 8px; font-size: 20px; }
  .verdict p { margin: 0 0 10px; color: var(--muted); max-width: 72ch; }
  .verdict p:last-child { margin-bottom: 0; }
  pre { margin: 0; overflow-x: auto; background: var(--card-2); border: 1px solid var(--hair); border-radius: var(--r-sm); padding: 12px 14px; font-size: 12.5px; line-height: 1.5; }
  code { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 0.92em; }
  .tbl-wrap { overflow-x: auto; border: 1px solid var(--hair); border-radius: var(--r-md); background: var(--card); box-shadow: var(--shadow-sm); }
  table { width: 100%; border-collapse: collapse; font-size: 13.5px; min-width: 560px; }
  th { background: var(--card-2); border-bottom: 1px solid var(--hair-strong); text-align: left; padding: 10px 13px; font-size: 11px; letter-spacing: 0.07em; text-transform: uppercase; color: var(--muted); font-weight: 700; white-space: nowrap; }
  td { padding: 9px 13px; border-bottom: 1px solid var(--hair); }
  tr:last-child td { border-bottom: none; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  tr.pick { background: var(--accent-wash); }
  tr.pick td:first-child::after { content: " ← pick"; color: var(--accent-ink); font-weight: 700; font-size: 11px; }
  .bars { display: grid; grid-template-columns: repeat(var(--n), minmax(38px, 1fr)); gap: 8px; align-items: end; height: 150px; padding-top: 18px; border-bottom: 1px solid var(--hair-strong); }
  .bar { position: relative; background: var(--c-purple); border-radius: 4px 4px 0 0; min-height: 2px; }
  .bar.best { background: var(--ok); }
  .bar.bad { background: var(--bad); }
  .bar span { position: absolute; top: -17px; left: 50%; transform: translateX(-50%); font-size: 11px; font-weight: 700; color: var(--muted); font-variant-numeric: tabular-nums; }
  .bar-axis { display: grid; grid-template-columns: repeat(var(--n), minmax(38px, 1fr)); gap: 8px; font-size: 11px; color: var(--faint); text-align: center; margin-top: 6px; }
  .charts { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 20px; }
  .chart-title { font-size: 13px; font-weight: 700; margin: 0 0 2px; }
  .chart-sub { font-size: 12px; color: var(--faint); margin: 0 0 10px; }
  .hyp { display: flex; flex-direction: column; gap: 12px; }
  .hyp-item { border: 1px solid var(--hair); border-radius: var(--r-sm); padding: 14px 16px; background: var(--card); }
  .hyp-item.confirmed { border-left: 4px solid var(--ok); }
  .hyp-item.falsified { border-left: 4px solid var(--bad); }
  .hyp-item.overturned { border-left: 4px solid var(--warn); }
  .hyp-claim { font-weight: 700; margin: 0 0 6px; }
  .hyp-item dl { margin: 0; display: grid; grid-template-columns: max-content 1fr; gap: 3px 12px; font-size: 13.5px; }
  .hyp-item dt { color: var(--faint); font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; padding-top: 3px; }
  .hyp-item dd { margin: 0; color: var(--muted); }
  ul.notes { margin: 0; padding-left: 20px; color: var(--muted); display: flex; flex-direction: column; gap: 7px; }
  .pill { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; border: 1px solid; }
  .pill.confirmed { color: var(--ok); border-color: var(--ok); }
  .pill.falsified { color: var(--bad); border-color: var(--bad); }
  .pill.overturned { color: var(--warn); border-color: var(--warn); }
  .empty-note { color: var(--faint); font-style: italic; }
`;

const s1 = (n) => n.toFixed(1);
const pctFail = (row) => ((row.fails / row.execs) * 100).toFixed(3);

function barChart(values, labels, { format, bestIndex, badIndexes = [] }) {
  const peak = Math.max(...values, 1);
  const bars = values
    .map((v, i) => {
      const cls = ['bar', bestIndex === i ? 'best' : '', badIndexes.includes(i) ? 'bad' : '']
        .filter(Boolean)
        .join(' ');
      const h = v === 0 ? 2 : Math.max(3, (v / peak) * 100);
      return `<div class="${cls}" style="height:${v === 0 ? '2px' : h + '%'}"><span>${esc(format(v))}</span></div>`;
    })
    .join('');
  const axis = labels.map((l) => `<span>${esc(l)}</span>`).join('');
  return `<div class="bars" style="--n:${values.length}">${bars}</div>
    <div class="bar-axis" style="--n:${values.length}">${axis}</div>`;
}

function sweepTable(rows, { pick } = {}) {
  const body = rows
    .map(
      (r) => `<tr${r.w === pick ? ' class="pick"' : ''}>
      <td>${r.w}</td>
      <td class="num">${r.wall ? s1(r.wall) + 's' : '—'}</td>
      <td class="num">${r.redRuns}/${r.runs}</td>
      <td class="num">${r.fails}</td>
      <td class="num">${pctFail(r)}%</td>
      <td class="num">${r.infl ? r.infl.toFixed(2) + '×' : '—'}</td>
      <td class="num">${r.cpu ? s1(r.cpu) + 's' : '—'}</td>
    </tr>`
    )
    .join('');
  return `<div class="tbl-wrap"><table>
    <thead><tr>
      <th>Workers</th><th class="num">Wall (median)</th><th class="num">Red runs</th>
      <th class="num">Failures</th><th class="num">Per-test rate</th>
      <th class="num">Latency inflation</th><th class="num">CPU work</th>
    </tr></thead>
    <tbody>${body}</tbody>
  </table></div>`;
}

// The reverted reveal-budget experiment, emphasising per row whichever column
// that row is the evidence for.
function beforeAfterTable(rows) {
  const cell = (row, column, text) =>
    `<td class="num">${row.shows === column ? `<b>${text}</b>` : text}</td>`;
  const body = rows
    .map(
      (r) => `<tr${r.shipped ? ' class="pick"' : ''}>
      <td>${r.w}${r.shipped ? ' (CI ships this)' : ''}</td>
      ${cell(r, 'fails', `${r.failsBefore} → ${r.fails}`)}
      ${cell(r, 'wall', `${s1(r.wallBefore)}s → ${s1(r.wall)}s`)}
    </tr>`
    )
    .join('');
  return `<div class="tbl-wrap"><table>
    <thead><tr>
      <th>Workers</th><th class="num">Failures before → after</th>
      <th class="num">Wall before → after</th>
    </tr></thead>
    <tbody>${body}</tbody>
  </table></div>`;
}

const harnessPanel = `<div class="panel verdict">
  <h3>First finding: the sweep was measuring itself</h3>
  <p>${esc(HARNESS_ARTIFACT.cause)}</p>
  <ul class="notes">${HARNESS_ARTIFACT.evidence.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>
  <p>${esc(HARNESS_ARTIFACT.fix)}</p>
</div>`;

const residualSection = CI_RESIDUAL.length
  ? sweepTable(CI_RESIDUAL, { pick: CI_RESIDUAL.find((r) => r.recommended)?.w })
  : `<p class="empty-note">Re-measure pending — re-run <code>npm run gen:e2e-tuning-report</code> once the numbers land.</p>`;

const ciSection = CI_SWEEP.length
  ? `${sweepTable(CI_SWEEP, { pick: CI_SWEEP.find((r) => r.recommended)?.w })}`
  : `<p class="empty-note">CI sweep pending — re-run <code>npm run gen:e2e-tuning-report</code> once the numbers land.</p>`;

const body = `
${masthead({
  title: 'E2E tuning — workers, retries, and three real flakes',
  tagline:
    'How many Playwright workers the suite should run with, measured rather than guessed — plus the flake investigation that ran alongside it.',
  crumbs: [{ label: 'Scrapbook', href: '../index.html' }, { label: 'E2E tuning' }],
  home: '../index.html',
  stats: `<span class="chip">${RUN_DATE}</span><span class="chip">59 local runs</span><span class="chip">203 tests each</span>`,
})}

<main class="shell">
  <p class="lede">
    The suite ran at 1, 2, 3, 4, 6 and 8 workers, eight repetitions each, round-robin so machine
    drift could not favour any one configuration. Wall clock stops improving long before the flake
    rate stops rising — this page records where that crossover sits, on which hardware, and what it
    took to separate genuine test bugs from contention.
  </p>

  <section>
    <div class="panel verdict">
      <h3>Two workers locally, four on CI</h3>
      <p>
        The two environments want different settings, for different reasons. Locally
        (<code>retries: 0</code>) a red run costs a re-run plus the attention to triage it, and the
        break-even is only ~15 seconds of attention — so 2 workers wins despite finishing ~10.2s
        later (92.3s vs 82.1s).
        On CI (<code>retries: 2</code>) flakes are absorbed cheaply and the flake rate barely moves
        between 1 and 6 workers, so wall clock decides: 4 workers, the fastest setting measured.
      </p>
      <p>
        One finding holds on both machines: CPU work per run divided by the uncontended baseline
        tracks <strong>w/2</strong>, which means each Playwright worker demands about
        <strong>2 cores</strong> to run unthrottled — a Chromium is several processes, not one.
        Implied cores per worker came out 2.0–2.5 locally and 2.2–2.8 on CI. That is why
        <code>workers: '100%'</code> (one worker per core) oversubscribes on any machine.
      </p>
    </div>
  </section>

  <section>
    <h2>Local sweep — before the test fixes</h2>
    <p>
      ${esc(HARDWARE.local.detail)}. Latency inflation is each test's mean duration divided by its
      own mean at 1 worker. CPU work is the summed duration of every test in the run — it should be
      flat (same 203 tests) and is not, which is the contention tax made visible.
    </p>
    ${sweepTable(LOCAL_PREFIX, { pick: 3 })}
    <div class="panel charts">
      <div>
        <p class="chart-title">Median wall clock</p>
        <p class="chart-sub">lower is better</p>
        ${barChart(
          LOCAL_PREFIX.map((r) => r.wall),
          LOCAL_PREFIX.map((r) => `${r.w}w`),
          { format: (v) => v.toFixed(0) + 's', bestIndex: 3 }
        )}
      </div>
      <div>
        <p class="chart-title">Runs with at least one failure</p>
        <p class="chart-sub">lower is better · out of 8 (w=1: 3)</p>
        ${barChart(
          LOCAL_PREFIX.map((r) => r.redRuns),
          LOCAL_PREFIX.map((r) => `${r.w}w`),
          { format: (v) => String(v), bestIndex: 1, badIndexes: [4, 5] }
        )}
      </div>
    </div>
    <ul class="notes">
      <li><strong>Returns collapse immediately.</strong> 1→2 saves 74.1s; 2→3 saves 9.3s; 3→4 saves 5.1s; 4→6 saves nothing; 6→8 costs 4.4s.</li>
      <li><strong>Fragility becomes systemic past saturation.</strong> Distinct failing tests go 2 → 2 → 10 → 18 across 3, 4, 6, 8 workers — at 8 the failures reach specs with no canvas-timing character at all.</li>
      <li><strong>One worker still flaked</strong> (1 failure in 3 runs), so reducing parallelism alone never reaches a clean suite.</li>
    </ul>
  </section>

  <section>
    <h2>Local sweep — after the test fixes</h2>
    <p>Same hardware, freshly restarted preview server, three magic-brush tests repaired.</p>
    ${sweepTable(LOCAL_POSTFIX, { pick: 3 })}
    <ul class="notes">
      <li>The fixes cleared magic-brush out of the 3- and 4-worker failure lists entirely, and took 6 workers from 0/8 green to 5/8.</li>
      <li>They did <strong>not</strong> move the optimum. At 4 workers the post-fix rate (5/1624) is statistically indistinguishable from the pre-fix rate (3/1624) — a different thin-margin tail simply took over. Contention level dominates; test fixes raise the ceiling.</li>
    </ul>
  </section>

  <section>
    <h2>CI sweep — ${esc(HARDWARE.ci.label)}</h2>
    <p>
      Run one worker count per runner, so configurations never contend with each other. Retries are
      disabled for the measurement (the production config sets <code>retries: 2</code> on CI, which
      would mask the rate being measured).
    </p>
    ${ciSection}
    <ul class="notes">
      <li><b>The flake rate is flat from 1 to 6 workers</b> (1–3 failures per 1015 executions) and only breaks at 8. Contention is not the dominant driver here, which is the opposite of the local result.</li>
      <li><b>One worker was the second-WORST setting</b> — 3 failures, two of them 30s timeouts. With zero contention, that rules contention out as the cause: the runner has no GPU, so Chromium rasterizes the magic-brush reveal in software and the reveal sits near its 15s budget no matter how many workers are running.</li>
      <li><b>Wall clock bottoms out at 4 workers</b> (60.2s). 8 workers is no faster and carries 4.5× the failures.</li>
      <li><b>CI is faster than the local box overall</b> (60–95s vs 81–169s) while being slower at canvas work — a reminder that "faster hardware" is not one number.</li>
    </ul>
    <h2 style="margin-top:12px">Raising the reveal budget: a two-sided result</h2>
    <p>
      The 15s→30s change was made because the CI failures landed <em>at</em> the old budget. Re-measured
      at the two most informative worker counts, it did not do one clean thing:
    </p>
    ${beforeAfterTable(REVEAL_BUDGET_EXPERIMENT)}
    <ul class="notes">
      <li><b>At the shipped CI setting it worked</b> — 5/5 green where 3/5 had been, for ~4.6s of wall clock. Not enough to keep it: see the last bullet.</li>
      <li><b>At one worker it did not.</b> Same three failures, but now costing far more: with <code>test.slow()</code> in play a non-converging reveal burns its full 90s budget instead of failing at 30s, which is what dragged the median run from 95.2s to 138.1s.</li>
      <li><b>What that means:</b> those failures were never time-starved. <code>drawMagicReveal</code> churns draw→check→undo→redraw, and a bigger budget just lets a non-converging loop churn longer. The budget helped where the reveal was merely slow, and did nothing where the loop never converges.</li>
      <li><b>Reverted.</b> At 4 workers the two failures it fixed were already invisible — <code>retries: 2</code> reaches red essentially never at a 2/1015 rate — so the win landed where retries had already paid, while the cost (a stuck reveal exceeding the suite's parallel floor and becoming its critical path) was real. The genuinely-slow cases are worth fixing by bounding the churn instead.</li>
    </ul>
  </section>

  <section>
    <h2>Re-measured, ${esc(RE_MEASURE_DATE)} — and the retry decision</h2>
    <p>
      Every rate above was measured with one preview server shared across a configuration's reps.
      That turned out to be most of what was being measured, so the retry question could not be
      answered until the harness was fixed.
    </p>
    ${harnessPanel}
    <p>
      Re-run on the same runner image with an independent server per rep. <b>Red runs</b> is the
      column a retry count is chosen against: retries only pay for themselves against the rate at
      which an unretried run goes red.
    </p>
    ${residualSection}
    ${RESIDUAL_NOTES.length ? `<ul class="notes">${RESIDUAL_NOTES.map((n) => `<li>${n}</li>`).join('')}</ul>` : ''}
  </section>

  <section>
    <h2>What was tried</h2>
    <p>
      Three of these four hypotheses were wrong. They are recorded because they are cheap to think
      of again and expensive to re-test.
    </p>
    <div class="hyp">
      ${HYPOTHESES.map(
        (h) => `<div class="hyp-item ${h.verdict}">
        <p class="hyp-claim">${esc(h.claim)} <span class="pill ${h.verdict}">${esc(h.verdict)}</span></p>
        <dl>
          <dt>How</dt><dd>${esc(h.how)}</dd>
          <dt>Result</dt><dd>${esc(h.result)}</dd>
        </dl>
      </div>`
      ).join('')}
    </div>
  </section>

  <section>
    <h2>Re-tuning later</h2>
    <p>
      The numbers above are specific to their hardware. The shape of the curve (saturation near
      cores−1) should transfer; the optimum will not. To re-measure:
    </p>
    <pre><code>${esc(RE_TUNE)}</code></pre>
    <p>
      Then replace the datasets at the top of <code>scripts/gen-e2e-tuning-report.mjs</code> and run
      <code>npm run gen:e2e-tuning-report</code>. The decision and its reasoning live in
      <a href="https://github.com/KyleMit/Splotch/blob/main/docs/adrs/0078-playwright-worker-count-and-flake-tuning.md">ADR-0078</a>.
    </p>
  </section>
</main>

${siteFooter({ home: '../index.html' })}`;

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
