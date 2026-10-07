import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { capturedCommand } from '../command-evidence.mjs';
import { controlGroupObservation } from './process-group-observation.mjs';
import { runLegacyContinuity } from '../run-fixture.mjs';
import { digest, sourceConfiguration, heldNamespaceConfiguration } from '../contract.mjs';
import { nativeOverlay } from '../native-overlay.mjs';
import {
  verifyBuffers,
  verifyHeldObservation,
  verifyIOSFrame,
  verifyPageReport,
} from '../report-contract.mjs';

const ROOT = resolve(import.meta.dirname, '../../../..');
const CAPABILITY_ROOT = dirname(import.meta.dirname);
const NONCE = 'a'.repeat(32);
const RECEIPT = 'b'.repeat(32);
const IMPORT_CONTROL_DEADLINE_MS = 5_000;
const PROCESS_CONTROL_DRAIN_MS = 3_000;
const PROCESS_CONTROL_POLL_MS = 50;
const PROCESS_CONTROL_START_MS = 200;
const PROCESS_CONTROL_CHILD_MS = 1_000;
const PROCESS_CONTROL_EXIT_MS = 300;
const PROCESS_CONTROL_FAILURE_CODE = 7;
const readerKeys = () => readFileSync(join(ROOT, 'web/src/lib/storageKeys.ts'), 'utf8');
const secretOwner = () => readFileSync(join(ROOT, 'web/src/lib/secureStorage.ts'), 'utf8');
const releasedKeys = () =>
  readFileSync(join(import.meta.dirname, 'fixtures/released-storageKeys.ts.txt'), 'utf8');
const heldNamespace = () =>
  heldNamespaceConfiguration(
    readFileSync(join(ROOT, 'web/src/lib/drawing/unsavedPictureStore.ts'), 'utf8')
  );
const configuration = () => ({
  ...sourceConfiguration('reader', readerKeys(), secretOwner(), releasedKeys()),
  heldNamespace: heldNamespace(),
});

