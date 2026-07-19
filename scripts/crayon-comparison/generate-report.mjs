import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { ROOT } from '../lib/utils.mjs';
import { esc, masthead, page, siteFooter } from '../lib/artifact-chrome.mjs';

const REPORT_DIR = join(ROOT, 'artifacts/crayon-brush-comparison');
const ATTEMPTS_DIR = join(REPORT_DIR, 'attempts');
const REFERENCES_DIR = join(ROOT, 'artifacts/crayon-brush-samples');
const RANKINGS_PATH = join(REPORT_DIR, 'rankings.json');
const SCENES = [
  { id: '01-single-line', label: 'Single line', reference: '1-line-blue.webp' },
  {
    id: '02-continuous-retrace',
    label: 'Continuous retrace',
    reference: '4-scribble-backforth-blue.webp',
  },
  { id: '03-lifted-buildup', label: 'Lifted buildup', reference: '2-buildup-red.webp' },
  { id: '04-color-crossing', label: 'Color crossing', reference: '3-cross-red-blue.webp' },
  { id: '05-toddler-drawing', label: 'Full drawing', reference: '4-scribble-wild-multi.webp' },
];

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const rankings = existsSync(RANKINGS_PATH) ? readJson(RANKINGS_PATH) : { attempts: [] };
const rankingsByPr = new Map(
  (rankings.attempts ?? []).map((ranking) => [Number(ranking.pr), ranking])
);
const naturalEntries = (value) =>
  value && typeof value === 'object' && !Array.isArray(value) ? Object.entries(value) : [];
const hasRank = (attempt) => Number.isFinite(Number(attempt.metadata.rank));

function attemptDirectories() {
  if (!existsSync(ATTEMPTS_DIR)) return [];
  return readdirSync(ATTEMPTS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^pr-\d+$/.test(entry.name))
    .map((entry) => join(ATTEMPTS_DIR, entry.name));
}

function loadAttempt(directory) {
  const metadataPath = join(directory, 'metadata.json');
  const capturePath = join(directory, 'capture.json');
  if (!existsSync(metadataPath) || !existsSync(capturePath)) return null;
  const metadata = readJson(metadataPath);
  const capture = readJson(capturePath);
  const pr = Number(metadata.pr ?? basename(directory).replace('pr-', ''));
  const ranking = rankingsByPr.get(pr);
  if (ranking) {
    metadata.rank = ranking.rank;
    metadata.score = ranking.total;
    metadata.scores = ranking.scores;
    metadata.rankingRationale = ranking.rationale;
  }
  return { directory, metadata, capture, pr };
}

function compareAttempts(a, b) {
  if (hasRank(a) && hasRank(b)) return Number(a.metadata.rank) - Number(b.metadata.rank);
  if (hasRank(a) !== hasRank(b)) return hasRank(a) ? -1 : 1;
  return b.pr - a.pr;
}

function displayValue(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'pass' : 'fail';
  if (Array.isArray(value)) return value.map(displayValue).join(', ');
  if (typeof value === 'object') {
    return naturalEntries(value)
      .map(([key, child]) => `${key}: ${displayValue(child)}`)
      .join(' · ');
  }
  return String(value);
}

function activationLabel(metadata, capture) {
  const activation = metadata.activation ?? capture.results?.[0]?.activation;
  if (Array.isArray(activation)) return activation.map(displayValue).join(' = ');
  if (activation?.strategy === 'setter')
    return `${activation.setter} = ${displayValue(activation.value)}`;
  return displayValue(activation);
}

function metricRows(metadata) {
  const scoreSource = metadata.scores ?? metadata.scoreComponents ?? metadata.score_components;
  const gateSource = metadata.gates ?? metadata.qualityGates ?? metadata.quality_gates;
  const rows = [
    ...naturalEntries(scoreSource).map(([name, value]) => ({ kind: 'score', name, value })),
    ...naturalEntries(gateSource).map(([name, value]) => ({ kind: 'gate', name, value })),
  ];
  if (!rows.length && metadata.score !== undefined)
    rows.push({ kind: 'score', name: 'overall', value: metadata.score });
  return rows;
}

