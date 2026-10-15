import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from '../lib/proc.mjs';

const APP = join(ROOT, 'experiments/native-architecture');
const babel = createRequire(join(APP, 'package.json'))('@babel/core');
const RSD_IMPORT = /from\s*["']react-strict-dom["']/;
const COMPILED_ONLY = `import { css, html } from 'react-strict-dom';
export function Card() {
  return <html.div style={styles.card} />;
}
const styles = css.create({ card: { padding: 4 } });
`;
const READS_AN_ELEMENT = `import { html } from 'react-strict-dom';
export const HEADINGS = { h2: html.h2 };
`;

// The project's own Babel config, as Metro calls it for a production bundle.
function transform(source, platform) {
  return babel.transformSync(source, {
    filename: join(APP, 'src/rsdDrawing/StrictDomImportProbe.tsx'),
    cwd: APP,
    babelrc: false,
    configFile: join(APP, 'babel.config.cjs'),
    caller: { name: 'metro', platform, isDev: false, supportsStaticESM: true },
  }).code;
}

describe('React Strict DOM imports in the web build', () => {
  it('drop once the preset has compiled every element and style away', () => {
    const web = transform(COMPILED_ONLY, 'web');
    expect(web).toContain('react-strict-dom/runtime');
    expect(web).not.toMatch(RSD_IMPORT);
  });

  it('stay in a module that reads an element as a value', () => {
    expect(transform(READS_AN_ELEMENT, 'web')).toMatch(RSD_IMPORT);
  });

  it('stay on native, where React Strict DOM renders at runtime', () => {
    expect(transform(COMPILED_ONLY, 'ios')).toMatch(RSD_IMPORT);
  });
});
