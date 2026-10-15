import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import {
  AI_ERROR_CARD_COPY,
  AI_REPORT_CONFIRM_COPY,
  AI_REPORT_COPY,
  AI_RESULT_COPY,
  aiReportReceived,
} from '../../experiments/native-architecture/src/ai/aiResultCopy.ts';
import {
  AI_REPORT_RETENTION_DAYS,
  AI_REPORT_REVIEW_HOURS,
} from '../../experiments/native-architecture/src/ai/reportContract.ts';
import { aiButtonFace } from '../../experiments/native-architecture/src/ai/uiState.ts';
import { REPORT_RECEIVED_MESSAGE, reportFailureMessage } from '../../web/src/lib/reportReply.ts';
import {
  AI_PROBLEM_REPORT_COPY,
  MAX_FAILURE_MESSAGE_LENGTH,
  problemReportRows,
} from '../../experiments/native-architecture/src/ai/problemReport.ts';

vi.mock('react-native', () => ({}));

const web = (path) => readFileSync(new URL(`../../web/src/${path}`, import.meta.url), 'utf8');
// Template text as rendered: every run of whitespace, line breaks included, reads as one space.
const rendered = (path) => web(`lib/components/${path}`).replace(/\s+/g, ' ');
const SHIPPING = {
  result: rendered('AiImageResult.svelte'),
  disclosure: rendered('AiResultDisclosure.svelte'),
  error: rendered('AiResultError.svelte'),
  errorCard: rendered('AiErrorCard.svelte'),
  footer: rendered('AiResultFooter.svelte'),
  report: rendered('AiImageReport.svelte'),
  button: rendered('AiImageButton.svelte'),
  polaroid: rendered('AiWaitingPolaroid.svelte'),
};
const ALL = Object.values(SHIPPING).join(' ');

it('speaks the AI Result in the shipping templates’ words', () => {
  for (const [key, text] of Object.entries(AI_RESULT_COPY))
    expect(ALL, `AI_RESULT_COPY.${key}`).toContain(text);
  expect(SHIPPING.result).toContain(`aria-label="${AI_RESULT_COPY.label}"`);
  for (const copy of Object.values(AI_ERROR_CARD_COPY))
    for (const text of [copy.title, copy.body, copy.action, copy.note].filter(Boolean))
      expect(SHIPPING.errorCard).toContain(text);
  for (const text of Object.values(AI_REPORT_COPY)) expect(SHIPPING.report).toContain(text);
});

it('describes each report as the shipping confirmation does', () => {
  const promise = SHIPPING.report
    .replaceAll('{reviewHours}', String(AI_REPORT_REVIEW_HOURS))
    .replaceAll('{IMAGE_REPORT_RETENTION_DAYS}', String(AI_REPORT_RETENTION_DAYS));
  for (const copy of Object.values(AI_REPORT_CONFIRM_COPY)) {
    const [what, when] = copy.copy.split(' We look within ');
    expect(SHIPPING.report).toContain(copy.title);
    expect(SHIPPING.report).toContain(what);
    expect(promise).toContain(`We look within ${when}`);
    expect(SHIPPING.report).toContain(copy.drawing);
  }
  const sent = web('lib/components/AiImageReport.svelte')
    .match(/`Thanks\. We'll review it[^`]+`/)?.[0]
    .replace('${reviewHours}', String(AI_REPORT_REVIEW_HOURS))
    .replace('${reply.reportId}', 'REF');
  expect(`\`${aiReportReceived('REF')}\``).toBe(sent);
});

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
  for (const label of labels) expect(SHIPPING.button).toContain(`'${label}'`);
  expect(aiButtonFace(state({}), false).label).toBe('Create AI image, 3 free left');
  expect(SHIPPING.button).toContain('`Create AI image, ${freeGrant.remaining} free left`');
  expect(SHIPPING.button).toContain('"Show what didn\'t work"');
  expect(SHIPPING.button).toContain("'Show your finished picture'");
  const polaroid = readFileSync(
    new URL('../../experiments/native-architecture/src/ai/AiWaitingPolaroid.tsx', import.meta.url),
    'utf8'
  );
  for (const label of [
    'Your picture is being made — tap to watch',
    'Your picture is ready — tap to see it',
    "That didn't work — tap to see",
  ]) {
    expect(SHIPPING.polaroid).toContain(label);
    expect(polaroid).toContain(label);
  }
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
  const { sent, failed, ...copy } = AI_PROBLEM_REPORT_COPY;
  expect(sent).toBe(REPORT_RECEIVED_MESSAGE);
  expect(failed).toBe(reportFailureMessage('generation-error'));
  for (const [key, text] of Object.entries(copy))
    expect(`${SHIPPING.report} ${SHIPPING.disclosure}`, key).toContain(text);
  const rows = web('lib/ai/failureReport.ts');
  expect(rows).toContain(`const MAX_ERROR_MESSAGE_LENGTH = ${MAX_FAILURE_MESSAGE_LENGTH};`);
  const native = problemReportRows(null, 2, null, 'web');
  for (const { label, value } of native) {
    expect(rows).toContain(`label: '${label}'`);
    expect(value).toBeTruthy();
  }
  expect(native.map(({ value }) => value).slice(0, 3)).toEqual([
    'Picture generation failed',
    'No error details available.',
    '2 in a row',
  ]);
  expect(rows).toContain("'Picture generation failed'");
  expect(rows).toContain("'No error details available.'");
  expect(rows).toContain('in a row');
  expect(rows).toContain("style ?? 'Default'");
  expect(rows).toContain("failure.status ?? 'No response'");
});
