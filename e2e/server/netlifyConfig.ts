// The parts of netlify.toml a local host has to obey to answer as the deploy does: the publish
// directory, the [[redirects]] rules and the [[headers]] rules. Netlify reads the file as TOML; this
// reads only the spellings the file uses and throws on any other, so a rule written another valid
// way fails the suite's server instead of being served as if it were absent.

export type RedirectRule = { from: string; to: string; status: number; force: boolean };
export type HeaderRule = { for: string; values: Record<string, string> };
export type NetlifyConfig = { publish: string; redirects: RedirectRule[]; headers: HeaderRule[] };

type Table = 'build' | 'redirects' | 'headers' | 'headers.values' | 'other';
type Value = string | number | boolean;
type Line =
  | { kind: 'table'; table: Table }
  | { kind: 'pair'; table: Table; key: string; value: Value; at: string };

const TABLE_HEADER = /^(\[\[?)([^\]]+)\]\]?$/;
const KEY_VALUE = /^([A-Za-z0-9_-]+|"[^"\\]+"|'[^']+')\s*=\s*(.+)$/;
const TRAILING_COMMENT = String.raw`\s*(?:#.*)?$`;
const BASIC_STRING = new RegExp(`^"([^"\\\\]*)"${TRAILING_COMMENT}`);
const LITERAL_STRING = new RegExp(`^'([^']*)'${TRAILING_COMMENT}`);
const BARE_SCALAR = new RegExp(`^(\\d+|true|false)${TRAILING_COMMENT}`);
const MULTILINE_DELIMITERS = ['"""', "'''"] as const;
// A backslash that ends a line in a multi-line basic string joins it to the next non-blank text.
const LINE_ENDING_BACKSLASH = /\\[ \t]*\r?\n\s*/g;
const READ_TABLES: Record<string, Table> = {
  '[build': 'build',
  '[[redirects': 'redirects',
  '[[headers': 'headers',
  '[headers.values': 'headers.values',
};
const REDIRECT_KEYS = new Set(['from', 'to', 'status', 'force']);

function tableOf(brackets: string, name: string): Table {
  const table = READ_TABLES[`${brackets}${name.trim()}`];
  if (table) return table;
  if (/redirects|headers/.test(name)) throw new Error(`netlify.toml: an unreadable table ${name}`);
  return 'other';
}

function scalar(raw: string, at: string): Value {
  const quoted = BASIC_STRING.exec(raw) ?? LITERAL_STRING.exec(raw);
  if (quoted) return quoted[1];
  const bare = BARE_SCALAR.exec(raw)?.[1];
  if (bare === 'true' || bare === 'false') return bare === 'true';
  if (bare !== undefined) return Number(bare);
  throw new Error(`netlify.toml ${at}: a value this host cannot read: ${raw}`);
}

function multiline(delimiter: string, body: string, at: string): string {
  const content = body.replace(/^\r?\n/, '');
  if (delimiter === "'''") return content;
  const joined = content.replace(LINE_ENDING_BACKSLASH, '');
  if (joined.includes('\\')) throw new Error(`netlify.toml ${at}: an escape this host cannot read`);
  return joined;
}

function* readLines(toml: string): Generator<Line> {
  const lines = toml.split('\n');
  let table: Table = 'other';
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trim();
    const at = `line ${index + 1}`;
    if (line === '' || line.startsWith('#')) continue;
    const header = TABLE_HEADER.exec(line);
    if (header) {
      table = tableOf(header[1], header[2]);
      yield { kind: 'table', table };
      continue;
    }
    const pair = KEY_VALUE.exec(line);
    if (!pair) throw new Error(`netlify.toml ${at}: unreadable: ${line}`);
    const key = pair[1].replace(/^["']|["']$/g, '');
    const delimiter = MULTILINE_DELIMITERS.find((opener) => pair[2].startsWith(opener));
    if (!delimiter) {
      yield { kind: 'pair', table, key, value: scalar(pair[2], at), at };
      continue;
    }
    let body = pair[2].slice(delimiter.length);
    while (!body.includes(delimiter)) {
      index++;
      if (index >= lines.length) throw new Error(`netlify.toml ${at}: an unclosed string`);
      body += `\n${lines[index]}`;
    }
    const close = body.indexOf(delimiter);
    if (body.slice(close + delimiter.length).trim() !== '')
      throw new Error(`netlify.toml ${at}: text after a multi-line string`);
    yield { kind: 'pair', table, key, value: multiline(delimiter, body.slice(0, close), at), at };
  }
}

function stringValue(value: Value | undefined, what: string): string {
  if (typeof value !== 'string') throw new Error(`netlify.toml: ${what} is not a string`);
  return value;
}

function redirectRule(fields: Map<string, Value>): RedirectRule {
  const from = stringValue(fields.get('from'), 'a redirect from');
  const status = fields.get('status') ?? 301;
  const force = fields.get('force') ?? false;
  if (typeof status !== 'number' || typeof force !== 'boolean')
    throw new Error(`netlify.toml: the redirect from ${from} has an unreadable status or force`);
  if (!from.startsWith('/') || from.includes(':'))
    throw new Error(`netlify.toml: a redirect from ${from}, which this host cannot match`);
  return {
    from,
    to: stringValue(fields.get('to'), `the redirect from ${from}'s to`),
    status,
    force,
  };
}

export function readNetlifyConfig(toml: string): NetlifyConfig {
  let publish: string | undefined;
  const redirects: Map<string, Value>[] = [];
  const headers: { for?: string; values: Record<string, string> }[] = [];
  for (const line of readLines(toml)) {
    if (line.kind === 'table') {
      if (line.table === 'redirects') redirects.push(new Map());
      if (line.table === 'headers') headers.push({ values: {} });
      continue;
    }
    const { table, key, value, at } = line;
    const header = headers.at(-1);
    if (table === 'build' && key === 'publish') publish = stringValue(value, 'publish');
    else if (table === 'redirects') {
      if (!REDIRECT_KEYS.has(key)) throw new Error(`netlify.toml ${at}: a redirect's ${key}`);
      redirects.at(-1)?.set(key, value);
    } else if (table === 'headers' && header) {
      if (key !== 'for') throw new Error(`netlify.toml ${at}: a header rule's ${key}`);
      header.for = stringValue(value, 'a header rule for');
    } else if (table === 'headers.values' && header) {
      header.values[key] = stringValue(value, key);
    }
  }
  if (publish === undefined) throw new Error('netlify.toml names no [build] publish directory');
  return {
    publish,
    redirects: redirects.map(redirectRule),
    headers: headers.map((rule) => ({
      for: stringValue(rule.for, 'a [[headers]] rule for'),
      values: rule.values,
    })),
  };
}

const escapeRegExp = (pattern: string) => pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');

// Netlify's splat: `*` matches the rest of the path, and a target's `:splat` receives it.
function splatPattern(path: string): RegExp {
  return new RegExp(`^${escapeRegExp(path).replaceAll('*', '(.*)')}$`);
}

export function redirectFor(
  rules: readonly RedirectRule[],
  pathname: string
): (RedirectRule & { target: string }) | null {
  for (const rule of rules) {
    const match = splatPattern(rule.from).exec(pathname);
    if (match) return { ...rule, target: rule.to.replaceAll(':splat', match[1] ?? '') };
  }
  return null;
}

// Every rule whose path matches applies, a later rule's value winning for the same header.
export function headersFor(rules: readonly HeaderRule[], pathname: string): Record<string, string> {
  return Object.assign(
    {},
    ...rules.filter((rule) => splatPattern(rule.for).test(pathname)).map((rule) => rule.values)
  );
}
