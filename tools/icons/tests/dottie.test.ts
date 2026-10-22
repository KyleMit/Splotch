// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { brand } from '../../../src/lib/design/tokens';

const expressions = import.meta.glob<string>('../../../assets/icons/deferred/dottie-*.svg', {
  eager: true,
  query: '?raw',
  import: 'default',
});

const bodyPath = (svg: string) => svg.match(/<path\b[^>]*>/)?.[0] ?? '';

describe('Dottie expressions', () => {
  it.each(Object.entries(expressions))(
    '%s keeps its body connected to the brand token',
    (_path, svg) => {
      expect(bodyPath(svg)).toContain(`fill:var(--brand,${brand.brand})`);
    }
  );
});