function failures(metadata) {
  const value = metadata.failures ?? metadata.failureReasons ?? metadata.failure_reasons;
  if (value === undefined || value === null || value === '') return [];
  return Array.isArray(value) ? value : [value];
}

function imageCell(src, label, missing = false) {
  return `<figure class="scene${missing ? ' missing' : ''}">
    ${missing ? `<div class="missing-art">Missing capture</div>` : `<a href="${esc(src)}"><img src="${esc(src)}" alt="${esc(label)}" loading="lazy"/></a>`}
    <figcaption>${esc(label)}</figcaption>
  </figure>`;
}

function sceneGrid(attempt) {
  const results = new Map((attempt.capture.results ?? []).map((result) => [result.scene, result]));
  return `<div class="scene-grid">${SCENES.map((scene) => {
    const result = results.get(scene.id);
    const file = result?.file ?? `${scene.id}.webp`;
    const absolute = join(attempt.directory, file);
    const src = relative(REPORT_DIR, absolute).replaceAll('\\', '/');
    return imageCell(src, scene.label, !existsSync(absolute));
  }).join('')}</div>`;
}

function attemptCard(attempt) {
  const { metadata } = attempt;
  const metrics = metricRows(metadata);
  const attemptFailures = failures(metadata);
  const rank = hasRank(attempt) ? `<span class="rank">Rank ${esc(metadata.rank)}</span>` : '';
  return `<article class="attempt" id="pr-${attempt.pr}">
    <header class="attempt-head">
      <div><div class="eyebrow">PR ${attempt.pr}</div><h2><a href="https://github.com/KyleMit/Splotch/pull/${attempt.pr}">${esc(metadata.title ?? `Pull request ${attempt.pr}`)}</a></h2></div>
      ${rank}
    </header>
    <div class="attempt-meta">
      <span class="chip"><b>Activation</b> ${esc(activationLabel(metadata, attempt.capture))}</span>
      ${metadata.headSha ? `<span class="chip"><b>SHA</b> <code>${esc(String(metadata.headSha).slice(0, 10))}</code></span>` : ''}
    </div>
    ${sceneGrid(attempt)}
    <div class="assessment">
      <div><h3>Evaluator notes</h3><p>${esc(metadata.visualNotes ?? metadata.notes ?? 'No evaluator notes yet.')}</p>${metadata.rankingRationale ? `<p class="ranking-note"><b>Ranking:</b> ${esc(metadata.rankingRationale)}</p>` : ''}</div>
      <div><h3>Scores &amp; gates</h3>${metrics.length ? `<dl>${metrics.map(({ kind, name, value }) => `<div class="metric ${kind}"><dt>${esc(name)}</dt><dd>${esc(displayValue(value))}</dd></div>`).join('')}</dl>` : '<p class="muted">Not scored yet.</p>'}</div>
      <div><h3>Failures</h3>${attemptFailures.length ? `<ul class="failures">${attemptFailures.map((failure) => `<li>${esc(displayValue(failure))}</li>`).join('')}</ul>` : '<p class="muted">None recorded.</p>'}</div>
    </div>
  </article>`;
}

const attempts = attemptDirectories().map(loadAttempt).filter(Boolean).sort(compareAttempts);
const rankedCount = attempts.filter(hasRank).length;
const referenceGrid = `<div class="scene-grid reference-grid">${SCENES.map((scene) => {
  const absolute = join(REFERENCES_DIR, scene.reference);
  const src = relative(REPORT_DIR, absolute).replaceAll('\\', '/');
  return imageCell(src, scene.label, !existsSync(absolute));
}).join('')}</div>`;

