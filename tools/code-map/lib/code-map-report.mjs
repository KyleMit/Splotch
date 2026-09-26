import {
  AREAS,
  classifyPath,
  DOMAIN_SUBDIVISIONS,
  EXCLUSION_CLASSES,
  SPLIT_THRESHOLD_LOC,
  subdomainOf,
  WEB_SRC_DOMAIN_RULES,
  WEB_SRC_PREFIX,
  webSrcDomainRuleOf,
} from './code-map-rules.mjs';

const SHORT_SHA_LENGTH = 12;

export function assignFiles(paths) {
  return paths.map((path) => {
    const classification = classifyPath(path);
    if (classification.kind === 'excluded' || classification.area !== 'web/src') {
      return { path, ...classification };
    }
    const subject = path.slice(WEB_SRC_PREFIX.length);
    return {
      path,
      ...classification,
      domainRule: webSrcDomainRuleOf(subject).ruleIndex,
      subdomain: subdomainOf(classification.bucket, subject),
    };
  });
}

function tally(entries, keyOf) {
  const totals = new Map();
  for (const entry of entries) {
    const key = keyOf(entry);
    const row = totals.get(key) ?? { label: key, loc: 0, files: 0 };
    row.loc += entry.lines;
    row.files += 1;
    totals.set(key, row);
  }
  return [...totals.values()].sort((a, b) => b.loc - a.loc || a.label.localeCompare(b.label));
}

export function summarize(assignments, linesByPath) {
  const measured = assignments
    .filter((entry) => entry.kind === 'measured')
    .map((entry) => ({ ...entry, lines: linesByPath.get(entry.path) }));
  const excluded = assignments.filter((entry) => entry.kind === 'excluded');
  const exclusionCounts = EXCLUSION_CLASSES.map(({ label }) => ({
    label,
    files: excluded.filter((entry) => entry.exclusion === label).length,
  }))
    .filter((row) => row.files > 0)
    .sort((a, b) => b.files - a.files || a.label.localeCompare(b.label));
  const areaLabel = new Map(AREAS.map((area) => [area.key, area.label]));
  const areas = tally(measured, (entry) => entry.area).map((row) => ({
    ...row,
    key: row.label,
    label: areaLabel.get(row.label),
    buckets: tally(
      measured.filter((entry) => entry.area === row.label),
      (entry) => entry.bucket
    ),
  }));
  const subdivisions = Object.keys(DOMAIN_SUBDIVISIONS).map((domain) => ({
    domain,
    definition: DOMAIN_SUBDIVISIONS[domain].definition,
    rows: tally(
      measured.filter((entry) => entry.bucket === domain),
      (entry) => entry.subdomain
    ),
  }));
  return {
    trackedFiles: assignments.length,
    measuredFiles: measured.length,
    measuredLoc: measured.reduce((sum, entry) => sum + entry.lines, 0),
    excludedFiles: excluded.length,
    exclusionCounts,
    areas,
    subdivisions,
  };
}

const number = (value) => value.toLocaleString('en-US');

// Left unpadded: gen-code-map runs dprint over the written file, which owns
// Markdown table alignment (ADR-0057).
function table(headers, rows) {
  const numericColumns = headers.slice(1).map(() => '---:');
  return [
    `| ${headers.join(' | ')} |`,
    `| --- | ${numericColumns.join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');
}

const locRows = (rows) => rows.map((row) => [row.label, number(row.loc), number(row.files)]);

function renderSnapshot({ sha, date }) {
  return [
    `> **Snapshot of ${sha.slice(0, SHORT_SHA_LENGTH)} (${date}).** Every table in this map is`,
    '> generated from that commit by `npm run gen:code-map`; the prose around them is maintained by the',
    '> `reconcile-code-map` skill. Counts drift as the code changes — regenerate rather than hand-edit.',
  ].join('\n');
}

function renderCoverage(summary) {
  return [
    table(
      ['Disposition', 'Files'],
      [
        ['Measured and categorized', number(summary.measuredFiles)],
        ['Explicitly excluded', number(summary.excludedFiles)],
        ['**All tracked files**', number(summary.trackedFiles)],
        ['Unassigned or multiply counted', '0'],
      ]
    ),
    '',
    table(
      ['Exclusion class', 'Files'],
      [
        ...summary.exclusionCounts.map((row) => [row.label, number(row.files)]),
        ['**Total explicitly excluded**', number(summary.excludedFiles)],
      ]
    ),
  ].join('\n');
}

function renderTotals(summary) {
  return [
    `## Grand total: **${number(summary.measuredLoc)} LOC across ${number(summary.measuredFiles)} measured files**`,
    '',
    table(['Area', 'LOC', 'Files'], locRows(summary.areas)),
  ].join('\n');
}

