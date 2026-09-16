export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;

const nestedViews = new WeakMap<object, object>();
const readonlyValues = new WeakSet<object>();

function isPlainRecordOrArray(value: object): boolean {
  if (Array.isArray(value)) return true;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function readonlyValue<T>(value: T): DeepReadonly<T> {
  if (typeof value !== 'object' || value === null || !isPlainRecordOrArray(value)) {
    return value as DeepReadonly<T>;
  }
  if (readonlyValues.has(value)) return value as DeepReadonly<T>;

  const cached = nestedViews.get(value);
  if (cached) return cached as DeepReadonly<T>;

  const target = Object.isFrozen(value)
    ? Array.isArray(value)
      ? [...value]
      : Object.assign(Object.create(Object.getPrototypeOf(value)), value)
    : value;
  const view = new Proxy(target, {
    get(target, key, receiver) {
      return readonlyValue(Reflect.get(target, key, receiver));
    },
    getOwnPropertyDescriptor(target, key) {
      const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
      if (!descriptor || !('value' in descriptor) || !descriptor.configurable) return descriptor;
      return { ...descriptor, value: readonlyValue(descriptor.value) };
    },
    set: () => false,
    defineProperty: () => false,
    deleteProperty: () => false,
    setPrototypeOf: () => false,
    preventExtensions: () => false,
  });
  nestedViews.set(value, view);
  readonlyValues.add(view);
  return view as DeepReadonly<T>;
}

function mutatorPrototype<T extends object>(mutators: T): T {
  const prototype = {};
  for (const key of Reflect.ownKeys(mutators)) {
    const descriptor = Object.getOwnPropertyDescriptor(mutators, key);
    if (descriptor) Object.defineProperty(prototype, key, { ...descriptor, enumerable: false });
  }
  return Object.freeze(prototype) as T;
}

// Read-only getters over a `$state` object whose keys come from a table rather
// than a literal (the settings tables, the parental-gate policy map), where
// spelling each getter out by hand would reintroduce the drift the table exists
// to prevent. Every getter reads through the proxy, so a read stays tracked; a
// write hits a getter-only property and throws, as it does on a literal getter.
export function readonlyView<T extends object, Mutators extends object = Record<never, never>>(
  source: T,
  mutators?: Mutators
): DeepReadonly<T> & Mutators {
  const view: Partial<T> = Object.create(mutators ? mutatorPrototype(mutators) : Object.prototype);
  // Object.keys is the untyped edge: it returns string[] for any object.
  for (const key of Object.keys(source) as (keyof T)[]) {
    Object.defineProperty(view, key, {
      get: () => readonlyValue(source[key]),
      enumerable: true,
    });
  }
  return view as DeepReadonly<T> & Mutators;
}
