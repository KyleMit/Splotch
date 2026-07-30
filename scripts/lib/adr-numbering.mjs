const ADR_FILENAME = /^(\d{4})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;

export const ADR_DIR = 'docs/adrs';

export function adrNumber(filename) {
  const match = ADR_FILENAME.exec(filename);
  return match ? match[1] : null;
}

function adrFilenames(entries) {
  return entries.filter((entry) => adrNumber(entry) !== null).sort();
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
 * record. Checked against the base ref read at run time rather than against the
 * pull request's merge commit, because GitHub does not recompute a check that
 * already passed: a branch that went green before the colliding record landed
 * would otherwise merge on a stale result.
 */
export function collisionsAgainstBase(baseFilenames, headFilenames) {
  const base = groupByNumber(baseFilenames);
  const collisions = [];
  for (const [number, headFiles] of groupByNumber(headFilenames)) {
    const baseFiles = base.get(number);
    if (!baseFiles) continue;
    const added = headFiles.filter((file) => !baseFiles.includes(file));
    for (const file of added) {
      collisions.push({ number, baseFile: baseFiles[0], headFile: file });
    }
  }
  return collisions;
}

export function nextAdrNumber(filenames) {
  const highest = adrFilenames(filenames).reduce(
    (max, filename) => Math.max(max, Number(adrNumber(filename))),
    0
  );
  return String(highest + 1).padStart(4, '0');
}

/**
 * Reports what this branch did to docs/adrs/ without deciding whether to check.
 * Scanning the tree costs a directory read, so skipping it on "nothing changed"
 * would buy nothing and would report success against a tree that already holds
 * duplicates — which is exactly the state an audit run needs to surface.
 */
export function describeAdrChanges(changedFiles) {
  if (changedFiles === null) return null;
  if (changedFiles.length === 0) {
    return `No record in ${ADR_DIR} changed here — verifying the resulting tree anyway.`;
  }
  const names = changedFiles.map((file) => file.replace(`${ADR_DIR}/`, '')).join(', ');
  return `${changedFiles.length === 1 ? '1 record' : `${changedFiles.length} records`} changed in ${ADR_DIR}: ${names}`;
}

export function formatProblems({ duplicates, collisions, baseRef }) {
  const lines = [];
  for (const { number, files } of duplicates) {
    lines.push(`ADR number ${number} is used by ${files.length} records: ${files.join(', ')}`);
  }
  for (const { number, baseFile, headFile } of collisions) {
    lines.push(
      `ADR number ${number} is already taken on ${baseRef} by ${baseFile}; this branch adds ${headFile}`
    );
  }
  return lines;
}