describe('legacy continuity source boundaries', () => {
  it('imports the real entry without parsing flags or executing commands', () => {
    const owned = mkdtempSync(join(tmpdir(), 'splotch-l0-import-control-'));
    try {
      const driver = join(owned, 'import-entry.mjs');
      writeFileSync(
        driver,
        `const module = await import(${JSON.stringify(join(CAPABILITY_ROOT, 'run-fixture.mjs'))}); process.stdout.write(typeof module.runLegacyContinuity);`
      );
      const result = execFileSync(process.execPath, [driver, '--unrecognized-import-argument'], {
        encoding: 'utf8',
        timeout: IMPORT_CONTROL_DEADLINE_MS,
      });
      expect(result).toBe('function');
    } finally {
      rmSync(owned, { recursive: true });
    }
  });

  it('rejects unknown flags and recognizes the restored finite flag set before source refusal', async () => {
    await expect(
      runLegacyContinuity(['inspect', '--source', 'reader', '--unexpected'])
    ).rejects.toThrow(/Unknown option/);
    await expect(
      runLegacyContinuity(['inspect', '--source', 'foreign', '--repo', '/splotch-l0-missing-repo'])
    ).rejects.toThrow(/L0_SOURCE_ROLE_INVALID/);
    expect(configuration().role).toBe('reader');
  });

  it('refuses a wrong role before attempting Git input reads and restores the accepted role', () => {
    expect(() =>
      execFileSync(
        process.execPath,
        [
          join(CAPABILITY_ROOT, 'run-fixture.mjs'),
          'inspect',
          '--source',
          'foreign',
          '--repo',
          '/splotch-l0-missing-repo',
        ],
        { stdio: ['ignore', 'pipe', 'pipe'] }
      )
    ).toThrow(/L0_SOURCE_ROLE_INVALID/);
    expect(configuration().role).toBe('reader');
  });

  it('refuses duplicate real owner literals and restores exact source bytes', () => {
    const source = readerKeys();
    expect(() =>
      sourceConfiguration(
        'reader',
        source + "\nconst theme = 'foreign';\n",
        secretOwner(),
        releasedKeys()
      )
    ).toThrow(/L0_OWNER_LITERAL_CHANGED: theme/);
    const restored = configuration();
    expect(restored.keys.theme).toBe('splotch-theme');
    expect(restored.legacyDrawerKey).toBe('splotch-advanced-controls');
    expect(restored.vaultAccounts).toEqual([
      'capacitor-storage_gemini-api-key',
      'capacitor-storage_managed-access-code',
    ]);
  });

  it('refuses a changed actual registration anchor without editing source and restores the positive', () => {
    const owned = mkdtempSync(join(tmpdir(), 'splotch-l0-source-control-'));
    const activity = 'android/app/src/main/java/art/splotch/app/MainActivity.java';
    const controller = 'ios/App/App/MainViewController.swift';
    const project = 'ios/App/App.xcodeproj/project.pbxproj';
    const templates = join(CAPABILITY_ROOT, 'templates');
    const originals = new Map(
      [activity, controller, project].map((path) => [path, readFileSync(join(ROOT, path))])
    );
    try {
      for (const [path, bytes] of originals) {
        mkdirSync(dirname(join(owned, path)), { recursive: true });
        writeFileSync(join(owned, path), bytes);
      }
      writeFileSync(
        join(owned, activity),
        originals
          .get(activity)
          .toString()
          .replace('registerPlugin(DeviceLockPlugin.class);', 'registerPlugin(ChangedOwner.class);')
      );
      expect(() => nativeOverlay(owned, configuration(), templates)).toThrow(
        /L0_OWNER_ANCHOR_CHANGED/
      );
      writeFileSync(join(owned, activity), originals.get(activity));
      const positive = nativeOverlay(owned, configuration(), templates);
      expect(positive[activity]).toContain('registerPlugin(LegacyContinuityObserver.class);');
      expect(positive[controller]).toContain(
        'bridge.registerPluginInstance(LegacyContinuityObserver())'
      );
      expect(positive[project]).toContain('LegacyContinuityDriver.swift in Sources');
      const marker = configuration().heldUndefinedOwnerKey;
      expect(configuration().observedKeys.filter((key) => key === marker)).toEqual([marker]);
      expect(
        positive['android/app/src/main/java/art/splotch/app/LegacyContinuityObserver.java']
      ).toContain(JSON.stringify(marker));
      expect(positive['ios/App/App/LegacyContinuityObserver.swift']).toContain(
        JSON.stringify(marker)
      );
      for (const [path, bytes] of originals) expect(readFileSync(join(owned, path))).toEqual(bytes);
    } finally {
      rmSync(owned, { recursive: true });
    }
  });
});

