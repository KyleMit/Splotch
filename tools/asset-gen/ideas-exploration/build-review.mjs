import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = dirname(fileURLToPath(import.meta.url));
const IDEAS_DIR = ROOT;
const OUT = join(ROOT, "ideas-review.html");

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

async function inlineImage(ideaDir, file) {
  const p = join(ideaDir, file);
  if (!existsSync(p)) return null;
  try {
    const buf = await sharp(p)
      .resize(480, 480, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 65 })
      .toBuffer();
    return `data:image/webp;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

function list(title, items, cls = "") {
  if (!items || !items.length) return "";
  return `<div class="finding-group ${cls}"><h4>${esc(title)}</h4><ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul></div>`;
}

const VERDICT_META = {
  WORKED: { label: "Worked", cls: "v-worked" },
  PARTIAL: { label: "Partial", cls: "v-partial" },
  BLOCKED: { label: "Blocked", cls: "v-blocked" },
};

async function build() {
  const dirs = existsSync(IDEAS_DIR)
    ? readdirSync(IDEAS_DIR)
        .filter((d) => /^idea-\d+$/.test(d))
        .sort((a, b) => Number(a.split("-")[1]) - Number(b.split("-")[1]))
    : [];
  const ideas = [];
  for (const d of dirs) {
    const metaPath = join(IDEAS_DIR, d, "meta.json");
    if (!existsSync(metaPath)) continue;
    try {
      ideas.push({
        dir: join(IDEAS_DIR, d),
        meta: JSON.parse(readFileSync(metaPath, "utf8")),
      });
    } catch (e) {
      console.error(`bad meta.json in ${d}: ${e.message}`);
    }
  }

  const rows = ideas
    .map(({ meta }) => {
      const v = VERDICT_META[meta.verdict] ?? { label: meta.verdict, cls: "" };
      return `<tr><td class="num">${meta.idea}</td><td><a href="#idea-${meta.idea}">${esc(meta.title)}</a></td><td><span class="chip ${v.cls}">${v.label}</span></td><td class="oneline">${esc(meta.oneline ?? "")}</td></tr>`;
    })
    .join("\n");

  const sections = [];
  for (const { dir, meta } of ideas) {
    const v = VERDICT_META[meta.verdict] ?? { label: meta.verdict, cls: "" };
    let comparisons = "";
    for (const c of meta.comparisons ?? []) {
      const before = await inlineImage(dir, c.before);
      const after = await inlineImage(dir, c.after);
      if (!before && !after) continue;
      comparisons += `<figure class="compare">
        <figcaption>${esc(c.label)}${c.note ? ` — <span class="note">${esc(c.note)}</span>` : ""}</figcaption>
        <div class="pair">
          ${before ? `<div class="shot"><span class="tag">Before</span><img src="${before}" alt="Before: ${esc(c.label)}"></div>` : ""}
          ${after ? `<div class="shot"><span class="tag tag-after">After</span><img src="${after}" alt="After: ${esc(c.label)}"></div>` : ""}
        </div>
      </figure>`;
    }
    let singles = "";
    for (const im of meta.images ?? []) {
      const src = await inlineImage(dir, im.file);
      if (!src) continue;
      singles += `<figure class="single"><img src="${src}" alt="${esc(im.caption)}"><figcaption>${esc(im.caption)}</figcaption></figure>`;
    }
    let code = "";
    for (const c of meta.code ?? []) {
      const p = join(dir, c.file);
      if (!existsSync(p)) continue;
      let content = readFileSync(p, "utf8");
      if (content.length > 12000)
        content = content.slice(0, 12000) + "\n… (truncated)";
      code += `<details class="code"><summary>${esc(c.title)}</summary><div class="codewrap"><pre><code>${esc(content)}</code></pre></div></details>`;
    }
    sections.push(`<section class="idea" id="idea-${meta.idea}">
      <header>
        <h2><span class="idea-num">#${meta.idea}</span> ${esc(meta.title)}</h2>
        <span class="chip ${v.cls}">${v.label}</span>
      </header>
      <p class="summary">${esc(meta.summary)}</p>
      <div class="findings">
        ${list("Tried", meta.tried)}
        ${list("Worked", meta.worked, "good")}
        ${list("Didn't work", meta.failed, "bad")}
        ${list("Limitations", meta.limitations, "warn")}
      </div>
      ${comparisons}
      ${singles ? `<div class="singles">${singles}</div>` : ""}
      ${code}
    </section>`);
  }

  const done = ideas.length;
  const counts = { WORKED: 0, PARTIAL: 0, BLOCKED: 0 };
  for (const { meta } of ideas)
    if (counts[meta.verdict] != null) counts[meta.verdict]++;

  const html = `<title>Splotch asset-gen — IDEAS.md burn-down</title>
<style>
:root {
  --paper: #f7f6f2;
  --card: #ffffff;
  --ink: #26292e;
  --muted: #6b7078;
  --line: #e2e0d9;
  --accent: #3565d4;
  --good: #237a4b; --good-bg: #e2f2e8;
  --warn: #8a6410; --warn-bg: #f7ecd2;
  --bad: #b03434; --bad-bg: #f9e3e0;
  --codebg: #f0efe9;
}
@media (prefers-color-scheme: dark) {
  :root {
    --paper: #1d2025; --card: #262a31; --ink: #e8e6e1; --muted: #9aa0a8;
    --line: #383d45; --accent: #7ea3f0;
    --good: #7fd6a4; --good-bg: #1e3a2b;
    --warn: #e6c273; --warn-bg: #3d321c;
    --bad: #ef9e93; --bad-bg: #46231f;
    --codebg: #1a1d21;
  }
}
:root[data-theme="dark"] {
  --paper: #1d2025; --card: #262a31; --ink: #e8e6e1; --muted: #9aa0a8;
  --line: #383d45; --accent: #7ea3f0;
  --good: #7fd6a4; --good-bg: #1e3a2b;
  --warn: #e6c273; --warn-bg: #3d321c;
  --bad: #ef9e93; --bad-bg: #46231f;
  --codebg: #1a1d21;
}
:root[data-theme="light"] {
  --paper: #f7f6f2; --card: #ffffff; --ink: #26292e; --muted: #6b7078;
  --line: #e2e0d9; --accent: #3565d4;
  --good: #237a4b; --good-bg: #e2f2e8;
  --warn: #8a6410; --warn-bg: #f7ecd2;
  --bad: #b03434; --bad-bg: #f9e3e0;
  --codebg: #f0efe9;
}
body { background: var(--paper); color: var(--ink); font: 16px/1.55 system-ui, -apple-system, 'Segoe UI', sans-serif; margin: 0; padding: 2.5rem 1.25rem 5rem; }
main { max-width: 880px; margin: 0 auto; }
h1 { font-family: 'Avenir Next', Seravek, ui-rounded, system-ui, sans-serif; font-size: 1.9rem; line-height: 1.2; text-wrap: balance; margin: 0 0 .4rem; }
.subtitle { color: var(--muted); margin: 0 0 2rem; max-width: 65ch; }
.tally { display: flex; gap: .6rem; flex-wrap: wrap; margin: 0 0 1.5rem; }
.tally .chip { font-size: .85rem; }
table.index { width: 100%; border-collapse: collapse; background: var(--card); border: 1px solid var(--line); border-radius: 8px; overflow: hidden; font-size: .92rem; }
.indexwrap { overflow-x: auto; margin-bottom: 3rem; }
table.index th { text-align: left; font-size: .72rem; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); padding: .55rem .75rem; border-bottom: 1px solid var(--line); }
table.index td { padding: .5rem .75rem; border-bottom: 1px solid var(--line); vertical-align: top; }
table.index tr:last-child td { border-bottom: none; }
table.index .num { color: var(--muted); font-variant-numeric: tabular-nums; }
table.index a { color: var(--accent); text-decoration: none; }
table.index a:hover, table.index a:focus-visible { text-decoration: underline; }
.oneline { color: var(--muted); font-size: .86rem; }
.chip { display: inline-block; padding: .12rem .6rem; border-radius: 99px; font-size: .78rem; font-weight: 600; letter-spacing: .02em; white-space: nowrap; }
.v-worked { background: var(--good-bg); color: var(--good); }
.v-partial { background: var(--warn-bg); color: var(--warn); }
.v-blocked { background: var(--bad-bg); color: var(--bad); }
section.idea { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 1.5rem 1.75rem; margin-bottom: 2rem; }
section.idea header { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin-bottom: .5rem; }
section.idea h2 { font-family: 'Avenir Next', Seravek, ui-rounded, system-ui, sans-serif; font-size: 1.25rem; margin: 0; text-wrap: balance; }
.idea-num { color: var(--accent); margin-right: .25rem; }
.summary { max-width: 68ch; margin: 0 0 1rem; }
.findings { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: .9rem 1.4rem; margin-bottom: 1.1rem; }
.finding-group h4 { margin: 0 0 .25rem; font-size: .74rem; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
.finding-group.good h4 { color: var(--good); }
.finding-group.bad h4 { color: var(--bad); }
.finding-group.warn h4 { color: var(--warn); }
.finding-group ul { margin: 0; padding-left: 1.1rem; font-size: .92rem; }
.finding-group li { margin-bottom: .2rem; }
figure.compare { margin: 1.25rem 0; }
figure.compare figcaption { font-size: .88rem; font-weight: 600; margin-bottom: .5rem; }
figure.compare .note { font-weight: 400; color: var(--muted); }
.pair { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: .75rem; }
.shot { position: relative; }
.shot img { width: 100%; height: auto; display: block; border-radius: 6px; border: 1px solid var(--line); background: #111; }
.shot .tag { position: absolute; top: .5rem; left: .5rem; background: rgba(20,20,24,.72); color: #eee; font-size: .68rem; font-weight: 600; text-transform: uppercase; letter-spacing: .07em; padding: .12rem .5rem; border-radius: 4px; }
.shot .tag-after { background: rgba(35,90,60,.82); }
.singles { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: .75rem; margin: 1.25rem 0; }
figure.single { margin: 0; }
figure.single img { width: 100%; height: auto; display: block; border-radius: 6px; border: 1px solid var(--line); }
figure.single figcaption { font-size: .82rem; color: var(--muted); margin-top: .3rem; }
details.code { margin: .75rem 0; border: 1px solid var(--line); border-radius: 8px; background: var(--codebg); }
details.code summary { cursor: pointer; padding: .55rem .9rem; font-family: ui-monospace, 'Cascadia Mono', Menlo, monospace; font-size: .84rem; font-weight: 600; }
details.code summary:focus-visible { outline: 2px solid var(--accent); }
.codewrap { overflow-x: auto; padding: 0 .9rem .75rem; }
.codewrap pre { margin: 0; font: .8rem/1.5 ui-monospace, 'Cascadia Mono', Menlo, monospace; }
footer { color: var(--muted); font-size: .85rem; margin-top: 3rem; }
</style>
<main>
  <h1>Splotch asset-gen — IDEAS.md burn-down</h1>
  <p class="subtitle">One subagent per idea from <code>tools/asset-gen/IDEAS.md</code>, run sequentially. Each attempted the proposed approach, recorded what worked and what didn't, and reverted all repo changes before exiting. ${done} of 25 ideas explored so far.</p>
  <div class="tally">
    <span class="chip v-worked">${counts.WORKED} worked</span>
    <span class="chip v-partial">${counts.PARTIAL} partial</span>
    <span class="chip v-blocked">${counts.BLOCKED} blocked</span>
  </div>
  <div class="indexwrap"><table class="index">
    <thead><tr><th>#</th><th>Idea</th><th>Verdict</th><th>Outcome</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>
  ${sections.join("\n")}
  <footer>Generated from per-idea reports in the session scratchpad. Repo state was reverted to baseline (8e471b8) after every attempt — nothing here is committed.</footer>
</main>`;

  writeFileSync(OUT, html.replace(/[\uFFFD\uD800-\uDFFF]/g, ""));
  const kb = Math.round(Buffer.byteLength(html) / 1024);
  console.log(`wrote ${OUT} (${kb} KB, ${done} ideas)`);
}

await build();
