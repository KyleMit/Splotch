#!/usr/bin/env node
// Builds the drag-to-clear sound contact sheet under scrapbook/sound-design/.
//
// The committed assets/ directory is the source of truth for the audio: this
// generator re-emits the page from whatever clips are sitting there, so running
// it twice is a no-op. That includes baseline-clear-pop.mp3, which the app no
// longer ships — the sheet is the record of a comparison, so its copy of the
// sound that lost stays put rather than tracking web/static/. `--from <dir>` imports freshly generated clips (see
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

const PAGE_TITLE = 'Drag-to-clear sound options';

const { values: args } = parseArgs({
  options: { from: { type: 'string' }, inline: { type: 'string' } },
  allowPositionals: false,
});

await mkdir(ASSET_DIR, { recursive: true });
if (args.from) await importClips(resolve(args.from));
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
      'Candidate sounds for the gesture that clears the canvas. Press a trash button, drag it ' +
      'away, and let go past the ring. Every card runs the same gesture through a different sound.',
    crumbs: [
      { label: 'Scrapbook', href: '../../index.html' },
      { label: 'Sound design', href: '../' },
      { label: 'Drag-to-clear options' },
    ],
    home: '../../index.html',
    stats:
      `<span class="chip accent" data-option-count></span>` +
      `<span class="chip" data-secondary-count></span>` +
      `<span class="chip"><b>${manifest.length}</b> clips</span>`,
  })}
<main><div class="shell">
  <div class="toolbar" data-toolbar>
    <button class="solid sound-toggle" type="button" data-enable aria-pressed="false">
      <span class="sound-icon" aria-hidden="true"></span><span class="sound-label">Turn sound on</span>
    </button>
    <label class="field volume"><span>Volume</span><input type="range" min="0" max="1" step="0.01" data-volume aria-label="Volume"/></label>
    <label class="field gesture"><span>Gesture</span><select data-gesture aria-label="Scripted gesture"></select></label>
    <button class="ghost" type="button" data-sequence-run title="Play the selected gesture on every card, one after another">Play on every card</button>
    <button class="ghost stop" type="button" data-stop>Stop</button>
    <span class="status" data-status aria-live="polite">Sound is off until you tap.</span>
  </div>

  <div class="outcome">
    <span class="eyebrow">Shipped</span>
    <p><b>Bubble Ladder, Keep climbing past the ring, crisp page turn on release.</b>
    It lives in <code>drawingSound.ts</code> and ADR-0131 records why. Everything else here stays playable so the comparison can be re-run.</p>
  </div>

  <section class="howto" aria-label="How to use this sheet">
    <div class="step"><b>1. Turn sound on.</b> Browsers block audio until you tap something. Any play button or trash button counts.</div>
    <div class="step"><b>2. Drag a trash button.</b> Cross the dashed ring to arm the clear. Let go inside the ring to cancel, outside it to clear.</div>
    <div class="step"><b>3. Change “Past the ring”.</b> Then play <b>Hold at ready</b>. That picker is what this sheet was built to compare.</div>
  </section>
  <p class="aside">Use headphones or a real tablet speaker. The held notes sit in a range that small laptop speakers roll off.</p>

  <div class="section-head"><h2>Voices</h2><span class="desc">Drag distance becomes a note. The picker on each card decides what happens once the hand is past the ring.</span></div>
  <div class="options" data-options></div>

  <details class="explored">
    <summary><span class="section-head"><h2>Set aside</h2><span class="desc"><span data-secondary-count-inline></span> takes that lost to the voices above. Still playable; they handle the ring their own way and ignore the picker.</span></span></summary>
    <div class="options" data-options-secondary></div>
  </details>

  <div class="section-head"><h2>Release sounds</h2><span class="desc">Every clip that can play when the drag lets go. Pick any of them on a card under “Release”.</span></div>
  <div class="bench" data-bench-oneshots></div>

  <div class="section-head"><h2>Loops and long recordings</h2><span class="desc">The beds the set-aside options are built from. Each preview runs for three seconds.</span></div>
  <div class="bench" data-bench-beds></div>

  <details class="prompts">
    <summary><span class="section-head"><h2>Prompts</h2><span class="desc">Every clip is ElevenLabs ${esc(provenance.model)} at ${esc(provenance.outputFormat)}. The ${provenance.clips.length} prompts below are committed in <code>sounds.json</code>.</span></span></summary>
    ${provenanceTable()}
  </details>
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
          clip.loop ? ', loop' : ''
        } · influence ${clip.promptInfluence}</td><td>${esc(clip.prompt)}</td></tr>`
    )
    .join('');
  return `<div class="prompt-table"><table>
    <thead><tr><th>Clip</th><th>Settings</th><th>Prompt</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}
