import { createElement } from 'react';

// React Strict DOM reduced to the plain elements its web build emits, styles dropped, for suites
// that mount React Strict DOM surfaces on react-native stand-ins without its compiler.
export function rsdWebStub() {
  const elements = new Map();
  const element = (tag) => {
    if (!elements.has(tag))
      elements.set(tag, ({ style: _style, ...props }) => createElement(tag, props));
    return elements.get(tag);
  };
  return {
    html: new Proxy({}, { get: (_, tag) => element(tag) }),
    css: {
      create: (styles) =>
        Object.fromEntries(
          Object.entries(styles).map(([key, value]) => [
            key,
            typeof value === 'function' ? () => null : null,
          ])
        ),
      defineVars: (values) => values,
      createTheme: () => null,
    },
  };
}
