declare module '*.css';

// Metro asset IDs and web asset URLs/descriptors cross the bundled image boundary.
declare module '*.webp' {
  const source: number | string | { uri: string; width: number; height: number };
  export { source as default };
}

// The web export's font files cross the same Metro asset boundary.
declare module '*.woff2' {
  const source: number | string | { uri: string; width: number; height: number };
  export { source as default };
}

// The native apps read the Farm book's line art from the shipped SVG files (bundledOutlines.ts).
declare module '*.svg' {
  const source: number | string;
  export { source as default };
}
