import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Guards the issue templates against off-taxonomy labels: a template can apply
// any label string, and one absent from .github/labels.yml silently escapes
// the synced taxonomy (this once shipped bare `bug`/`enhancement` labels).
const repoRoot = join(import.meta.dirname, '..', '..');
const templateDir = join(repoRoot, '.github', 'ISSUE_TEMPLATE');
const labelsYaml = readFileSync(join(repoRoot, '.github', 'labels.yml'), 'utf8');

// GitHub's label API rejects a longer description with "description is too
// long (maximum is 100 characters)", and the Label Sync workflow's labeler
// fails the whole run on the first rejection.
const MAX_LABEL_DESCRIPTION_CHARS = 100;

const definedLabels = new Set(
  [...labelsYaml.matchAll(/^- name:\s*['"]?([^'"\n]+?)['"]?\s*$/gm)].map((m) => m[1])
);

function unquoteYamlScalar(raw) {
  if (raw.startsWith("'")) return raw.slice(1, -1).replaceAll("''", "'");
  if (raw.startsWith('"')) return JSON.parse(raw);
  return raw;
}

function labelDescriptions() {
  return labelsYaml
    .split(/^- /m)
    .slice(1)
    .map((entry) => ({
      name: unquoteYamlScalar(entry.match(/^name:\s*(.+?)\s*$/m)[1]),
      description: unquoteYamlScalar(entry.match(/^\s+description:\s*(.+?)\s*$/m)[1]),
    }));
}

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

describe('label descriptions', () => {
  it('parses a description for every defined label', () => {
    expect(labelDescriptions().map(({ name }) => name)).toEqual([...definedLabels]);
  });

  it(`stay within GitHub's ${MAX_LABEL_DESCRIPTION_CHARS}-character cap`, () => {
    const tooLong = labelDescriptions()
      .map(({ name, description }) => ({ name, length: [...description].length }))
      .filter(({ length }) => length > MAX_LABEL_DESCRIPTION_CHARS)
      .map(({ name, length }) => `${name} (${length})`);
    expect(tooLong, `descriptions over ${MAX_LABEL_DESCRIPTION_CHARS} characters`).toEqual([]);
  });
});
