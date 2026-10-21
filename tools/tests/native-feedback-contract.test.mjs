import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FEEDBACK_URL } from '../../experiments/native-architecture/src/feedback/feedbackTransport.ts';
import { FEEDBACK_APP_VERSION } from '../../experiments/native-architecture/src/feedback/feedbackCopy.ts';
import {
  GATE_OPERAND_MIN,
  GATE_OPERAND_MAX,
  FEEDBACK_GATE_MODES,
} from '../../experiments/native-architecture/src/feedback/feedbackGate.ts';
const root = join(import.meta.dirname, '../..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const candidate = 'experiments/native-architecture/src/feedback/';
const projections = [
  ['web/src/lib/report.ts', 'report.ts', "'./platform/deviceReport'", "'./deviceReport'"],
  ['web/src/lib/platform/deviceReport.ts', 'deviceReport.ts', "'../truncate'", "'./truncate'"],
  ['web/src/lib/truncate.ts', 'truncate.ts', '', ''],
  ['web/src/lib/state/parentalGateLockout.ts', 'gateLockout.ts', '', ''],
];
function assertProjection(actual, source, before, after) {
  assert.equal(actual, projected(source, before, after));
}
function projected(source, before, after) {
  return before ? source.replace(before, after) : source;
}
describe('feedback projection across the native candidate import boundary', () => {
  it.each(projections)(
    'pins %s byte-for-byte except its isolated import',
    (shipping, file, before, after) => {
      expect(() =>
        assertProjection(read(candidate + file), read(shipping), before, after)
      ).not.toThrow();
    }
  );
  it.each(projections)('rejects a changed owning source in %s', (shipping, file, before, after) => {
    const source = read(shipping);
    expect(() =>
      assertProjection(read(candidate + file), source + '\nchanged owner', before, after)
    ).toThrow();
  });
  it('pins arithmetic ranges and native default to the current gate contract', () => {
    const source = read('web/src/lib/state/parentalGate.svelte.ts');
    expect(source).toContain(`export const GATE_OPERAND_MIN = ${GATE_OPERAND_MIN};`);
    expect(source).toContain(`export const GATE_OPERAND_MAX = ${GATE_OPERAND_MAX};`);
    expect(source).toContain("__IS_CAPACITOR__ ? 'always' : 'never'");
    expect(FEEDBACK_GATE_MODES).toEqual(['always', 'session', 'never']);
  });
  it('pins the strict HTTPS hosted origin, report path and app version without a shipping runtime import', () => {
    expect(FEEDBACK_URL).toBe('https://splotch.art/api/report');
    expect(read('web/src/lib/siteUrl.ts')).toContain("'https://splotch.art'");
    expect(FEEDBACK_APP_VERSION).toBe(JSON.parse(read('package.json')).version);
  });
});