const EXTRA_CSS = `
.intro{max-width:78ch;color:var(--muted);margin:0 0 22px}.reference,.attempt{background:var(--card);border:1px solid var(--hair);border-radius:var(--r-lg);box-shadow:var(--shadow-sm);padding:clamp(14px,2.5vw,24px);margin-bottom:24px}.reference h2,.attempt h2{margin:0;font-size:1.22rem;line-height:1.25}.scene-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin-top:16px}.scene{margin:0;min-width:0}.scene a{display:block}.scene img,.missing-art{display:block;width:100%;aspect-ratio:1024/559;object-fit:cover;background:#f7f4ec;border:1px solid var(--hair);border-radius:var(--r-sm)}.scene img{transition:transform .12s,box-shadow .12s}.scene img:hover{transform:translateY(-2px);box-shadow:var(--shadow-md)}.scene figcaption{font-size:.76rem;color:var(--muted);padding-top:6px}.missing-art{display:grid;place-items:center;color:var(--bad);font-size:.76rem}.attempt-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}.rank{flex:none;background:var(--ink);color:var(--paper);border-radius:999px;padding:5px 12px;font-size:.78rem;font-weight:750}.attempt-meta{display:flex;flex-wrap:wrap;gap:8px;margin-top:11px}.assessment{display:grid;grid-template-columns:minmax(0,2fr) repeat(2,minmax(180px,1fr));gap:20px;margin-top:19px;padding-top:17px;border-top:1px solid var(--hair)}.assessment h3{font-size:.82rem;text-transform:uppercase;letter-spacing:.08em;margin:0 0 7px;color:var(--muted)}.assessment p{margin:0}.muted{color:var(--faint)}dl{margin:0}.metric{display:flex;justify-content:space-between;gap:10px;padding:4px 0;border-bottom:1px solid var(--hair);font-size:.82rem}.metric:last-child{border:0}.metric dt{color:var(--muted)}.metric dd{margin:0;font-weight:700;text-align:right}.failures{margin:0;padding-left:18px;color:var(--bad);font-size:.86rem}@media(max-width:900px){.scene-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.assessment{grid-template-columns:1fr 1fr}.assessment>div:first-child{grid-column:1/-1}}@media(max-width:560px){.scene-grid,.assessment{grid-template-columns:1fr}.assessment>div:first-child{grid-column:auto}.attempt-head{display:block}.rank{display:inline-block;margin-top:9px}}
`;

const stats = `<span class="chip accent"><b>${attempts.length}</b> attempts</span><span class="chip"><b>${rankedCount}</b> ranked</span><span class="chip"><b>${SCENES.length}</b> scenes each</span>`;
const body = `${masthead({
  title: 'Crayon brush comparison',
  tagline:
    'Identical deterministic drawings across independent crayon implementations, compared against real-crayon reference samples. Ranked candidates appear <b>worst to best</b>; unranked candidates follow by PR number.',
  home: '../index.html',
  crumbs: [{ label: 'Artifacts', href: '../index.html' }, { label: 'Crayon brush comparison' }],
  stats,
})}<main><div class="shell">
  <section class="reference"><div class="eyebrow">North star</div><h2>Real crayon references</h2><p class="intro">Representative examples from the committed crayon sample set. They anchor paper tooth, buildup, color interaction, and full-drawing character.</p>${referenceGrid}</section>
  <div class="section-head"><h2>Implementation attempts</h2><span class="desc">Worst to best once ranked</span></div>
  ${attempts.length ? attempts.map(attemptCard).join('\n') : '<p class="empty">No completed captures yet.</p>'}
</div></main>${siteFooter({ home: '../index.html' })}`;

const html = page({
  title: `Crayon brush comparison — ${attempts.length} attempts`,
  extraCss: EXTRA_CSS,
  body,
});
const manifest = {
  schemaVersion: 1,
  sceneSpec: 'crayon-comparison-v1',
  order: 'rank-worst-to-best-then-pr-descending',
  scenes: SCENES,
  attempts: attempts.map((attempt) => ({
    pr: attempt.pr,
    rank: hasRank(attempt) ? Number(attempt.metadata.rank) : null,
    title: attempt.metadata.title ?? null,
    headSha: attempt.metadata.headSha ?? null,
    activation: attempt.metadata.activation ?? attempt.capture.results?.[0]?.activation ?? null,
    directory: relative(REPORT_DIR, attempt.directory).replaceAll('\\', '/'),
    captureSchemaVersion: attempt.capture.schemaVersion ?? null,
  })),
};

mkdirSync(REPORT_DIR, { recursive: true });
writeFileSync(join(REPORT_DIR, 'index.html'), html);
writeFileSync(join(REPORT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`wrote ${join(REPORT_DIR, 'index.html')} (${attempts.length} attempts)`);
console.log(`wrote ${join(REPORT_DIR, 'manifest.json')}`);
