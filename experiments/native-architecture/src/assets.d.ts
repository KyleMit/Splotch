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
