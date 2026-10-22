// Every SVG element the app draws comes from here. The native apps draw with react-native-svg;
// svg.web.ts renders the same DOM without the library's transform and XML parsers (ADR-0179).
export {
  Circle,
  ClipPath,
  Defs,
  Ellipse,
  FeBlend,
  FeComposite,
  Filter,
  G,
  Image,
  LinearGradient,
  Mask,
  Path,
  Pattern,
  Polygon,
  RadialGradient,
  Rect,
  Stop,
  default as Svg,
  SvgXml,
  Use,
} from 'react-native-svg';
