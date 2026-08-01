import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, isMain, runMain } from '../lib/proc.mjs';
import { esc } from '../lib/html.mjs';
import { masthead, page, siteFooter } from '../lib/scrapbook-chrome.mjs';

export const IPAD_RELEASE_SCRAPBOOK_DIR = join(
  ROOT,
  'scrapbook',
  'performance',
  'ipad-release-rig'
);

export function releaseRigEntries(dir = IPAD_RELEASE_SCRAPBOOK_DIR) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const artifact = join(dir, entry.name, 'ipad-gates.json');
      if (!existsSync(artifact)) return [];
      const { metadata } = JSON.parse(readFileSync(artifact, 'utf8'));
      return [{ slug: entry.name, ...metadata }];
    })
    .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
}

export function renderReleaseRigIndex(entries) {
  const cards = entries.length
    ? entries
        .map(
          (entry) =>
            `<a class="run" href="${esc(entry.slug)}/"><b>${esc(entry.capturedAt.slice(0, 10))} · ${esc(entry.suite)}</b><span>Splotch ${esc(entry.appVersion)} · ${esc(entry.device.label)} · ${esc(entry.device.model)} · iPadOS ${esc(entry.device.os)}</span><small>${entry.repeats} repeats · ${entry.scenarios.join(', ')}</small></a>`
        )
        .join('')
    : '<p>No release-rig captures have been published yet.</p>';
  const header = masthead({
    title: 'Physical iPad release rig',
    tagline: 'Release-cadence measurements from the tethered hardware gate.',
    home: '../../index.html',
    crumbs: [{ label: 'Performance', href: '../' }, { label: 'iPad release rig' }],
    stats: `<span class="chip"><b>${entries.length}</b> published runs</span>`,
  });
  return page({
    title: 'Physical iPad release rig',
    extraCss:
      '.runs{display:grid;gap:10px}.run{display:grid;gap:3px;padding:15px;background:var(--card);border:1px solid var(--hair);border-radius:var(--r-md);box-shadow:var(--shadow-sm)}.run span{color:var(--muted);font-size:.86rem}.run small{color:var(--faint)}',
    body: `${header}<main><div class="shell"><div class="runs">${cards}</div></div></main>${siteFooter({ home: '../../index.html' })}`,
  });
}

export async function writeReleaseRigIndex(dir = IPAD_RELEASE_SCRAPBOOK_DIR) {
  writeFileSync(
    join(dir, 'index.html'),
    renderReleaseRigIndex(releaseRigEntries(dir)).replace(/[ \t]+$/gm, '')
  );
}

if (isMain(import.meta.url)) runMain(writeReleaseRigIndex);
