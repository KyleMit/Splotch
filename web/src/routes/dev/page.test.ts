// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { DEV_HARNESSES } from './dev-harnesses';

// Guards against DEV_HARNESSES drifting from the actual harness routes: nothing
// else fails if a `routes/dev/*` subdirectory is added or removed without
// updating this list, so /dev would silently link to a 404 or omit a harness.
const harnessPages = import.meta.glob('./*/+page.svelte');

const harnessDirNames = Object.keys(harnessPages)
  .map((path) => path.match(/^\.\/([^/]+)\/\+page\.svelte$/)?.[1])
  .filter((name): name is string => name !== undefined);

describe('DEV_HARNESSES matches routes/dev/*', () => {
  it('lists exactly the harness subdirectories that exist', () => {
    expect(harnessDirNames.length).toBeGreaterThan(0);

    const listedHrefs = new Set(DEV_HARNESSES.map((h) => h.href));
    const expectedHrefs = new Set(harnessDirNames.map((name) => `/dev/${name}`));

    expect(listedHrefs).toEqual(expectedHrefs);
  });
});
