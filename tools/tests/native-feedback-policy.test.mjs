import { describe, expect, it } from 'vitest';
import {
  feedbackPolicySnapshot,
  parseFeedbackPolicy,
} from '../../experiments/native-architecture/src/feedback/feedbackPolicy.ts';
describe('feedback policy storage boundary', () => {
  it.each(['always', 'session', 'never'])('round trips %s', (mode) => {
    expect(parseFeedbackPolicy(feedbackPolicySnapshot(mode))).toBe(mode);
  });
  it.each([
    'null',
    '[]',
    '{}',
    '{"version":1,"mode":"unknown"}',
    '{"version":2,"mode":"never"}',
    '{"version":1,"mode":"never","extra":true}',
    'x'.repeat(129),
  ])('rejects malformed policy %s', (snapshot) => {
    expect(() => parseFeedbackPolicy(snapshot)).toThrow();
  });
  it('treats missing storage as an unwritten preference', () => {
    expect(parseFeedbackPolicy(null)).toBeNull();
  });
});
