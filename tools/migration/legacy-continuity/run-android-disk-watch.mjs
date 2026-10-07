import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { join, resolve, dirname, basename } from 'node:path';
import { realpathSync, lstatSync } from 'node:fs';
import { writerAcknowledgement } from './android-writer-ack.mjs';
import { parseArgs } from 'node:util';
import {
  commandContext,
  evidence,
  finishEvidence,
  settleCommandChildren,
} from './command-evidence.mjs';
import { guardedAdbCommand } from './adb-server.mjs';
import { commandRemainingMs } from './command-timing.mjs';
import { isMain, runMain } from '../../lib/proc.mjs';
import { digest } from './contract.mjs';
const ACK_WAIT_MS = 60_000;
const PERSISTENCE_OBSERVATION_MS = 5_000;
const POLL_MS = 20;
export async function runAndroidDiskWatch(argv) {
  assert.equal(process.platform, 'darwin', 'L0_ANDROID_FIXTURE_GUARD_REQUIRES_MACOS');
  const { values } = parseArgs({
    args: argv,
    options: {
      fixture: { type: 'string' },
      lease: { type: 'string' },
      nonce: { type: 'string' },
      'seed-output': { type: 'string' },
      output: { type: 'string' },
    },
  });
  for (const key of ['fixture', 'lease', 'nonce', 'seed-output', 'output'])
    assert.ok(values[key], `L0_WATCH_${key}_REQUIRED`);
  const context = commandContext({ ...values, platform: 'android', command: 'disk' });
  const cancelWork = () => {
    context.workCancelled = true;
  };
  process.on('SIGTERM', cancelWork);
  let failure;
  try {
    assert.equal(
      digest(readFileSync(context.lease.adbPath)),
      context.lease.adbSha256,
      'L0_WATCH_ADB_CHANGED'
    );
    const adb = (args) => guardedAdbCommand(context, args);
    const stat = await adb(['shell', 'cat', `/proc/${context.lease.pid}/stat`]);
    const ticks = stat
      .toString()
      .trim()
      .slice(stat.toString().lastIndexOf(')') + 2)
      .split(/\s+/)[19];
    assert.equal(ticks, context.lease.processStartTicks, 'L0_WATCH_APP_BIRTH_CHANGED');
    const seedRoot = realpathSync(values['seed-output']);
    assert.equal(seedRoot, resolve(values['seed-output']), 'L0_WATCH_SEED_ROOT_SYMLINK_REFUSED');
    assert.ok(
      basename(seedRoot).startsWith('splotch-legacy-continuity-') &&
        dirname(seedRoot) === dirname(context.root),
      'L0_WATCH_SEED_ROOT_UNOWNED'
    );
    const seedInputs = JSON.parse(readFileSync(join(seedRoot, 'inputs.json.txt'), 'utf8'));
    assert.equal(seedInputs.options.command, 'seed', 'L0_WATCH_SEED_COMMAND_CHANGED');
    assert.equal(seedInputs.options.nonce, context.nonce, 'L0_WATCH_SEED_NONCE_CHANGED');
    assert.equal(
      realpathSync(seedInputs.options.fixture),
      context.fixtureRoot,
      'L0_WATCH_SEED_FIXTURE_CHANGED'
    );
    assert.deepEqual(seedInputs.lease, context.lease, 'L0_WATCH_SEED_LEASE_CHANGED');
    assert.equal(
      seedInputs.sourceReceiptSha256,
      digest(readFileSync(join(context.fixtureRoot, '.splotch-l0-source.json'))),
      'L0_WATCH_SEED_SOURCE_CHANGED'
    );
    const wire = join(seedRoot, 'cdp-wire.jsonl.txt');
    const waitUntil = Date.now() + commandRemainingMs(context, ACK_WAIT_MS);
    let ack;
    while (Date.now() < waitUntil && !ack) {
      if (existsSync(wire)) {
        assert.ok(
          lstatSync(wire).isFile() && !lstatSync(wire).isSymbolicLink(),
          'L0_WATCH_WIRE_REGULAR_REQUIRED'
        );
        ack = writerAcknowledgement(readFileSync(wire, 'utf8'), context);
      }
      if (!ack) await delay(POLL_MS);
    }
    assert.ok(ack, 'L0_WATCH_NO_WRITER_ACKNOWLEDGEMENT');
    evidence(context, 'actual-writer-ack.json.txt', JSON.stringify(ack, null, 2));
    const acknowledgedAt = Date.parse(ack.at);
    assert.ok(Number.isFinite(acknowledgedAt), 'L0_WATCH_ACK_TIME_INVALID');
    assert.ok(
      Date.now() - acknowledgedAt <= PERSISTENCE_OBSERVATION_MS,
      'L0_WATCH_ACK_ALREADY_LATE'
    );
    const fileNames = [
      `shared_prefs/${context.input.configuration.preferencesGroup}.xml`,
      `shared_prefs/${context.input.configuration.preferencesGroup}.xml.bak`,
      `shared_prefs/${context.input.configuration.vaultPreferences}.xml`,
      `shared_prefs/${context.input.configuration.vaultPreferences}.xml.bak`,
    ];
    assert.ok(
      fileNames.every((name) => /^shared_prefs\/[a-zA-Z0-9]+\.xml(?:\.bak)?$/.test(name)),
      'L0_WATCH_FILE_OWNER_INVALID'
    );
    const script = `for p in ${fileNames.map((name) => `'${name}'`).join(' ')}; do printf 'L0_BEGIN %s\\n' "$p"; if [ -L "$p" ]; then printf 'L0_SYMLINK\\n'; elif [ -f "$p" ]; then stat -c 'L0_PRESENT %a %s' "$p" || exit 11; base64 "$p" || exit 12; printf '\\n'; elif [ -e "$p" ]; then printf 'L0_NONREGULAR\\n'; else printf 'L0_ABSENT\\n'; fi; printf 'L0_END %s\\n' "$p"; done`;
    const bytes = await adb(['exec-out', 'run-as', 'art.splotch.app', 'sh', '-c', script]);
    const capturedAt = context.lastAdbCall.endedAt;
    const guardCompletedAt = new Date().toISOString();
    const elapsedMs = Date.parse(capturedAt) - acknowledgedAt;
    evidence(context, 'independent-xml-framed.raw.txt', bytes);
    const text = bytes.toString();
    let offset = 0;
    const files = [];
    for (const name of fileNames) {
      const begin = `L0_BEGIN ${name}\n`;
      const end = `L0_END ${name}\n`;
      assert.ok(text.startsWith(begin, offset), 'L0_WATCH_FILE_BEGIN_INVALID');
      const until = text.indexOf(end, offset + begin.length);
      assert.ok(until >= 0, 'L0_WATCH_FILE_END_MISSING');
      const body = text.slice(offset + begin.length, until);
      if (body === 'L0_ABSENT\n') files.push({ path: name, presence: 'absent' });
      else {
        const match = /^L0_PRESENT ([0-7]{3,4}) (\d+)\n([a-zA-Z0-9+/=\r\n]*)$/.exec(body);
        assert.ok(match, 'L0_WATCH_FILE_FRAME_INVALID');
        const decoded = Buffer.from(match[3].replace(/[\r\n]/g, ''), 'base64');
        assert.equal(decoded.length, Number(match[2]), 'L0_WATCH_FILE_SIZE_CHANGED');
        assert.equal(
          decoded.toString('base64'),
          match[3].replace(/[\r\n]/g, ''),
          'L0_WATCH_BASE64_INVALID'
        );
        const artifact = name.replace('shared_prefs/', '');
        evidence(context, artifact + '.raw.txt', decoded);
        files.push({
          path: name,
          presence: 'present',
          mode: match[1],
          bytes: decoded.length,
          sha256: digest(decoded),
          artifact: artifact + '.raw.txt',
        });
      }
      offset = until + end.length;
    }
    assert.equal(offset, text.length, 'L0_WATCH_UNEXPECTED_TRAILING_BYTES');
    const finalStat = await adb(['shell', 'cat', `/proc/${context.lease.pid}/stat`]);
    const finalTicks = finalStat
      .toString()
      .trim()
      .slice(finalStat.toString().lastIndexOf(')') + 2)
      .split(/\s+/)[19];
    assert.equal(finalTicks, context.lease.processStartTicks, 'L0_WATCH_APP_CHANGED_AFTER_CUT');
    const observation = {
      stage: 'independent-source-writer-to-XML-cut',
      acknowledgedAt: ack.at,
      capturedAt,
      elapsedMs,
      guardCompletedAt,
      deadlineMs: PERSISTENCE_OBSERVATION_MS,
      withinDeadline: elapsedMs <= PERSISTENCE_OBSERVATION_MS,
      files,
      scope:
        'observed complete per-file XML bytes/modes; no atomic multi-file transaction or alias durability inferred',
    };
    evidence(context, 'persistence-cut.json.txt', JSON.stringify(observation, null, 2));
    assert.ok(observation.withinDeadline, 'L0_WATCH_XML_CUT_LATE');
    context.persistenceObservation = observation;
  } catch (error) {
    failure = error;
  } finally {
    try {
      await settleCommandChildren(context);
    } catch (error) {
      failure = failure ? new AggregateError([failure, error]) : error;
    }
    process.removeListener('SIGTERM', cancelWork);
  }
  finishEvidence(
    context,
    failure ? 'failed-independent-XML-observation' : 'independent-XML-observation-completed',
    failure ? String(failure) : context.persistenceObservation
  );
  if (failure) throw failure;
}

if (isMain(import.meta.url)) runMain(() => runAndroidDiskWatch(process.argv.slice(2)));
