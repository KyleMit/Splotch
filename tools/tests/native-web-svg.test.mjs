// @vitest-environment happy-dom
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createElement, createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { NATIVE_ICONS } from '../../src/rsdDrawing/icons.generated.ts';
import { NATIVE_DEFERRED_ICONS } from '../../src/rsdDrawing/icons.deferred.generated.ts';
import { NATIVE_SPLOTCHY } from '../../src/rsdDrawing/splotchy.generated.ts';
import { ROOT } from '../lib/proc.mjs';

// Metro resolves react-native to React Native Web for the web export, and react-native-svg's
// XML renderer to its web elements.
vi.mock('react-native', () => import('react-native-web'));
vi.mock(
  'react-native-svg/lib/module/elements',
  () => import('react-native-svg/lib/module/elements.web.js')
);
const released = {
  ...(await import('react-native-svg/lib/module/elements.web.js')),
  SvgXml: (await import('react-native-svg/lib/module/xml.js')).SvgXml,
};
const web = await import('../../src/platform/svg.web.ts');

const SRC = join(ROOT, 'src');
const PLATFORM_SVG = 'platform/svg.ts';
const SVG_IMPORT = /from\s*'react-native-svg'/;
const EXPORT_LIST = /export \{([^}]*)\} from 'react-native-svg';/;
const COLORING = join(ROOT, 'assets/static/coloring');
// The released SvgXml copies its markup onto the <svg> as an xml attribute; nothing reads it.
const RELEASED_ONLY_ATTRIBUTES = new Set(['xml']);

function sources(directory = SRC) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.tsx?$/.test(entry.name) ? [relative(SRC, path)] : [];
  });
}

// The rendered tree with each element's attributes sorted, so prop order cannot differ a match.
function canonical(markup) {
  const host = document.createElement('div');
  host.innerHTML = markup;
  const node = (element) => ({
    tag: element.tagName.toLowerCase(),
    attributes: [...element.attributes]
      .filter(({ name }) => !RELEASED_ONLY_ATTRIBUTES.has(name))
      .map(({ name, value }) => `${name}=${value}`)
      .sort(),
    children: [...element.childNodes].map((child) =>
      child.nodeType === Node.ELEMENT_NODE ? node(child) : child.textContent
    ),
  });
  return [...host.children].map(node);
}

function bothRender(tree) {
  const [expected, actual] = [released, web].map((svg) =>
    canonical(renderToStaticMarkup(tree(svg)))
  );
  expect(actual).toEqual(expected);
  return actual;
}

function iconMarkup() {
  return [
    ...Object.entries({ ...NATIVE_ICONS, ...NATIVE_DEFERRED_ICONS }).flatMap(([name, themes]) =>
      Object.entries(themes).map(([theme, xml]) => [`${name} ${theme}`, xml])
    ),
    ['splotchy', NATIVE_SPLOTCHY],
  ];
}

