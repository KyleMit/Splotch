import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const root = path.resolve('docs/scratchpad/2026-10-21-rn-config-sweep');
function validate(records, label) {
  const get = (suffix) => {
    const r = records.find((x) => x.label === label + suffix);
    assert.ok(r, 'Missing capture ' + label + suffix);
    return r;
  };
  const before = get('-before'),
    applied = get('-applied'),
    undo = get('-applied-undo'),
    restored = get('-restored'),
    restoredUndo = get('-restored-undo');
  for (const r of [applied, undo, restored, restoredUndo]) {
    assert.equal(r.pid, before.pid, 'PID changed');
    assert.deepEqual(r.activity, before.activity, 'Activity changed');
    assert.equal(r.creates, before.creates, 'Activity create count changed');
    assert.ok(r.inkPixels > 0, 'Ink invisible');
    assert.equal(r.undo?.enabled, 'true', 'Undo disabled');
  }
  assert.ok(applied.inkPixels > undo.inkPixels, 'Applied Undo did not remove visible ink');
  assert.ok(
    restored.inkPixels > restoredUndo.inkPixels,
    'Restored Undo did not remove visible ink'
  );
}
const report = [];
for (const serial of process.argv.slice(2)) {
  const records = JSON.parse(
    readFileSync(path.join(root, 'results', serial + '-analysis.json'), 'utf8')
  );
  const label = 'font-largest';
  validate(records, label);
  const controls = {
    pid: (r) => (r.pid = 'deliberately-wrong'),
    activity: (r) => (r.activity = ['deliberately-wrong']),
    creates: (r) => (r.creates += 1),
    blank: (r) => (r.inkPixels = 0),
    disabled: (r) => (r.undo = { ...r.undo, enabled: 'false' }),
    ineffectiveUndo: (r) =>
      (r.inkPixels = records.find((x) => x.label === label + '-applied-undo').inkPixels),
  };
  const rejected = [];
  for (const [name, mutate] of Object.entries(controls)) {
    const negative = structuredClone(records);
    mutate(negative.find((x) => x.label === label + '-applied'));
    assert.throws(() => validate(negative, label), 'Negative control survived: ' + name);
    rejected.push(name);
  }
  report.push({
    serial,
    case: label,
    status: 'pass',
    negativeControlsRejected: rejected,
    scope:
      'Offline Android evidence checker; effective configuration and chrome are reviewed separately.',
  });
}
writeFileSync(
  path.join(root, 'results', 'survival-validation.json'),
  JSON.stringify(report, null, 2) + '\n'
);
console.log(JSON.stringify(report));
