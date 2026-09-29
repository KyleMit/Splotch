import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(import.meta.dirname, '..', '..', '..');

export const testWorkflow = readFileSync(join(repoRoot, '.github/workflows/test.yml'), 'utf8');

const JOBS_KEY = /^jobs:\s*(?:#.*)?$/;
const JOB_KEY = /^ {2}([\w-]+):\s*(?:#.*)?$/;
const KEY_AT_JOB_INDENT_OR_SHALLOWER = /^ {0,2}[^\s#]/;
const TOP_LEVEL_KEY = /^[^\s#]/;
const BLANK_OR_COMMENT_AT_JOB_INDENT = /^(?: {0,2}#.*|\s*)$/;

// Each job under `jobs:`, from its key line through the last line indented past that key, as a
// verbatim substring of `yaml`. A comment at job indent after a job's last line introduces
// whatever follows, so it belongs to no job: a guard reading one job never sees text written
// about its neighbour.
export function jobBlocks(yaml) {
  const lines = yaml.split('\n');
  const jobsKey = lines.findIndex((line) => JOBS_KEY.test(line));
  if (jobsKey === -1) return [];

  const blocks = [];
  for (let start = jobsKey + 1; start < lines.length; start++) {
    if (TOP_LEVEL_KEY.test(lines[start])) break;
    const id = lines[start].match(JOB_KEY)?.[1];
    if (id === undefined) continue;

    let end = start + 1;
    while (end < lines.length && !KEY_AT_JOB_INDENT_OR_SHALLOWER.test(lines[end])) end++;
    while (BLANK_OR_COMMENT_AT_JOB_INDENT.test(lines[end - 1])) end--;
    const text = lines.slice(start, end).join('\n') + (end < lines.length ? '\n' : '');
    blocks.push({ id, text });
  }
  return blocks;
}

export function jobBlock(yaml, jobKey) {
  const block = jobBlocks(yaml).find(({ id }) => id === jobKey);
  if (!block) throw new Error(`No ${jobKey} job under jobs:`);
  return block.text;
}

export function runCommandsIn(block) {
  return [...block.matchAll(/^ +run: (.+)$/gm)].map(([, command]) => command.trim());
}
