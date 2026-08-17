// The store device slots every screenshot set is produced for, shared by the
// /dev/store-frames harness and tools/marketing-assets/gen-store-assets.mjs.
// The generator imports this under `node --experimental-strip-types`, so this
// module (and everything it imports) uses relative paths only — no $lib alias.

export type StoreOrientation = 'landscape' | 'portrait';

const TARGET_SOURCE = [
  { name: 'phone', dir: 'screenshots/phone', width: 1080, height: 1920, orientation: 'portrait' },
  {
    name: 'tablet10',
    dir: 'screenshots/tablet10',
    width: 1920,
    height: 1080,
    orientation: 'landscape',
  },
  {
    name: 'iphone69',
    dir: 'screenshots/iphone69',
    width: 1290,
    height: 2796,
    orientation: 'portrait',
  },
  {
    name: 'ipad13',
    dir: 'screenshots/ipad13',
    width: 2732,
    height: 2048,
    orientation: 'landscape',
  },
] as const satisfies readonly {
  name: string;
  dir: string;
  width: number;
  height: number;
  orientation: StoreOrientation;
}[];

export type StoreTarget = (typeof TARGET_SOURCE)[number];
export type StoreTargetName = StoreTarget['name'];

export const STORE_TARGETS: readonly StoreTarget[] = TARGET_SOURCE;

export function storeTarget(name: StoreTargetName): StoreTarget {
  const target = STORE_TARGETS.find((entry) => entry.name === name);
  if (!target) throw new Error(`Unknown store target: ${name}`);
  return target;
}

// Google Play feature graphic — its own fixed slot, rendered by the same
// harness route (`?page=feature-graphic`) without a device target.
export const FEATURE_GRAPHIC = { width: 1024, height: 500 } as const;
