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
describe('feedback projection across the native candidate import boundary', () => {
  it('pins arithmetic ranges and native default to the current gate contract', () => {
    expect([GATE_OPERAND_MIN, GATE_OPERAND_MAX]).toEqual([3, 9]);
    expect(FEEDBACK_GATE_MODES).toEqual(['always', 'session', 'never']);
  });
  it('pins the strict HTTPS hosted origin, report path and app version without a shipping runtime import', () => {
    expect(FEEDBACK_URL).toBe('https://splotch.art/api/report');
    expect(read('web/src/lib/siteUrl.ts')).toContain("'https://splotch.art'");
    expect(FEEDBACK_APP_VERSION).toBe(JSON.parse(read('package.json')).version);
  });
});
