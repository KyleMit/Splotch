import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  createIndex,
  extractReferences,
  proseOnly,
  resolveReference,
  stripInlineCode,
} from './check-doc-references.mjs';
import { ROOT, isMain, runMain } from './lib/proc.mjs';

const WIKI_LINK = /\[\[([^\]]+)\]\]/g;
const INDEX_ENTRY = /^\s*(?:[-*+]|\d+[.)])\s+\[[^\]]+\]\(([^)]+)\)/gm;
const FRONTMATTER_NAME = /^name:\s*(.+)$/m;
const FLAG = /(?<![\w-])--[a-z][\w-]*/g;
const URL_SCHEME = /^[a-z][a-z+.-]*:/i;

function trackedFiles(root) {
  const result = spawnSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || 'git ls-files failed');
  return result.stdout.split('\0').filter(Boolean);
}

function repoIndex(root, files) {
  const packages = new Map();
  for (const file of files.filter((name) => basename(name) === 'package.json')) {
    const dir = file === 'package.json' ? '' : file.slice(0, -'/package.json'.length);
    packages.set(
      dir,
      new Set(Object.keys(JSON.parse(readFileSync(join(root, file), 'utf8')).scripts ?? {}))
    );
  }
  return createIndex({ files, packages });
}

function namesUnder(root, subdir) {
  try {
    return new Set(
      readdirSync(join(root, subdir), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
    );
  } catch {
    return new Set();
  }
}

export function scanAgentMemory({ memoryDir, root = ROOT, files = trackedFiles(root) }) {
  const directory = resolve(memoryDir);
  const entries = readdirSync(directory, { withFileTypes: true });
  const errors = [];
  const advisory = entries
    .filter(
      (entry) => entry.isDirectory() || (entry.isSymbolicLink() && entry.name.endsWith('.md'))
    )
    .map((entry) => ({ file: entry.name, kind: 'unscanned entry', ref: entry.name }));
  const memoryFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'MEMORY.md')
    .map((entry) => entry.name)
    .sort();
  const knownFiles = new Set(memoryFiles);
  const knownStems = new Set(memoryFiles.map((name) => name.slice(0, -3)));
  const indexText = readFileSync(join(directory, 'MEMORY.md'), 'utf8');
  const indexLinks = [...indexText.matchAll(INDEX_ENTRY)]
    .map((match) => match[1])
    .filter((target) => !URL_SCHEME.test(target))
    .map((target) => target.replace(/[?#].*$/, '').replace(/^\.\//, ''));
  for (const name of memoryFiles) {
    const count = indexLinks.filter((link) => link === name).length;
    if (count !== 1)
      errors.push({
        file: 'MEMORY.md',
        kind: 'index',
        ref: name,
        detail: `indexed ${count} times`,
      });
  }
  for (const link of indexLinks) {
    if (!knownFiles.has(link))
      errors.push({ file: 'MEMORY.md', kind: 'index', ref: link, detail: 'target missing' });
  }

  const index = repoIndex(root, files);
  const skills = new Set([
    ...namesUnder(root, '.claude/skills'),
    ...namesUnder(root, '.agents/skills'),
  ]);
  const prefixes = new Set([...skills].map((skill) => skill.split('-')[0]));
  prefixes.add('implement');
  prefixes.add('update');
  const skillName = new RegExp(`\\b(?:${[...prefixes].join('|')})-[a-z0-9-]+\\b`, 'g');
  for (const file of memoryFiles) {
    const content = readFileSync(join(directory, file), 'utf8');
    const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1] ?? '';
    const name = frontmatter.match(FRONTMATTER_NAME)?.[1]?.trim();
    if (!name) errors.push({ file, kind: 'name', ref: '', detail: 'missing frontmatter name' });
    else if (name !== file.slice(0, -3))
      advisory.push({ file, kind: 'name', ref: name, detail: 'differs from filename' });
    for (const match of stripInlineCode(proseOnly(content)).matchAll(WIKI_LINK)) {
      const target = match[1].split(/[|#]/, 1)[0].trim().replace(/\.md$/, '');
      const slug = target.toLowerCase().replace(/\s+/g, '-');
      if (!knownStems.has(target) && !knownStems.has(slug))
        errors.push({ file, kind: 'wiki link', ref: match[1], detail: 'target missing' });
    }
    for (const reference of extractReferences(content, index)) {
      if (reference.kind === 'link') continue;
      if (resolveReference(`memory/${file}`, reference, index) !== 'missing') continue;
      const finding = { file, line: reference.line, kind: reference.kind, ref: reference.ref };
      if (reference.kind === 'script') errors.push(finding);
      else advisory.push(finding);
    }
    for (const match of content.matchAll(skillName)) {
      if (!skills.has(match[0])) advisory.push({ file, kind: 'possible skill', ref: match[0] });
    }
    for (const match of content.matchAll(FLAG))
      advisory.push({ file, kind: 'flag', ref: match[0] });
  }
  return { memoryDir: directory, checked: memoryFiles.length, errors, advisory };
}

export function checkAgentMemoryReferences(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: { 'memory-dir': { type: 'string' }, json: { type: 'boolean' } },
  });
  if (!values['memory-dir']) throw new Error('pass --memory-dir=<Claude project memory directory>');
  const result = scanAgentMemory({ memoryDir: values['memory-dir'] });
  if (values.json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`Checked ${result.checked} memories in ${result.memoryDir}`);
    for (const finding of result.errors)
      console.error(
        `ERROR ${finding.file}: ${finding.kind} ${finding.ref} ${finding.detail ?? ''}`
      );
    for (const finding of result.advisory)
      console.log(
        `REVIEW ${finding.file}${finding.line ? `:${finding.line}` : ''}: ${finding.kind} ${finding.ref}`
      );
    console.log(`${result.errors.length} errors; ${result.advisory.length} references for review`);
  }
  return result.errors.length ? 1 : 0;
}

if (isMain(import.meta.url))
  runMain(async () => {
    process.exitCode = checkAgentMemoryReferences();
  });
