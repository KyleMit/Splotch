import type { BundledOutlineVariant, OutlineNode } from './bundledBookAssets';

const OUTLINE_ATTRIBUTES = {
  path: ['d'],
  ellipse: ['rx', 'ry', 'transform'],
  rect: ['width', 'height', 'x', 'y', 'rx', 'ry', 'transform'],
  circle: ['cx', 'cy', 'r'],
} as const satisfies Record<OutlineNode['kind'], readonly string[]>;
const ROOT_ATTRIBUTES = ['xmlns', 'width', 'height', 'fill', 'viewBox'] as const;
const SVG_DOCUMENT = /^<svg ([^>]*)>(.*)<\/svg>\s*$/s;
const ELEMENT = /<([a-z]+)((?: [a-zA-Z]+="[^"]*")*)\/>/y;
const ATTRIBUTE = / ([a-zA-Z]+)="([^"]*)"/g;
const DEFAULT_INK = '#000';

function isOutlineKind(kind: string): kind is OutlineNode['kind'] {
  return Object.hasOwn(OUTLINE_ATTRIBUTES, kind);
}

function attributes(
  source: string,
  allowed: readonly string[],
  context: string
): Record<string, string> {
  const entries = [...source.matchAll(ATTRIBUTE)].map(([, name, value]) => [name, value]);
  const unknown = entries.filter(([name]) => !allowed.includes(name));
  if (unknown.length)
    throw new Error(`Unsupported ${context} attributes: ${unknown.map(([name]) => name).join()}`);
  return Object.fromEntries(entries);
}

function required(values: Record<string, string>, name: string, context: string): string {
  const value = values[name];
  if (value === undefined) throw new Error(`Missing ${context} ${name}`);
  return value;
}

function outlineNode(kind: OutlineNode['kind'], source: string, name: string): OutlineNode {
  const context = `${name} ${kind}`;
  const values = attributes(source, OUTLINE_ATTRIBUTES[kind], context);
  const need = (attribute: string) => required(values, attribute, context);
  // The canonical overlays write attributes in a fixed order, which the generated web modules
  // keep; spreading the parsed attributes preserves that order and omits absent optionals.
  if (kind === 'path') return { kind, ...values, d: need('d') };
  if (kind === 'ellipse') return { kind, ...values, rx: need('rx'), ry: need('ry') };
  if (kind === 'circle') return { kind, ...values, cx: need('cx'), cy: need('cy'), r: need('r') };
  return {
    kind,
    ...values,
    x: need('x'),
    y: need('y'),
    width: need('width'),
    height: need('height'),
  };
}

// The canonical overlays are flat SVGO output: one root and self-closing shape children. The
// generator writes the web export's outline modules with this parser and the native apps parse
// the same shipped files with it at runtime, so both platforms draw identical line art.
export function parseOverlay(svg: string, name: string): BundledOutlineVariant {
  const document = SVG_DOCUMENT.exec(svg);
  if (!document) throw new Error(`Unexpected SVG document in ${name}`);
  const root = attributes(` ${document[1]}`, ROOT_ATTRIBUTES, `${name} root`);
  const body = document[2];
  const outline: OutlineNode[] = [];
  for (let offset = 0; offset < body.length; offset = ELEMENT.lastIndex) {
    ELEMENT.lastIndex = offset;
    const match = ELEMENT.exec(body);
    if (!match) throw new Error(`Unexpected SVG content in ${name}`);
    const [, kind, source] = match;
    if (!isOutlineKind(kind)) throw new Error(`Unsupported ${kind} element in ${name}`);
    outline.push(outlineNode(kind, source, name));
  }
  if (outline.length === 0) throw new Error(`Empty SVG outline in ${name}`);
  return {
    viewBox: required(root, 'viewBox', `${name} root`),
    ink: root.fill ?? DEFAULT_INK,
    outline,
  };
}
