const ADR_FILENAME = /^(\d{4})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
const NUMBER_PREFIXED = /^\d{4}/;
const ADR_HEADING = /^#\s*ADR-(\d{4})\b/;
const ADR_INDEX_ENTRY = /^(?:\* \*\*|\| )\[([^\]]+)\]\(([^)\s]+\.md)\)/;
const ADR_INDEX_NUMBER = /^(\d{4})(?:\s+—|$)/;

export const ADR_DIR = 'docs/adrs';

export function adrNumber(filename) {
  const match = ADR_FILENAME.exec(filename);
  return match ? match[1] : null;
}

function adrFilenames(entries) {
  return entries.filter((entry) => adrNumber(entry) !== null).sort();
}

/**
 * Entries that look like a record but do not parse as one. Without this they
 * fall out of every code path silently — no duplicate, no collision, and
 * nextAdrNumber does not count them either, so the next record can be issued a
 * number already visibly spoken for.
 */
export function malformedRecordNames(entries) {
  return entries.filter((entry) => NUMBER_PREFIXED.test(entry) && adrNumber(entry) === null).sort();
}

function groupByNumber(filenames) {
  const byNumber = new Map();
  for (const filename of adrFilenames(filenames)) {
    const number = adrNumber(filename);
    const group = byNumber.get(number);
    if (group) group.push(filename);
    else byNumber.set(number, [filename]);
  }
  return byNumber;
}

export function duplicateNumbers(filenames) {
  return [...groupByNumber(filenames)]
    .filter(([, files]) => files.length > 1)
    .map(([number, files]) => ({ number, files }));
}

/**
 * A number the branch introduces that the base already spends on a different
 * record.
 *
 * Takes the records the branch genuinely added rather than deriving them from
 * filename identity: renaming a record keeps its number and changes its slug,
 * which by identity alone is indistinguishable from adding a record at a taken
 * number. The caller resolves the added set with rename-aware git, so a retitle
 * contributes nothing here.
 *
 * The base is read at run time rather than taken from the pull request's merge
 * commit, because GitHub does not recompute a check that already passed: a
 * branch that went green before the colliding record landed would otherwise
 * merge on a stale result.
 */
export function collisionsAgainstBase(baseFilenames, addedFilenames) {
  const base = groupByNumber(baseFilenames);
  const collisions = [];
  for (const file of adrFilenames(addedFilenames)) {
    const baseFiles = base.get(adrNumber(file));
    if (!baseFiles || baseFiles.includes(file)) continue;
    collisions.push({ number: adrNumber(file), baseFile: baseFiles[0], headFile: file });
  }
  return collisions;
}

export function headingNumber(firstLine) {
  const match = ADR_HEADING.exec(firstLine ?? '');
  return match ? match[1] : null;
}

/**
 * A record whose H1 claims a different number than its filename. The failure
 * message tells authors to update both, and an invariant a tool asks for but
 * never checks is the drift this workflow exists to prevent: 0081-foo.md
 * opening "# ADR-0079:" makes ADR-0079 ambiguous exactly as two files would.
 */
export function headingMismatches(records) {
  const mismatches = [];
  for (const { file, firstLine } of records) {
    const expected = adrNumber(file);
    if (expected === null) continue;
    const found = headingNumber(firstLine);
    if (found !== expected) mismatches.push({ file, expected, found });
  }
  return mismatches;
}

/**
 * The index's canonical entries are either the leading link in a Start here
 * bullet or the leading link in a section table row. Restricting parsing to
 * those positions keeps amendment and supersession links from counting as
 * duplicate index entries.
 */
export function adrIndexEntries(markdown) {
  const entries = [];
  for (const [index, line] of markdown.split('\n').entries()) {
    const match = ADR_INDEX_ENTRY.exec(line);
    if (!match) continue;
    entries.push({
      number: ADR_INDEX_NUMBER.exec(match[1])?.[1] ?? null,
      file: match[2],
      line: index + 1,
    });
  }
  return entries;
}

export function indexIntegrity(filenames, markdown) {
  const records = adrFilenames(filenames);
  const recordSet = new Set(records);
  const entries = adrIndexEntries(markdown);
  const entriesByFile = new Map();

  for (const entry of entries) {
    const matches = entriesByFile.get(entry.file);
    if (matches) matches.push(entry);
    else entriesByFile.set(entry.file, [entry]);
  }

  const missing = records.filter((file) => !entriesByFile.has(file));
  const duplicates = records.flatMap((file) => {
    const matches = entriesByFile.get(file) ?? [];
    return matches.length > 1 ? [{ file, entries: matches }] : [];
  });
  const mismatches = entries.flatMap((entry) => {
    const expected = adrNumber(entry.file);
    return expected !== null && entry.number !== expected ? [{ ...entry, expected }] : [];
  });
  const unknown = entries.filter((entry) => !recordSet.has(entry.file));

  return { missing, duplicates, mismatches, unknown };
}

export function nextAdrNumber(filenames) {
  const highest = adrFilenames(filenames).reduce(
    (max, filename) => Math.max(max, Number(adrNumber(filename))),
    0
  );
  return String(highest + 1).padStart(4, '0');
}

export function formatProblems({ duplicates, collisions, mismatches, index, baseRef }) {
  const lines = [];
  for (const { number, files } of duplicates) {
    lines.push(`ADR number ${number} is used by ${files.length} records: ${files.join(', ')}`);
  }
  for (const { number, baseFile, headFile } of collisions) {
    lines.push(
      `ADR number ${number} is already taken on ${baseRef} by ${baseFile}; this branch adds ${headFile}`
    );
  }
  for (const { file, expected, found } of mismatches ?? []) {
    lines.push(
      `${file} is numbered ${expected} but its heading reads ${found === null ? 'no ADR-NNNN heading' : `ADR-${found}`}`
    );
  }
  for (const file of index?.missing ?? []) {
    lines.push(`${file} has no canonical entry in ${ADR_DIR}/README.md`);
  }
  for (const { file, entries } of index?.duplicates ?? []) {
    lines.push(
      `${file} appears ${entries.length} times in ${ADR_DIR}/README.md on lines ` +
        entries.map(({ line }) => line).join(', ')
    );
  }
  for (const { file, line, number, expected } of index?.mismatches ?? []) {
    lines.push(
      `${ADR_DIR}/README.md line ${line} labels ${file} as ` +
        `${number === null ? 'something other than a four-digit ADR number' : `ADR-${number}`}, ` +
        `but its target filename is ADR-${expected}`
    );
  }
  for (const { file, line } of index?.unknown ?? []) {
    lines.push(
      `${ADR_DIR}/README.md line ${line} links to ${file}, which is not an ADR record in ${ADR_DIR}`
    );
  }
  return lines;
}
