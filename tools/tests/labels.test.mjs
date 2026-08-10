import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Guards the issue templates against off-taxonomy labels: a template can apply
// any label string, and one absent from .github/labels.yml silently escapes
// the synced taxonomy (this once shipped bare `bug`/`enhancement` labels).
const repoRoot = join(import.meta.dirname, '..', '..');
const templateDir = join(repoRoot, '.github', 'ISSUE_TEMPLATE');

const definedLabels = new Set(
  [
    ...readFileSync(join(repoRoot, '.github', 'labels.yml'), 'utf8').matchAll(
      /^- name:\s*['"]?([^'"\n]+?)['"]?\s*$/gm
    ),
  ].map((m) => m[1])
);

function parseLabels(text) {
  const lines = text.split('\n');
  const index = lines.findIndex((line) => /^labels:/.test(line));
  if (index === -1) return [];
  const inline = lines[index].replace(/^labels:/, '').trim();
  if (inline !== '') {
    return inline
      .replace(/^\[|\]$/g, '')
      .split(',')
      .map((label) => label.trim().replace(/^['"]|['"]$/g, ''))
      .filter((label) => label !== '');
  }
  const items = [];
  for (const line of lines.slice(index + 1)) {
    const item = line.match(/^\s+-\s+['"]?([^'"\n]+?)['"]?\s*$/);
    if (!item) break;
    items.push(item[1]);
  }
  return items;
}

function templateLabels(name) {
  const text = readFileSync(join(templateDir, name), 'utf8');
  if (!name.endsWith('.md')) return parseLabels(text);
  const frontmatter = text.match(/^---\n([\s\S]*?)\n---/);
  return frontmatter ? parseLabels(frontmatter[1]) : [];
}

const templates = readdirSync(templateDir).filter((name) => name !== 'config.yml');

describe('issue template labels', () => {
  it('parses the taxonomy and at least one labeled template', () => {
    expect(definedLabels.size).toBeGreaterThan(0);
    expect(templates.flatMap(templateLabels).length).toBeGreaterThan(0);
  });

  for (const name of templates) {
    it(`${name} applies only labels defined in .github/labels.yml`, () => {
      for (const label of templateLabels(name)) {
        expect.soft(definedLabels.has(label), `label "${label}" is not in labels.yml`).toBe(true);
      }
    });
  }
});
