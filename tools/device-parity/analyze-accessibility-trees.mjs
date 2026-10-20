// A11Y-2 pass over two arms' captured XCUITest page sources: interactive controls per state whose
// roles differ, targets under 48 pt, and names only one arm exposes. Reads every <state>.xml in the
// subject directory and its namesake in the reference directory.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { isMain, runMain } from '../lib/proc.mjs';
import { parseNodes, shortTag } from './lib/accessibility-nodes.mjs';
import { parseFlags } from './lib/cli-flags.mjs';

const MIN_TARGET_PT = 48;
const INTERACTIVE = /Button|Switch|Slider|TextField|Cell|Link|SegmentedControl|Picker/;
const FLAGS = { subject: { type: 'string' }, reference: { type: 'string' } };

export function parseAccessibilityTreeFlags(argv) {
  const { values } = parseFlags(argv, { options: FLAGS, required: ['subject', 'reference'] });
  return { subjectDir: values.subject, referenceDir: values.reference };
}

const interactiveControls = (xml) =>
  parseNodes(xml, 'ios', 1)
    .filter((node) => INTERACTIVE.test(node.tag) && node.visible !== 'false' && node.frame.w > 0)
    .map((node) => ({
      role: shortTag(node.tag),
      name: node.name,
      w: node.frame.w,
      h: node.frame.h,
    }));

const isSmall = (control) => control.w < MIN_TARGET_PT || control.h < MIN_TARGET_PT;

export function analyzeAccessibilityTrees({ subjectDir, referenceDir }) {
  const small = { subject: new Map(), reference: new Map() };
  const roleDiff = new Map();
  const onlyIn = { subject: new Set(), reference: new Set() };
  for (const state of readdirSync(subjectDir).filter((name) => name.endsWith('.xml'))) {
    if (!existsSync(join(referenceDir, state))) continue;
    const a = interactiveControls(readFileSync(join(subjectDir, state), 'utf8'));
    const b = interactiveControls(readFileSync(join(referenceDir, state), 'utf8'));
    const byNameA = new Map(a.map((control) => [control.name, control]));
    const byNameB = new Map(b.map((control) => [control.name, control]));
    for (const control of a) {
      if (isSmall(control)) small.subject.set(control.name, `${control.w}x${control.h}`);
      const other = byNameB.get(control.name);
      if (!other) onlyIn.subject.add(control.name);
      else if (other.role !== control.role) {
        roleDiff.set(control.name, `subject ${control.role} / reference ${other.role}`);
      }
    }
    for (const control of b) {
      if (isSmall(control)) small.reference.set(control.name, `${control.w}x${control.h}`);
      if (!byNameA.has(control.name)) onlyIn.reference.add(control.name);
    }
  }
  const report = {
    rolesDiffer: Object.fromEntries(roleDiff),
    smallTargets: {
      subject: Object.fromEntries(small.subject),
      reference: Object.fromEntries(small.reference),
    },
    onlyIn: { subject: [...onlyIn.subject], reference: [...onlyIn.reference] },
  };
  console.log(JSON.stringify(report, null, 1));
  return report;
}

if (isMain(import.meta.url)) {
  runMain(async () =>
    analyzeAccessibilityTrees(parseAccessibilityTreeFlags(process.argv.slice(2)))
  );
}
