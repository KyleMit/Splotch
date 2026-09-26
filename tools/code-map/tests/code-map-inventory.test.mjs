import { describe, expect, it } from 'vitest';

import { countLinesByOid, listTrackedBlobs, resolveCommit } from '../lib/code-map-inventory.mjs';

const MISSING_OID = '0'.repeat(40);

describe('countLinesByOid', () => {
  const [first, second] = listTrackedBlobs(resolveCommit('HEAD').sha).filter((blob) =>
    ['package.json', 'knip.json'].includes(blob.path)
  );

  it('counts every requested blob', () => {
    const lines = countLinesByOid([first.oid, second.oid]);
    expect([...lines.keys()]).toEqual([first.oid, second.oid]);
    expect(lines.get(first.oid)).toBeGreaterThan(0);
    expect(lines.get(second.oid)).toBeGreaterThan(0);
  });

  it('fails instead of dropping blobs when git reports one missing', () => {
    expect(() => countLinesByOid([first.oid, MISSING_OID, second.oid])).toThrow(
      `expected blob ${MISSING_OID}, got "${MISSING_OID} missing"`
    );
  });
});