describe('legacy continuity report boundaries', () => {
  it('refuses missing or changed transported buffer bytes and restores the positive', () => {
    const bytes = Buffer.from([17, 23, 41, 255]);
    const positive = {
      kind: 'buffer',
      bytes: bytes.length,
      base64: bytes.toString('base64'),
      sha256: digest(bytes),
    };
    expect(() => verifyBuffers({ raw: { fields: { bytes: positive } } })).not.toThrow();
    expect(() => verifyBuffers({ ...positive, base64: '' })).toThrow(/L0_BUFFER_LENGTH_CHANGED/);
    expect(() => verifyBuffers({ ...positive, sha256: '0'.repeat(64) })).toThrow(
      /L0_BUFFER_HASH_CHANGED/
    );
    expect(() => verifyBuffers(positive)).not.toThrow();
  });

  it('refuses lost encoded tags or recognized held bytes and restores the complete transport', () => {
    const bytes = Buffer.from([17, 23, 41, 255]);
    const positive = {
      status: 'recognized-source',
      complete: true,
      count: 1,
      key: 'pictures',
      recognized: [true],
      entryCount: 1,
      raw: {
        kind: 'array',
        fields: {
          length: { kind: 'number', value: '1' },
          0: {
            kind: 'object',
            fields: {
              bytes: {
                kind: 'buffer',
                bytes: bytes.length,
                base64: bytes.toString('base64'),
                sha256: digest(bytes),
              },
            },
          },
        },
      },
    };
    const lostTag = structuredClone(positive);
    lostTag.raw.fields[0].fields.bytes = {};
    expect(() => verifyHeldObservation(lostTag, heldNamespace())).toThrow(
      /L0_ENCODED_KIND_MISSING/
    );
    const wrongTag = structuredClone(positive);
    wrongTag.raw.fields[0].fields.bytes = { kind: 'undefined' };
    expect(() => verifyHeldObservation(wrongTag, heldNamespace())).toThrow(
      /L0_HELD_RECOGNIZED_BYTES_MISSING/
    );
    expect(() => verifyHeldObservation(positive, heldNamespace())).not.toThrow();
    expect(() =>
      verifyHeldObservation({ status: 'absent-record', count: 1 }, heldNamespace())
    ).toThrow(/L0_HELD_ABSENCE_COUNT_CHANGED/);
    expect(() =>
      verifyHeldObservation({ status: 'absent-record', count: 0 }, heldNamespace())
    ).not.toThrow();
  });

  it('refuses a wrong source, origin or normal boot and restores the positive', () => {
    const input = {
      role: 'reader',
      revision: 'c'.repeat(40),
      configuration: { heldNamespace: heldNamespace() },
    };
    const positive = {
      command: 'raw',
      nonce: NONCE,
      role: input.role,
      revision: input.revision,
      result: {
        native: true,
        drawingSurface: false,
        origin: 'https://localhost',
        href: 'https://localhost/legacy-continuity.html',
        observation: { platform: 'android', bundleId: 'art.splotch.app' },
        held: { status: 'absent-database', databases: [] },
      },
    };
    const expected = {
      command: 'raw',
      nonce: NONCE,
      input,
      platform: 'android',
    };
    expect(() => verifyPageReport({ ...positive, revision: 'd'.repeat(40) }, expected)).toThrow(
      /L0_PAGE_SOURCE_CHANGED/
    );
    expect(() =>
      verifyPageReport(
        {
          ...positive,
          result: { ...positive.result, origin: 'http://localhost' },
        },
        expected
      )
    ).toThrow(/L0_EFFECTIVE_ORIGIN_CHANGED/);
    expect(() =>
      verifyPageReport(
        { ...positive, result: { ...positive.result, drawingSurface: true } },
        expected
      )
    ).toThrow(/L0_NORMAL_DRAWING_BOOT_REFUSED/);
    expect(() => verifyPageReport(positive, expected)).not.toThrow();
  });

  it('requires exact complete iOS report framing and restores the positive', () => {
    const expected = {
      command: 'raw',
      nonce: NONCE,
      receiptId: RECEIPT,
      phase: 'raw',
    };
    const bytes = Buffer.from(
      JSON.stringify({
        ...expected,
        pid: 12345,
        persistentDataStore: true,
        url: 'capacitor://localhost/legacy-continuity.html',
        result: { status: 'completed' },
      })
    );
    const frame = Buffer.from(
      `SPLOTCH_L0_RESULT ${RECEIPT} raw ${bytes.length} ${digest(bytes)}\n`
    );
    expect(() => verifyIOSFrame(bytes, Buffer.from('clipped output'), expected)).toThrow(
      /L0_IOS_COMPLETE_FRAME_REQUIRED/
    );
    expect(() => verifyIOSFrame(Buffer.concat([bytes, Buffer.from(' ')]), frame, expected)).toThrow(
      /L0_IOS_COMPLETE_FRAME_REQUIRED/
    );
    expect(() => verifyIOSFrame(bytes, Buffer.concat([frame, frame]), expected)).toThrow(
      /L0_IOS_COMPLETE_FRAME_REQUIRED/
    );
    expect(verifyIOSFrame(bytes, frame, expected).pid).toBe(12345);
  });
});

function groupExists(pid) {
  return controlGroupObservation(pid).status !== 'absent';
}

