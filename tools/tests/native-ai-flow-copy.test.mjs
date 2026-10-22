import { expect, it, vi } from 'vitest';

import { aiButtonFace } from '../../experiments/native-architecture/src/ai/uiState.ts';
import { REPORT_RECEIVED_MESSAGE, reportFailureMessage } from '../../web/src/lib/reportReply.ts';
import {
  AI_PROBLEM_REPORT_COPY,
  problemReportRows,
} from '../../experiments/native-architecture/src/ai/problemReport.ts';

vi.mock('react-native', () => ({}));

it('names the AI Image Button and Waiting Polaroid as shipping does', () => {
  const state = (overrides) => ({
    open: false,
    minimized: false,
    view: 'prompt',
    attempt: null,
    availability: 'ready',
    credential: 'free',
    remaining: 3,
    journal: null,
    heldResult: null,
    refusal: null,
    busy: false,
    failures: 0,
    retryAt: 0,
    recovery: null,
    ...overrides,
  });
  const labels = [
    aiButtonFace(null, false).label,
    aiButtonFace(state({ availability: 'unavailable' }), false).label,
    aiButtonFace(state({ credential: 'byok' }), false).label,
    aiButtonFace(state({ remaining: 0 }), false).label,
    aiButtonFace(
      state({ open: true, minimized: true, attempt: { kind: 'starting', startedAt: 1 } }),
      false
    ).label,
  ];
  expect(labels).toEqual([
    'Checking AI image availability',
    'AI image unavailable',
    'Create AI image',
    'Set up AI image',
    'Show the picture being made',
  ]);
  expect(aiButtonFace(state({}), false).label).toBe('Create AI image, 3 free left');
});

it('parks the wand on a blank page or a run in flight, but never a minimized one', () => {
  const ready = {
    open: false,
    minimized: false,
    view: 'prompt',
    attempt: null,
    availability: 'ready',
    credential: 'free',
    remaining: 3,
    journal: null,
    heldResult: null,
    refusal: null,
    busy: false,
    failures: 0,
    retryAt: 0,
    recovery: null,
  };
  expect(aiButtonFace(ready, false)).toMatchObject({ disabled: false, busy: false, badge: 3 });
  expect(aiButtonFace(ready, true).disabled).toBe(true);
  const running = {
    ...ready,
    open: true,
    view: 'result',
    attempt: { kind: 'starting', startedAt: 1 },
  };
  expect(aiButtonFace(running, false)).toMatchObject({ disabled: true, busy: true });
  expect(aiButtonFace({ ...running, minimized: true }, true)).toMatchObject({
    disabled: false,
    busy: false,
  });
  expect(aiButtonFace({ ...ready, credential: 'managed' }, false).badge).toBeNull();
  expect(aiButtonFace({ ...ready, availability: 'unavailable' }, false).badge).toBeNull();
});

it('says Checking and takes no tap while the allowance is being read again', () => {
  const checking = {
    open: false,
    minimized: false,
    view: 'prompt',
    attempt: null,
    availability: 'ready',
    checking: true,
    credential: 'free',
    remaining: 3,
  };
  expect(aiButtonFace(checking, false)).toMatchObject({
    label: 'Checking AI image availability',
    disabled: true,
  });
});

it('words the problem report and lists its rows as shipping does', () => {
  const { sent, failed } = AI_PROBLEM_REPORT_COPY;
  expect(sent).toBe(REPORT_RECEIVED_MESSAGE);
  expect(failed).toBe(reportFailureMessage('generation-error'));
  const native = problemReportRows(null, 2, null, 'web');
  for (const { value } of native) expect(value).toBeTruthy();
  expect(native.map(({ value }) => value).slice(0, 3)).toEqual([
    'Picture generation failed',
    'No error details available.',
    '2 in a row',
  ]);
});
