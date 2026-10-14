// React Native Web ships this module untyped. It is the unstable_createElement react-native-svg's
// web elements render through: React Native styles and props in, a DOM element out.
declare module 'react-native-web/dist/exports/createElement' {
  import type { ReactElement } from 'react';
  const createElement: (component: string, props: object) => ReactElement;
  export = createElement;
}