describe('legacy continuity command ownership', () => {
  it('preserves command and ownership failures before restoring a successful owned command', async () => {
    const owned = mkdtempSync(join(tmpdir(), 'splotch-l0-combined-process-control-'));
    const context = { root: owned, calls: [], artifacts: [] };
    const exitScript = `process.exit(${PROCESS_CONTROL_FAILURE_CODE})`;
    const orphanScript = [
      "const { spawn } = require('node:child_process');",
      `setTimeout(() => spawn(process.execPath, ['-e', 'setTimeout(() => {}, ${PROCESS_CONTROL_CHILD_MS})'], {stdio: 'ignore'}), ${PROCESS_CONTROL_START_MS});`,
      `setTimeout(() => process.exit(${PROCESS_CONTROL_FAILURE_CODE}), ${PROCESS_CONTROL_EXIT_MS});`,
    ].join(' ');
    try {
      await expect(capturedCommand(context, process.execPath, ['-e', exitScript])).rejects.toThrow(
        `L0_COMMAND_EXIT_REFUSED: ${PROCESS_CONTROL_FAILURE_CODE}`
      );
      expect(context.calls.at(-1).groupAbsent).toBe(true);
      expect(context.calls.at(-1).unresolvedOwnership).toBeUndefined();
      let aggregateError;
      try {
        await capturedCommand(context, process.execPath, ['-e', orphanScript]);
      } catch (error) {
        aggregateError = error;
      }
      expect(aggregateError).toBeInstanceOf(AggregateError);
      expect(aggregateError.message).toBe('L0_COMMAND_AND_OWNERSHIP_UNRESOLVED');
      expect(aggregateError.errors.map(String)).toEqual([
        expect.stringContaining(`L0_COMMAND_EXIT_REFUSED: ${PROCESS_CONTROL_FAILURE_CODE}`),
        expect.stringContaining('L0_PROCESS_OWNERSHIP_UNRESOLVED_NO_SIGNAL'),
      ]);
      const call = context.calls.at(-1);
      expect(call.failure).toContain(`L0_COMMAND_EXIT_REFUSED: ${PROCESS_CONTROL_FAILURE_CODE}`);
      expect(call.unresolvedOwnership).toContain('L0_PROCESS_OWNERSHIP_UNRESOLVED_NO_SIGNAL');
      expect(call.groupAbsent).toBe(false);
      const saved = JSON.parse(readFileSync(join(owned, 'commands.json.txt'), 'utf8')).at(-1);
      expect(saved.failure).toBe(call.failure);
      expect(saved.unresolvedOwnership).toBe(call.unresolvedOwnership);
      const deadline = Date.now() + PROCESS_CONTROL_DRAIN_MS;
      while (groupExists(call.pid) && Date.now() < deadline) await delay(PROCESS_CONTROL_POLL_MS);
      expect(groupExists(call.pid)).toBe(false);
      const restored = await capturedCommand(context, process.execPath, [
        '-e',
        "process.stdout.write('restored')",
      ]);
      expect(restored.toString()).toBe('restored');
      expect(context.calls.at(-1).groupAbsent).toBe(true);
    } finally {
      if (context.calls.every((call) => !call.pid || !groupExists(call.pid)))
        rmSync(owned, { recursive: true });
    }
  });

  it('records actual spawn identity and refuses a surviving group after its leader exits', async () => {
    const owned = mkdtempSync(join(tmpdir(), 'splotch-l0-process-control-'));
    const context = { root: owned, calls: [], artifacts: [] };
    const script = [
      "const { spawn } = require('node:child_process');",
      `setTimeout(() => spawn(process.execPath, ['-e', 'setTimeout(() => {}, ${PROCESS_CONTROL_CHILD_MS})'], {stdio: 'ignore'}), ${PROCESS_CONTROL_START_MS});`,
      `setTimeout(() => process.exit(0), ${PROCESS_CONTROL_EXIT_MS});`,
    ].join(' ');
    try {
      await expect(capturedCommand(context, process.execPath, ['-e', script])).rejects.toThrow(
        /L0_PROCESS_OWNERSHIP_UNRESOLVED_NO_SIGNAL/
      );
      const call = context.calls[0];
      expect(call.identity.status).toBe('observed');
      expect(call.identity.ppid).toBe(process.pid);
      expect(call.identity.pgid).toBe(call.pid);
      expect(call.identity.birth).toBeTruthy();
      expect(call.groupAbsent).toBe(false);
      expect(call.signalIdentityChecks.at(-1).live.status).toBe('unavailable');
      const deadline = Date.now() + PROCESS_CONTROL_DRAIN_MS;
      while (groupExists(call.pid) && Date.now() < deadline) await delay(PROCESS_CONTROL_POLL_MS);
      expect(groupExists(call.pid)).toBe(false);
      const positive = await capturedCommand(context, process.execPath, [
        '-e',
        "process.stdout.write('restored')",
      ]);
      expect(positive.toString()).toBe('restored');
      expect(context.calls.at(-1).groupAbsent).toBe(true);
    } finally {
      if (context.calls.every((call) => !call.pid || !groupExists(call.pid)))
        rmSync(owned, { recursive: true });
    }
  });
});