function renderSubdivision({ domain, definition, rows }) {
  const loc = rows.reduce((sum, row) => sum + row.loc, 0);
  const files = rows.reduce((sum, row) => sum + row.files, 0);
  return [
    `#### ${domain} (${number(loc)}) — defined subdomains`,
    '',
    definition,
    '',
    table(
      ['Subdomain', 'LOC', 'Files'],
      [...locRows(rows), [`**${domain} total**`, number(loc), number(files)]]
    ),
  ].join('\n');
}

function renderSplits(summary) {
  const sections = [`## Splits for every measured area over ${number(SPLIT_THRESHOLD_LOC)} LOC`];
  for (const area of summary.areas) {
    if (area.loc <= SPLIT_THRESHOLD_LOC || area.buckets.length < 2) continue;
    const isWebSrc = area.key === 'web/src';
    sections.push(
      `### ${area.key} (${number(area.loc)}) — ${isWebSrc ? 'functional domains' : 'by subtree'}`,
      table([isWebSrc ? 'Domain' : 'Sub-bucket', 'LOC', 'Files'], locRows(area.buckets))
    );
    if (isWebSrc) sections.push(...summary.subdivisions.map(renderSubdivision));
  }
  return sections.join('\n\n');
}

export function renderBlocks(summary, commit) {
  return {
    snapshot: renderSnapshot(commit),
    coverage: renderCoverage(summary),
    totals: renderTotals(summary),
    splits: renderSplits(summary),
  };
}

const startMarker = (name) => `<!-- code-map:generated:start ${name} -->`;
const endMarker = (name) => `<!-- code-map:generated:end ${name} -->`;

// Only the marked blocks are rewritten; everything between them is prose the
// reconcile-code-map skill owns.
export function spliceBlocks(document, blocks) {
  let result = document;
  for (const [name, body] of Object.entries(blocks)) {
    const start = result.indexOf(startMarker(name));
    const end = result.indexOf(endMarker(name));
    if (start === -1 || end === -1 || end < start) {
      throw new Error(`docs/CODE-MAP.md is missing the generated "${name}" block markers`);
    }
    result =
      result.slice(0, start + startMarker(name).length) + `\n\n${body}\n\n` + result.slice(end);
  }
  return result;
}

// Rules that placed no file are reported so a rename or deletion does not leave
// a dead pattern behind.
export function unusedDomainRules(assignments) {
  const used = new Set(assignments.map((entry) => entry.domainRule));
  return WEB_SRC_DOMAIN_RULES.flatMap(([domain, pattern], index) =>
    used.has(index) ? [] : [`${domain}: ${pattern}`]
  );
}

export function renderAssignmentsTsv(assignments, linesByPath) {
  const rows = assignments.map((entry) =>
    entry.kind === 'excluded'
      ? [entry.path, 'excluded', entry.exclusion, '', '', '']
      : [
          entry.path,
          entry.area,
          entry.bucket ?? '',
          entry.subdomain ?? '',
          String(linesByPath.get(entry.path)),
          entry.domainRule === undefined ? '' : String(WEB_SRC_DOMAIN_RULES[entry.domainRule][1]),
        ]
  );
  return [['path', 'area', 'bucket', 'subdomain', 'lines', 'web/src rule'], ...rows]
    .map((row) => row.join('\t'))
    .join('\n');
}
