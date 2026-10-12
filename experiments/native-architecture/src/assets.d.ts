declare module '*.css';

// Metro asset IDs and web asset URLs/descriptors cross the bundled image boundary.
declare module '*.webp' {
  const source: number | string | { uri: string; width: number; height: number };
  export { source as default };
}
