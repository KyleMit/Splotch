import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const SHIPPING_WORKER = new URL(
  '../../android/app/src/main/java/art/splotch/app/ColoringPackWorker.java',
  import.meta.url
);
const NATIVE_PROBE = new URL(
  '../../experiments/native-architecture/android/app/src/main/java/art/splotch/migration/probe/',
  import.meta.url
);
const NATIVE_WORKER = new URL('SplotchLibraryWorker.kt', NATIVE_PROBE);
const NATIVE_DOWNLOADS = new URL('SplotchLibraryDownloads.kt', NATIVE_PROBE);

// android.net.ConnectivityManager's published RESTRICT_BACKGROUND_STATUS_* values.
const RESTRICT_BACKGROUND_STATUS = { DISABLED: 1, WHITELISTED: 2, ENABLED: 3 };

const DECISION_TABLE = [
  [false, false, 'DISABLED', false],
  [false, false, 'WHITELISTED', false],
  [false, false, 'ENABLED', false],
  [false, true, 'DISABLED', false],
  [false, true, 'WHITELISTED', false],
  [false, true, 'ENABLED', false],
  [true, false, 'DISABLED', false],
  [true, false, 'WHITELISTED', false],
  [true, false, 'ENABLED', false],
  [true, true, 'DISABLED', false],
  [true, true, 'WHITELISTED', false],
  [true, true, 'ENABLED', true],
];

const HELPERS = {
  'shipping ColoringPackWorker.java': {
    source: SHIPPING_WORKER,
    pattern:
      /static boolean dataSaverDefers\(\s*boolean allowMetered, boolean activeNetworkMetered, int restrictBackgroundStatus\)\s*\{\s*return ([^;]+);\s*\}/,
  },
  'React Native SplotchLibraryWorker.kt': {
    source: NATIVE_WORKER,
    pattern:
      /fun dataSaverDefers\(allowMetered: Boolean, activeNetworkMetered: Boolean, restrictBackgroundStatus: Int\): Boolean \{\s*return ([^\n]+)\n\s*\}/,
  },
};

const EXPRESSION_TOKENS =
  /^(?:\s+|&&|\|\||===|!==|!|\(|\)|\d+|allowMetered|activeNetworkMetered|restrictBackgroundStatus)*$/;

async function compiledDecision({ source, pattern }) {
  const match = (await readFile(source, 'utf8')).match(pattern);
  expect(match, 'pure dataSaverDefers helper').not.toBeNull();
  const expression = match[1]
    .replace(
      /ConnectivityManager\.RESTRICT_BACKGROUND_STATUS_([A-Z]+)/g,
      (_, status) => `${RESTRICT_BACKGROUND_STATUS[status]}`
    )
    .replace(/([!=])=/g, '$1==');
  expect(expression).toMatch(EXPRESSION_TOKENS);
  return new Function(
    'allowMetered',
    'activeNetworkMetered',
    'restrictBackgroundStatus',
    `return ${expression};`
  );
}

describe.each(Object.entries(HELPERS))('%s Data Saver deferral', (_, helper) => {
  it.each(DECISION_TABLE)(
    'allowMetered=%s, active network metered=%s, restriction %s defers: %s',
    async (allowMetered, metered, status, defers) => {
      const decide = await compiledDecision(helper);
      expect(decide(allowMetered, metered, RESTRICT_BACKGROUND_STATUS[status])).toBe(defers);
    }
  );
});

const occurrences = (source, needle) => source.split(needle).length - 1;

it('feeds worker admission from the active network and restriction status in both apps', async () => {
  const [shipping, worker] = await Promise.all([
    readFile(SHIPPING_WORKER, 'utf8'),
    readFile(NATIVE_WORKER, 'utf8'),
  ]);
  expect(shipping).toContain(
    'if (dataSaverDefers(job.getBoolean("allowMetered"))) return Result.retry();'
  );
  expect(shipping).toMatch(
    /dataSaverDefers\(\s*allowMetered, manager\.isActiveNetworkMetered\(\), manager\.getRestrictBackgroundStatus\(\)\)/
  );
  expect(occurrences(shipping, 'getRestrictBackgroundStatus')).toBe(1);
  expect(worker).toContain(
    'if (dataSaverDefers(applicationContext, stored.getBoolean("allowMetered"))) return Result.retry()'
  );
  expect(worker).toContain(
    'dataSaverDefers(allowMetered, manager.isActiveNetworkMetered, manager.restrictBackgroundStatus)'
  );
  expect(occurrences(worker, 'manager.restrictBackgroundStatus')).toBe(1);
});

it('classifies a deferred React Native attempt through the worker admission owner', async () => {
  const downloads = await readFile(NATIVE_DOWNLOADS, 'utf8');
  expect(downloads).toContain(
    'val dataSaver = SplotchLibraryWorker.dataSaverDefers(context, allowMetered)'
  );
  expect(downloads).toContain(
    'if (deferred && dataSaver) "library_metered" else "library_download"'
  );
  expect(downloads).not.toMatch(/restrictBackgroundStatus|isActiveNetworkMetered/);
});
