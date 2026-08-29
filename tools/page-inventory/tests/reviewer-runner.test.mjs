import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  REVIEWER_RUNNERS,
  claudeReviewerPrompt,
  detectReviewerRunner,
  parseReviewerOutput,
  reviewerArgs,
  reviewerFailureReason,
  reviewerBinary,
  discardStagedImage,
  reviewerModelDefault,
  stageReviewerImage,
} from '../lib/reviewer-runner.mjs';

const roots = [];
function reviewerRoot() {
  const root = mkdtempSync(join(tmpdir(), 'splotch-reviewer-runner-test-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  while (roots.length) rmSync(roots.pop(), { recursive: true, force: true });
});

const capture = {
  review_id: 'controls--brush-menu--iphone-13-mini--dark',
  review_description: 'Standalone description.',
};
const schemaDocument = { type: 'object', properties: { severity: { type: 'string' } } };

describe('detectReviewerRunner', () => {
  it('prefers a stable order when both reviewers are installed', () => {
    expect(detectReviewerRunner(() => true)).toBe(REVIEWER_RUNNERS[0]);
  });

  it('falls back to whichever reviewer is present', () => {
    expect(detectReviewerRunner((binary) => binary === 'codex')).toBe('codex');
    expect(detectReviewerRunner((binary) => binary === 'claude')).toBe('claude');
  });

  it('names both reviewers when neither is installed', () => {
    expect(() => detectReviewerRunner(() => false)).toThrow(/claude or codex/);
  });
});

describe('reviewerModelDefault', () => {
  it('gives each runner a model it can actually serve', () => {
    expect(reviewerModelDefault('codex')).not.toBe(reviewerModelDefault('claude'));
    expect(reviewerBinary('codex')).toBe('codex');
    expect(reviewerBinary('claude')).toBe('claude');
  });

  it('rejects a runner nobody supports', () => {
    expect(() => reviewerModelDefault('gemini')).toThrow(/unsupported/);
  });
});

describe('stageReviewerImage', () => {
  it('leaves the image where it is for codex, which takes a path directly', () => {
    const root = reviewerRoot();
    expect(stageReviewerImage('codex', '/tmp/capture.webp', root, capture.review_id)).toBe(
      '/tmp/capture.webp'
    );
  });

  // Concurrent reviews share one root; a fixed staged name would have parallel
  // reviewers overwrite each other and describe the wrong screen.
  it('stages a per-review copy for claude so concurrent reviews cannot collide', () => {
    const root = reviewerRoot();
    const source = join(root, 'source.webp');
    writeFileSync(source, 'pixels');

    const first = stageReviewerImage('claude', source, root, 'review-one');
    const second = stageReviewerImage('claude', source, root, 'review-two');

    expect(first).not.toBe(second);
    expect(first.endsWith('.webp')).toBe(true);
    expect(readFileSync(first, 'utf8')).toBe('pixels');
    expect(existsSync(second)).toBe(true);
  });
});

describe('reviewerArgs', () => {
  it('passes exactly one description and one image to an ephemeral codex reviewer', () => {
    const args = reviewerArgs({
      runner: 'codex',
      capture,
      image: '/tmp/capture.webp',
      schema: '/tmp/schema.json',
      model: 'test-model',
      effort: 'low',
      reviewerRoot: '/tmp/reviewer',
    });

    expect(args.at(-1)).toBe(capture.review_description);
    expect(args.filter((arg) => arg === '--image')).toHaveLength(1);
    expect(args).toContain('--ephemeral');
  });

  it('gives claude the schema inline and only the Read tool', () => {
    const args = reviewerArgs({
      runner: 'claude',
      capture,
      image: '/tmp/reviewer/capture.webp',
      schemaDocument,
      model: 'sonnet',
      effort: 'low',
    });

    expect(args).toContain('--json-schema');
    expect(args[args.indexOf('--json-schema') + 1]).toBe(JSON.stringify(schemaDocument));
    expect(args[args.indexOf('--allowedTools') + 1]).toBe('Read');
    expect(args[args.indexOf('--output-format') + 1]).toBe('json');
    // Claude has no --image flag; the path travels in the prompt instead.
    expect(args).not.toContain('--image');
    expect(args[args.indexOf('-p') + 1]).toContain('/tmp/reviewer/capture.webp');
    expect(args[args.indexOf('-p') + 1]).toContain(capture.review_description);
  });

  // A temp cwd is not a boundary: --allowedTools Read pre-approves absolute
  // paths too, and without these the reviewer can read the repo it is judging.
  it('confines the claude reviewer to its working directory', () => {
    const args = reviewerArgs({
      runner: 'claude',
      capture,
      image: '/tmp/reviewer/capture.webp',
      schemaDocument,
      model: 'sonnet',
      effort: 'low',
    });

    expect(args).toContain('--restricted');
    expect(args).toContain('--strict-mcp-config');
  });

  it('keeps the reviewer to the image in front of it', () => {
    expect(claudeReviewerPrompt(capture, '/tmp/x.webp')).toMatch(/only evidence/i);
  });
});

describe('discardStagedImage', () => {
  it('removes the claude copy so the next reviewer cannot read it', () => {
    const root = reviewerRoot();
    const source = join(root, 'source.webp');
    writeFileSync(source, 'pixels');
    const staged = stageReviewerImage('claude', source, root, 'review-one');

    discardStagedImage('claude', staged);

    expect(existsSync(staged)).toBe(false);
  });

  it('never touches the original a codex reviewer was pointed at', () => {
    const root = reviewerRoot();
    const source = join(root, 'source.webp');
    writeFileSync(source, 'pixels');

    discardStagedImage('codex', stageReviewerImage('codex', source, root, 'review-one'));

    expect(existsSync(source)).toBe(true);
  });
});

// The runner exits non-zero when it gives up, so the caller rejects on the exit
// code before any transcript is parsed — leaving "exited 1: no stderr", which
// reads like a crash rather than a budget that needs raising.
describe('reviewerFailureReason', () => {
  it('names the runner-reported failure from a claude envelope', () => {
    const stdout = JSON.stringify({ is_error: true, subtype: 'error_max_turns' });

    expect(reviewerFailureReason(stdout)).toBe('error_max_turns');
  });

  it('is empty for a run that produced a review', () => {
    const stdout = JSON.stringify({ structured_output: { severity: 'pass' }, is_error: false });

    expect(reviewerFailureReason(stdout)).toBe('');
  });

  it('is empty when there is no transcript to read', () => {
    expect(reviewerFailureReason('')).toBe('');
    expect(reviewerFailureReason('not json at all')).toBe('');
  });
});

describe('parseReviewerOutput', () => {
  const review = {
    severity: 'low',
    critique: 'Tight.',
    recommendation: 'Loosen it.',
    tags: ['spacing'],
  };

  it('reads a codex JSONL transcript', () => {
    const stdout = [
      JSON.stringify({ type: 'thread.started', thread_id: 't1' }),
      JSON.stringify({
        type: 'item.completed',
        item: { type: 'agent_message', text: JSON.stringify(review) },
      }),
      JSON.stringify({ type: 'turn.completed', usage: {} }),
    ].join('\n');

    expect(parseReviewerOutput(stdout, 'codex')).toEqual(review);
  });

  it('reads a claude JSON envelope', () => {
    const stdout = JSON.stringify({ structured_output: review, session_id: 's1', is_error: false });

    expect(parseReviewerOutput(stdout, 'claude')).toEqual(review);
  });

  // An empty structure would be recorded as a critique nobody actually made.
  it('refuses a run that produced no review', () => {
    expect(() =>
      parseReviewerOutput(JSON.stringify({ structured_output: {}, is_error: false }), 'claude')
    ).toThrow(/no structured review/);
    expect(() => parseReviewerOutput('', 'codex')).toThrow();
  });

  it('surfaces a runner-reported failure rather than an empty review', () => {
    const stdout = JSON.stringify({ is_error: true, subtype: 'max_turns', structured_output: {} });

    expect(() => parseReviewerOutput(stdout, 'claude')).toThrow(/max_turns/);
  });
});
