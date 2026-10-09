// Metro's native asset numbers and web descriptors share this supported Audio/Asset source boundary.
declare module '*.mp3' {
  const source: number | string | { uri: string; width: number; height: number };
  export { source as default };
}
