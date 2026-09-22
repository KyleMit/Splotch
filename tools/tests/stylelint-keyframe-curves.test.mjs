// @vitest-environment node
import stylelint from 'stylelint';
import { describe, expect, it } from 'vitest';
import keyframeCurves, { ruleName } from '../stylelint-keyframe-curves.mjs';

const SHAPED = `
@keyframes pop {
  0% { transform: scale(0.8); }
  60% { transform: scale(1.05); }
  100% { transform: scale(1); }
}
`;

const violations = async (code) => {
  const { results } = await stylelint.lint({
    code,
    config: { plugins: [keyframeCurves], rules: { [ruleName]: true } },
  });
  return results[0].warnings.filter((warning) => warning.rule === ruleName);
};

describe('the one-curve-per-cue rule', () => {
  it('rejects a shaped keyframe block played on an overshooting curve', async () => {
    expect(await violations(`${SHAPED} .a { animation: pop 300ms var(--ease-pop); }`)).toHaveLength(
      1
    );
  });

  it('rejects the implicit ease of a shorthand that names no curve', async () => {
    expect(await violations(`${SHAPED} .a { animation: pop 300ms; }`)).toHaveLength(1);
  });

  it('accepts a shaped block played linear', async () => {
    expect(await violations(`${SHAPED} .a { animation: pop 300ms linear both; }`)).toEqual([]);
  });

  it('accepts ease-in-out, which rests at every turning point', async () => {
    expect(await violations(`${SHAPED} .a { animation: pop 300ms ease-in-out; }`)).toEqual([]);
  });

  it('accepts any curve on a single-segment block', async () => {
    const code = `
      @keyframes rise { from { transform: scale(0); } to { transform: scale(1); } }
      .a { animation: rise 300ms var(--ease-pop); }
    `;
    expect(await violations(code)).toEqual([]);
  });

  it('counts a comma-joined keyframe selector as one stop per offset', async () => {
    const code = `
      @keyframes hold { 0% { scale: 0.5; } 40%, 80% { scale: 1; } }
      .a { animation: hold 1s ease; }
    `;
    expect(await violations(code)).toHaveLength(1);
  });

  it('checks each layer of a multi-animation shorthand', async () => {
    const code = `${SHAPED}
      @keyframes fade { to { opacity: 0; } }
      .a { animation: fade 1s ease, pop 300ms cubic-bezier(0.34, 1.56, 0.64, 1); }
    `;
    expect(await violations(code)).toHaveLength(1);
  });

  it('ignores opacity-only stops when counting the shape', async () => {
    const code = `
      @keyframes glow { 0% { opacity: 0; } 50% { opacity: 1; } 100% { opacity: 0.5; } }
      .a { animation: glow 1s var(--ease-glide); }
    `;
    expect(await violations(code)).toEqual([]);
  });
});