describe('the web export’s SVG elements', () => {
  it('are the only way app code reaches react-native-svg', () => {
    const offenders = sources().filter(
      (path) => path !== PLATFORM_SVG && SVG_IMPORT.test(readFileSync(join(SRC, path), 'utf8'))
    );
    expect(offenders).toEqual([]);
    expect("import Svg from 'react-native-svg';").toMatch(SVG_IMPORT);
  });

  it('export every name the native module re-exports', () => {
    const native = EXPORT_LIST.exec(readFileSync(join(SRC, PLATFORM_SVG), 'utf8'))[1]
      .split(',')
      .map((name) => name.trim().replace(/^default as /, ''))
      .filter(Boolean);
    expect(native).toContain('SvgXml');
    expect(Object.keys(web).sort()).toEqual(native.sort());
    for (const name of native) expect(released[name], name).toBeDefined();
  });

  it.each(iconMarkup())('render the %s icon as the released SvgXml does', (_, xml) => {
    const [svg] = bothRender(({ SvgXml }) => createElement(SvgXml, { xml, width: 32, height: 32 }));
    expect(svg.tag).toBe('svg');
    expect(svg.children.length).toBeGreaterThan(0);
  });

  it.each(['dinosaur/trex-wide.overlay.svg', 'dinosaur/brachiosaurus-tall.dark.overlay.svg'])(
    'render the downloaded %s outline as the released SvgXml does',
    (file) => {
      const xml = readFileSync(join(COLORING, file), 'utf8');
      const [svg] = bothRender(({ SvgXml }) =>
        createElement(SvgXml, { xml, width: 1024, height: 768 })
      );
      expect(svg.attributes).toContain('width=1024');
    }
  );

  it('rewrite every prop the drawing paper passes as the released elements do', () => {
    const [svg] = bothRender((s) =>
      createElement(
        s.Svg,
        { width: 200, height: 100, viewBox: '0 0 200 100', style: { position: 'absolute' } },
        createElement(
          s.Defs,
          null,
          createElement(
            s.Pattern,
            {
              id: 'wax',
              x: 0,
              y: 0,
              width: 8,
              height: 8,
              patternUnits: 'userSpaceOnUse',
              patternTransform: 'rotate(15)',
            },
            createElement(s.Image, { href: { uri: 'tile.png' }, width: 8, height: 8 })
          ),
          createElement(
            s.LinearGradient,
            { id: 'shine', gradientTransform: 'rotate(90)' },
            createElement(s.Stop, { offset: 0, stopColor: '#fff', stopOpacity: 0.5 })
          ),
          createElement(
            s.Mask,
            { id: 'cover', style: { maskType: 'luminance' }, x: 0, y: 0 },
            createElement(s.Rect, { width: 200, height: 100, fill: '#fff' })
          ),
          createElement(
            s.Filter,
            { id: 'glaze', filterUnits: 'userSpaceOnUse', x: 0, y: 0, width: 200, height: 100 },
            createElement(s.FeBlend, { in: 'SourceGraphic', mode: 'multiply' }),
            createElement(s.FeComposite, { operator: 'in', in2: 'SourceAlpha' })
          ),
          createElement(s.ClipPath, { id: 'clip' }, createElement(s.Ellipse, { rx: 4, ry: 2 }))
        ),
        createElement(
          s.G,
          { transform: 'scale(2)', style: { mixBlendMode: 'multiply' } },
          createElement(
            s.G,
            { x: 3, y: 4 },
            createElement(s.Use, { href: '#wax' }),
            createElement(s.Path, { d: 'M0 0L10 10', strokeWidth: 3, strokeLinecap: 'round' })
          ),
          createElement(s.Circle, { cx: 5, cy: 5, r: 2, origin: '5, 5', opacity: 0.4 }),
          createElement(s.Polygon, { points: '0,0 4,0 2,3', originX: 2, originY: 1 }),
          createElement(s.Ellipse, { rx: 4, ry: 2, transform: [1, 0, 0, 1, 3, 4] })
        ),
        createElement(s.Image, {
          href: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg"/>',
          x: 0,
          y: 0,
          preserveAspectRatio: 'none',
        }),
        createElement(s.Rect, { x: 1, y: 1, width: 4, height: 4, fontSize: 12, rx: 1 })
      )
    );
    expect(svg.children).toHaveLength(4);
  });

  it('hold the rendered element where CaptureSvg.web.tsx reads it', async () => {
    const { createRoot } = await import('react-dom/client');
    const { act } = await import('react');
    const host = document.createElement('div');
    const ref = createRef();
    const root = createRoot(host);
    await act(async () => root.render(createElement(web.Svg, { ref, width: 4, height: 4 })));
    expect(ref.current.elementRef.current).toBe(host.querySelector('svg'));
    await act(async () => root.unmount());
  });

  it('refuse the react-native-svg props they do not rewrite rather than drop them', () => {
    expect(() =>
      renderToStaticMarkup(createElement(web.Path, { d: 'M0 0', onPress: () => {} }))
    ).toThrow('Web SVG elements take no press handlers');
    expect(() =>
      renderToStaticMarkup(createElement(web.G, { transform: [{ translateX: 2 }] }))
    ).toThrow('not a transform list');
    expect(() => renderToStaticMarkup(createElement(web.Image, { href: 7 }))).toThrow(
      'not a bundled asset id'
    );
  });
});
