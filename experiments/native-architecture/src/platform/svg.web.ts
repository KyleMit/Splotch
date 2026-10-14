import {
  Component,
  createElement as createReactElement,
  createRef,
  useMemo,
  type ComponentClass,
  type ReactNode,
} from 'react';
import createElement from 'react-native-web/dist/exports/createElement';

// react-native-svg's web elements (lib/module/web/WebShape.js) render each element through React
// Native Web's createElement after rewriting its non-standard props. That rewrite also carries a
// parser for React Native transform lists, and SvgXml carries an XML parser: about 45 KB of the
// web startup path the app does not use. These elements make the same rewrite for the props the
// app passes, and tools/tests/native-web-svg.test.mjs renders both and compares the DOM.

type ShapeProps = { readonly [prop: string]: unknown; readonly children?: ReactNode };
type ShapeClass = ComponentClass<ShapeProps>;

const TOUCH_PROPS = ['onPress', 'onPressIn', 'onPressOut', 'onLongPress'];
const SVG_DATA_URI = /^(data:image\/svg\+xml;utf8,)(.*)/;
const SEPARATED_NAME = /[:-]([a-z])/g;

function present(value: unknown) {
  return value !== null && value !== undefined;
}

function transformProps(props: ShapeProps) {
  const list: string[] = [];
  const { translate, translateX, translateY, scale, scaleX, scaleY, rotation, skewX, skewY } =
    props;
  if (present(translate)) list.push(`translate(${String(translate)})`);
  if (present(translateX) || present(translateY))
    list.push(`translate(${String(translateX || 0)}, ${String(translateY || 0)})`);
  if (present(scale)) list.push(`scale(${String(scale)})`);
  if (present(scaleX) || present(scaleY))
    list.push(`scale(${String(scaleX || 1)}, ${String(scaleY || 1)})`);
  if (present(rotation)) list.push(`rotate(${String(rotation)})`);
  if (present(skewX)) list.push(`skewX(${String(skewX)})`);
  if (present(skewY)) list.push(`skewY(${String(skewY)})`);
  return list;
}

function transformAttribute(transform: unknown, props?: ShapeProps) {
  const list = props ? transformProps(props) : [];
  if (Array.isArray(transform)) {
    if (typeof transform[0] !== 'number')
      throw new Error('A web SVG transform is a string or a matrix, not a transform list.');
    list.push(`matrix(${transform.join(' ')})`);
  } else if (typeof transform === 'string') list.push(transform);
  return list.length ? list.join(' ') : undefined;
}

function hrefUri(href: unknown) {
  if (typeof href === 'number') throw new Error('A web SVG href is a URI, not a bundled asset id.');
  const uri =
    typeof href === 'string'
      ? href
      : typeof href === 'object' && href && 'uri' in href && typeof href.uri === 'string'
        ? href.uri
        : undefined;
  const svg = uri ? SVG_DATA_URI.exec(uri) : null;
  return svg ? `${svg[1]}${encodeURIComponent(svg[2])}` : uri;
}

const FONT_PROPS = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle'];
// The props react-native-svg's prepare() rewrites instead of passing them to the element.
const REWRITTEN_PROPS = new Set([
  'transform',
  'origin',
  'originX',
  'originY',
  ...FONT_PROPS,
  'style',
  'forwardedRef',
  'gradientTransform',
  'patternTransform',
  'onPress',
]);

function domProps(props: ShapeProps, ref: (element: SVGElement | null) => void) {
  if (TOUCH_PROPS.some((prop) => props[prop]))
    throw new Error('Web SVG elements take no press handlers; wrap them in a pressable instead.');
  const clean: Record<string, unknown> = Object.fromEntries(
    Object.entries(props).filter(([prop]) => !REWRITTEN_PROPS.has(prop))
  );
  const { origin, originX, originY } = props;
  if (present(origin)) clean['transform-origin'] = String(origin).replace(',', ' ');
  else if (present(originX) || present(originY))
    clean['transform-origin'] = `${String(originX || 0)} ${String(originY || 0)}`;
  const transforms = {
    transform: transformAttribute(props.transform, props),
    gradientTransform: transformAttribute(props.gradientTransform),
    patternTransform: transformAttribute(props.patternTransform),
  };
  for (const [name, value] of Object.entries(transforms)) if (value) clean[name] = value;
  clean.ref = ref;
  const fonts = Object.fromEntries(
    FONT_PROPS.flatMap((prop) => (present(props[prop]) ? [[prop, props[prop]]] : []))
  );
  clean.style = props.style ? [props.style, fonts] : fonts;
  if (present(props.href)) clean.href = hrefUri(props.href);
  return clean;
}

abstract class WebShape extends Component<ShapeProps> {
  // The rendered element, read by CaptureSvg.web.tsx as it reads react-native-svg's.
  readonly elementRef = createRef<SVGElement>();
  protected abstract readonly tag: string;
  private readonly attach = (element: SVGElement | null) => {
    this.elementRef.current = element;
  };

