import assert from 'node:assert/strict';
import { digest, FIXTURE_PATH } from './contract.mjs';

export function verifyBuffers(value) {
  if (typeof value !== 'object' || value === null) return;
  if (value.kind === 'buffer') {
    assert.ok(Number.isSafeInteger(value.bytes) && value.bytes >= 0, 'L0_BUFFER_LENGTH_INVALID');
    assert.equal(typeof value.base64, 'string', 'L0_BUFFER_BASE64_MISSING');
    const bytes = Buffer.from(value.base64, 'base64');
    assert.equal(bytes.toString('base64'), value.base64, 'L0_BUFFER_BASE64_NONCANONICAL');
    assert.equal(bytes.length, value.bytes, 'L0_BUFFER_LENGTH_CHANGED');
    assert.equal(digest(bytes), value.sha256, 'L0_BUFFER_HASH_CHANGED');
  }
  for (const field of Object.values(value)) verifyBuffers(field);
}

function verifyEncodedValue(value) {
  assert.ok(
    value && typeof value === 'object' && !Array.isArray(value),
    'L0_ENCODED_VALUE_MISSING'
  );
  const keys = Object.keys(value).sort().join(',');
  if (value.kind === 'object' || value.kind === 'array') {
    assert.equal(keys, 'fields,kind', 'L0_ENCODED_FIELDS_MISSING');
    assert.ok(
      value.fields && typeof value.fields === 'object' && !Array.isArray(value.fields),
      'L0_ENCODED_FIELDS_MISSING'
    );
    for (const field of Object.values(value.fields)) verifyEncodedValue(field);
  } else if (value.kind === 'buffer') {
    assert.equal(keys, 'base64,bytes,kind,sha256', 'L0_ENCODED_BUFFER_MISSING');
    verifyBuffers(value);
  } else if (value.kind === 'null' || value.kind === 'undefined') {
    assert.equal(keys, 'kind', 'L0_ENCODED_NULL_FIELDS_CHANGED');
  } else if (value.kind === 'unsupported') {
    assert.equal(keys, 'kind,tag', 'L0_ENCODED_UNSUPPORTED_TAG_MISSING');
    assert.equal(typeof value.tag, 'string', 'L0_ENCODED_UNSUPPORTED_TAG_MISSING');
  } else if (value.kind === 'string' || value.kind === 'boolean' || value.kind === 'number') {
    assert.equal(keys, 'kind,value', 'L0_ENCODED_SCALAR_MISSING');
    assert.equal(
      typeof value.value,
      value.kind === 'boolean' ? 'boolean' : 'string',
      'L0_ENCODED_SCALAR_TYPE_CHANGED'
    );
    if (value.kind === 'number')
      assert.ok(
        value.value === '-0' || String(Number(value.value)) === value.value,
        'L0_ENCODED_NUMBER_CHANGED'
      );
  } else assert.fail('L0_ENCODED_KIND_MISSING');
}

function hasUnsupported(value) {
  if (value.kind === 'unsupported') return true;
  return (
    (value.kind === 'object' || value.kind === 'array') &&
    Object.values(value.fields).some(hasUnsupported)
  );
}

