import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it } from 'vitest';
import { scanAgentMemory } from '../check-agent-memory-references.mjs';

const folders = [];
const checker = fileURLToPath(new URL('../check-agent-memory-references.mjs', import.meta.url));

function memoryFixture(index, files) {
  const directory = mkdtempSync(join(tmpdir(), 'splotch-memory-check-'));
  folders.push(directory);
  writeFileSync(join(directory, 'MEMORY.md'), index);
  for (const [name, content] of Object.entries(files))
    writeFileSync(join(directory, name), content);
  return directory;
}

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

it('finds missing index entries, wiki targets, npm scripts, and a mismatched name', () => {
  const memoryDir = memoryFixture('- [one](one.md)\n- [one again](one.md)\n- [ghost](ghost.md)\n', {
    'one.md':
      '---\ndescription: sample\n---\nname: renamed\nSee [[gone]] and `npm run gone:script`.\n',
    'two.md': '---\nname: two\n---\n',
  });
  const { errors } = scanAgentMemory({ memoryDir });
  expect(errors).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ kind: 'index', ref: 'ghost.md' }),
      expect.objectContaining({ kind: 'index', ref: 'two.md' }),
      expect.objectContaining({ kind: 'index', ref: 'one.md', detail: 'indexed 2 times' }),
      expect.objectContaining({ kind: 'name', file: 'one.md', detail: 'missing frontmatter name' }),
      expect.objectContaining({ kind: 'wiki link', ref: 'gone' }),
      expect.objectContaining({ kind: 'script', ref: 'gone:script' }),
    ])
  );
  expect(spawnSync(process.execPath, [checker, `--memory-dir=${memoryDir}`]).status).toBe(1);
});

it('keeps uncertain repo paths and flags advisory while accepting real references', () => {
  const memoryDir = memoryFixture('- [one](one.md)\n', {
    'one.md':
      '---\nname: one\n---\nSee [[one]], `tools/not-here.mjs`, `npm run check`, and --sample-flag.\n',
  });
  const { errors, advisory } = scanAgentMemory({ memoryDir });
  expect(errors).toEqual([]);
  expect(advisory).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ kind: 'path', ref: 'tools/not-here.mjs' }),
      expect.objectContaining({ kind: 'flag', ref: '--sample-flag' }),
    ])
  );
  expect(spawnSync(process.execPath, [checker, `--memory-dir=${memoryDir}`]).status).toBe(0);
});

it('accepts index anchors and extra links while reporting nonregular entries and title names', () => {
  const memoryDir = memoryFixture(
    '- [one](./one.md#top) — see [ADR](https://github.com/KyleMit/Splotch/blob/main/docs/adrs/README.md)\n- [two](two.md?view=1)\n',
    {
      'one.md': '---\nname: A display title\n---\nSee [[two.md]] and [[two|alias]].\n',
      'two.md': '---\nname: two\n---\n',
    }
  );
  mkdirSync(join(memoryDir, 'archive'));
  symlinkSync(join(memoryDir, 'two.md'), join(memoryDir, 'linked.md'));
  const { errors, advisory, checked } = scanAgentMemory({ memoryDir });
  expect(checked).toBe(2);
  expect(errors).toEqual([]);
  expect(advisory).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ kind: 'name', file: 'one.md', ref: 'A display title' }),
      expect.objectContaining({ kind: 'unscanned entry', ref: 'archive' }),
      expect.objectContaining({ kind: 'unscanned entry', ref: 'linked.md' }),
    ])
  );
});
