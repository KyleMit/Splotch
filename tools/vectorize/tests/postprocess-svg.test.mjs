import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { committedVectorizerSvgPaths, postprocessVectorizerSvg } from '../postprocess-svg.mjs';

const RAW_SVG = `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0.0 0.0 1024.0 1536.0"><path fill="#000000" d="M0 0h1v1z"/></svg>`;

describe('Vectorizer SVG post-processing', () => {
  it('optimizes the service output and restores intrinsic dimensions from its viewBox', () => {
    const output = postprocessVectorizerSvg(RAW_SVG);

    expect(output).toMatch(
      /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="1024" height="1536" viewBox="0 0 1024 1536">/
    );
    expect(output).not.toContain('<?xml');
  });

  it('reaches a byte-stable fixed point', () => {
    const once = postprocessVectorizerSvg(RAW_SVG);

    expect(postprocessVectorizerSvg(once)).toBe(once);
  });

  it('can bake a dark-theme ink color into the root SVG', () => {
    const output = postprocessVectorizerSvg(RAW_SVG, 'vectorizer.svg', { fill: '#FFF' });

    expect(output).toMatch(/^<svg\b[^>]*\bfill="#fff"/);
    expect(postprocessVectorizerSvg(output)).toBe(output);
  });

  it.each([
    ['missing', '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h1"/></svg>'],
    ['non-positive', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 0 10"/>'],
  ])('rejects a %s viewBox', (_name, source) => {
    expect(() => postprocessVectorizerSvg(source)).toThrow(/viewBox/);
  });

  it.each(committedVectorizerSvgPaths().map((path) => [path]))(
    'keeps committed vector art optimized with intrinsic dimensions: %s',
    (path) => {
      const source = readFileSync(path, 'utf8');

      expect(postprocessVectorizerSvg(source, path)).toBe(source);
      expect(source).toMatch(/^<svg\b[^>]*\bwidth="[^"]+"[^>]*\bheight="[^"]+"[^>]*\bviewBox=/);
    }
  );
});
