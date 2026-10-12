// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { brand } from '../design/tokens';
import sunny from './deferred/dottie-sunny.svg?raw';

const expressions = import.meta.glob<string>('./deferred/dottie-*.svg', {
  eager: true,
  query: '?raw',
  import: 'default',
});

const bodyPath = (svg: string) => svg.match(/<path\b[^>]*>/)?.[0] ?? '';
const bodyShape = (svg: string) => bodyPath(svg).match(/\sd="([^"]+)"/)?.[1];

describe('Dottie expressions', () => {
  it('includes the reference expression with a body path', () => {
    expect(expressions).toHaveProperty('./deferred/dottie-sunny.svg', sunny);
    expect(bodyShape(sunny)).toMatch(/^M\d/);
  });

  it.each(Object.entries(expressions))('%s shares the reference silhouette', (_path, svg) => {
    expect(bodyShape(svg)).toBe(bodyShape(sunny));
  });

  it.each(Object.entries(expressions))(
    '%s keeps its body connected to the brand token',
    (_path, svg) => {
      expect(bodyPath(svg)).toContain(`fill:var(--brand,${brand.brand})`);
    }
  );
});
