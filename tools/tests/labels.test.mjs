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

// Deliberately stricter than YAML: every field must be a single-line scalar at
// the entry's own indent, with no tag, anchor, or other indicator in front, so
// a block scalar (`description: >-`, `!!str >-`) or a wrapped plain scalar
// fails here instead of being measured by its first line.
function unquoteYamlScalar(raw, key) {
  if (/^'(?:[^']|'')*'$/.test(raw)) return raw.slice(1, -1).replaceAll("''", "'");
  if (/^"(?:[^"\\]|\\.)*"$/.test(raw)) return JSON.parse(raw);
  if (/^[!&*|>%@`'"[{]/.test(raw))
    throw new Error(`labels.yml ${key} must be a single-line scalar: ${raw}`);
  return raw;
}

function parseLabelEntries(yamlText) {
  return yamlText
    .split(/^- /m)
    .slice(1)
    .map((entry) => {
      const fields = {};
      for (const line of entry.split('\n')) {
        if (line.trim() === '' || /^(?: {2})?#/.test(line)) continue;
        const field = line.match(/^(?: {2})?([a-z]+): (.+?)\s*$/);
        if (!field) throw new Error(`labels.yml line is not a single-line field: ${line}`);
        fields[field[1]] = unquoteYamlScalar(field[2], field[1]);
      }
      return fields;
    });
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
    const entries = parseLabelEntries(labelsYaml);
    expect(entries.map(({ name }) => name)).toEqual([...definedLabels]);
    for (const { name, description } of entries) {
      expect(typeof description, `label "${name}" description`).toBe('string');
    }
  });

  it('rejects a multi-line description instead of measuring its first line', () => {
    const blockScalar = `- name: 'x'\n  description: >-\n    ${'x'.repeat(101)}\n`;
    const wrappedPlain = `- name: 'x'\n  description: short\n    ${'x'.repeat(101)}\n`;
    expect(() => parseLabelEntries(blockScalar)).toThrow(/single-line/);
    expect(() => parseLabelEntries(wrappedPlain)).toThrow(/single-line/);
    for (const prefix of ['!!str', '&d']) {
      const hiddenBody = `- name: 'x'\n  description: ${prefix} >-\n    #${'x'.repeat(100)}\n`;
      expect(() => parseLabelEntries(hiddenBody), prefix).toThrow(/single-line/);
    }
  });

  it(`stay within GitHub's ${MAX_LABEL_DESCRIPTION_CHARS}-character cap`, () => {
    const tooLong = parseLabelEntries(labelsYaml)
      .map(({ name, description }) => ({ name, length: [...description].length }))
      .filter(({ length }) => length > MAX_LABEL_DESCRIPTION_CHARS)
      .map(({ name, length }) => `${name} (${length})`);
    expect(tooLong, `descriptions over ${MAX_LABEL_DESCRIPTION_CHARS} characters`).toEqual([]);
  });
});
