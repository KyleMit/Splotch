#!/usr/bin/env node
// Builds the drag-to-clear sound contact sheet under scrapbook/sound-design/.
//
// The committed assets/ directory is the source of truth for the audio: this
// generator re-emits the page from whatever clips are sitting there, so running
// it twice is a no-op. `--from <dir>` imports freshly generated clips (see
// sounds.json for every prompt), and `--inline <file>` writes a second,
// fully self-contained copy with the audio embedded as data: URIs for sharing
// somewhere that cannot serve the assets folder.

import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { masthead, page, siteFooter } from '../lib/scrapbook-chrome.mjs';
import { esc } from '../../lib/html.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../..');
const OUT_DIR = join(REPO, 'scrapbook/sound-design/clear-sound-contact-sheet');
const ASSET_DIR = join(OUT_DIR, 'assets');
const SHIPPED_POP = join(REPO, 'web/static/sounds/clear-pop.mp3');
const SHIPPED_POP_NAME = 'baseline-clear-pop';
const PAGE_TITLE = 'Drag-to-clear sound options';

const { values: args } = parseArgs({
  options: { from: { type: 'string' }, inline: { type: 'string' } },
  allowPositionals: false,
});

await mkdir(ASSET_DIR, { recursive: true });
if (args.from) await importClips(resolve(args.from));
await copyFile(SHIPPED_POP, join(ASSET_DIR, `${SHIPPED_POP_NAME}.mp3`));
await copyFile(join(HERE, 'sheet.js'), join(ASSET_DIR, 'sheet.js'));

const provenance = JSON.parse(await readFile(join(HERE, 'sounds.json'), 'utf8'));
const clipNames = (await readdir(ASSET_DIR))
  .filter((file) => file.endsWith('.mp3'))
  .map((file) => basename(file, '.mp3'))
  .sort();

const css = await readFile(join(HERE, 'sheet.css'), 'utf8');
const script = await readFile(join(HERE, 'sheet.js'), 'utf8');

await writeFile(
  join(OUT_DIR, 'index.html'),
  render({
    manifest: clipNames.map((name) => ({ name, url: `assets/${name}.mp3` })),
    scriptTag: '<script src="assets/sheet.js"></script>',
  })
);
console.log(`Wrote ${join(OUT_DIR, 'index.html')} (${clipNames.length} clips)`);

if (args.inline) {
  const manifest = [];
  for (const name of clipNames) {
    const bytes = await readFile(join(ASSET_DIR, `${name}.mp3`));
    manifest.push({ name, url: `data:audio/mpeg;base64,${bytes.toString('base64')}` });
  }
  const target = resolve(args.inline);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, render({ manifest, scriptTag: `<script>\n${script}\n</script>` }));
  console.log(`Wrote ${target} (self-contained)`);
}

async function importClips(sourceDir) {
  const files = (await readdir(sourceDir)).filter((file) => file.endsWith('.mp3'));
  for (const file of files) await copyFile(join(sourceDir, file), join(ASSET_DIR, file));
  console.log(`Imported ${files.length} clip(s) from ${sourceDir}`);
}

function render({ manifest, scriptTag }) {
  const body = `${masthead({
    title: PAGE_TITLE,
    tagline:
      'Seven ways the Clear button could sound, next to a level-matched port of what ships ' +
      'today. Press a trash button and drag away from it — every option answers the same four ' +
      'calls the real app makes.',
    crumbs: [
      { label: 'Scrapbook', href: '../../index.html' },
      { label: 'Sound design', href: '../' },
      { label: 'Drag-to-clear options' },
    ],
    home: '../../index.html',
    stats:
      `<span class="chip accent" data-option-count></span>` +
      `<span class="chip"><b>${manifest.length}</b> clips</span>` +
      `<span class="chip" data-preset-count></span>`,
  })}
<main><div class="shell">
  <div class="controlbar">
    <button class="solid" type="button" data-enable>Turn sound on</button>
    <span class="status" data-status>Audio is off until you tap.</span>
    <label class="field"><span>Volume</span><input type="range" min="0" max="1" step="0.01" data-volume/></label>
    <label class="field"><input type="checkbox" data-ready-bell/><span>Threshold bell</span></label>
    <label class="field"><span>Run</span><select data-sequence-preset></select></label>
    <button class="ghost" type="button" data-sequence-run>across all options</button>
    <button class="ghost" type="button" data-stop>Stop</button>
  </div>

  <section class="intro">
    <ol>
      <li><b>Turn sound on</b> — browsers need one tap before audio can start.</li>
      <li><b>Press a trash button and drag away from it.</b> The dashed ring is the commit threshold; past it the card goes ready. Release inside to cancel, outside to clear.</li>
      <li><b>Or run a scripted gesture</b> — the same five hand shapes on every option, so the comparison is fair.</li>
      <li><b>Then run one gesture across every option</b> from the bar above and let it play down the page.</li>
    </ol>
    <p class="tagline">Headphones or a real tablet speaker both matter here: the drag beds live in a
    band that small speakers roll off, and that is exactly the device a two-year-old is holding.</p>
  </section>

  <div class="section-head"><h2>Options</h2><span class="desc">start / update(progress) / commit / cancel — the same contract as drawingSound.ts</span></div>
  <div class="options" data-options></div>

  <div class="section-head"><h2>One-shot bench</h2><span class="desc">every commit, cancel, and threshold clip on its own, to mix and match above</span></div>
  <div class="bench" data-bench-oneshots></div>

  <div class="section-head"><h2>Beds and sources</h2><span class="desc">the loops and long recordings the continuous options are built from — 3 s preview</span></div>
  <div class="bench" data-bench-beds></div>

  <div class="section-head"><h2>Provenance</h2><span class="desc">every clip is ElevenLabs ${esc(provenance.model)} at ${esc(provenance.outputFormat)}; prompts are committed in tools/scrapbook/clear-sound-sheet/sounds.json</span></div>
  <details class="notes"><summary>Show the ${provenance.clips.length} generation prompts</summary>${provenanceTable()}</details>
</div></main>
${siteFooter({ home: '../../index.html' })}
<script>window.CLEAR_SHEET_SOUNDS = ${JSON.stringify(manifest)};</script>
${scriptTag}`;

  return page({ title: `${PAGE_TITLE} · Splotch Scrapbook`, extraCss: css, body });
}

function provenanceTable() {
  const rows = provenance.clips
    .map(
      (clip) =>
        `<tr><td><code>${esc(clip.name)}</code></td><td>${clip.durationSeconds}s${
          clip.loop ? ' · loop' : ''
        } · influence ${clip.promptInfluence}</td><td>${esc(clip.prompt)}</td></tr>`
    )
    .join('');
  return `<div style="overflow-x:auto"><table style="border-collapse:collapse;width:100%;font-size:.84rem;margin-top:10px">
    <thead><tr style="text-align:left;color:var(--muted)"><th>Clip</th><th>Settings</th><th>Prompt</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}