  protected shapeProps(props: ShapeProps): ShapeProps {
    return props;
  }

  render() {
    return createElement(this.tag, domProps(this.shapeProps(this.props), this.attach));
  }
}

function shape(tag: string) {
  return class extends WebShape {
    protected readonly tag = tag;
  };
}

export const Circle = shape('circle');
export const ClipPath = shape('clipPath');
export const Defs = shape('defs');
export const Ellipse = shape('ellipse');
export const FeBlend = shape('feBlend');
export const FeComposite = shape('feComposite');
export const Filter = shape('filter');
export const Image = shape('image');
export const LinearGradient = shape('linearGradient');
export const Mask = shape('mask');
export const Path = shape('path');
export const Pattern = shape('pattern');
export const Polygon = shape('polygon');
export const RadialGradient = shape('radialGradient');
export const Rect = shape('rect');
export const Stop = shape('stop');
export const Svg = shape('svg');
export const Use = shape('use');

export class G extends WebShape {
  protected readonly tag = 'g';

  protected shapeProps({ x, y, ...rest }: ShapeProps): ShapeProps {
    return (x || y) && !rest.translate
      ? { ...rest, translate: `${String(x || 0)}, ${String(y || 0)}` }
      : rest;
  }
}

// Every tag react-native-svg's SvgXml renders (lib/module/xmlTags.js); any other renders nothing.
const XML_TAGS = new Map<string, ShapeClass>([
  ['circle', Circle],
  ['clipPath', ClipPath],
  ['defs', Defs],
  ['ellipse', Ellipse],
  ['feBlend', FeBlend],
  ['feComposite', FeComposite],
  ['filter', Filter],
  ['g', G],
  ['image', Image],
  ['linearGradient', LinearGradient],
  ['mask', Mask],
  ['path', Path],
  ['pattern', Pattern],
  ['polygon', Polygon],
  ['radialGradient', RadialGradient],
  ['rect', Rect],
  ['stop', Stop],
  ['svg', Svg],
  ['use', Use],
  ...[
    'feColorMatrix',
    'feComponentTransfer',
    'feConvolveMatrix',
    'feDiffuseLighting',
    'feDisplacementMap',
    'feDistantLight',
    'feDropShadow',
    'feFlood',
    'feFuncA',
    'feFuncB',
    'feFuncG',
    'feFuncR',
    'feGaussianBlur',
    'feImage',
    'feMerge',
    'feMergeNode',
    'feMorphology',
    'feOffset',
    'fePointLight',
    'feSpecularLighting',
    'feSpotLight',
    'feTile',
    'feTurbulence',
    'foreignObject',
    'line',
    'marker',
    'polyline',
    'symbol',
    'text',
    'textPath',
    'tspan',
  ].map((tag): [string, ShapeClass] => [tag, shape(tag)]),
]);

function camelCase(name: string) {
  return name.replace(SEPARATED_NAME, (_, letter: string) => letter.toUpperCase());
}

function inlineStyle(declarations: string) {
  return Object.fromEntries(
    declarations
      .split(';')
      .filter((declaration) => declaration.trim())
      .map((declaration) => {
        const [property = '', value = ''] = declaration.split(':');
        return [camelCase(property.trim()), value.trim()];
      })
  );
}

// react-native-svg's parser reads a numeric attribute other than id as a number.
function attributeValue(name: string, value: string): string | number {
  return name !== 'id' && value.trim() !== '' && !Number.isNaN(Number(value))
    ? Number(value)
    : value;
}

function xmlProps(element: Element) {
  const props: Record<string, unknown> = {};
  for (const { name, value } of element.attributes) {
    if (name === 'style') props.style = inlineStyle(value);
    else if (name === 'class') props.className = value;
    else props[camelCase(name)] = attributeValue(name, value);
  }
  return props;
}

function xmlChildren(element: Element): ReactNode[] {
  return [...element.childNodes].flatMap((node, key): ReactNode[] => {
    if (node instanceof Element) {
      const Tag = XML_TAGS.get(node.nodeName);
      return Tag ? [createReactElement(Tag, { key, ...xmlProps(node) }, ...xmlChildren(node))] : [];
    }
    const text = node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE;
    return text && node.textContent && /\S/.test(node.textContent) ? [node.textContent] : [];
  });
}

function parseXml(xml: string) {
  const root = new DOMParser().parseFromString(xml, 'image/svg+xml').documentElement;
  if (root.nodeName !== 'svg' || root.getElementsByTagName('parsererror').length)
    throw new Error(`Not an SVG document: ${xml.slice(0, 80)}`);
  return { props: xmlProps(root), children: xmlChildren(root) };
}

export function SvgXml({ xml, ...override }: ShapeProps & { readonly xml: string | null }) {
  const tree = useMemo(() => {
    try {
      return xml === null ? null : parseXml(xml);
    } catch (error) {
      console.error(error);
      return null;
    }
  }, [xml]);
  return tree && createReactElement(Svg, { ...tree.props, ...override }, ...tree.children);
}