export function verifyHeldObservation(value) {
  assert.ok(value && typeof value === 'object', 'L0_HELD_OBSERVATION_MISSING');
  if (value.status === 'absent-database') {
    assert.ok(Array.isArray(value.databases), 'L0_HELD_DATABASE_ENUMERATION_MISSING');
    return;
  }
  if (value.status === 'absent-record') {
    assert.equal(value.count, 0, 'L0_HELD_ABSENCE_COUNT_CHANGED');
    return;
  }
  if (value.status === 'invalid-source' && value.reason === 'missing-store') {
    assert.ok(Array.isArray(value.stores), 'L0_HELD_STORES_MISSING');
    return;
  }
  assert.ok(
    ['recognized-source', 'invalid-source', 'unsupported-source'].includes(value.status),
    'L0_HELD_STATUS_MISSING'
  );
  verifyEncodedValue(value.raw);
  assert.equal(value.complete, !hasUnsupported(value.raw), 'L0_HELD_COMPLETENESS_CHANGED');
  assert.equal(value.count, 1, 'L0_HELD_PRESENCE_COUNT_CHANGED');
  assert.equal(value.key, 'pictures', 'L0_HELD_KEY_CHANGED');
  assert.ok(
    Array.isArray(value.recognized) &&
      value.recognized.every((entry) => typeof entry === 'boolean'),
    'L0_HELD_RECOGNITION_MISSING'
  );
  assert.equal(value.entryCount, value.recognized.length, 'L0_HELD_ENTRY_COUNT_CHANGED');
  assert.equal(
    value.status,
    !value.complete
      ? 'unsupported-source'
      : value.recognized.every(Boolean)
        ? 'recognized-source'
        : 'invalid-source',
    'L0_HELD_RECOGNITION_CHANGED'
  );
  assert.ok(
    Number.isSafeInteger(value.entryCount) && value.entryCount >= 0,
    'L0_HELD_ENTRY_COUNT_INVALID'
  );
  if (value.raw.kind === 'array') {
    assert.equal(value.raw.fields.length?.kind, 'number', 'L0_HELD_ARRAY_LENGTH_MISSING');
    assert.equal(
      value.raw.fields.length.value,
      String(value.entryCount),
      'L0_HELD_ARRAY_LENGTH_CHANGED'
    );
  }
  const entries =
    value.raw.kind === 'array'
      ? Array.from({ length: value.entryCount }, (_, index) => value.raw.fields[String(index)])
      : [value.raw];
  assert.equal(entries.length, value.entryCount, 'L0_HELD_RAW_ENTRY_COUNT_CHANGED');
  value.recognized.forEach((recognized, index) => {
    if (!recognized) return;
    assert.equal(entries[index]?.kind, 'object', 'L0_HELD_RECOGNIZED_OBJECT_MISSING');
    assert.equal(entries[index].fields.bytes?.kind, 'buffer', 'L0_HELD_RECOGNIZED_BYTES_MISSING');
  });
}

export function verifyPageReport(value, { command, nonce, input, platform }) {
  assert.equal(value.command, command, 'L0_COMMAND_IDENTITY_CHANGED');
  assert.equal(value.nonce, nonce, 'L0_NONCE_CHANGED');
  assert.equal(value.revision, input.revision, 'L0_PAGE_SOURCE_CHANGED');
  assert.equal(value.role, input.role, 'L0_PAGE_ROLE_CHANGED');
  verifyBuffers(value);
  if (command.startsWith('held-')) verifyHeldObservation(value.result);
  if (command === 'raw') verifyHeldObservation(value.result.held);
  if (command === 'seed') verifyHeldObservation(value.result.snapshot.held);
  if (command === 'cleanup') {
    verifyHeldObservation(value.result.held);
    verifyHeldObservation(value.result.snapshot.held);
  }
  if (command !== 'raw') return;
  assert.equal(value.result.native, true, 'L0_NATIVE_PAGE_REQUIRED');
  assert.equal(value.result.drawingSurface, false, 'L0_NORMAL_DRAWING_BOOT_REFUSED');
  assert.equal(
    value.result.origin,
    platform === 'android' ? 'https://localhost' : 'capacitor://localhost',
    'L0_EFFECTIVE_ORIGIN_CHANGED'
  );
  assert.equal(value.result.href, value.result.origin + FIXTURE_PATH, 'L0_EFFECTIVE_ROUTE_CHANGED');
  assert.equal(value.result.observation.bundleId, 'art.splotch.app', 'L0_APPLICATION_ID_CHANGED');
  assert.equal(value.result.observation.platform, platform, 'L0_PLATFORM_CHANGED');
}

export function verifyIOSFrame(bytes, consoleBytes, expected) {
  const value = JSON.parse(bytes);
  for (const key of ['command', 'nonce', 'receiptId', 'phase'])
    assert.equal(value[key], expected[key], `L0_IOS_${key.toUpperCase()}_CHANGED`);
  assert.ok(Number.isInteger(value.pid) && value.pid > 0, 'L0_IOS_PROCESS_ID_MISSING');
  assert.equal(value.url, `capacitor://localhost${FIXTURE_PATH}`, 'L0_IOS_EFFECTIVE_ROUTE_CHANGED');
  assert.equal(value.persistentDataStore, true, 'L0_IOS_NONPERSISTENT_PROFILE_REFUSED');
  const frame = `SPLOTCH_L0_RESULT ${expected.receiptId} ${expected.phase} ${bytes.length} ${digest(bytes)}`;
  const matches = consoleBytes
    .toString()
    .split(/\r?\n/)
    .filter((line) => line === frame);
  assert.equal(matches.length, 1, 'L0_IOS_COMPLETE_FRAME_REQUIRED');
  return value;
}
