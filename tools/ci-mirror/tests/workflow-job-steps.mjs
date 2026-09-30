import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(import.meta.dirname, '..', '..', '..');

export const testWorkflow = readFileSync(join(repoRoot, '.github/workflows/test.yml'), 'utf8');

const JOBS_KEY = /^jobs:(?:\s+#.*)?\s*$/;
const JOB_KEY = /^ {2}([\w-]+):/;
const KEY_AT_JOB_INDENT_OR_SHALLOWER = /^ {0,2}[^\s#]/;
const TOP_LEVEL_KEY = /^[^\s#]/;
const BLANK_OR_COMMENT_AT_JOB_INDENT = /^(?: {0,2}#.*)?\s*$/;

// Each job under `jobs:`, from its key line through the last line indented past that key, as a
// verbatim substring of `yaml`. A comment at job indent after a job's last line introduces
// whatever follows, so it belongs to no job: a guard reading one job never sees text written
// about its neighbour. A key at job indent this cannot read throws rather than dropping the job
// from every guard that enumerates them.
export function jobBlocks(yaml) {
  const lines = yaml.split('\n');
  const jobsKey = lines.findIndex((line) => JOBS_KEY.test(line));
  if (jobsKey === -1) return [];

  const blocks = [];
  for (let start = jobsKey + 1; start < lines.length; start++) {
    if (TOP_LEVEL_KEY.test(lines[start])) break;
    if (!KEY_AT_JOB_INDENT_OR_SHALLOWER.test(lines[start])) continue;
    const id = lines[start].match(JOB_KEY)?.[1];
    if (id === undefined) throw new Error(`Unreadable job key under jobs: ${lines[start].trim()}`);

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

const JOB_HEADER_WITHOUT_VALUE = /^ {2}[\w-]+:(?:\s+#.*)?\s*$/;
const LINE_AT_JOB_KEY_INDENT = /^ {4}[^\s#]/;
const PLAIN_JOB_KEY = /^ {4}[\w-]+:(?:\s|$)/;
const STEPS_KEY = /^ {4}steps:/;
const READABLE_STEPS_KEY = /^ {4}steps:(?:\s+#.*)?\s*$/;
const STEP_INDENT = /^ {6}\S/;
const STEP_ITEM = /^ {6}- /;
const STEP_NAME = /^ {6}- name: (.+)$/;
const KEY_AT_STEP_INDENT_OR_SHALLOWER = /^ {0,6}[^\s#]/;
const BLANK_OR_COMMENT_AT_STEP_INDENT = /^(?: {0,6}#.*)?\s*$/;
const RUN_SCRIPT_KEY = /^ {8}run: \|\s*$/;
const RUN_SCRIPT_INDENT = ' '.repeat(10);

// Only the plain block form is read: a job header with nothing after its colon, and a plain
// `key:` on every line at job-key indent. Any other spelling Prettier keeps (a quoted, escaped,
// tagged, or explicit key, a merge key, an alias or flow-style body) can carry steps this cannot
// see, so it throws rather than reading the job as step-less.
function assertPlainJob(lines) {
  if (!JOB_HEADER_WITHOUT_VALUE.test(lines[0])) {
    throw new Error(`Unreadable job header: ${lines[0].trim()}`);
  }
  const unreadable = lines.find(
    (line) => LINE_AT_JOB_KEY_INDENT.test(line) && !PLAIN_JOB_KEY.test(line)
  );
  if (unreadable !== undefined) throw new Error(`Unreadable job key: ${unreadable.trim()}`);
}

// Each item of a job's `steps:` list, from its `- ` line through the last line indented past it,
// as a verbatim substring of `job`, named by a `- name:` on that line. The same boundary rule as
// jobBlocks one level down: a comment at step indent after a step's last line introduces the
// step after it and belongs to neither, and a job key after the list ends its last step. A job or
// list this cannot read throws rather than hiding its steps from every guard that enumerates them.
export function stepBlocks(job) {
  const lines = job.split('\n');
  assertPlainJob(lines);
  const stepsKey = lines.findIndex((line) => STEPS_KEY.test(line));
  if (stepsKey === -1) return [];
  if (!READABLE_STEPS_KEY.test(lines[stepsKey])) {
    throw new Error(`Unreadable steps key: ${lines[stepsKey].trim()}`);
  }

  const blocks = [];
  for (let start = stepsKey + 1; start < lines.length; start++) {
    if (!KEY_AT_STEP_INDENT_OR_SHALLOWER.test(lines[start])) continue;
    if (!STEP_INDENT.test(lines[start])) break;
    if (!STEP_ITEM.test(lines[start])) throw new Error(`Unreadable step: ${lines[start].trim()}`);

    let end = start + 1;
    while (end < lines.length && !KEY_AT_STEP_INDENT_OR_SHALLOWER.test(lines[end])) end++;
    while (BLANK_OR_COMMENT_AT_STEP_INDENT.test(lines[end - 1])) end--;
    const text = lines.slice(start, end).join('\n') + (end < lines.length ? '\n' : '');
    blocks.push({ name: lines[start].match(STEP_NAME)?.[1], text });
  }
  if (blocks.length === 0) throw new Error('No step at six-space indent under steps:');
  return blocks;
}

// A guard that names a step asserts on that one step, so a second step of the same name throws
// rather than leaving the guard to read whichever comes first.
export function stepBlock(job, name) {
  const matches = stepBlocks(job).filter((step) => step.name === name);
  if (matches.length !== 1) {
    throw new Error(`Expected one step named ${name}, found ${matches.length}`);
  }
  return matches[0].text;
}

// A step's `run: |` block as the runner hands it to bash: dedented, ending in one newline.
export function runScriptIn(step) {
  const lines = step.split('\n');
  const key = lines.findIndex((line) => RUN_SCRIPT_KEY.test(line));
  if (key === -1) throw new Error(`No run: | script in step: ${lines[0].trim()}`);

  const script = [];
  for (const line of lines.slice(key + 1)) {
    if (line.trim() !== '' && !line.startsWith(RUN_SCRIPT_INDENT)) break;
    script.push(line.slice(RUN_SCRIPT_INDENT.length));
  }
  while (script.at(-1)?.trim() === '') script.pop();
  return `${script.join('\n')}\n`;
}

export function runCommandsIn(block) {
  return [...block.matchAll(/^ +run: (.+)$/gm)].map(([, command]) => command.trim());
}
