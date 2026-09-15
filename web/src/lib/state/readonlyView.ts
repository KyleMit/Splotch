// Read-only getters over a `$state` object whose keys come from a table rather
// than a literal (the settings tables, the parental-gate policy map), where
// spelling each getter out by hand would reintroduce the drift the table exists
// to prevent. Every getter reads through the proxy, so a read stays tracked; a
// write hits a getter-only property and throws, as it does on a literal getter.
export function readonlyView<T extends object>(source: T): Readonly<T> {
  const view: Partial<T> = {};
  // Object.keys is the untyped edge: it returns string[] for any object.
  for (const key of Object.keys(source) as (keyof T)[]) {
    Object.defineProperty(view, key, { get: () => source[key], enumerable: true });
  }
  return view as Readonly<T>;
}
